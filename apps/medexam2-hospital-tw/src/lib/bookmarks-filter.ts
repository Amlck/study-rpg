import type { Question, SubjectId } from '@study-rpg/core'

/**
 * Shared filter state for the /bookmarks page.
 * Empty Set on either dimension = "no filter on that dimension" (match-all).
 */
export interface BookmarkFilterState {
  readonly years: ReadonlySet<number>
  readonly subjects: ReadonlySet<SubjectId>
}

/**
 * Does this `questionId` pass the active filter?
 *
 * Rules (per add-bookmarks-filters-and-wrong-history-medexam2 Decision 4):
 *  - Orphan rows (questionId not in questionsById) ALWAYS pass — we have no
 *    metadata to filter against, and hiding them would prevent cleanup.
 *  - Empty year selection = match-all years (no filter on that dim).
 *  - Empty subject selection = match-all subjects.
 *  - Non-empty: AND combination — row must satisfy BOTH dimensions.
 *  - `questionsById === null` (pre-load) = don't filter yet (return true).
 */
export function matchesFilter(
  questionId: string,
  filter: BookmarkFilterState,
  questionsById: ReadonlyMap<string, Question> | null,
): boolean {
  if (!questionsById) return true
  const q = questionsById.get(questionId)
  if (!q) return true // orphan bypass
  const year = (q.meta as { year?: number } | undefined)?.year
  const subject = q.subject as SubjectId
  if (filter.years.size > 0 && (year === undefined || !filter.years.has(year))) return false
  if (filter.subjects.size > 0 && !filter.subjects.has(subject)) return false
  return true
}
