import { computeThroughput, type Room, type RoomType } from '@study-rpg/content-medexam2-tw'
import type { DoctorRow, RoomSupportAssignmentRow } from '../db/schema'

export const SUPPORT_THROUGHPUT_SHARE = 0.35
export const ER_CONSULT_LEAD_BONUS = 1.15
export const ER_CONSULT_TEAM_BONUS = 1.25

export const ROOM_SUPPORT_CAPACITY: Readonly<Record<RoomType, number>> = Object.freeze({
  outpatient: 0,
  ward: 0,
  surgery: 1,
  emergency: 2,
  icu: 1,
})

export function getRoomSupportCapacity(roomType: RoomType): number {
  return ROOM_SUPPORT_CAPACITY[roomType] ?? 0
}

export function roomSupportsTeams(roomType: RoomType): boolean {
  return getRoomSupportCapacity(roomType) > 0
}

export function makeRoomSupportAssignmentId(roomId: string, slot: number): string {
  return `${roomId}:${slot}`
}

export function normalizeSupportAssignment(
  row: Partial<RoomSupportAssignmentRow> & { roomId: string; doctorId: string; assignedAt?: number },
): RoomSupportAssignmentRow {
  const slot = Number.isFinite(row.slot) && row.slot! > 0 ? Math.floor(row.slot!) : 1
  return {
    id: makeRoomSupportAssignmentId(row.roomId, slot),
    roomId: row.roomId,
    slot,
    doctorId: row.doctorId,
    assignedAt: row.assignedAt ?? Date.now(),
    _updatedAt: row._updatedAt,
  }
}

export function computeSupportThroughput(
  room: Pick<Room, 'baseRate' | 'roomFacility' | 'type'>,
  supportDoctor: DoctorRow | null,
  supportEquipmentBonus = 1,
): number {
  if (!roomSupportsTeams(room.type) || !supportDoctor) return 0
  return computeThroughput(room, supportDoctor, supportEquipmentBonus) * SUPPORT_THROUGHPUT_SHARE
}

export function computeRoomThroughputWithSupport(
  room: Pick<Room, 'baseRate' | 'roomFacility' | 'type'>,
  primaryDoctor: DoctorRow | null,
  primaryEquipmentBonus: number,
  supportDoctors: ReadonlyArray<{ doctor: DoctorRow; equipmentBonus: number }>,
): number {
  let total = computeThroughput(room, primaryDoctor, primaryEquipmentBonus)
  for (const support of supportDoctors) {
    total += computeSupportThroughput(room, support.doctor, support.equipmentBonus)
  }
  return total
}

export function getERConsultStaffingMultiplier(opts: {
  emergencyLeadCount: number
  emergencySupportCount: number
}): number {
  if (opts.emergencyLeadCount <= 0) return 1
  return opts.emergencySupportCount > 0 ? ER_CONSULT_TEAM_BONUS : ER_CONSULT_LEAD_BONUS
}
