// R2 client — Worker presign caller for neurons-tw.
//
// Bundle name is fixed to 'neurons' (the Worker whitelists it per
// cloudflare/sync-worker/src/presign.ts BUNDLES). The Worker enforces
// tenancy at signing time using the JWT `sub` claim — body fields are
// ignored. R2 key on the server side: users/<jwt.sub>/neurons-snapshot.json.gz

import type { SupabaseClient } from '@supabase/supabase-js'

export type PresignOp = 'put' | 'get'

export interface PresignResult {
  url: string
  expiresAt: number  // epoch ms
}

const WORKER_URL_RAW = import.meta.env.VITE_SYNC_WORKER_URL as string | undefined
const WORKER_URL_TRIMMED = (WORKER_URL_RAW ?? '').trim().replace(/\/+$/, '')
const WORKER_URL =
  WORKER_URL_TRIMMED.length > 0
    ? WORKER_URL_TRIMMED
    : 'https://api.med-study-rpg.com'

const BUNDLE_NAME = 'neurons' as const
export type Bundle = typeof BUNDLE_NAME

const cache = new Map<PresignOp, PresignResult>()

export function clearPresignCache(): void {
  cache.clear()
}

export async function requestPresign(
  supabase: SupabaseClient,
  op: PresignOp,
): Promise<PresignResult> {
  const cached = cache.get(op)
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached

  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw new Error(`presign_no_session: ${error.message}`)
  if (!session?.access_token) throw new Error('presign_no_session')

  const res = await fetch(`${WORKER_URL}/presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ bundle: BUNDLE_NAME, op }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`presign_failed_${res.status}: ${body.slice(0, 200)}`)
  }

  const result = (await res.json()) as PresignResult
  cache.set(op, result)
  return result
}

export function getWorkerUrl(): string {
  return WORKER_URL
}
