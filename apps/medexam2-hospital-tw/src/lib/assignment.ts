/**
 * Doctor↔room assignment service. Single source of truth: `doctor.assignedRoom`.
 *
 * Spec: openspec/specs/hospital-tycoon-engine —
 *   "Doctor assignment SHALL use `Doctor.assignedRoom` as the single source of truth"
 *
 * `Room.assignedDoctorId` is retained in the type (cloud blob compat) but never
 * written by this module. Read sites derive room→doctor via `buildDoctorByRoom`
 * helper in `./room-doctor-map.ts`.
 *
 * `checkAssignmentInvariants` is an active repairer — it modifies state to
 * restore invariants. Invoked on app boot + after every successful cloud pull.
 */

<<<<<<< HEAD
import { getHospitalDB, type DoctorRow } from '../db/schema'
import {
  getRoomSupportCapacity,
  makeRoomSupportAssignmentId,
  normalizeSupportAssignment,
  roomSupportsTeams,
} from './room-team'
<<<<<<< Updated upstream
=======
=======
import { getHospitalDB, type DoctorRow, type RoomSupportRoleId } from '../db/schema'
import {
  ROOM_SUPPORT_ROLE_ANESTHESIA,
  isEligibleSupportDoctor,
  isSupportRoleAvailableForRoom,
} from '../services/room-team'
>>>>>>> 082a356aabc9653a22663510ebb18fca31c68dec
>>>>>>> Stashed changes

/**
 * Assign a doctor to a room. If a different doctor was already in that room,
 * the prior doctor's `assignedRoom` is cleared in the same transaction
 * (displacement). If the target doctor was assigned elsewhere, the move is
 * captured by the single `doctors.put` on the target row (no second-room write
 * needed — single source of truth).
 */
export async function assignDoctor(roomId: string, doctorId: string): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', [db.doctors, db.roomSupportAssignments], async () => {
    const doctor = await db.doctors.get(doctorId)
    if (!doctor) throw new Error(`assignDoctor: doctor ${doctorId} not found`)

    // A doctor cannot be primary and support at the same time.
    const supportRows = await db.roomSupportAssignments.where('doctorId').equals(doctorId).toArray()
    for (const row of supportRows) {
      await db.roomSupportAssignments.delete(row.id)
    }

    // Displace any other doctor pointing to the target room.
    const all = await db.doctors.toArray()
    for (const d of all) {
      if (d.id !== doctorId && d.assignedRoom === roomId) {
        await db.doctors.put({ ...d, assignedRoom: null })
      }
    }

    if (doctor.assignedRoom !== roomId) {
      await db.doctors.put({ ...doctor, assignedRoom: roomId })
    }

    const supportAssignments = await db.roomSupportAssignments
      .where('doctorId')
      .equals(doctorId)
      .toArray()
    for (const assignment of supportAssignments) {
      await db.roomSupportAssignments.delete([assignment.roomId, assignment.roleId])
    }
  })
}

/** Clear the doctor currently assigned to a room. No-op if room is empty. */
export async function unassignDoctor(roomId: string): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.doctors, async () => {
    const all = await db.doctors.toArray()
    const occupant = all.find((d) => d.assignedRoom === roomId)
    if (!occupant) return
    await db.doctors.put({ ...occupant, assignedRoom: null })
  })
}

export async function getUnassignedDoctors(): Promise<DoctorRow[]> {
  const db = getHospitalDB()
  const [all, supportAssignments] = await Promise.all([
    db.doctors.orderBy('obtainedAt').reverse().toArray(),
    db.roomSupportAssignments.toArray(),
  ])
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
>>>>>>> Stashed changes
  const supportDoctorIds = new Set(supportAssignments.map((row) => row.doctorId))
  return all.filter((d) => d.assignedRoom === null && !supportDoctorIds.has(d.id))
}

export async function getAvailableSupportDoctors(
  roomId: string,
  slot: number,
  primaryDoctorId: string | null,
): Promise<DoctorRow[]> {
  const db = getHospitalDB()
  const [all, currentSupport, supportAssignments] = await Promise.all([
    db.doctors.orderBy('obtainedAt').reverse().toArray(),
    db.roomSupportAssignments.get(makeRoomSupportAssignmentId(roomId, slot)),
    db.roomSupportAssignments.toArray(),
  ])
  const supportDoctorIds = new Set(
    supportAssignments
      .filter((row) => row.roomId !== roomId)
      .map((row) => row.doctorId),
  )
  const currentSupportDoctorId = currentSupport?.doctorId ?? null
  return all.filter((d) => {
    if (d.id === primaryDoctorId) return false
    if (d.id === currentSupportDoctorId) return true
    return d.assignedRoom === null && !supportDoctorIds.has(d.id)
  })
}

