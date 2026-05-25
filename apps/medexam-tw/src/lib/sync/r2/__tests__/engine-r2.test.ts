// Unit tests for pushBundle's 412 recovery loop, covering the three distinct
// paths that the engine must distinguish in production logs:
//
//   1. Corrupt-blob recovery — first PUT lands on a non-gzip leftover, engine
//      pulls the ETag without decoding the body, retries PUT with If-Match,
//      succeeds. console.info logs the recovery for grep-able auditing.
//   2. Concurrent-writer exhausted — every retry hits a 412 because a real
//      writer keeps invalidating the ETag. Engine surfaces a distinct error
//      `r2_blob_concurrent_writer_exhausted` so logs separate this from
//      the network-fail case.
//   3. Real network failure — fetch throws before getting a response. Engine
//      preserves the underlying message in `r2_push_exhausted: <orig>` so
//      CORS / DNS / offline misconfigs remain identifiable in logs.

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Bundle, PresignResult } from '../client'

// Mock module boundaries before importing the SUT.

const mocks = vi.hoisted(() => ({
  buildBundleSnapshot: vi.fn(async () => ({
    meta: { schema_version: 1, updated_at: '2026-05-20T00:00:00.000Z', client_id: 'test-client' },
    data: { player_state: [{ user_id: 'u1', updated_at: '2026-05-20T00:00:00.000Z' }] },
  })),
  gzipBundle: vi.fn(async () => new Blob(['fake-gz-body'], { type: 'application/gzip' })),
  gunzipBundle: vi.fn() as ReturnType<typeof vi.fn>,
  applyBundleSnapshot: vi.fn(async () => ({ applied: 1, skipped: 0 })),
  etagMap: new Map<string, string | null>(),
}))

vi.mock('../client', () => ({
  requestPresign: vi.fn(
    async (_supabase: unknown, _bundle: Bundle, _op: 'put' | 'get'): Promise<PresignResult> => ({
      url: 'mock://r2/m1',
      expiresAt: Date.now() + 60_000,
    }),
  ),
  clearPresignCache: vi.fn(),
  getWorkerUrl: vi.fn(() => 'mock://worker'),
}))

vi.mock('../bundles', () => ({
  buildBundleSnapshot: mocks.buildBundleSnapshot,
  gzipBundle: mocks.gzipBundle,
  gunzipBundle: mocks.gunzipBundle,
  applyBundleSnapshot: mocks.applyBundleSnapshot,
  validateBundleMeta: vi.fn(),
  getClientId: vi.fn(() => 'test-client'),
}))

vi.mock('../etag', () => ({
  getEtag: vi.fn((b: string) => mocks.etagMap.get(b) ?? null),
  setEtag: vi.fn((b: string, e: string | null) => {
    mocks.etagMap.set(b, e)
  }),
  clearAllEtags: vi.fn(() => {
    mocks.etagMap.clear()
  }),
}))

// Import after mocks so the SUT picks up the mocked deps.
import { pullBundle, pushBundle } from '../engine-r2'

function makeResponse(status: number, body: BodyInit | null, etag?: string): Response {
  const headers = new Headers()
  if (etag) headers.set('ETag', etag)
  return new Response(body, { status, headers })
}

describe('pushBundle 412 recovery paths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.etagMap.clear()
  })

  it('recovers from a corrupt 1-byte blob via If-Match overwrite', async () => {
    const fetchMock = vi.fn()
    // 1: first PUT (If-None-Match: *) → 412 PreconditionFailed.
    fetchMock.mockResolvedValueOnce(makeResponse(412, '<PreconditionFailed/>'))
    // 2: GET inside pullBundle → 200 OK + corrupt 1-byte body + ETag.
    fetchMock.mockResolvedValueOnce(makeResponse(200, new Uint8Array([0x74]), '"corrupt-etag"'))
    // 3: second PUT (If-Match: "corrupt-etag") → 200 OK + new ETag.
    fetchMock.mockResolvedValueOnce(makeResponse(200, '', '"new-etag"'))
    vi.stubGlobal('fetch', fetchMock)

    // gunzip on the corrupt body throws — engine MUST NOT apply it.
    mocks.gunzipBundle.mockRejectedValueOnce(new Error('invalid gzip'))

    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    const result = await pushBundle({} as never, {} as never, [], 'm1', 'u1')

    expect(result.etag).toBe('"new-etag"')
    expect(result.attempts).toBe(2)
    expect(result.bytes).toBeGreaterThan(0)

    // Corrupt body MUST NOT have been merged to local Dexie.
    expect(mocks.applyBundleSnapshot).not.toHaveBeenCalled()

    // Operator-visible recovery log MUST fire.
    expect(infoSpy).toHaveBeenCalledWith(expect.stringMatching(/recovered from corrupt blob via overwrite/))

    // Fetch call sequence sanity.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('PUT')
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>)['If-None-Match']).toBe('*')
    expect(fetchMock.mock.calls[1][1]?.method).toBe('GET')
    expect(fetchMock.mock.calls[2][1]?.method).toBe('PUT')
    expect((fetchMock.mock.calls[2][1]?.headers as Record<string, string>)['If-Match']).toBe('"corrupt-etag"')
  })

  it('surfaces r2_blob_concurrent_writer_exhausted when 412 retries never succeed', async () => {
    const fetchMock = vi.fn()
    // Three rounds of (PUT 412, GET 200 corrupt) — every PUT loses the ETag race.
    for (let i = 0; i < 3; i++) {
      fetchMock.mockResolvedValueOnce(makeResponse(412, '<PreconditionFailed/>'))
      fetchMock.mockResolvedValueOnce(makeResponse(200, new Uint8Array([0x74]), `"etag-r${i}"`))
    }
    vi.stubGlobal('fetch', fetchMock)
    mocks.gunzipBundle.mockRejectedValue(new Error('invalid gzip'))

    await expect(pushBundle({} as never, {} as never, [], 'm1', 'u1')).rejects.toThrow(
      /r2_blob_concurrent_writer_exhausted/,
    )
  })

  it('preserves the underlying network-error message in r2_push_exhausted', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    await expect(pushBundle({} as never, {} as never, [], 'm1', 'u1')).rejects.toThrow(
      /r2_push_exhausted: Failed to fetch/,
    )
  })
})

