import type { SubjectId } from '@study-rpg/core'
import { getHospitalDB } from '../db/schema'

export const YEAR_FILTER_META_KEY = 'quiz.yearFilter'

/** 民國 years available in the 二階 corpus (106–115 inclusive). */
export const ALL_YEARS: readonly number[] = [106, 107, 108, 109, 110, 111, 112, 113, 114, 115]

const ALL_YEARS_SET: ReadonlySet<number> = new Set(ALL_YEARS)

export async function getYearFilter(): Promise<number[] | null> {
  const row = await getHospitalDB().meta.get(YEAR_FILTER_META_KEY)
  if (!row) return null
  if (!Array.isArray(row.value)) return null
  const cleaned: number[] = []
  for (const v of row.value) {
    if (typeof v === 'number' && ALL_YEARS_SET.has(v)) cleaned.push(v)
  }
  return cleaned
}

export async function setYearFilter(years: number[]): Promise<void> {
  await getHospitalDB().meta.put({ key: YEAR_FILTER_META_KEY, value: years })
}

/**
 * Derive the effective year-filter Set from the persisted array.
 * Both `null` (no row) AND `[]` (empty array) map to「全選 10 年」 — single
 * source of truth for the "default = everything" semantics so every caller
 * (chips, picker, pool gate) reads consistent behavior.
 */
export function effectiveYearSet(persisted: number[] | null): Set<number> {
  if (!persisted || persisted.length === 0) return new Set(ALL_YEARS)
  return new Set(persisted)
}

/**
 * Count playable questions in `subjectId` whose `meta.year` is in `yearFilter`.
 * When the filter spans all 10 years (size === ALL_YEARS.length) the count is
 * returned without per-row scanning — semantically a no-op filter.
 */
export async function effectivePoolSize(
  subjectId: SubjectId,
  yearFilter: Set<number>,
): Promise<number> {
  const { loadPlayablePoolFor } = await import('../lib/quiz')
  const pool = await loadPlayablePoolFor(subjectId)
  if (yearFilter.size === 0 || yearFilter.size >= ALL_YEARS.length) return pool.length
  let count = 0
  for (const q of pool) {
    if (yearFilter.has(q.meta?.year as number)) count += 1
  }
  return count
}