export async function assignSupportDoctor(roomId: string, doctorId: string): Promise<void> {
  return assignSupportDoctorToSlot(roomId, 1, doctorId)
}

export async function assignSupportDoctorToSlot(roomId: string, slot: number, doctorId: string): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', [db.rooms, db.doctors, db.roomSupportAssignments], async () => {
    const [room, doctor] = await Promise.all([db.rooms.get(roomId), db.doctors.get(doctorId)])
    if (!room) throw new Error(`assignSupportDoctor: room ${roomId} not found`)
    if (!doctor) throw new Error(`assignSupportDoctor: doctor ${doctorId} not found`)
    const capacity = getRoomSupportCapacity(room.type)
    if (!roomSupportsTeams(room.type)) {
      throw new Error(`assignSupportDoctor: room ${roomId} does not support team slots`)
    }
    if (!Number.isFinite(slot) || slot < 1 || slot > capacity) {
      throw new Error(`assignSupportDoctor: slot ${slot} is invalid for room ${roomId}`)
    }
    if (doctor.assignedRoom !== null) {
      throw new Error(`assignSupportDoctor: doctor ${doctorId} is already assigned as primary`)
    }

    const existingRows = await db.roomSupportAssignments.where('doctorId').equals(doctorId).toArray()
    for (const row of existingRows) {
      if (row.roomId !== roomId || row.slot !== slot) await db.roomSupportAssignments.delete(row.id)
    }

    await db.roomSupportAssignments.put({
      id: makeRoomSupportAssignmentId(roomId, slot),
      roomId,
      slot,
      doctorId,
      assignedAt: Date.now(),
    })
  })
}

export async function unassignSupportDoctor(roomId: string): Promise<void> {
  return unassignSupportDoctorFromSlot(roomId, 1)
}

export async function unassignSupportDoctorFromSlot(roomId: string, slot: number): Promise<void> {
  const db = getHospitalDB()
  await db.roomSupportAssignments.delete(makeRoomSupportAssignmentId(roomId, slot))
<<<<<<< Updated upstream
=======
=======
  const supportDoctorIds = new Set(supportAssignments.map((assignment) => assignment.doctorId))
  return all.filter((d) => d.assignedRoom === null && !supportDoctorIds.has(d.id))
}

export type AssignSupportResult =
  | { kind: 'success' }
  | {
      kind: 'aborted'
      reason:
        | 'room-not-found'
        | 'role-not-available'
        | 'doctor-not-found'
        | 'doctor-ineligible'
        | 'doctor-leading'
    }

export async function assignSupportDoctor(
  roomId: string,
  roleId: RoomSupportRoleId,
  doctorId: string,
): Promise<AssignSupportResult> {
  const db = getHospitalDB()
  return db.transaction(
    'rw',
    [db.rooms, db.doctors, db.roomSupportAssignments],
    async () => {
      const [room, doctor] = await Promise.all([db.rooms.get(roomId), db.doctors.get(doctorId)])
      if (!room) return { kind: 'aborted', reason: 'room-not-found' } as const
      if (!isSupportRoleAvailableForRoom(room, roleId)) {
        return { kind: 'aborted', reason: 'role-not-available' } as const
      }
      if (!doctor) return { kind: 'aborted', reason: 'doctor-not-found' } as const
      if (!isEligibleSupportDoctor(doctor, roleId)) {
        return { kind: 'aborted', reason: 'doctor-ineligible' } as const
      }
      if (doctor.assignedRoom !== null) {
        return { kind: 'aborted', reason: 'doctor-leading' } as const
      }

      const existingForDoctor = await db.roomSupportAssignments
        .where('doctorId')
        .equals(doctorId)
        .toArray()
      for (const assignment of existingForDoctor) {
        await db.roomSupportAssignments.delete([assignment.roomId, assignment.roleId])
      }

      await db.roomSupportAssignments.put({
        roomId,
        roleId,
        doctorId,
        assignedAt: Date.now(),
      })

      return { kind: 'success' } as const
    },
  )
}

export async function unassignSupportDoctor(
  roomId: string,
  roleId: RoomSupportRoleId,
): Promise<void> {
  const db = getHospitalDB()
  await db.roomSupportAssignments.delete([roomId, roleId])
}

