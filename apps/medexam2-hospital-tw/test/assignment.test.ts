import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Room } from '@study-rpg/content-medexam2-tw'
import type { DoctorRow, RoomSupportAssignmentRow, RoomSupportRoleId } from '../src/db/schema'

function keyFrom(value: unknown): string {
  return Array.isArray(value) ? value.join('\u0000') : String(value)
}

class MemoryTable<T extends Record<string, unknown>> {
  rows = new Map<string, T>()

  constructor(private readonly keyForRow: (row: T) => unknown) {}

  async get(key: unknown): Promise<T | undefined> {
    return this.rows.get(keyFrom(key))
  }

  async put(row: T): Promise<void> {
    this.rows.set(keyFrom(this.keyForRow(row)), row)
  }

  async delete(key: unknown): Promise<void> {
    this.rows.delete(keyFrom(key))
  }

  async toArray(): Promise<T[]> {
    return Array.from(this.rows.values())
  }

  async count(): Promise<number> {
    return this.rows.size
  }

  where(field: keyof T) {
    return {
      equals: (value: unknown) => ({
        toArray: async () => Array.from(this.rows.values()).filter((row) => row[field] === value),
      }),
    }
  }

  orderBy(field: keyof T) {
    return {
      reverse: () => ({
        toArray: async () =>
          Array.from(this.rows.values()).sort((a, b) => Number(b[field]) - Number(a[field])),
      }),
    }
  }
}

const mockState = {
  db: {
    rooms: new MemoryTable<Room>((row) => row.id),
    doctors: new MemoryTable<DoctorRow>((row) => row.id),
    roomSupportAssignments: new MemoryTable<RoomSupportAssignmentRow>((row) => [
      row.roomId,
      row.roleId,
    ]),
    transaction: async <T>(_mode: 'rw', ...args: unknown[]) => {
      const callback = args[args.length - 1] as () => Promise<T>
      return callback()
    },
  },
}

vi.doMock('../src/db/schema', () => ({
  getHospitalDB: () => mockState.db,
}))

const {
  assignDoctor,
  assignSupportDoctor,
  checkAssignmentInvariants,
  getAvailableSupportDoctors,
} = await import('../src/lib/assignment')

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
    rarity: 'P4',
    powerMultiplier: 1.5,
    name: '外科 醫師',
    spriteKey: 'doctor-外科-P4',
    obtainedAt: 1,
    assignedRoom: null,
    pityCounter: 0,
    ...overrides,
  }
}

describe('room support assignments', () => {
  beforeEach(() => {
    mockState.db.rooms.rows.clear()
    mockState.db.doctors.rows.clear()
    mockState.db.roomSupportAssignments.rows.clear()
  })

  it('allows anesthesia support only from unassigned 麻醉科 doctors', async () => {
    await mockState.db.rooms.put(makeRoom())
    await mockState.db.doctors.put(makeDoctor({ id: 'lead-1', assignedRoom: 'surgery-1' }))
    await mockState.db.doctors.put(makeDoctor({ id: 'anes-1', subjectId: '麻醉科', name: '麻醉科 醫師' }))
    await mockState.db.doctors.put(makeDoctor({ id: 'anes-2', subjectId: '麻醉科', assignedRoom: 'ward-1' }))
    await mockState.db.doctors.put(makeDoctor({ id: 'fm-1', subjectId: '家醫科' }))

    const available = await getAvailableSupportDoctors('surgery-1')
    expect(available.map((doctor) => doctor.id)).toEqual(['anes-1'])

    await expect(assignSupportDoctor('surgery-1', 'anesthesia', 'fm-1')).resolves.toMatchObject({
      kind: 'aborted',
      reason: 'doctor-ineligible',
    })
    await expect(assignSupportDoctor('surgery-1', 'anesthesia', 'anes-1')).resolves.toMatchObject({
      kind: 'success',
    })
    expect(await mockState.db.roomSupportAssignments.get(['surgery-1', 'anesthesia'])).toMatchObject({
      doctorId: 'anes-1',
    })
  })

  it('moves support assignment and clears support when doctor becomes lead', async () => {
    await mockState.db.rooms.put(makeRoom({ id: 'surgery-1', slot: 1 }))
    await mockState.db.rooms.put(makeRoom({ id: 'surgery-2', slot: 2 }))
    await mockState.db.doctors.put(makeDoctor({ id: 'anes-1', subjectId: '麻醉科' }))

    await assignSupportDoctor('surgery-1', 'anesthesia', 'anes-1')
    await assignSupportDoctor('surgery-2', 'anesthesia', 'anes-1')

    expect(await mockState.db.roomSupportAssignments.get(['surgery-1', 'anesthesia'])).toBeUndefined()
    expect(await mockState.db.roomSupportAssignments.get(['surgery-2', 'anesthesia'])).toMatchObject({
      doctorId: 'anes-1',
    })

    await assignDoctor('surgery-1', 'anes-1')
    expect((await mockState.db.doctors.get('anes-1'))?.assignedRoom).toBe('surgery-1')
    expect(await mockState.db.roomSupportAssignments.count()).toBe(0)
  })

  it('repairs orphan, duplicate, and lead-conflicting support assignments', async () => {
    await mockState.db.rooms.put(makeRoom({ id: 'surgery-1' }))
    await mockState.db.rooms.put(makeRoom({ id: 'surgery-2' }))
    await mockState.db.doctors.put(makeDoctor({ id: 'anes-1', subjectId: '麻醉科' }))
    await mockState.db.doctors.put(makeDoctor({ id: 'anes-2', subjectId: '麻醉科', assignedRoom: 'surgery-2' }))
    await mockState.db.roomSupportAssignments.put({
      roomId: 'surgery-1',
      roleId: 'anesthesia' as RoomSupportRoleId,
      doctorId: 'anes-1',
      assignedAt: 1,
    })
    await mockState.db.roomSupportAssignments.put({
      roomId: 'surgery-2',
      roleId: 'anesthesia' as RoomSupportRoleId,
      doctorId: 'anes-1',
      assignedAt: 2,
    })
    await mockState.db.roomSupportAssignments.put({
      roomId: 'missing-room',
      roleId: 'anesthesia' as RoomSupportRoleId,
      doctorId: 'anes-2',
      assignedAt: 3,
    })

    const report = await checkAssignmentInvariants()

    expect(report.repaired.supportAssignments).toBe(2)
    expect(await mockState.db.roomSupportAssignments.get(['surgery-1', 'anesthesia'])).toBeUndefined()
    expect(await mockState.db.roomSupportAssignments.get(['surgery-2', 'anesthesia'])).toMatchObject({
      doctorId: 'anes-1',
    })
    expect(await mockState.db.roomSupportAssignments.get(['missing-room', 'anesthesia'])).toBeUndefined()
  })
})
