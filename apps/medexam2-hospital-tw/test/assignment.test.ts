import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Rarity, Room, RoomType } from '@study-rpg/content-medexam2-tw'
import {
  AFFINITY_MATCH_BONUS,
  ROOM_EXTENSION_COSTS,
  ROOM_TYPE_LABELS,
  TIER_ROOMS,
  computeThroughput,
  getAffinityBonus,
} from '@study-rpg/content-medexam2-tw'
import type {
  AffinityRow,
  DoctorRow,
  GachaStatsRow,
  GameCountersRow,
  RoomSupportAssignmentRow,
  TicketsRow,
} from '../src/db/schema'

class MemoryTable<T extends Record<string, unknown>, K extends keyof T = 'id'> {
  rows = new Map<string, T>()

  constructor(private readonly key: K) {}

  async get(id: string): Promise<T | undefined> {
    return this.rows.get(id)
  }

  async put(row: T): Promise<void> {
    this.rows.set(String(row[this.key]), row)
  }

  async bulkPut(rows: T[]): Promise<void> {
    for (const row of rows) await this.put(row)
  }

  async add(row: T): Promise<void> {
    await this.put(row)
  }

  async delete(id: string): Promise<void> {
    this.rows.delete(id)
  }

  async clear(): Promise<void> {
    this.rows.clear()
  }

