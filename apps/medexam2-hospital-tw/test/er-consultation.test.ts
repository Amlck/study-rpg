import { describe, expect, it } from 'vitest'
import type { Room } from '@study-rpg/content-medexam2-tw'
import type { DoctorRow, RoomSupportAssignmentRow } from '../src/db/schema'
import { computeERConsultStaffingMultiplierFromRows } from '../src/services/er-consultation'

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: 'emergency-1',
    type: 'emergency',
    baseRate: 12,
    roomFacility: 1,
    facilityLevel: 1,
    assignedDoctorId: null,
    slot: 1,
    ...overrides,
  }
}

function doctor(overrides: Partial<DoctorRow> = {}): DoctorRow {
  return {
    id: 'doctor-1',
    subjectId: '內科',
    rarity: 'P3',
    powerMultiplier: 2,
    name: '內科 醫師',
    spriteKey: 'doctor-內科-P3',
    obtainedAt: 1,
    assignedRoom: null,
    pityCounter: 0,
    ...overrides,
  }
}

describe('ER consult staffing multiplier', () => {
  it('uses no bonus without a staffed ER lead', () => {
    expect(computeERConsultStaffingMultiplierFromRows([room()], [doctor()], [])).toBe(1)
  })

  it('gives lead and team bonuses for staffed ER rooms', () => {
    const rooms = [room()]
    const lead = doctor({ id: 'lead', assignedRoom: 'emergency-1' })
    const support = doctor({ id: 'support', subjectId: '外科' })
    const supportAssignments: RoomSupportAssignmentRow[] = [
      { roomId: 'emergency-1', roleId: 'emergency-1', doctorId: 'support', assignedAt: 1 },
    ]

    expect(computeERConsultStaffingMultiplierFromRows(rooms, [lead], [])).toBe(1.15)
    expect(computeERConsultStaffingMultiplierFromRows(rooms, [lead, support], supportAssignments)).toBe(1.25)
  })
})
