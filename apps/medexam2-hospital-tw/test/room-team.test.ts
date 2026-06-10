import { describe, expect, it } from 'vitest'
import type { Room } from '@study-rpg/content-medexam2-tw'
import type { DoctorRow } from '../src/db/schema'
import {
  ROOM_SUPPORT_ROLE_EMERGENCY_1,
  ROOM_SUPPORT_ROLE_EMERGENCY_2,
  ROOM_SUPPORT_ROLE_ANESTHESIA,
  computeRoomTeamThroughput,
  getSupportRolesForRoom,
  getRoomSupportMultiplier,
} from '../src/services/room-team'

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'surgery-1',
    type: 'surgery',
    baseRate: 10,
    roomFacility: 1,
    facilityLevel: 1,
    assignedDoctorId: null,
    slot: 1,
    ...overrides,
  }
}

function makeDoctor(overrides: Partial<DoctorRow> = {}): DoctorRow {
  return {
    id: 'doctor-1',
    subjectId: '外科',
    rarity: 'P3',
    powerMultiplier: 2,
    name: '外科 醫師',
    spriteKey: 'doctor-外科-P3',
    obtainedAt: 1,
    assignedRoom: null,
    pityCounter: 0,
    ...overrides,
  }
}

describe('room team throughput', () => {
  it('adds anesthesia support as 35% of the support doctor throughput', () => {
    const room = makeRoom()
    const lead = makeDoctor({ rarity: 'P3', powerMultiplier: 2 })
    const support = makeDoctor({
      id: 'anes-1',
      subjectId: '麻醉科',
      rarity: 'P2',
      powerMultiplier: 3,
      name: '麻醉科 醫師',
    })

    expect(getRoomSupportMultiplier(room, lead, support, ROOM_SUPPORT_ROLE_ANESTHESIA)).toBe(1.35)
    // Lead: 10 * 2 * 1.3 = 26. Support: (10 * 3) * 35% = 10.5.
    expect(computeRoomTeamThroughput(room, lead, support, undefined)).toBeCloseTo(36.5)
  })

  it('allows support throughput for a staffed room even when lead has no primary affinity', () => {
    const room = makeRoom()
    const lead = makeDoctor({ subjectId: '家醫科', rarity: 'P3' })
    const support = makeDoctor({ id: 'anes-1', subjectId: '麻醉科', rarity: 'P1' })

    expect(getRoomSupportMultiplier(room, lead, support, ROOM_SUPPORT_ROLE_ANESTHESIA)).toBe(1.35)
    // Mismatched lead keeps no-penalty lead throughput; support contributes additively.
    expect(computeRoomTeamThroughput(room, lead, support, undefined)).toBeCloseTo(27)
  })

  it('keeps empty-lead rooms at zero even with support assigned', () => {
    const room = makeRoom()
    const support = makeDoctor({ id: 'anes-1', subjectId: '麻醉科', rarity: 'P1' })

    expect(computeRoomTeamThroughput(room, null, support, undefined)).toBe(0)
  })

  it('supports two ER support slots', () => {
    const room = makeRoom({ id: 'emergency-1', type: 'emergency', baseRate: 12 })
    const lead = makeDoctor({ subjectId: '內科', rarity: 'P3', powerMultiplier: 2 })
    const supportA = makeDoctor({ id: 'support-a', subjectId: '外科', rarity: 'P3', powerMultiplier: 2 })
    const supportB = makeDoctor({ id: 'support-b', subjectId: '麻醉科', rarity: 'P2', powerMultiplier: 3 })

    expect(getSupportRolesForRoom(room)).toEqual([ROOM_SUPPORT_ROLE_EMERGENCY_1, ROOM_SUPPORT_ROLE_EMERGENCY_2])
    expect(computeRoomTeamThroughput(room, lead, [supportA, supportB], undefined)).toBeCloseTo(59.76)
  })
})
