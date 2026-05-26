import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

// Minimal localStorage shim (bundles.ts needs it for client-id; etag.ts needs
// it for schema_version cache). Some Vitest environments don't ship one.
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

import { getHospitalDB, type RetirementLogRow } from '../db/schema'
import { M2_ADAPTERS, HOSPITAL_ADAPTERS } from '../lib/sync/tables'
import { buildBundleSnapshot, applyBundleSnapshot } from '../lib/sync/r2/bundles'
import { reconcileRetiredDoctors } from '../lib/retirement-reconcile'
import { clearLocalSyncTables } from '../lib/sync/account-switch'
import {
  getSchemaVersion,
  setSchemaVersion,
  clearSchemaVersion,
} from '../lib/sync/r2/etag'

const USER_ID = 'user-test-fixture'

beforeEach(async () => {
  const db = getHospitalDB()
  await db.delete()
  await db.open()
  clearSchemaVersion('m2')
  clearSchemaVersion('bookmarks')
})

afterEach(() => {
  clearSchemaVersion('m2')
  clearSchemaVersion('bookmarks')
})

// ─── §8.2 Round-trip: retire → snapshot → apply → no resurrection ──────────
describe('retirement_log bundle round-trip (fix-doctor-retire-cloud-resurrection §8.2)', () => {
  it('snapshot includes retirement_log key alongside hospital_doctors', async () => {
    const db = getHospitalDB()
    await db.doctors.put({
      id: 'doc-a',
      subjectId: '內科',
      rarity: 'P3',
      powerMultiplier: 2,
      name: 'Dr. A',
      spriteKey: 'a',
      obtainedAt: 1000,
      assignedRoom: null,
      pityCounter: 0,
    })
    await db.retirementLog.put({
      doctorId: 'doc-b',
      retiredAt: 5000,
      subjectId: '外科',
      rarity: 'P5',
      refund: 500,
      _updatedAt: 5000,
    })

    const snapshot = await buildBundleSnapshot(db, M2_ADAPTERS, USER_ID)
    expect(snapshot.meta.schema_version).toBe(4)
    expect(snapshot.data.retirement_log).toBeDefined()
    expect(snapshot.data.retirement_log).toHaveLength(1)
    const row = snapshot.data.retirement_log[0]
    expect(row.doctor_id).toBe('doc-b')
    expect(row.refund).toBe(500)
  })

  it('applying a v4 bundle with a tombstone refuses to write the matching doctor row', async () => {
    const db = getHospitalDB()
    // Pre-seed a tombstone for doc-c
    await db.retirementLog.put({
      doctorId: 'doc-c',
      retiredAt: 5000,
      subjectId: '內科',
      rarity: 'P3',
      refund: 2000,
      _updatedAt: 5000,
    })

    // Cloud bundle still carries the stale doc-c row (pre-fix engine never deleted it)
    const cloudSnapshot = {
      meta: { schema_version: 4, updated_at: new Date(7000).toISOString(), client_id: 'fixture' },
      data: {
        retirement_log: [
          {
            user_id: USER_ID,
            updated_at: new Date(5000).toISOString(),
            app_version: 'test',
            doctor_id: 'doc-c',
            retired_at: 5000,
            subject_id: '內科',
            rarity: 'P3',
            refund: 2000,
          },
        ],
        hospital_doctors: [
          {
            user_id: USER_ID,
            updated_at: new Date(3000).toISOString(),
            app_version: 'test',
            id: 'doc-c',
            data: {
              id: 'doc-c',
              subjectId: '內科',
              rarity: 'P3',
              powerMultiplier: 2,
              name: 'Dr. C',
              spriteKey: 'c',
              obtainedAt: 1000,
              assignedRoom: null,
              pityCounter: 0,
            },
          },
        ],
      },
    }

    await applyBundleSnapshot(db, M2_ADAPTERS, cloudSnapshot, { force: true })
    const doctor = await db.doctors.get('doc-c')
    expect(doctor).toBeUndefined()
  })
})

