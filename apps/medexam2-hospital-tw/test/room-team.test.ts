import { describe, expect, it } from 'vitest'
import type { Room } from '@study-rpg/content-medexam2-tw'
import type { DoctorRow } from '../src/db/schema'
import {
  ROOM_SUPPORT_ROLE_ANESTHESIA,
  computeRoomTeamThroughput,
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

describe('surgery team throughput', () => {
  it('adds an anesthesia support multiplier when surgery lead is eligible', () => {
    const room = makeRoom()
    const lead = makeDoctor({ rarity: 'P3', powerMultiplier: 2 })
    const support = makeDoctor({
      id: 'anes-1',
      subjectId: '麻醉科',
      rarity: 'P2',
      powerMultiplier: 3,
      name: '麻醉科 醫師',
    })

    expect(getRoomSupportMultiplier(room, lead, support, ROOM_SUPPORT_ROLE_ANESTHESIA)).toBe(1.25)
    // 10 base * 2 doctor * 1 facility * 1.3 affinity * 1.25 team
    expect(computeRoomTeamThroughput(room, lead, support, undefined)).toBeCloseTo(32.5)
  })

  it('does not add team bonus without a surgery-mapped lead', () => {
    const room = makeRoom()
    const lead = makeDoctor({ subjectId: '家醫科', rarity: 'P3' })
    const support = makeDoctor({ id: 'anes-1', subjectId: '麻醉科', rarity: 'P1' })

    expect(getRoomSupportMultiplier(room, lead, support, ROOM_SUPPORT_ROLE_ANESTHESIA)).toBe(1)
    // Mismatched lead still keeps current no-penalty lead throughput.
    expect(computeRoomTeamThroughput(room, lead, support, undefined)).toBeCloseTo(20)
  })

  it('keeps empty-lead rooms at zero even with support assigned', () => {
    const room = makeRoom()
    const support = makeDoctor({ id: 'anes-1', subjectId: '麻醉科', rarity: 'P1' })

    expect(computeRoomTeamThroughput(room, null, support, undefined)).toBe(0)
  })
})
