import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'

// bundles.ts reads localStorage for client-id persistence; install a minimal
// in-memory shim before any module that needs it is imported.
if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage?.getItem !== 'function') {
  const store = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  }
}

import { getHospitalDB } from '../db/schema'
import { M2_ADAPTERS } from '../lib/sync/tables'
import {
  buildBundleSnapshot,
  applyBundleSnapshot,
  type BundleSnapshot,
} from '../lib/sync/r2/bundles'

const USER_ID = 'user-test-fixture'

beforeEach(async () => {
  const db = getHospitalDB()
  await db.delete()
  await db.open()
})

describe('m2 bundle schema_version 3 — daily_study_log round-trip', () => {
  it('snapshot includes daily_study_log table with all rows', async () => {
    const db = getHospitalDB()
    await db.dailyStudyLog.bulkPut([
      { date: '2026-05-25', minutesAdded: 60, updatedAt: 1000 },
      { date: '2026-05-26', minutesAdded: 8, updatedAt: 2000 },
    ])
    const snapshot = await buildBundleSnapshot(db, M2_ADAPTERS, USER_ID)
    expect(snapshot.meta.schema_version).toBe(3)
    expect(snapshot.data.daily_study_log).toBeDefined()
    expect(snapshot.data.daily_study_log).toHaveLength(2)
    const ids = snapshot.data.daily_study_log.map((r) => r.id).sort()
    expect(ids).toEqual(['2026-05-25', '2026-05-26'])
  })

  it('round-trip preserves dailyStudyLog rows verbatim', async () => {
    const db = getHospitalDB()
    await db.dailyStudyLog.bulkPut([
      { date: '2026-05-25', minutesAdded: 60, updatedAt: 1000 },
      { date: '2026-05-26', minutesAdded: 8, updatedAt: 2000 },
    ])
    const snapshot = await buildBundleSnapshot(db, M2_ADAPTERS, USER_ID)
    // Wipe local
    await db.dailyStudyLog.clear()
    expect((await db.dailyStudyLog.toArray()).length).toBe(0)
    // Apply snapshot
    await applyBundleSnapshot(db, M2_ADAPTERS, snapshot, { force: true })
    const rows = await db.dailyStudyLog.orderBy('date').toArray()
    expect(rows.length).toBe(2)
    expect(rows[0].date).toBe('2026-05-25')
    expect(rows[0].minutesAdded).toBe(60)
    expect(rows[0].updatedAt).toBe(1000)
    expect(rows[1].date).toBe('2026-05-26')
    expect(rows[1].minutesAdded).toBe(8)
  })

  it('v2 bundle (no daily_study_log key) read by v3 client leaves table untouched', async () => {
    const db = getHospitalDB()
    // Seed local row that should survive a v2-bundle apply
    await db.dailyStudyLog.put({ date: '2026-05-26', minutesAdded: 5, updatedAt: 1 })
    const v2Snapshot: BundleSnapshot = {
      meta: {
        schema_version: 2,
        updated_at: new Date(0).toISOString(),
        client_id: 'legacy-v2-client',
      },
      data: {
        // No `daily_study_log` key — pre-v3 bundle shape
      },
    }
    await applyBundleSnapshot(db, M2_ADAPTERS, v2Snapshot)
    const rows = await db.dailyStudyLog.toArray()
    expect(rows.length).toBe(1)
    expect(rows[0].minutesAdded).toBe(5)
  })

  it('LWW resolves cross-device same-day conflict by latest updatedAt', async () => {
    const db = getHospitalDB()
    // Device A — earlier write
    await db.dailyStudyLog.put({ date: '2026-05-26', minutesAdded: 5, updatedAt: 1000 })
    // Simulate cloud row from Device B with newer updated_at
    const cloudUpdatedAtIso = new Date(2000).toISOString()
    const adapter = M2_ADAPTERS.find((a) => a.postgresTable === 'daily_study_log')
    expect(adapter).toBeDefined()
    const wrote = await adapter!.applyToLocal(db, {
      user_id: USER_ID,
      updated_at: cloudUpdatedAtIso,
      app_version: '0.3.0',
      id: '2026-05-26',
      data: { date: '2026-05-26', minutesAdded: 8, updatedAt: 2000 },
    })
    expect(wrote).toBe(true)
    const row = await db.dailyStudyLog.get('2026-05-26')
    expect(row?.minutesAdded).toBe(8)
  })

  it('LWW rejects older cloud write when local is newer', async () => {
    const db = getHospitalDB()
    // Local has a fresh write
    const now = Date.now()
    await db.dailyStudyLog.put({ date: '2026-05-26', minutesAdded: 10, updatedAt: now })
    // Mark its _updatedAt by re-putting (Dexie hook attaches it on write
    // when sync engine is mounted; tests bypass engine — set explicitly).
    const localRow = await db.dailyStudyLog.get('2026-05-26')
    if (localRow) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await db.dailyStudyLog.put({ ...localRow, _updatedAt: now } as any)
    }

    // Simulate older cloud row arriving
    const cloudUpdatedAtIso = new Date(now - 60_000).toISOString()
    const adapter = M2_ADAPTERS.find((a) => a.postgresTable === 'daily_study_log')!
    const wrote = await adapter.applyToLocal(db, {
      user_id: USER_ID,
      updated_at: cloudUpdatedAtIso,
      app_version: '0.3.0',
      id: '2026-05-26',
      data: { date: '2026-05-26', minutesAdded: 3, updatedAt: now - 60_000 },
    })
    expect(wrote).toBe(false)
    const row = await db.dailyStudyLog.get('2026-05-26')
    expect(row?.minutesAdded).toBe(10) // local preserved
  })
})