// ─── §8.4 reconcileRetiredDoctors cleans up local ghost doctors ─────────────
describe('reconcileRetiredDoctors (§8.4)', () => {
  it('deletes local doctor rows whose id is in retirementLog', async () => {
    const db = getHospitalDB()
    await db.doctors.put({
      id: 'ghost-x',
      subjectId: '內科',
      rarity: 'P3',
      powerMultiplier: 2,
      name: 'Ghost',
      spriteKey: 'g',
      obtainedAt: 1000,
      assignedRoom: null,
      pityCounter: 0,
    })
    await db.retirementLog.put({
      doctorId: 'ghost-x',
      retiredAt: 2000,
      subjectId: '內科',
      rarity: 'P3',
      refund: 2000,
      _updatedAt: 2000,
    })

    const result = await reconcileRetiredDoctors()
    expect(result.cleaned).toBe(1)
    expect(await db.doctors.get('ghost-x')).toBeUndefined()
  })

  it('is idempotent (no-op on clean state)', async () => {
    const result = await reconcileRetiredDoctors()
    expect(result.cleaned).toBe(0)
  })

  it('leaves doctors with no matching tombstone untouched', async () => {
    const db = getHospitalDB()
    await db.doctors.put({
      id: 'live-doc',
      subjectId: '內科',
      rarity: 'P3',
      powerMultiplier: 2,
      name: 'Live',
      spriteKey: 'l',
      obtainedAt: 1000,
      assignedRoom: null,
      pityCounter: 0,
    })
    const result = await reconcileRetiredDoctors()
    expect(result.cleaned).toBe(0)
    expect(await db.doctors.get('live-doc')).toBeDefined()
  })
})

// ─── §8.5/8.6/8.7 R2 schema_version monotonic guard ────────────────────────
describe('R2 schema_version monotonic guard (§8.5/8.6/8.7)', () => {
  it('getSchemaVersion returns null for fresh accounts (8.6 first-ever push)', () => {
    expect(getSchemaVersion('m2')).toBeNull()
  })

  it('setSchemaVersion + getSchemaVersion round-trip', () => {
    setSchemaVersion('m2', 4)
    expect(getSchemaVersion('m2')).toBe(4)
  })

  it('clearSchemaVersion wipes the cache (account-switch path)', () => {
    setSchemaVersion('m2', 4)
    clearSchemaVersion('m2')
    expect(getSchemaVersion('m2')).toBeNull()
  })

  it('rejects non-positive values (defensive bounds)', () => {
    setSchemaVersion('m2', 0)
    expect(getSchemaVersion('m2')).toBeNull()
    setSchemaVersion('m2', Number.NaN)
    expect(getSchemaVersion('m2')).toBeNull()
  })

  // 8.5 / 8.7 — pushBundle full path requires fetch/presign mocking which is
  // out of scope for this unit-level suite. The guard logic is exercised
  // indirectly through the integration smoke (tasks.md §9.10) where a
  // manually-poisoned localStorage SV value is observed to refuse the push.
  // Full pushBundle mocking is tracked as a follow-up alongside `audit-
  // pushAllNow-dirty-marker-semantics` in tasks.md §12.
})

// ─── §8.9 Account-switch wipe clears retirementLog ──────────────────────────
describe('account-switch clearLocalSyncTables (§8.9)', () => {
  it('clears retirementLog alongside the other synced tables', async () => {
    const db = getHospitalDB()
    await db.retirementLog.put({
      doctorId: 'A',
      retiredAt: 100,
      subjectId: '內科',
      rarity: 'P3',
      refund: 2000,
      _updatedAt: 100,
    })
    await db.doctors.put({
      id: 'live',
      subjectId: '外科',
      rarity: 'P4',
      powerMultiplier: 1,
      name: 'L',
      spriteKey: 'x',
      obtainedAt: 50,
      assignedRoom: null,
      pityCounter: 0,
    })

    await clearLocalSyncTables(db)
    expect(await db.retirementLog.count()).toBe(0)
    expect(await db.doctors.count()).toBe(0)
  })

  it('also clears R2 schema_version cache so next account is not blocked', async () => {
    const db = getHospitalDB()
    setSchemaVersion('m2', 4)
    setSchemaVersion('bookmarks', 4)
    await clearLocalSyncTables(db)
    expect(getSchemaVersion('m2')).toBeNull()
    expect(getSchemaVersion('bookmarks')).toBeNull()
  })
})

