import type { HospitalDB, StudyTimeBucketRow } from '../db/schema'

const MINUTE_MS = 60 * 1000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

export interface StudyTimeDay {
  dayKey: string
  minutes: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface StudyTimeMap {
  days: StudyTimeDay[]
  hourlyMinutes: number[]
  totalMinutes: number
  activeDays: number
  currentStreak: number
  maxDayMinutes: number
}

export function localDayKey(ts: number): string {
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function addStudyTimeBuckets(
  db: HospitalDB,
  intervalEndMs: number,
  elapsedMs: number,
): Promise<void> {
  if (elapsedMs <= 0) return
  let cursor = Math.max(0, intervalEndMs - elapsedMs)
  while (cursor < intervalEndMs) {
    const nextHour = startOfNextLocalHour(cursor)
    const segmentEnd = Math.min(intervalEndMs, nextHour)
    const minutes = (segmentEnd - cursor) / MINUTE_MS
    if (minutes > 0) {
      const dayKey = localDayKey(cursor)
      const hour = new Date(cursor).getHours()
      const id = `${dayKey}:${String(hour).padStart(2, '0')}`
      const existing = await db.studyTimeBuckets.get(id)
      const row: StudyTimeBucketRow = {
        id,
        dayKey,
        hour,
        minutes: (existing?.minutes ?? 0) + minutes,
        updatedAt: intervalEndMs,
      }
      await db.studyTimeBuckets.put(row)
    }
    cursor = segmentEnd
  }
}

export function buildStudyTimeMap(
  buckets: StudyTimeBucketRow[],
  opts?: { now?: number; days?: number },
): StudyTimeMap {
  const now = opts?.now ?? Date.now()
  const days = opts?.days ?? 84
  const todayStart = startOfLocalDay(now)
  const firstDayStart = todayStart - (days - 1) * DAY_MS
  const byDay = new Map<string, number>()
  const hourlyMinutes = Array.from({ length: 24 }, () => 0)

  for (const bucket of buckets) {
    const dayStart = new Date(`${bucket.dayKey}T00:00:00`).getTime()
    if (!Number.isFinite(dayStart) || dayStart < firstDayStart || dayStart > todayStart) continue
    byDay.set(bucket.dayKey, (byDay.get(bucket.dayKey) ?? 0) + bucket.minutes)
    if (bucket.hour >= 0 && bucket.hour < 24) {
      hourlyMinutes[bucket.hour] += bucket.minutes
    }
  }

  const resultDays: StudyTimeDay[] = []
  let maxDayMinutes = 0
  for (let i = 0; i < days; i += 1) {
    const ts = firstDayStart + i * DAY_MS
    const dayKey = localDayKey(ts)
    const minutes = byDay.get(dayKey) ?? 0
    maxDayMinutes = Math.max(maxDayMinutes, minutes)
    resultDays.push({ dayKey, minutes, level: 0 })
  }

  for (const day of resultDays) {
    day.level = intensityLevel(day.minutes, maxDayMinutes)
  }

  const activeDays = resultDays.filter((day) => day.minutes > 0).length
  const totalMinutes = resultDays.reduce((sum, day) => sum + day.minutes, 0)
  let currentStreak = 0
  for (let i = resultDays.length - 1; i >= 0; i -= 1) {
    if (resultDays[i].minutes <= 0) break
    currentStreak += 1
  }

  return {
    days: resultDays,
    hourlyMinutes,
    totalMinutes,
    activeDays,
    currentStreak,
    maxDayMinutes,
  }
}

function intensityLevel(minutes: number, maxDayMinutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0 || maxDayMinutes <= 0) return 0
  const ratio = minutes / maxDayMinutes
  if (ratio >= 0.75) return 4
  if (ratio >= 0.5) return 3
  if (ratio >= 0.25) return 2
  return 1
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function startOfNextLocalHour(ts: number): number {
  const d = new Date(ts)
  d.setMinutes(0, 0, 0)
  return d.getTime() + HOUR_MS
}