// Helpers for pullBundle tests: a gzip body that gunzipBundle accepts (mock
// returns a valid snapshot regardless of payload) and assertion helpers that
// inspect fetch call shape.

function gzipResponse(status: number, etag?: string): Response {
  return makeResponse(status, new Uint8Array([0x1f, 0x8b, 0x08, 0x00]), etag)
}

function methodOf(call: unknown[]): string | undefined {
  return (call[1] as { method?: string } | undefined)?.method
}

function headersOf(call: unknown[]): Record<string, string> {
  return ((call[1] as { headers?: Record<string, string> } | undefined)?.headers ?? {}) as Record<
    string,
    string
  >
}

describe('pullBundle HEAD-then-unconditional-GET path (R2 304 CORS workaround)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.etagMap.clear()
    // Default gunzip success — tests that need failure override locally.
    mocks.gunzipBundle.mockReset()
    mocks.gunzipBundle.mockResolvedValue({
      meta: { schema_version: 1, updated_at: '2026-05-24T00:00:00.000Z', client_id: 'test-client' },
      data: { player_state: [{ user_id: 'u1', updated_at: '2026-05-24T00:00:00.000Z' }] },
    })
  })

  it('cache-hit: HEAD etag matches cached lastEtag → noChange, body never fetched', async () => {
    mocks.etagMap.set('m2', '"a268"')
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(makeResponse(200, null, '"a268"'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await pullBundle({} as never, {} as never, [], 'm2', { conditional: true })

    expect(result.notModified).toBe(true)
    expect(result.blobMissing).toBe(false)
    expect(result.applied).toBeNull()
    expect(result.etag).toBe('"a268"')
    // Exactly one fetch — the HEAD probe. No body GET.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(methodOf(fetchMock.mock.calls[0])).toBe('HEAD')
    expect(mocks.applyBundleSnapshot).not.toHaveBeenCalled()
  })

  it('cache-miss: HEAD etag differs → unconditional GET fetches body, applies snapshot', async () => {
    mocks.etagMap.set('m1', '"old"')
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(makeResponse(200, null, '"new"'))
    fetchMock.mockResolvedValueOnce(gzipResponse(200, '"new"'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await pullBundle({} as never, {} as never, [], 'm1', { conditional: true })

    expect(result.notModified).toBe(false)
    expect(result.blobMissing).toBe(false)
    expect(result.applied).not.toBeNull()
    expect(result.etag).toBe('"new"')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(methodOf(fetchMock.mock.calls[0])).toBe('HEAD')
    expect(methodOf(fetchMock.mock.calls[1])).not.toBe('HEAD') // body-fetching GET
    // Critical invariant: GET request MUST NOT carry If-None-Match.
    expect(headersOf(fetchMock.mock.calls[1])['If-None-Match']).toBeUndefined()
    expect(mocks.applyBundleSnapshot).toHaveBeenCalledTimes(1)
  })

  it('blobMissing: HEAD returns 404 → no body GET, returns blobMissing', async () => {
    mocks.etagMap.set('bookmarks', '"x"')
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(makeResponse(404, ''))
    vi.stubGlobal('fetch', fetchMock)

    const result = await pullBundle({} as never, {} as never, [], 'bookmarks', { conditional: true })

    expect(result.blobMissing).toBe(true)
    expect(result.notModified).toBe(false)
    expect(result.etag).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(methodOf(fetchMock.mock.calls[0])).toBe('HEAD')
    expect(mocks.applyBundleSnapshot).not.toHaveBeenCalled()
  })

  it('fallback: HEAD throws → console.warn fires, unconditional GET still attempted', async () => {
    mocks.etagMap.set('m2', '"some"')
    const fetchMock = vi.fn()
    fetchMock.mockRejectedValueOnce(new TypeError('boom'))
    fetchMock.mockResolvedValueOnce(gzipResponse(200, '"new"'))
    vi.stubGlobal('fetch', fetchMock)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = await pullBundle({} as never, {} as never, [], 'm2', { conditional: true })

    expect(result.applied).not.toBeNull()
    expect(result.etag).toBe('"new"')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(methodOf(fetchMock.mock.calls[0])).toBe('HEAD')
    expect(headersOf(fetchMock.mock.calls[1])['If-None-Match']).toBeUndefined()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/\[sync:pullR2:m2\] HEAD probe failed/))
  })

  it('force=true: skips HEAD entirely, single unconditional GET', async () => {
    mocks.etagMap.set('m1', '"cached"')
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(gzipResponse(200, '"new"'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await pullBundle({} as never, {} as never, [], 'm1', {
      conditional: true,
      force: true,
    })

    expect(result.applied).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Single GET (not HEAD).
    expect(methodOf(fetchMock.mock.calls[0])).not.toBe('HEAD')
    expect(headersOf(fetchMock.mock.calls[0])['If-None-Match']).toBeUndefined()
  })

  it('no cached etag: skips HEAD on first conditional pull', async () => {
    // etagMap empty for 'm2'
    const fetchMock = vi.fn()
    fetchMock.mockResolvedValueOnce(gzipResponse(200, '"first"'))
    vi.stubGlobal('fetch', fetchMock)

    const result = await pullBundle({} as never, {} as never, [], 'm2', { conditional: true })

    expect(result.applied).not.toBeNull()
    expect(result.etag).toBe('"first"')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(methodOf(fetchMock.mock.calls[0])).not.toBe('HEAD')
    expect(headersOf(fetchMock.mock.calls[0])['If-None-Match']).toBeUndefined()
  })

  it('invariant: no If-None-Match header on body-fetching GET in any scenario', async () => {
    const scenarios: Array<{
      label: string
      setup: () => void
      opts: { conditional?: boolean; force?: boolean }
      expectedFetches: number
    }> = [
      {
        label: 'cache-miss after HEAD diff',
        setup: () => {
          mocks.etagMap.set('m1', '"old"')
          const fetchMock = vi.fn()
          fetchMock.mockResolvedValueOnce(makeResponse(200, null, '"new"'))
          fetchMock.mockResolvedValueOnce(gzipResponse(200, '"new"'))
          vi.stubGlobal('fetch', fetchMock)
        },
        opts: { conditional: true },
        expectedFetches: 2,
      },
      {
        label: 'HEAD-throws fallback',
        setup: () => {
          mocks.etagMap.set('m1', '"old"')
          const fetchMock = vi.fn()
          fetchMock.mockRejectedValueOnce(new TypeError('boom'))
          fetchMock.mockResolvedValueOnce(gzipResponse(200, '"new"'))
          vi.stubGlobal('fetch', fetchMock)
          vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        },
        opts: { conditional: true },
        expectedFetches: 2,
      },
      {
        label: 'force=true bypass',
        setup: () => {
          mocks.etagMap.set('m1', '"old"')
          const fetchMock = vi.fn()
          fetchMock.mockResolvedValueOnce(gzipResponse(200, '"new"'))
          vi.stubGlobal('fetch', fetchMock)
        },
        opts: { conditional: true, force: true },
        expectedFetches: 1,
      },
      {
        label: 'no cached etag',
        setup: () => {
          // etagMap empty
          const fetchMock = vi.fn()
          fetchMock.mockResolvedValueOnce(gzipResponse(200, '"first"'))
          vi.stubGlobal('fetch', fetchMock)
        },
        opts: { conditional: true },
        expectedFetches: 1,
      },
      {
        label: 'conditional=false (pushBundle recovery path)',
        setup: () => {
          mocks.etagMap.set('m1', '"old"')
          const fetchMock = vi.fn()
          fetchMock.mockResolvedValueOnce(gzipResponse(200, '"new"'))
          vi.stubGlobal('fetch', fetchMock)
        },
        opts: { conditional: false },
        expectedFetches: 1,
      },
    ]

    for (const sc of scenarios) {
      mocks.etagMap.clear()
      vi.clearAllMocks()
      mocks.gunzipBundle.mockResolvedValue({
        meta: { schema_version: 1, updated_at: '2026-05-24T00:00:00.000Z', client_id: 'test-client' },
        data: {},
      })
      sc.setup()

      await pullBundle({} as never, {} as never, [], 'm1', sc.opts)

      const fetchMock = (globalThis.fetch as unknown) as ReturnType<typeof vi.fn>
      expect(fetchMock).toHaveBeenCalledTimes(sc.expectedFetches)
      // Every GET-shaped call (method undefined, since GET is the default) MUST
      // NOT include If-None-Match. HEAD calls (method 'HEAD') are not subject
      // to this assertion.
      for (const call of fetchMock.mock.calls) {
        if (methodOf(call) === 'HEAD') continue
        expect(
          headersOf(call)['If-None-Match'],
          `${sc.label}: unexpected If-None-Match on body-fetching GET`,
        ).toBeUndefined()
      }
    }
  })
})