// ─── §8.11 Dexie pk-as-doctorId is deterministic (duplicate throws) ─────────
describe('retirementLog pk = doctorId (§8.11)', () => {
  it('rejects duplicate doctorId (deterministic pk)', async () => {
    const db = getHospitalDB()
    await db.retirementLog.add({
      doctorId: 'doc-x',
      retiredAt: 1,
      subjectId: '內科',
      rarity: 'P3',
      refund: 2000,
      _updatedAt: 1,
    } as RetirementLogRow)
    await expect(
      db.retirementLog.add({
        doctorId: 'doc-x',
        retiredAt: 2,
        subjectId: '外科',
        rarity: 'P5',
        refund: 500,
        _updatedAt: 2,
      } as RetirementLogRow),
    ).rejects.toThrow()
  })

  it('allows distinct doctorIds', async () => {
    const db = getHospitalDB()
    await db.retirementLog.add({
      doctorId: 'doc-a',
      retiredAt: 1,
      subjectId: '內科',
      rarity: 'P3',
      refund: 2000,
      _updatedAt: 1,
    } as RetirementLogRow)
    await db.retirementLog.add({
      doctorId: 'doc-b',
      retiredAt: 2,
      subjectId: '外科',
      rarity: 'P5',
      refund: 500,
      _updatedAt: 2,
    } as RetirementLogRow)
    expect(await db.retirementLog.count()).toBe(2)
  })
})

// ─── §8.10 Dexie v18→v19 migration ──────────────────────────────────────────
// Note: testing a multi-version Dexie upgrade in fake-indexeddb requires
// opening the DB at v18, writing rows, closing, and reopening with the v19
// schema. The HospitalDB class declares all version chains up to v19 already,
// so opening it once runs v18 first, then upgrades to v19. Inside the test
// we can only observe the post-upgrade state. To exercise the dedup path we
// would need a parallel test-only DB class fixed at v18 — out of scope for
// this unit suite. The migration is exercised end-to-end by the smoke
// checklist (tasks.md §9.4: query `db.retirementLog.toArray()` post-load on
// a v18 save with existing retire rows).
//
// Smoke-level invariant we CAN assert: a fresh DB opens at v19 and the
// retirementLog pk is 'doctorId' (added via .add() with only doctorId works).
describe('retirementLog post-v19 shape (§8.10 partial)', () => {
  it('fresh open uses doctorId as pk; add with just doctorId works', async () => {
    const db = getHospitalDB()
    await db.retirementLog.add({
      doctorId: 'fresh-x',
      retiredAt: 1,
      subjectId: '內科',
      rarity: 'P3',
      refund: 2000,
      _updatedAt: 1,
    } as RetirementLogRow)
    const r = await db.retirementLog.get('fresh-x')
    expect(r).toBeDefined()
    expect(r!.doctorId).toBe('fresh-x')
  })
})

// Sanity: HOSPITAL_ADAPTERS / M2_ADAPTERS array ordering puts RETIREMENT_LOG
// BEFORE HOSPITAL_DOCTORS so applyBundleSnapshot lands tombstones first.
describe('Adapter ordering invariant (cloud-sync spec "Apply ordering")', () => {
  it('RETIREMENT_LOG precedes HOSPITAL_DOCTORS in M2_ADAPTERS', () => {
    const idx = (table: string) => M2_ADAPTERS.findIndex((a) => a.postgresTable === table)
    expect(idx('retirement_log')).toBeGreaterThanOrEqual(0)
    expect(idx('hospital_doctors')).toBeGreaterThanOrEqual(0)
    expect(idx('retirement_log')).toBeLessThan(idx('hospital_doctors'))
  })

  it('RETIREMENT_LOG precedes HOSPITAL_DOCTORS in HOSPITAL_ADAPTERS', () => {
    const idx = (table: string) =>
      HOSPITAL_ADAPTERS.findIndex((a) => a.postgresTable === table)
    expect(idx('retirement_log')).toBeGreaterThanOrEqual(0)
    expect(idx('hospital_doctors')).toBeGreaterThanOrEqual(0)
    expect(idx('retirement_log')).toBeLessThan(idx('hospital_doctors'))
  })
})

// Avoid unused-import warning (vi is imported defensively for any future mock).
void vi