export async function getAvailableSupportDoctors(
  roomId: string,
  roleId: RoomSupportRoleId = ROOM_SUPPORT_ROLE_ANESTHESIA,
): Promise<DoctorRow[]> {
  const db = getHospitalDB()
  const [room, allDoctors, supportAssignments] = await Promise.all([
    db.rooms.get(roomId),
    db.doctors.orderBy('obtainedAt').reverse().toArray(),
    db.roomSupportAssignments.toArray(),
  ])
  if (!room || !isSupportRoleAvailableForRoom(room, roleId)) return []
  const supportDoctorIds = new Set(
    supportAssignments
      .filter((assignment) => assignment.roomId !== roomId || assignment.roleId !== roleId)
      .map((assignment) => assignment.doctorId),
  )
  return allDoctors.filter(
    (doctor) =>
      doctor.assignedRoom === null &&
      !supportDoctorIds.has(doctor.id) &&
      isEligibleSupportDoctor(doctor, roleId),
  )
>>>>>>> 082a356aabc9653a22663510ebb18fca31c68dec
>>>>>>> Stashed changes
}

export interface AssignmentRepairReport {
  scanned: { rooms: number; doctors: number }
  repaired: {
    /** Rooms whose `assignedDoctorId` was non-null and got force-nulled. */
    roomsReset: number
    /** Doctors whose `assignedRoom` was nulled because another doctor with later
     *  `obtainedAt` already claimed the same room. */
    doctorsDuplicates: number
    /** Doctors whose `assignedRoom` pointed to a non-existent room id. */
    doctorsOrphans: number
<<<<<<< Updated upstream
    /** Support rows removed because they referenced invalid rooms/doctors or broke exclusivity. */
=======
<<<<<<< HEAD
    /** Support rows removed because they referenced invalid rooms/doctors or broke exclusivity. */
=======
    /** Support assignments removed because they were stale, duplicate, or invalid. */
>>>>>>> 082a356aabc9653a22663510ebb18fca31c68dec
>>>>>>> Stashed changes
    supportAssignments: number
  }
}

/**
 * Scan + repair assignment invariants in one Dexie transaction. Trusts the
 * `doctors` side as source of truth; force-nulls `rooms[*].assignedDoctorId`.
 *
 * Three repair rules (applied in one tx over both tables):
 *
 *   1. `room.assignedDoctorId !== null` → reset to null
 *   2. Multiple doctors with same `assignedRoom`: keep the one with the
 *      largest `obtainedAt`; null the rest
 *   3. `doctor.assignedRoom` references a room id not in the rooms table
 *      (orphan) → reset to null
 *
 * Invoked on app boot (App.tsx) and after every successful cloud pull
 * (sync/engine.ts pullNow resolve path).
 */
