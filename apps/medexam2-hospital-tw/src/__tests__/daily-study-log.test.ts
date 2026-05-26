import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getHospitalDB } from '../db/schema'
import { formatYMD, dateRangeYMD, startOfDay, subDays } from '../lib/util/date'

beforeEach(async () => {
  const db = getHospitalDB()
  await db.delete()
  await db.open()
})

describe('dailyStudyLog Dexie table (v18)', () => {
  it('fresh install yields empty table', async () => {
    const rows = await getHospitalDB().dailyStudyLog.toArray()
    expect(rows).toEqual([])
  })

  it('first upsert of the day creates a new row', async () => {
    const db = getHospitalDB()
    const date = '2026-05-26'
    await db.dailyStudyLog.put({ date, minutesAdded: 5, updatedAt: 1000 })
    const row = await db.dailyStudyLog.get(date)
    expect(row).toEqual({ date, minutesAdded: 5, updatedAt: 1000 })
  })

  it('second same-day upsert overwrites by primary key', async () => {
    const db = getHospitalDB()
    const date = '2026-05-26'
    await db.dailyStudyLog.put({ date, minutesAdded: 5, updatedAt: 1000 })
    // Simulate accumulating-upsert pattern used by tick.ts:
    const existing = await db.dailyStudyLog.get(date)
    await db.dailyStudyLog.put({
      date,
      minutesAdded: (existing?.minutesAdded ?? 0) + 3,
      updatedAt: 2000,
    })
    const final = await db.dailyStudyLog.get(date)
    expect(final).toEqual({ date, minutesAdded: 8, updatedAt: 2000 })
    // Only one row total — same PK collapses
    const all = await db.dailyStudyLog.toArray()
    expect(all.length).toBe(1)
  })

  it('crossing midnight creates a new row, preserves yesterday', async () => {
    const db = getHospitalDB()
    await db.dailyStudyLog.put({ date: '2026-05-25', minutesAdded: 60, updatedAt: 1000 })
    await db.dailyStudyLog.put({ date: '2026-05-26', minutesAdded: 2, updatedAt: 2000 })
    const yesterday = await db.dailyStudyLog.get('2026-05-25')
    const today = await db.dailyStudyLog.get('2026-05-26')
    expect(yesterday?.minutesAdded).toBe(60)
    expect(today?.minutesAdded).toBe(2)
    expect((await db.dailyStudyLog.toArray()).length).toBe(2)
  })
})

describe('atomic upsert pattern (tick.ts contract)', () => {
  it('mirrors monotonicCounters + dailyStudyLog write inside one tx', async () => {
    const db = getHospitalDB()
    // Seed monotonicCounters singleton so the tick-path equivalent has something to update
    await db.monotonicCounters.put({
      id: 'singleton',
      totalStudyMinutes: 100,
      fateCardBadLuckPity: { common: 0, rare: 0, epic: 0 },
    })

    const now = Date.now()
    const today = formatYMD(new Date(now))
    const deltaMinutes = 2.5

    // Simulate the in-tx upsert pair (see tick.ts ~line 367-388)
    await db.transaction('rw', [db.monotonicCounters, db.dailyStudyLog], async () => {
      const mono = await db.monotonicCounters.get('singleton')
      if (mono) {
        await db.monotonicCounters.put({
          ...mono,
          totalStudyMinutes: mono.totalStudyMinutes + deltaMinutes,
        })
      }
      const existingDay = await db.dailyStudyLog.get(today)
      await db.dailyStudyLog.put({
        date: today,
        minutesAdded: (existingDay?.minutesAdded ?? 0) + deltaMinutes,
        updatedAt: now,
      })
    })

    const finalMono = await db.monotonicCounters.get('singleton')
    const finalDay = await db.dailyStudyLog.get(today)
    expect(finalMono?.totalStudyMinutes).toBe(102.5)
    expect(finalDay).toEqual({ date: today, minutesAdded: 2.5, updatedAt: now })
  })

  it('rolls back BOTH writes when tx throws mid-block (atomicity contract)', async () => {
    const db = getHospitalDB()
    await db.monotonicCounters.put({
      id: 'singleton',
      totalStudyMinutes: 100,
      fateCardBadLuckPity: { common: 0, rare: 0, epic: 0 },
    })
    const today = formatYMD(new Date())

    let caught: unknown = null
    try {
      await db.transaction('rw', [db.monotonicCounters, db.dailyStudyLog], async () => {
        const mono = await db.monotonicCounters.get('singleton')
        if (mono) {
          await db.monotonicCounters.put({ ...mono, totalStudyMinutes: 999 })
        }
        await db.dailyStudyLog.put({ date: today, minutesAdded: 5, updatedAt: 1 })
        throw new Error('forced rollback')
      })
    } catch (err) {
      caught = err
    }

    expect(caught).toBeInstanceOf(Error)
    const mono = await db.monotonicCounters.get('singleton')
    const day = await db.dailyStudyLog.get(today)
    // Both writes rolled back — atomic
    expect(mono?.totalStudyMinutes).toBe(100)
    expect(day).toBeUndefined()
  })
})

describe('date helpers (lib/util/date.ts)', () => {
  it('formatYMD pads month/day with leading zero', () => {
    expect(formatYMD(new Date(2026, 0, 5))).toBe('2026-01-05') // Jan 5
    expect(formatYMD(new Date(2026, 11, 31))).toBe('2026-12-31') // Dec 31
  })

  it('startOfDay zeroes time-of-day components', () => {
    const d = new Date(2026, 4, 26, 13, 45, 30, 500)
    const s = startOfDay(d)
    expect(s.getHours()).toBe(0)
    expect(s.getMinutes()).toBe(0)
    expect(s.getSeconds()).toBe(0)
    expect(s.getMilliseconds()).toBe(0)
    expect(s.getFullYear()).toBe(2026)
    expect(s.getMonth()).toBe(4)
    expect(s.getDate()).toBe(26)
  })

  it('subDays subtracts N days', () => {
    const d = new Date(2026, 4, 26)
    expect(formatYMD(subDays(d, 7))).toBe('2026-05-19')
    expect(formatYMD(subDays(d, 30))).toBe('2026-04-26')
  })

  it('dateRangeYMD produces inclusive contiguous range', () => {
    const start = new Date(2026, 4, 24)
    const end = new Date(2026, 4, 26)
    expect(dateRangeYMD(start, end)).toEqual(['2026-05-24', '2026-05-25', '2026-05-26'])
  })

  it('dateRangeYMD single-day collapses to one entry', () => {
    const d = new Date(2026, 4, 26)
    expect(dateRangeYMD(d, d)).toEqual(['2026-05-26'])
  })
})
