/**
 * Date helpers — local-timezone YYYY-MM-DD formatting + day-bucket math
 * for `dailyStudyLog` table writes and stats panel aggregations.
 *
 * Spec: `daily-study-log` capability ("Tick hook SHALL upsert the current-day
 * row whenever study minutes accrue" — date key SHALL use local timezone
 * start-of-day).
 */

/** Format a Date as local-timezone `YYYY-MM-DD`. */
export function formatYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Return a fresh Date set to local-timezone midnight of the given date. */
export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Return an array of local-timezone `YYYY-MM-DD` strings covering the inclusive
 * range from `startInclusive` to `endInclusive`. Used by stats aggregation to
 * zero-fill empty days so the bar chart's X-axis stays continuous.
 */
export function dateRangeYMD(startInclusive: Date, endInclusive: Date): string[] {
  const out: string[] = []
  const cursor = startOfDay(startInclusive)
  const end = startOfDay(endInclusive)
  while (cursor.getTime() <= end.getTime()) {
    out.push(formatYMD(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/** Subtract N days from a date (returns a fresh Date). */
export function subDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - n)
  return d
}
