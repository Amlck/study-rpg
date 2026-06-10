/**
 * Single-source-of-truth helper: derive room→doctor mapping from
 * `doctor.assignedRoom` (the only authoritative pointer post `fix-medexam2-doctor-room-pointer-drift`).
 *
 * Spec: openspec/specs/hospital-tycoon-engine — "Read sites SHALL derive
 * room→doctor mapping via shared helper".
 *
 * Race safety: if two doctors transiently point to the same room (e.g. between
 * cloud pull and `checkAssignmentInvariants()` repair), the larger `obtainedAt`
 * wins. This is a defense-in-depth — repair should already have cleaned this up
 * by the time React renders.
 */

import type { DoctorRow, RoomSupportAssignmentRow } from '../db/schema'

export function buildDoctorByRoom(
  doctors: ReadonlyArray<DoctorRow>,
): Map<string, DoctorRow> {
  const m = new Map<string, DoctorRow>()
  for (const d of doctors) {
    if (d.assignedRoom === null) continue
    const existing = m.get(d.assignedRoom)
    if (!existing || d.obtainedAt > existing.obtainedAt) {
      m.set(d.assignedRoom, d)
    }
  }
  return m
}

export function getAssignedDoctor(
  roomId: string,
  doctorByRoom: Map<string, DoctorRow>,
): DoctorRow | null {
  return doctorByRoom.get(roomId) ?? null
}

export function buildSupportDoctorByRoom(
  doctors: ReadonlyArray<DoctorRow>,
  supportAssignments: ReadonlyArray<RoomSupportAssignmentRow>,
): Map<string, DoctorRow[]> {
  const doctorsById = new Map(doctors.map((doctor) => [doctor.id, doctor]))
  const byRoom = new Map<string, DoctorRow[]>()
  const ordered = [...supportAssignments].sort((a, b) => a.roleId.localeCompare(b.roleId))
  for (const assignment of ordered) {
    const doctor = doctorsById.get(assignment.doctorId)
    if (!doctor || doctor.assignedRoom !== null) continue
    const list = byRoom.get(assignment.roomId) ?? []
    list.push(doctor)
    byRoom.set(assignment.roomId, list)
  }
  return byRoom
}

export function getSupportDoctors(
  roomId: string,
  supportDoctorByRoom: Map<string, DoctorRow[]>,
): DoctorRow[] {
  return supportDoctorByRoom.get(roomId) ?? []
}
