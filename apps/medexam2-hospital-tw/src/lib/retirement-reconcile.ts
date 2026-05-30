/**
 * Post-pull reconcile — iterate retirementLog and delete any matching doctor
 * rows from local Dexie. Covers two race-condition cases the apply-path
 * carve-out (HOSPITAL_DOCTORS.applyToLocal) alone cannot guarantee:
 *
 *   (a) Supabase per-table fetch returns doctors BEFORE retirement_log within
 *       the same pullNow() cycle, applying the doctor row to local Dexie
 *       before the tombstone arrives → carve-out doesn't fire on that write.
 *   (b) Pre-fix backfill: user installed a v3 client previously, accumulated
 *       ghost doctors that resurrected on every cold-start; this is their
 *       first time on v4 client → they have both a retirementLog row AND a
 *       stale doctor row that the carve-out alone wouldn't notice (the cloud
 *       row hasn't applied yet in this cycle).
 *
 * Spec linkage: `cloud-sync` capability requirement "Row deletion in
 * collection tables SHALL propagate via tombstone-table mechanism" — section
 * "Post-pull reconcile".
 *
 * Idempotency: calling repeatedly is a no-op once roster is clean. Each
 * iteration calls `db.doctors.delete(doctorId)` which is a no-op when the
 * doctor row is already absent.
 *
 * Error semantics: the caller (useSync.ts onPullComplete) catches and logs
 * but does NOT rethrow. Reconcile failure must not break the downstream
 * `checkAssignmentInvariants()` repair or any achievement evaluation.
 *
 * Ordering: this function MUST run BEFORE `checkAssignmentInvariants()` in
 * the onPullComplete chain. The invariant repair expects to read a correct
 * doctor roster to detect orphan room pointers; if reconcile runs after,
 * the repair would observe stale ghost rows and produce wrong fixes.
 */

import { getHospitalDB } from '../db/schema'

export async function reconcileRetiredDoctors(): Promise<{ cleaned: number }> {
  const db = getHospitalDB()
  let cleaned = 0
  await db.transaction('rw', [db.doctors, db.retirementLog], async () => {
    const tombstones = await db.retirementLog.toArray()
    for (const t of tombstones) {
      const existing = await db.doctors.get(t.doctorId)
      if (existing) {
        await db.doctors.delete(t.doctorId)
        cleaned += 1
      }
    }
  })
  return { cleaned }
}
