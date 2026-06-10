/**
 * Voluntary retirement service — `redesign-hospital-economy` §5.7.
 *
 * Atomic transaction:
 *   1. Read doctor + counters
 *   2. Delete doctor from `db.doctors` (removing the doctor row also drops its
 *      `assignedRoom` pointer — the single source of truth post `fix-medexam2-
 *      doctor-room-pointer-drift`, so no rooms-table mutation is needed)
 *   3. Clear any room-team support assignment for that doctor
 *   4. Refund `powerMultiplier × 1000` to `gameCounters.revenue`
 *   5. Append a `retirementLog` row for the 24-hour diversification grace lookup
 *
 * Curator note: retirement is destructive (db.doctors row gone). The UI MUST
 * present an explicit confirmation modal before invoking this service.
 */

import { getHospitalDB, type RetirementLogRow } from '../db/schema'

export type RetireResult =
  | { kind: 'success'; doctorId: string; refund: number; roomFreed: string | null }
  | { kind: 'not-found'; doctorId: string }

export async function retireDoctor(doctorId: string): Promise<RetireResult> {
  const db = getHospitalDB()
  return db.transaction(
    'rw',
<<<<<<< Updated upstream
    [db.doctors, db.roomSupportAssignments, db.gameCounters, db.retirementLog],
=======
<<<<<<< HEAD
    [db.doctors, db.roomSupportAssignments, db.gameCounters, db.retirementLog],
=======
    [db.doctors, db.gameCounters, db.retirementLog, db.roomSupportAssignments],
>>>>>>> 082a356aabc9653a22663510ebb18fca31c68dec
>>>>>>> Stashed changes
    async () => {
      const doctor = await db.doctors.get(doctorId)
      if (!doctor) return { kind: 'not-found', doctorId } as RetireResult

      const refund = doctor.powerMultiplier * 1000
      const roomFreed = doctor.assignedRoom

      // Delete the doctor row. With `Doctor.assignedRoom` as the single source
      // of truth, removing the row implicitly clears the room's occupancy —
      // no `rooms.put` needed.
      await db.doctors.delete(doctorId)
<<<<<<< Updated upstream
      const supportRows = await db.roomSupportAssignments.where('doctorId').equals(doctorId).toArray()
      for (const row of supportRows) {
        await db.roomSupportAssignments.delete(row.id)
=======
<<<<<<< HEAD
      const supportRows = await db.roomSupportAssignments.where('doctorId').equals(doctorId).toArray()
      for (const row of supportRows) {
        await db.roomSupportAssignments.delete(row.id)
=======
      const supportAssignments = await db.roomSupportAssignments
        .where('doctorId')
        .equals(doctorId)
        .toArray()
      for (const assignment of supportAssignments) {
        await db.roomSupportAssignments.delete([assignment.roomId, assignment.roleId])
>>>>>>> 082a356aabc9653a22663510ebb18fca31c68dec
>>>>>>> Stashed changes
      }

      // Refund to revenue
      const counters = await db.gameCounters.get('singleton')
      if (counters) {
        await db.gameCounters.put({ ...counters, revenue: counters.revenue + refund })
      }

      // Append retirementLog row
      const logRow: RetirementLogRow = {
        retiredAt: Date.now(),
        doctorId: doctor.id,
        subjectId: doctor.subjectId,
        rarity: doctor.rarity,
        refund,
      }
      await db.retirementLog.add(logRow)

      return { kind: 'success', doctorId, refund, roomFreed }
    },
  )
}
