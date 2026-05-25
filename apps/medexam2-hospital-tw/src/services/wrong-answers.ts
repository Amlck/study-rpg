/**
 * Wrong-answers — derived live view of `hospital_question_history` filtered to
 * rows whose `lastResult === 'wrong'`.
 *
 * Per add-wrong-answer-list-medexam2 design.md Decision 2:
 *   - No separate Dexie store, no Supabase mirror — questionHistory IS the source of truth
 *   - Existing `recordWrongAnswer` / `recordCorrectAnswer` (lib/mastery.ts) flips
 *     `lastResult` and that's the sole driver
 *   - Cross-device "answer-right-removes-wrong" works for free via history sync
 *   - Compound index `[lastResult+lastAnsweredAt]` (Dexie v11) avoids full scan
 */

import Dexie from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import { getHospitalDB, type QuestionHistoryRow } from '../db/schema'

/**
 * Live-query the derived wrong-answer list: every questionHistory row whose
 * `lastResult === 'wrong'`, sorted by `lastAnsweredAt` descending (newest first).
 *
 * Returns `undefined` while the query is in flight (Dexie convention), or the
 * sorted array (possibly empty) once resolved.
 */
export function useWrongAnswers(): QuestionHistoryRow[] | undefined {
  return useLiveQuery(() =>
    getHospitalDB()
      .questionHistory
      .where('[lastResult+lastAnsweredAt]')
      .between(['wrong', Dexie.minKey], ['wrong', Dexie.maxKey])
      .reverse()
      .toArray(),
  )
}

/**
 * 「歷史曾錯」 sub-view: every questionHistory row whose `everWrong === true`,
 * sorted by `lastAnsweredAt` descending. Once a row is added, it never auto-
 * leaves this view (mirrors monotonic-OR sync semantics — see
 * sync/tables.ts QUESTION_HISTORY adapter).
 *
 * Per add-bookmarks-filters-and-wrong-history-medexam2 — wrong-answer-list
 * 「錯題」 tab sub-view split requirement.
 */
export function useEverWrongAnswers(): QuestionHistoryRow[] | undefined {
  return useLiveQuery(async () => {
    // Dexie boolean equality has well-known quirks across versions — use a
    // `.filter()` predicate scan, which is reliable. For corpus-scale (~6000
    // questions, half answered) the in-memory scan + sort is sub-millisecond
    // and avoids per-version index gotchas. The `everWrong` Dexie index from
    // v17 is still useful for future query plan optimizations.
    const rows = await getHospitalDB()
      .questionHistory
      .filter((r) => r.everWrong === true)
      .toArray()
    return rows.sort((a, b) => b.lastAnsweredAt - a.lastAnsweredAt)
  })
}
