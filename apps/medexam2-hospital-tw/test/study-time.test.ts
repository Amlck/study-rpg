import { describe, expect, it } from 'vitest'
import type { StudyTimeBucketRow } from '../src/db/schema'
import { addStudyTimeBuckets, buildStudyTimeMap, localDayKey } from '../src/lib/study-time'

function ts(y: number, m: number, d: number, h = 0, min = 0): number {
  return new Date(y, m - 1, d, h, min, 0, 0).getTime()
}

describe('study time map', () => {
  it('splits elapsed study time across local hour buckets', async () => {
    const rows = new Map<string, StudyTimeBucketRow>()
    const db = {
      studyTimeBuckets: {
        get: async (id: string) => rows.get(id),
        put: async (row: StudyTimeBucketRow) => {
          rows.set(row.id, row)
        },
      },
    }

    await addStudyTimeBuckets(db as never, ts(2026, 6, 15, 10, 5), 10 * 60 * 1000)

    const nine = rows.get('2026-06-15:09')
    const ten = rows.get('2026-06-15:10')
    expect(Math.round(nine?.minutes ?? 0)).toBe(5)
    expect(Math.round(ten?.minutes ?? 0)).toBe(5)
  })

  it('builds daily intensity, hourly totals, and current streak', () => {
    const buckets: StudyTimeBucketRow[] = [
      {
        id: '2026-06-13:21',
        dayKey: '2026-06-13',
        hour: 21,
        minutes: 20,
        updatedAt: ts(2026, 6, 13, 21),
      },
      {
        id: '2026-06-14:22',
        dayKey: '2026-06-14',
        hour: 22,
        minutes: 40,
        updatedAt: ts(2026, 6, 14, 22),
      },
      {
        id: '2026-06-15:22',
        dayKey: '2026-06-15',
        hour: 22,
        minutes: 60,
        updatedAt: ts(2026, 6, 15, 22),
      },
    ]

    const map = buildStudyTimeMap(buckets, { now: ts(2026, 6, 15, 23), days: 7 })

    expect(map.totalMinutes).toBe(120)
    expect(map.activeDays).toBe(3)
    expect(map.currentStreak).toBe(3)
    expect(map.hourlyMinutes[22]).toBe(100)
    expect(map.days.at(-1)).toMatchObject({
      dayKey: localDayKey(ts(2026, 6, 15)),
      minutes: 60,
      level: 4,
    })
  })
})
