/**
 * Quiz pool filter — supports the family-subject picker on Overview.
 *
 * Spec: openspec/specs/neurons-mode/spec.md
 *   "Overview SHALL surface a family subject picker that filters the active
 *   quiz pool"
 *
 * Pure filter mode: takes a pool of Questions + optional familyId; returns
 * the unrestricted pool when familyId is null/undefined (existing behavior),
 * otherwise restricts to questions whose `subject` resolves to that family.
 *
 * Downstream mechanics (rewards / SRS / DMN trigger / mastery accrual) operate
 * unchanged — they read `subject` from the served question itself.
 */

import type { Question } from '@study-rpg/core'

/**
 * Filter a question pool by family. Returns a new array (does not mutate input).
 *
 * @param pool - Source pool, typically `pack.questions`
 * @param familyId - Family identifier (from `pack.subjects[].id`). Pass null
 *                   or undefined to disable filtering and return the full pool.
 */
export function filterPoolByFamily(
  pool: readonly Question[],
  familyId: string | null | undefined,
): Question[] {
  if (familyId == null) return [...pool]
  return pool.filter((q) => q.subject === familyId)
}
