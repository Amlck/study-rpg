import {
  SECONDARY_ROOM_AFFINITY,
  computeThroughput,
  type Room,
  type RoomType,
} from '@study-rpg/content-medexam2-tw'
import type {
  DoctorRow,
  EquipmentRow,
  RoomSupportAssignmentRow,
  RoomSupportRoleId,
} from '../db/schema'
import { getEquipmentBonus } from './equipment'

export const ROOM_SUPPORT_ROLE_ANESTHESIA: RoomSupportRoleId = 'anesthesia'
export const ROOM_SUPPORT_ROLE_EMERGENCY_1: RoomSupportRoleId = 'emergency-1'
export const ROOM_SUPPORT_ROLE_EMERGENCY_2: RoomSupportRoleId = 'emergency-2'
export const ROOM_SUPPORT_ROLE_ICU_1: RoomSupportRoleId = 'icu-1'
export const SUPPORT_THROUGHPUT_SHARE = 0.35
export const ER_CONSULT_LEAD_BONUS = 1.15
export const ER_CONSULT_TEAM_BONUS = 1.25

export const ROOM_SUPPORT_ROLES_BY_TYPE: Readonly<Record<RoomType, readonly RoomSupportRoleId[]>> = Object.freeze({
  outpatient: Object.freeze([]),
  ward: Object.freeze([]),
  surgery: Object.freeze([ROOM_SUPPORT_ROLE_ANESTHESIA]),
  emergency: Object.freeze([ROOM_SUPPORT_ROLE_EMERGENCY_1, ROOM_SUPPORT_ROLE_EMERGENCY_2]),
  icu: Object.freeze([ROOM_SUPPORT_ROLE_ICU_1]),
})

export const ROOM_SUPPORT_ROLE_LABELS: Record<RoomSupportRoleId, string> = {
  anesthesia: '麻醉支援',
  'emergency-1': '急診支援 #1',
  'emergency-2': '急診支援 #2',
  'icu-1': 'ICU 支援 #1',
}

export const ROOM_SUPPORT_ROLE_DESCRIPTIONS: Record<RoomSupportRoleId, string> = {
  anesthesia: '手術房可由麻醉科醫師支援，支援醫師貢獻自身房間產能的 35%。',
  'emergency-1': '急診可由內科、外科、小兒科、麻醉科醫師支援，支援醫師貢獻 35% 產能。',
  'emergency-2': '急診可配置第二位支援醫師，支援醫師貢獻 35% 產能。',
  'icu-1': 'ICU 可由內科、神經內科、小兒科、麻醉科醫師支援，支援醫師貢獻 35% 產能。',
}

export function getSupportRolesForRoom(room: Room): readonly RoomSupportRoleId[] {
  return ROOM_SUPPORT_ROLES_BY_TYPE[room.type] ?? []
}

export function isSupportRoleAvailableForRoom(room: Room, roleId: RoomSupportRoleId): boolean {
  return getSupportRolesForRoom(room).includes(roleId)
}

export function isEligibleSupportDoctor(
  doctor: DoctorRow,
  roleId: RoomSupportRoleId,
): boolean {
  if (roleId === ROOM_SUPPORT_ROLE_ANESTHESIA) return doctor.subjectId === '麻醉科'
  if (roleId === ROOM_SUPPORT_ROLE_EMERGENCY_1 || roleId === ROOM_SUPPORT_ROLE_EMERGENCY_2) {
    return SECONDARY_ROOM_AFFINITY.emergency?.includes(doctor.subjectId) ?? false
  }
  if (roleId === ROOM_SUPPORT_ROLE_ICU_1) {
    return SECONDARY_ROOM_AFFINITY.icu?.includes(doctor.subjectId) ?? false
  }
  return false
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
  return true
}

export function getRoomSupportMultiplier(
  room: Room,
  leadDoctor: DoctorRow | null,
  supportDoctor: DoctorRow | null,
  roleId: RoomSupportRoleId,
): number {
  if (!canApplySupportBonus(room, leadDoctor, supportDoctor, roleId)) return 1
  return 1 + SUPPORT_THROUGHPUT_SHARE
}

export function buildSupportAssignmentByRoom(
  assignments: ReadonlyArray<RoomSupportAssignmentRow>,
): Map<string, RoomSupportAssignmentRow[]> {
  const roleOrder = new Map<RoomSupportRoleId, number>([
    [ROOM_SUPPORT_ROLE_ANESTHESIA, 1],
    [ROOM_SUPPORT_ROLE_EMERGENCY_1, 1],
    [ROOM_SUPPORT_ROLE_EMERGENCY_2, 2],
    [ROOM_SUPPORT_ROLE_ICU_1, 1],
  ])
  const byRoom = new Map<string, RoomSupportAssignmentRow[]>()
  for (const assignment of assignments) {
    const existing = byRoom.get(assignment.roomId) ?? []
    existing.push(assignment)
    existing.sort((a, b) => (roleOrder.get(a.roleId) ?? 99) - (roleOrder.get(b.roleId) ?? 99))
    byRoom.set(assignment.roomId, existing)
  }
  return byRoom
}

export function getSupportDoctorsForRoom(
  roomId: string,
  supportByRoom: Map<string, RoomSupportAssignmentRow[]>,
  doctorsById: Map<string, DoctorRow>,
): DoctorRow[] {
  const assignments = supportByRoom.get(roomId) ?? []
  return assignments
    .map((assignment) => doctorsById.get(assignment.doctorId) ?? null)
    .filter((doctor): doctor is DoctorRow => doctor !== null && doctor.assignedRoom === null)
}

export function getSupportDoctorForRoom(
  roomId: string,
  supportByRoom: Map<string, RoomSupportAssignmentRow[]>,
  doctorsById: Map<string, DoctorRow>,
): DoctorRow | null {
  return getSupportDoctorsForRoom(roomId, supportByRoom, doctorsById)[0] ?? null
}

export function computeSupportThroughput(
  room: Room,
  supportDoctor: DoctorRow | null,
  equippedItem: EquipmentRow | undefined,
): number {
  if (!supportDoctor) return 0
  return computeThroughput(room, supportDoctor, getEquipmentBonus(equippedItem, room.type)) * SUPPORT_THROUGHPUT_SHARE
}

export function computeRoomTeamThroughput(
  room: Room,
  leadDoctor: DoctorRow | null,
  supportDoctors: DoctorRow | ReadonlyArray<DoctorRow> | null,
  equippedItem: EquipmentRow | undefined,
  supportEquipmentMap?: Map<string, EquipmentRow>,
): number {
  if (!leadDoctor) return 0
  const equipmentBonus = getEquipmentBonus(equippedItem, room.type)
  const leadThroughput = computeThroughput(room, leadDoctor, equipmentBonus)
  const supportList = Array.isArray(supportDoctors)
    ? supportDoctors
    : supportDoctors
      ? [supportDoctors]
      : []
  return supportList.reduce(
    (sum, supportDoctor) =>
      sum + computeSupportThroughput(room, supportDoctor, supportEquipmentMap?.get(supportDoctor.id)),
    leadThroughput,
  )
}

export function getERConsultStaffingMultiplier(opts: {
  emergencyLeadCount: number
  emergencySupportCount: number
}): number {
  if (opts.emergencyLeadCount <= 0) return 1
  return opts.emergencySupportCount > 0 ? ER_CONSULT_TEAM_BONUS : ER_CONSULT_LEAD_BONUS
}