export async function checkAssignmentInvariants(): Promise<AssignmentRepairReport> {
  const db = getHospitalDB()
  const report: AssignmentRepairReport = {
    scanned: { rooms: 0, doctors: 0 },
    repaired: { roomsReset: 0, doctorsDuplicates: 0, doctorsOrphans: 0, supportAssignments: 0 },
  }

  await db.transaction('rw', db.rooms, db.doctors, db.roomSupportAssignments, async () => {
    const rooms = await db.rooms.toArray()
    const doctors = await db.doctors.toArray()
    const supportAssignments = await db.roomSupportAssignments.toArray()
    report.scanned.rooms = rooms.length
    report.scanned.doctors = doctors.length

    // Rule 1: force-null any non-null rooms.assignedDoctorId
    for (const r of rooms) {
      if (r.assignedDoctorId !== null) {
        await db.rooms.put({ ...r, assignedDoctorId: null })
        report.repaired.roomsReset += 1
      }
    }

    // Rule 2 + 3 setup
    const roomIds = new Set(rooms.map((r) => r.id))
    const byRoom = new Map<string, DoctorRow>()
    const orphans: DoctorRow[] = []
    const losers: DoctorRow[] = []

    for (const d of doctors) {
      if (d.assignedRoom === null) continue
      if (!roomIds.has(d.assignedRoom)) {
        // Rule 3: orphan
        orphans.push(d)
        continue
      }
      const existing = byRoom.get(d.assignedRoom)
      if (!existing) {
        byRoom.set(d.assignedRoom, d)
        continue
      }
      // Rule 2: duplicate — keep larger obtainedAt
      if (d.obtainedAt > existing.obtainedAt) {
        losers.push(existing)
        byRoom.set(d.assignedRoom, d)
      } else {
        losers.push(d)
      }
    }

    for (const d of losers) {
      await db.doctors.put({ ...d, assignedRoom: null })
      report.repaired.doctorsDuplicates += 1
    }
    for (const d of orphans) {
      await db.doctors.put({ ...d, assignedRoom: null })
      report.repaired.doctorsOrphans += 1
    }

<<<<<<< Updated upstream
=======
<<<<<<< HEAD
>>>>>>> Stashed changes
    const roomsById = new Map(rooms.map((r) => [r.id, r]))
    const doctorsById = new Map(doctors.map((d) => [d.id, d]))
    const supportDoctorIds = new Set<string>()
    for (const row of supportAssignments) {
      const normalized = normalizeSupportAssignment(row)
      const rowId = row.id ?? normalized.id
      if (normalized.id !== row.id || normalized.slot !== row.slot) {
        await db.roomSupportAssignments.delete(rowId)
        await db.roomSupportAssignments.put(normalized)
      }
      const room = roomsById.get(normalized.roomId)
      const doctor = doctorsById.get(normalized.doctorId)
      const invalid =
        !room ||
        !roomSupportsTeams(room.type) ||
        normalized.slot < 1 ||
        normalized.slot > getRoomSupportCapacity(room.type) ||
        !doctor ||
        doctor.assignedRoom !== null ||
        supportDoctorIds.has(normalized.doctorId)
      if (invalid) {
        await db.roomSupportAssignments.delete(normalized.id)
        report.repaired.supportAssignments += 1
      } else {
        supportDoctorIds.add(normalized.doctorId)
      }
    }
<<<<<<< Updated upstream
=======
=======
    const doctorsById = new Map(doctors.map((d) => [d.id, d]))
    const roomsById = new Map(rooms.map((r) => [r.id, r]))
    const supportDoctorWinner = new Map<string, { roomId: string; roleId: RoomSupportRoleId; assignedAt: number }>()
    const supportKeysToDelete = new Set<string>()
    const keyOf = (roomId: string, roleId: RoomSupportRoleId) => `${roomId}\u0000${roleId}`

    for (const assignment of supportAssignments) {
      const room = roomsById.get(assignment.roomId)
      const doctor = doctorsById.get(assignment.doctorId)
      let invalid = false
      if (!room || !doctor) invalid = true
      if (room && !isSupportRoleAvailableForRoom(room, assignment.roleId)) invalid = true
      if (doctor && doctor.assignedRoom !== null) invalid = true
      if (doctor && !isEligibleSupportDoctor(doctor, assignment.roleId)) invalid = true

      if (invalid) {
        supportKeysToDelete.add(keyOf(assignment.roomId, assignment.roleId))
        continue
      }

      const existing = supportDoctorWinner.get(assignment.doctorId)
      if (!existing || assignment.assignedAt > existing.assignedAt) {
        if (existing) supportKeysToDelete.add(keyOf(existing.roomId, existing.roleId))
        supportDoctorWinner.set(assignment.doctorId, {
          roomId: assignment.roomId,
          roleId: assignment.roleId,
          assignedAt: assignment.assignedAt,
        })
      } else {
        supportKeysToDelete.add(keyOf(assignment.roomId, assignment.roleId))
      }
    }

    for (const key of supportKeysToDelete) {
      const [roomId, roleId] = key.split('\u0000') as [string, RoomSupportRoleId]
      await db.roomSupportAssignments.delete([roomId, roleId])
      report.repaired.supportAssignments += 1
    }
>>>>>>> 082a356aabc9653a22663510ebb18fca31c68dec
>>>>>>> Stashed changes
  })

  const { roomsReset, doctorsDuplicates, doctorsOrphans, supportAssignments } = report.repaired
  if (roomsReset + doctorsDuplicates + doctorsOrphans + supportAssignments > 0) {
    console.info(
      `[assignment] repaired ${roomsReset + doctorsDuplicates + doctorsOrphans + supportAssignments} drift(s): ` +
<<<<<<< Updated upstream
        `roomsReset=${roomsReset}, doctorsDuplicates=${doctorsDuplicates}, doctorsOrphans=${doctorsOrphans}, ` +
        `supportAssignments=${supportAssignments}`,
=======
<<<<<<< HEAD
        `roomsReset=${roomsReset}, doctorsDuplicates=${doctorsDuplicates}, doctorsOrphans=${doctorsOrphans}, ` +
        `supportAssignments=${supportAssignments}`,
=======
        `roomsReset=${roomsReset}, doctorsDuplicates=${doctorsDuplicates}, ` +
        `doctorsOrphans=${doctorsOrphans}, supportAssignments=${supportAssignments}`,
>>>>>>> 082a356aabc9653a22663510ebb18fca31c68dec
>>>>>>> Stashed changes
    )
  }

  return report
}
