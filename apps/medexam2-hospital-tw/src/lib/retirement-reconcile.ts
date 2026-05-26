/**
 * Post-pull reconcile for the doctor-retire tombstone mechanism.
 *
 * Iterates every row in `db.retirementLog` (the authoritative tombstone
 * table per fix-doctor-retire-cloud-resurrection 2026-05-26) and deletes
 * any `db.doctors` row whose `id` matches a tombstone's `doctorId`.
 *
 * Two race-condition cases this covers that the apply-path carve-out in
 * `HOSPITAL_DOCTORS.applyToLocal` cannot alone:
 *
 *   1. Supabase per-table pull does not guarantee inter-table apply
 *      order within a single `pullNow()`. If `hospital_doctors` is
 *      fetched before `retirement_log` and the local `retirementLog`
 *      table is empty at the moment of `HOSPITAL_DOCTORS.applyToLocal`,
 *      the carve-out cannot fire and the doctor row gets force-written
 *      to local Dexie. The subsequent `retirement_log` fetch lands the
 *      tombstone, but the doctor is already resurrected — this reconcile
 *      cleans up at the end of `onPullComplete`.
 *
 *   2. Pre-fix backfill: players who ran the pre-fix build, retired a
 *      doctor, and saw resurrection have BOTH a local `doctors[X]` row
 *      (resurrected from cloud) AND a local `retirementLog[X]` row
 *      (from the original retire). The first post-fix cold-start force-
 *      pulls retirementLog from cloud, the carve-out fires for that
 *      specific cloud row's apply, but pre-existing local ghost doctors
 *      need this reconcile to clean up.
 *
 * Idempotent: calling on a healthy state is a no-op (no matching
 * doctor rows to delete). Wrapped in its own try/catch by the caller
 * (`useSync.ts onPullComplete`) so any transient failure does not
 * break downstream achievement/invariant chains.
 *
 * MUST run BEFORE `checkAssignmentInvariants()` in the onPullComplete
 * chain — the invariant repair expects an accurate doctor roster.
 *
 * Spec: openspec/specs/cloud-sync/spec.md "Row deletion in collection
 * tables SHALL propagate via tombstone-table mechanism" → Post-pull
 * reconcile section.
 */

import { getHospitalDB } from '../db/schema'

export async function reconcileRetiredDoctors(): Promise<{ cleaned: number }> {
  const db = getHospitalDB()
  let cleaned = 0

  await db.transaction('rw', [db.doctors, db.retirementLog], async () => {
    const tombstones = await db.retirementLog.toArray()
    for (const t of tombstones) {
      const ghost = await db.doctors.get(t.doctorId)
      if (ghost) {
        await db.doctors.delete(t.doctorId)
        cleaned++
      }
    }
  })

  return { cleaned }
}
