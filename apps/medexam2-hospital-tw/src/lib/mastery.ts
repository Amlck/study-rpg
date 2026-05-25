import {
  reviewCardBinary,
  reviewCardBinaryEasy,
  reviewCardBinaryGuessed,
  type SubjectId,
} from '@study-rpg/core'
import { getSpecialtyMultiplier, type Rarity } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB, type MasteryRow, type QuestionHistoryRow } from '../db/schema'

/** Quality modifier signaled by player click on opt-in action-bar button after a correct answer. */
export type CorrectAnswerQuality = 'default' | 'easy' | 'guessed'

interface AnswerRecord {
  subjectId: SubjectId
  questionId: string
}

interface PartnerInfo {
  subjectId: SubjectId
  rarity: Rarity
}

async function upsertHistory(
  db: ReturnType<typeof getHospitalDB>,
  record: AnswerRecord,
  wasCorrect: boolean,
  quality: CorrectAnswerQuality = 'default',
): Promise<{ prevLastResult: 'correct' | 'wrong' | null }> {
  const now = Date.now()
  const existing = await db.questionHistory.get(record.questionId)
  const prevLastResult = existing?.lastResult ?? null
  const prevSrs = existing
    ? { interval: existing.interval, easeFactor: existing.easeFactor, nextDueAt: existing.nextDueAt }
    : { interval: 0, easeFactor: 2.5, nextDueAt: null }

  // SRS update routed by quality modifier. Wrong answers always use the default
  // binary path (quality only meaningful on correct answers; UI gates accordingly).
  let srs: { interval: number; easeFactor: number; nextDueAt: number }
  if (!wasCorrect) {
    srs = reviewCardBinary({ correct: false, prev: prevSrs, now })
  } else if (quality === 'easy') {
    srs = reviewCardBinaryEasy({ prev: prevSrs, now })
  } else if (quality === 'guessed') {
    srs = reviewCardBinaryGuessed({ prev: prevSrs, now })
  } else {
    srs = reviewCardBinary({ correct: true, prev: prevSrs, now })
  }

  // everWrong semantics:
  // - Wrong answer always sets true (idempotent if already true)
  // - 'easy' on correct answer EXPLICITLY clears (player has graduated this question)
  // - 'guessed' and 'default' on correct answer preserve existing value
  let everWrong: boolean
  if (!wasCorrect) {
    everWrong = true
  } else if (quality === 'easy') {
    everWrong = false
  } else {
    everWrong = existing?.everWrong === true
  }

  if (existing) {
    await db.questionHistory.put({
      ...existing,
      attempts: existing.attempts + 1,
      correctCount: existing.correctCount + (wasCorrect ? 1 : 0),
      lastAnsweredAt: now,
      lastResult: wasCorrect ? 'correct' : 'wrong',
      interval: srs.interval,
      easeFactor: srs.easeFactor,
      nextDueAt: srs.nextDueAt,
      everWrong,
    })
  } else {
    const row: QuestionHistoryRow = {
      questionId: record.questionId,
      subjectId: record.subjectId,
      attempts: 1,
      correctCount: wasCorrect ? 1 : 0,
      lastAnsweredAt: now,
      lastResult: wasCorrect ? 'correct' : 'wrong',
      interval: srs.interval,
      easeFactor: srs.easeFactor,
      nextDueAt: srs.nextDueAt,
      everWrong,
    }
    await db.questionHistory.put(row)
  }
  return { prevLastResult }
}

async function upsertMastery(
  db: ReturnType<typeof getHospitalDB>,
  subjectId: SubjectId,
  wasCorrect: boolean,
  multiplier: number = 1.0,
): Promise<void> {
  const delta = wasCorrect ? multiplier : 0
  const existing = await db.mastery.get(subjectId)
  if (existing) {
    await db.mastery.put({
      subjectId,
      correct: existing.correct + delta,
      total: existing.total + 1,
    })
  } else {
    await db.mastery.put({
      subjectId,
      correct: delta,
      total: 1,
    })
  }
}

export interface CorrectAnswerOpts {
  /**
   * Invoked AFTER the Dexie transaction commits, only when the previous
   * `lastResult` value was `'wrong'` (i.e. this answer flipped the row from
   * wrong → correct). The grace toast wires into this — every call site
   * SHOULD pass an explicit callback (use `() => {}` to opt out intentionally).
   * Per Decision 6 of add-bookmarks-filters-and-wrong-history-medexam2:
   * making this required at TS level would force tests / internal helpers
   * to pass a callback too; discipline enforced via code review + this doc.
   *
   * NOT invoked when `quality === 'easy'` — the player has explicitly graduated
   * the question; the grace-toast "answered correctly, removed from 「目前未答對」"
   * narrative is redundant with the explicit graduation gesture.
   */
  onTransitionToCorrect?: (questionId: string) => void
  /**
   * Quality modifier signaled by the player after a correct answer.
   * - `'default'` (default): standard binary SM-2 update (1d→6d→×ease, now using [3,7] seeds)
   * - `'easy'`: applies `reviewCardBinaryEasy` (ease ×1.5, interval ×3, clamped) AND clears `everWrong`
   * - `'guessed'`: applies `reviewCardBinaryGuessed` (interval=1, ease unchanged); `everWrong` preserved
   *
   * Reward dispatch (revenue, reputation, affinity, mastery) is IDENTICAL across
   * all three values — only SRS state and (for 'easy') the `everWrong` flag differ.
   */
  quality?: CorrectAnswerQuality
}

