import {
  SUBJECT_TO_ROOM,
  computeThroughput,
  type Room,
} from '@study-rpg/content-medexam2-tw'
import type {
  DoctorRow,
  EquipmentRow,
  RoomSupportAssignmentRow,
  RoomSupportRoleId,
} from '../db/schema'
import { getEquipmentBonus } from './equipment'

export const ROOM_SUPPORT_ROLE_ANESTHESIA: RoomSupportRoleId = 'anesthesia'

export const ROOM_SUPPORT_ROLE_LABELS: Record<RoomSupportRoleId, string> = {
  anesthesia: '麻醉支援',
}

export const ROOM_SUPPORT_ROLE_DESCRIPTIONS: Record<RoomSupportRoleId, string> = {
  anesthesia: '手術房可由麻醉科醫師支援，提升外科系主治的團隊產能。',
}

export const ROOM_SUPPORT_BONUS_BY_RARITY: Record<DoctorRow['rarity'], number> = {
  P1: 1.35,
  P2: 1.25,
  P3: 1.18,
  P4: 1.12,
  P5: 1.08,
}

export function isSupportRoleAvailableForRoom(room: Room, roleId: RoomSupportRoleId): boolean {
  return roleId === ROOM_SUPPORT_ROLE_ANESTHESIA && room.type === 'surgery'
}

export function isEligibleSupportDoctor(
  doctor: DoctorRow,
  roleId: RoomSupportRoleId,
): boolean {
  return roleId === ROOM_SUPPORT_ROLE_ANESTHESIA && doctor.subjectId === '麻醉科'
}

export function canApplySupportBonus(
  room: Room,
  leadDoctor: DoctorRow | null,
  supportDoctor: DoctorRow | null,
  roleId: RoomSupportRoleId,
): boolean {
  if (!isSupportRoleAvailableForRoom(room, roleId)) return false
  if (!leadDoctor || !supportDoctor) return false
  if (!isEligibleSupportDoctor(supportDoctor, roleId)) return false
  return SUBJECT_TO_ROOM[leadDoctor.subjectId] === room.type
}

export function getRoomSupportMultiplier(
  room: Room,
  leadDoctor: DoctorRow | null,
  supportDoctor: DoctorRow | null,
  roleId: RoomSupportRoleId,
): number {
  if (!canApplySupportBonus(room, leadDoctor, supportDoctor, roleId)) return 1
  if (!supportDoctor) return 1
  return ROOM_SUPPORT_BONUS_BY_RARITY[supportDoctor.rarity]
}

export function buildSupportAssignmentByRoom(
  assignments: ReadonlyArray<RoomSupportAssignmentRow>,
): Map<string, RoomSupportAssignmentRow> {
  const byRoom = new Map<string, RoomSupportAssignmentRow>()
  for (const assignment of assignments) {
    if (assignment.roleId !== ROOM_SUPPORT_ROLE_ANESTHESIA) continue
    const existing = byRoom.get(assignment.roomId)
    if (!existing || assignment.assignedAt > existing.assignedAt) {
      byRoom.set(assignment.roomId, assignment)
    }
  }
  return byRoom
}

export function getSupportDoctorForRoom(
  roomId: string,
  supportByRoom: Map<string, RoomSupportAssignmentRow>,
  doctorsById: Map<string, DoctorRow>,
): DoctorRow | null {
  const assignment = supportByRoom.get(roomId)
  if (!assignment) return null
  return doctorsById.get(assignment.doctorId) ?? null
}

export function computeRoomTeamThroughput(
  room: Room,
  leadDoctor: DoctorRow | null,
  supportDoctor: DoctorRow | null,
  equippedItem: EquipmentRow | undefined,
): number {
  const equipmentBonus = getEquipmentBonus(equippedItem, room.type)
  const leadThroughput = computeThroughput(room, leadDoctor, equipmentBonus)
  return leadThroughput * getRoomSupportMultiplier(
    room,
    leadDoctor,
    supportDoctor,
    ROOM_SUPPORT_ROLE_ANESTHESIA,
  )
}
