/**
 * Retirement tombstone tests — fix-doctor-retire-cloud-resurrection-v2.
 *
 * §8.12 of tasks.md is MANDATORY: it exercises the Dexie v18 → v19 upgrade
 * path with REAL existing v18 data including a duplicate-doctorId pair.
 * This is the primary guard against any future contributor mistakenly
 * changing retirementLog pk (v1 commit dac4eae did this and was prod-reverted
 * because Dexie 4.x throws `UpgradeError Not yet support for changing primary
 * key`). See ~/.claude/imports/dexie_pk_change_pitfall.md.
 *
 * DO NOT "simplify" the §8.12 fixture to open a fresh v19 DB or seed only
 * unique doctorIds — that defeats the entire purpose of the test.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { HospitalDB } from '../db/schema'

// Each upgrade test uses its own DB name so fake-indexeddb keeps them isolated.
// indexedDB.deleteDatabase between tests is the cheapest cleanup.
async function deleteDb(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(name)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
    req.onblocked = () => resolve() // best-effort
  })
}

describe('§8.12 MANDATORY — v18 → v19 upgrade from existing data (Dexie pk-change guard)', () => {
  const TEST_DB = 'test-retirement-tombstone-v18-to-v19'

  beforeEach(async () => {
    await deleteDb(TEST_DB)
  })

  afterEach(async () => {
    await deleteDb(TEST_DB)
  })

  it('opens cleanly from v18 with existing retirementLog rows and dedups duplicates', async () => {
    // 1. Open at explicit v18 schema only (mirror the actual v18 schema string),
    //    write 3 rows including a duplicate-doctorId pair (simulates the
    //    ghost-resurrection bug: retire doc-x → ghost back → retire doc-x again).
    const dbV18 = new Dexie(TEST_DB)
    dbV18.version(18).stores({ retirementLog: '++id, retiredAt, doctorId' })
    await dbV18.open()
    await dbV18.table('retirementLog').bulkAdd([
      { doctorId: 'doc-x', retiredAt: 1000, subjectId: '內科', rarity: 'P3', refund: 500 },
      // ↑ first retire event for doc-x — should win after dedup (smallest retiredAt)
      { doctorId: 'doc-x', retiredAt: 2000, subjectId: '內科', rarity: 'P3', refund: 500 },
      // ↑ ghost-resurrection then re-retire — duplicate doctorId
      { doctorId: 'doc-y', retiredAt: 1500, subjectId: '外科', rarity: 'P4', refund: 250 },
    ])
    dbV18.close()

    // 2. Reopen with the FULL HospitalDB chain (which declares v1 ... v18 v19).
    //    THIS is the canonical guard — if v2 mistakenly changes pk or the
    //    upgrade callback ordering is wrong, .open() will throw
    //    DatabaseClosedError / UpgradeError / ConstraintError here.
    const dbV19 = new HospitalDB(TEST_DB)
    await dbV19.open()

    // 3. Assert dedup kept the smaller retiredAt + secondary-index lookup works.
    const docX = await dbV19.retirementLog.where('doctorId').equals('doc-x').first()
    expect(docX).toBeDefined()
    expect(docX!.retiredAt).toBe(1000) // smaller of {1000, 2000}
    expect(docX!._updatedAt).toBe(1000) // backfilled from retiredAt

    const docY = await dbV19.retirementLog.where('doctorId').equals('doc-y').first()
    expect(docY).toBeDefined()
    expect(docY!.retiredAt).toBe(1500)

    const allRows = await dbV19.retirementLog.toArray()
    expect(allRows.length).toBe(2) // 3 input rows → 2 unique doctorIds

    // 4. Path A: doctorId is a plain (non-unique) secondary index. Uniqueness
    //    invariant lives at the app layer (services/retire.ts — retire is
    //    destructive, can't re-retire a deleted doctor) and at the cloud layer
    //    (Supabase composite pk (user_id, doctor_id)). Dexie does NOT enforce
    //    uniqueness, so adding a duplicate succeeds locally (but would never
    //    happen via the retire flow). Adapter snapshotDirty / snapshotAll
    //    still emit one logical row per doctorId via .where().first() lookup.
    //    See design.md Decision 2 (Path A note added post-codex-audit 2026-05-27).
    await dbV19.retirementLog.add({
      doctorId: 'doc-x',
      retiredAt: 3000,
      subjectId: '內科',
      rarity: 'P3',
      refund: 500,
      _updatedAt: Date.now(),
    })
    // After the extra add we have 3 rows total but still only 2 unique doctorIds.
    expect(await dbV19.retirementLog.count()).toBe(3)
    const xRows = await dbV19.retirementLog.where('doctorId').equals('doc-x').toArray()
    expect(xRows.length).toBe(2) // pre-existing dedup result + new duplicate

    // 5. Assert pk is still auto-incr `id` (numbers), not `doctorId` (strings).
    //    If anyone changes the pk in the future, this assertion catches it.
    for (const row of allRows) {
      expect(typeof row.id).toBe('number')
      expect(row.id).not.toBe(row.doctorId) // sanity: numeric id != string doctorId
    }

    dbV19.close()
  })

  it('opens cleanly from v18 with zero retirementLog rows (fresh / never-retired user)', async () => {
    // Edge case: brand-new v18 user who never retired anyone. Upgrade callback
    // should early-return without touching the table.
    const dbV18 = new Dexie(TEST_DB)
    dbV18.version(18).stores({ retirementLog: '++id, retiredAt, doctorId' })
    await dbV18.open()
    dbV18.close()

    const dbV19 = new HospitalDB(TEST_DB)
    await dbV19.open()

    expect(await dbV19.retirementLog.count()).toBe(0)

    // Fresh v19 row also works (sanity check the new schema isn't broken).
    await dbV19.retirementLog.add({
      doctorId: 'fresh-doc',
      retiredAt: 9999,
      subjectId: '內科',
      rarity: 'P5',
      refund: 100,
      _updatedAt: 9999,
    })
    const fresh = await dbV19.retirementLog.where('doctorId').equals('fresh-doc').first()
    expect(fresh).toBeDefined()
    expect(typeof fresh!.id).toBe('number') // auto-incr pk works

    dbV19.close()
  })

  it('opens cleanly from v18 with all-unique doctorId rows (no dedup needed)', async () => {
    // Happy path: existing user with valid v18 data (no ghost-resurrection
    // duplicates). Upgrade callback should still rewrite (idempotent — read
    // → identity transform → write back with _updatedAt backfilled) without
    // dropping any rows.
    const dbV18 = new Dexie(TEST_DB)
    dbV18.version(18).stores({ retirementLog: '++id, retiredAt, doctorId' })
    await dbV18.open()
    await dbV18.table('retirementLog').bulkAdd([
      { doctorId: 'doc-a', retiredAt: 100, subjectId: '內科', rarity: 'P3', refund: 500 },
      { doctorId: 'doc-b', retiredAt: 200, subjectId: '外科', rarity: 'P4', refund: 250 },
      { doctorId: 'doc-c', retiredAt: 300, subjectId: '婦產科', rarity: 'P5', refund: 100 },
    ])
    dbV18.close()

    const dbV19 = new HospitalDB(TEST_DB)
    await dbV19.open()

    const all = await dbV19.retirementLog.toArray()
    expect(all.length).toBe(3) // all 3 preserved

    // All rows backfilled with _updatedAt === their retiredAt
    for (const row of all) {
      expect(row._updatedAt).toBe(row.retiredAt)
    }

    dbV19.close()
  })
})