/**
 * Correct answer: bumps mastery (correct + total) + questionHistory + affinity.
 * Both mastery.correct and affinity.correctCount deltas are multiplied by the
 * specialty-match multiplier when `partner.subjectId === record.subjectId`
 * (per hospital-specialty-bonus + affinity-specialty-bonus specs). SRS state
 * is unaffected by the multiplier (hospital-srs Req 6).
 *
 * EVERY call site (QuizModal / MockExamPage / MentorPage / ER consultation /
 * future game modes) MUST pass `opts.onTransitionToCorrect` to wire the
 * grace toast — see wrong-answer-list capability for the spec.
 */
export async function recordCorrectAnswer(
  record: AnswerRecord,
  partner: PartnerInfo | null = null,
  opts: CorrectAnswerOpts = {},
): Promise<void> {
  const db = getHospitalDB()
  const quality: CorrectAnswerQuality = opts.quality ?? 'default'
  const multiplier = getSpecialtyMultiplier(
    partner?.subjectId ?? null,
    partner?.rarity ?? null,
    record.subjectId,
  )
  let prevLastResult: 'correct' | 'wrong' | null = null
  await db.transaction('rw', db.mastery, db.questionHistory, db.affinity, async () => {
    await upsertMastery(db, record.subjectId, true, multiplier)
    const r = await upsertHistory(db, record, true, quality)
    prevLastResult = r.prevLastResult
    const aff = await db.affinity.get(record.subjectId)
    await db.affinity.put({
      subjectId: record.subjectId,
      correctCount: (aff?.correctCount ?? 0) + multiplier,
    })
  })
  // Grace toast on wrong→correct transition. Note: the QuizModal opt-in
  // 「太簡單」 / 「我亂猜的」 buttons currently follow up AFTER this call (via
  // applyQualityModifier), so `quality` here is always `'default'` from the
  // QuizModal pick path — the toast fires for every wrong→correct flip
  // regardless of which modifier the player clicks afterward. If a future
  // refactor inlines the modifier choice into this call site, gate the toast
  // on `quality !== 'easy'` to suppress the toast when the player has
  // explicitly graduated the question.
  if (prevLastResult === 'wrong') {
    opts.onTransitionToCorrect?.(record.questionId)
  }
}

/**
 * Wrong answer: bumps mastery.total + questionHistory.attempts only.
 * Also sets `everWrong = true` on the row (idempotent — no-op if already true).
 * Affinity unchanged per recruitment-gacha spec (never decrement).
 */
export async function recordWrongAnswer(record: AnswerRecord): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.mastery, db.questionHistory, async () => {
    await upsertMastery(db, record.subjectId, false)
    await upsertHistory(db, record, false)
  })
}

export interface PrevSrsSnapshot {
  interval: number
  easeFactor: number
  nextDueAt: number | null
}

/**
 * Re-apply SRS state for a question using a quality modifier, computed from
 * the row's state PRIOR to this answer.
 *
 * Use case: 「太簡單」 / 「我亂猜的」 buttons in 二階 QuizModal. Because
 * `recordCorrectAnswer` writes immediately on pick (atomic mastery + SRS + reward
 * transaction can't easily be deferred without breaking the achievement
 * sub-transaction subset scope rule), we let the default-path write commit
 * first, then if the player clicks a modifier we OVERWRITE the SRS portion
 * using the captured pre-answer state — so the modifier escalator/reset is
 * computed from the right baseline, not stacked on top of the default write.
 *
 * For 'easy': also clears `everWrong` (player has explicitly graduated this question).
 * For 'guessed': preserves `everWrong`.
 *
 * Bumps `lastAnsweredAt = now` so the LWW sync merge picks up the explicit
 * `everWrong` change cross-device.
 */
export async function applyQualityModifier(
  questionId: string,
  quality: Exclude<CorrectAnswerQuality, 'default'>,
  prev: PrevSrsSnapshot,
): Promise<void> {
  const db = getHospitalDB()
  const now = Date.now()
  const srs =
    quality === 'easy'
      ? reviewCardBinaryEasy({ prev, now })
      : reviewCardBinaryGuessed({ prev, now })
  await db.transaction('rw', db.questionHistory, async () => {
    const existing = await db.questionHistory.get(questionId)
    if (!existing) return // safety: row should exist (recordCorrectAnswer ran first)
    await db.questionHistory.put({
      ...existing,
      interval: srs.interval,
      easeFactor: srs.easeFactor,
      nextDueAt: srs.nextDueAt,
      lastAnsweredAt: now,
      // 'easy' clears everWrong (explicit graduation); 'guessed' preserves
      everWrong: quality === 'easy' ? false : existing.everWrong,
    })
  })
}

/**
 * Format mastery as a display label. Returns `「掌握 N%」` when total > 0,
 * `「掌握 -」` placeholder otherwise.
 */
export function formatMasteryPercent(mastery: MasteryRow | undefined): string {
  if (!mastery || mastery.total === 0) return '掌握 -'
  const pct = Math.floor((mastery.correct / mastery.total) * 100)
  return `掌握 ${pct}%`
}