  async toArray(): Promise<T[]> {
    return Array.from(this.rows.values())
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

type MockDB = {
  doctors: MemoryTable<DoctorRow>
  rooms: MemoryTable<Room, 'id'>
  roomSupportAssignments: MemoryTable<RoomSupportAssignmentRow, 'id'>
  gameCounters: MemoryTable<GameCountersRow>
  gachaStats: MemoryTable<GachaStatsRow>
  tickets: MemoryTable<TicketsRow>
  affinity: MemoryTable<AffinityRow, 'subjectId'>
  transaction: <T>(
    mode: 'rw',
    ...args: unknown[]
  ) => Promise<T>
}

const mockState = {
  db: {
    doctors: new MemoryTable<DoctorRow>('id'),
    rooms: new MemoryTable<Room, 'id'>('id'),
    roomSupportAssignments: new MemoryTable<RoomSupportAssignmentRow, 'id'>('id'),
    gameCounters: new MemoryTable<GameCountersRow>('id'),
    gachaStats: new MemoryTable<GachaStatsRow>('id'),
    tickets: new MemoryTable<TicketsRow>('id'),
    affinity: new MemoryTable<AffinityRow, 'subjectId'>('subjectId'),
    transaction: async <T>(_mode: 'rw', ...args: unknown[]) => {
      const callback = args[args.length - 1] as () => Promise<T>
      return callback()
    },
  } satisfies MockDB,
}

vi.doMock('../src/db/schema', () => ({
  ALL_SUBJECT_IDS: ['內科', '外科', '小兒科', '麻醉科', '神經內科'],
  getHospitalDB: () => mockState.db,
}))

const {
  assignDoctor,
  assignSupportDoctor,
  assignSupportDoctorToSlot,
  checkAssignmentInvariants,
  getUnassignedDoctors,
} = await import('../src/lib/assignment')
const {
  computeRoomThroughputWithSupport,
  getERConsultStaffingMultiplier,
  makeRoomSupportAssignmentId,
  normalizeSupportAssignment,
} = await import('../src/lib/room-team')
const { HOSPITAL_ADAPTERS } = await import('../src/lib/sync/tables')
const { getERConsultStaffingMultiplierFromDb } = await import('../src/services/er-consultation')

function makeDoctor(id: string, overrides: Partial<DoctorRow> = {}): DoctorRow {
  return {
    id,
    subjectId: '外科',
    rarity: 'P4' as Rarity,
    powerMultiplier: 1.5,
    name: id,
    spriteKey: `doctor-${id}`,
    obtainedAt: Number(id.replace(/\D/g, '')) || 1,
    assignedRoom: null,
    pityCounter: 0,
    ...overrides,
  }
}

function makeRoom(id: string, type: RoomType = 'surgery'): Room {
  return {
    id,
    type,
    baseRate: type === 'emergency' ? 12 : type === 'icu' ? 14 : 10,
    roomFacility: 1,
    facilityLevel: 1,
    assignedDoctorId: null,
    slot: Number(id.replace(/\D/g, '')) || 1,
  }
}

function makeSupport(row: Omit<RoomSupportAssignmentRow, 'id' | 'slot'> & Partial<Pick<RoomSupportAssignmentRow, 'id' | 'slot'>>): RoomSupportAssignmentRow {
  const slot = row.slot ?? 1
  return {
    id: row.id ?? makeRoomSupportAssignmentId(row.roomId, slot),
    slot,
    ...row,
  }
}

function makeCounters(overrides: Partial<GameCountersRow> = {}): GameCountersRow {
  return {
    id: 'singleton',
    revenue: 0,
    reputation: 0,
    lastTickAt: 1,
    tier: '診所',
    hasUsedStarterPull: false,
    currentSessionStartedAt: null,
    lastSessionEndedAt: null,
    tutorial: { completedSteps: {}, firstVisit: {}, firedTips: {} },
    ...overrides,
  }
}

function resetMockDb(): void {
  mockState.db.doctors.rows.clear()
  mockState.db.rooms.rows.clear()
  mockState.db.roomSupportAssignments.rows.clear()
  mockState.db.gameCounters.rows.clear()
  mockState.db.gachaStats.rows.clear()
  mockState.db.tickets.rows.clear()
  mockState.db.affinity.rows.clear()
}

describe('ER and ICU room metadata', () => {
  it('defines labels, tier rosters, and extension costs', () => {
    expect(ROOM_TYPE_LABELS.emergency).toBe('急診')
    expect(ROOM_TYPE_LABELS.icu).toBe('加護病房')
    expect(TIER_ROOMS['診所'].some((room) => room.type === 'emergency' || room.type === 'icu')).toBe(false)
    expect(TIER_ROOMS['區域醫院'].map((room) => room.id)).toContain('emergency-1')
    expect(TIER_ROOMS['醫學中心'].map((room) => room.id)).toContain('icu-1')
    expect(TIER_ROOMS['國家級教學醫院'].map((room) => room.id)).toEqual(
      expect.arrayContaining(['emergency-2', 'icu-2']),
    )
    expect(ROOM_EXTENSION_COSTS.emergency).toEqual({ cost: 150_000, maxExtras: 2 })
    expect(ROOM_EXTENSION_COSTS.icu).toEqual({ cost: 450_000, maxExtras: 1 })
  })

  it('applies secondary multi-fit affinity bonuses for ER and ICU', () => {
    expect(getAffinityBonus('P4', '外科', 'emergency')).toBe(AFFINITY_MATCH_BONUS.P4)
    expect(getAffinityBonus('P4', '麻醉科', 'emergency')).toBe(AFFINITY_MATCH_BONUS.P4)
    expect(getAffinityBonus('P3', '神經內科', 'icu')).toBe(AFFINITY_MATCH_BONUS.P3)
    expect(getAffinityBonus('P3', '外科', 'icu')).toBe(1)
  })
})

describe('room-team support assignments', () => {
  beforeEach(resetMockDb)

  it('keeps support doctors out of the primary unassigned pool and clears support when promoted', async () => {
    await mockState.db.rooms.put(makeRoom('surgery-1'))
    await mockState.db.doctors.put(makeDoctor('doctor-1', { obtainedAt: 1 }))
    await mockState.db.doctors.put(makeDoctor('doctor-2', { obtainedAt: 2 }))

    await assignSupportDoctor('surgery-1', 'doctor-1')

    expect((await getUnassignedDoctors()).map((d) => d.id)).toEqual(['doctor-2'])

    await assignDoctor('surgery-1', 'doctor-1')

    expect(await mockState.db.roomSupportAssignments.get('surgery-1:1')).toBeUndefined()
    expect((await mockState.db.doctors.get('doctor-1'))?.assignedRoom).toBe('surgery-1')
  })

  it('stores ER support doctors in independent slot-aware rows', async () => {
    await mockState.db.rooms.put(makeRoom('emergency-1', 'emergency'))
    await mockState.db.doctors.bulkPut([
      makeDoctor('doctor-1', { obtainedAt: 1 }),
      makeDoctor('doctor-2', { obtainedAt: 2 }),
    ])

    await assignSupportDoctorToSlot('emergency-1', 1, 'doctor-1')
    await assignSupportDoctorToSlot('emergency-1', 2, 'doctor-2')

    expect((await mockState.db.roomSupportAssignments.toArray()).map((row) => row.id).sort()).toEqual([
      'emergency-1:1',
      'emergency-1:2',
    ])
  })

  it('normalizes legacy support rows to slot 1', () => {
    expect(
      normalizeSupportAssignment({
        roomId: 'surgery-1',
        doctorId: 'doctor-1',
        assignedAt: 123,
      }),
    ).toEqual({
      id: 'surgery-1:1',
      roomId: 'surgery-1',
      slot: 1,
      doctorId: 'doctor-1',
      assignedAt: 123,
      _updatedAt: undefined,
    })
  })

  it('repairs invalid support slots, duplicate support doctors, primary conflicts, and non-team rows', async () => {
    await mockState.db.rooms.bulkPut([
      makeRoom('surgery-1'),
      makeRoom('surgery-2'),
      makeRoom('outpatient-1', 'outpatient'),
      makeRoom('emergency-1', 'emergency'),
    ])
    await mockState.db.doctors.bulkPut([
      makeDoctor('doctor-1'),
      makeDoctor('doctor-2', { assignedRoom: 'surgery-1' }),
      makeDoctor('doctor-3'),
    ])
    await mockState.db.roomSupportAssignments.bulkPut([
      makeSupport({ roomId: 'surgery-1', doctorId: 'doctor-1', assignedAt: 1 }),
      makeSupport({ roomId: 'surgery-2', doctorId: 'doctor-1', assignedAt: 2 }),
      makeSupport({ roomId: 'outpatient-1', doctorId: 'doctor-3', assignedAt: 3 }),
      makeSupport({ roomId: 'emergency-1', slot: 3, doctorId: 'doctor-3', assignedAt: 4 }),
      makeSupport({ roomId: 'emergency-1', slot: 1, doctorId: 'doctor-2', assignedAt: 5 }),
      makeSupport({ roomId: 'missing-room', doctorId: 'missing-doctor', assignedAt: 6 }),
    ])

    const report = await checkAssignmentInvariants()

    expect(report.repaired.supportAssignments).toBe(5)
    expect(await mockState.db.roomSupportAssignments.toArray()).toEqual([
      makeSupport({ roomId: 'surgery-1', doctorId: 'doctor-1', assignedAt: 1 }),
    ])
  })
})

describe('room-team throughput and ER consult bonuses', () => {
  beforeEach(resetMockDb)

  it('adds support throughput for surgery, ER, and ICU at 35% per support doctor', () => {
    const lead = makeDoctor('lead', { powerMultiplier: 2, rarity: 'P5' as Rarity })
    const support = makeDoctor('support', { powerMultiplier: 1, rarity: 'P5' as Rarity })
    for (const type of ['surgery', 'emergency', 'icu'] as const) {
      const room = makeRoom(`${type}-1`, type)
      const expected =
        computeThroughput(room, lead, 1) +
        computeThroughput(room, support, 1) * 0.35
      expect(computeRoomThroughputWithSupport(room, lead, 1, [{ doctor: support, equipmentBonus: 1 }]))
        .toBeCloseTo(expected)
    }
  })

  it('returns ER consult reward multipliers from staffed ER state', async () => {
    expect(getERConsultStaffingMultiplier({ emergencyLeadCount: 0, emergencySupportCount: 2 })).toBe(1)
    expect(getERConsultStaffingMultiplier({ emergencyLeadCount: 1, emergencySupportCount: 0 })).toBe(1.15)
    expect(getERConsultStaffingMultiplier({ emergencyLeadCount: 1, emergencySupportCount: 1 })).toBe(1.25)

    await mockState.db.rooms.put(makeRoom('emergency-1', 'emergency'))
    await mockState.db.doctors.bulkPut([
      makeDoctor('doctor-1', { assignedRoom: 'emergency-1' }),
      makeDoctor('doctor-2'),
    ])
    expect(await getERConsultStaffingMultiplierFromDb()).toBe(1.15)
    await mockState.db.roomSupportAssignments.put(makeSupport({
      roomId: 'emergency-1',
      doctorId: 'doctor-2',
      assignedAt: 1,
    }))
    expect(await getERConsultStaffingMultiplierFromDb()).toBe(1.25)
  })
})

describe('hospital_state support-assignment sync', () => {
  beforeEach(resetMockDb)

  it('snapshots and applies slot-aware support assignments with the hospital_state blob', async () => {
    const adapter = HOSPITAL_ADAPTERS.find((a) => a.postgresTable === 'hospital_state')
    expect(adapter).toBeDefined()
    await mockState.db.gameCounters.put(makeCounters())
    await mockState.db.gachaStats.put({ id: 'global', totalRolls: 0, rollsSinceLast: {} })
    await mockState.db.tickets.put({ id: 'global', available: 1, lastRefreshDay: 1 })
    await mockState.db.rooms.put({ ...makeRoom('surgery-1'), assignedDoctorId: 'legacy-primary' })
    await mockState.db.roomSupportAssignments.put(makeSupport({
      roomId: 'surgery-1',
      doctorId: 'doctor-1',
      assignedAt: 123,
    }))

    const snapshot = await adapter!.snapshotAll(
      mockState.db as never,
      'user-1',
      '2026-06-08T00:00:00.000Z',
      'test',
    )

    expect(snapshot[0].data.roomSupportAssignments).toEqual([
      makeSupport({ roomId: 'surgery-1', doctorId: 'doctor-1', assignedAt: 123 }),
    ])

    await adapter!.applyToLocal(mockState.db as never, {
      user_id: 'user-1',
      updated_at: '2026-06-09T00:00:00.000Z',
      app_version: 'test',
      data: {
        gameCounters: makeCounters(),
        gachaStats: null,
        tickets: null,
        rooms: [{ ...makeRoom('surgery-1'), assignedDoctorId: 'legacy-primary' }],
        roomSupportAssignments: [{ roomId: 'surgery-1', doctorId: 'doctor-2', assignedAt: 456 }],
        affinity: [],
      },
    })

    expect((await mockState.db.rooms.get('surgery-1'))?.assignedDoctorId).toBeNull()
    expect(await mockState.db.roomSupportAssignments.toArray()).toEqual([
      {
        id: 'surgery-1:1',
        roomId: 'surgery-1',
        slot: 1,
        doctorId: 'doctor-2',
        assignedAt: 456,
        _updatedAt: Date.parse('2026-06-09T00:00:00.000Z'),
      },
    ])
  })
})
