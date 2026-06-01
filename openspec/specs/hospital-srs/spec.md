# hospital-srs Specification

## Purpose

Spaced-repetition scheduling for the hospital (二階) track's quiz flow. Owns per-question SRS state (`interval`, `easeFactor`, `nextDueAt`) and the due-queue picker that prefers due cards over random new questions, with a global daily cap and round-robin allocation across the 14 二階 subjects. Mirrors the 一階 `srs-queue` capability but stays decoupled so the two tracks can tune independently.

## Requirements

### Requirement: Binary-input SM-2 review on answer

The system SHALL update each question's `interval`, `easeFactor`, and `nextDueAt` after every quiz answer using a binary (correct / wrong) input variant of SM-2. Mastery, affinity, and SRS state updates MUST happen in a single atomic Dexie transaction. The correct-path `interval` MUST be clamped to `MAX_INTERVAL_DAYS` (365) to prevent runaway expansion on long streaks of correct answers.

The first-interval seed values SHALL be `STANDARD_INITIAL_INTERVALS = [3, 7]` — the first correct review schedules `interval = 3` days; the second consecutive correct review schedules `interval = 7` days; subsequent correct reviews compute `interval = round(prev.interval × prev.easeFactor)` clamped at the cap.

The opt-in 「太簡單」 and 「我亂猜的」 buttons (see the Easy / Guessed modifier requirements below) SHALL take precedence over the default binary correct-path mapping when the player clicks them after a correct answer.

#### Scenario: First correct answer on a fresh question

- **WHEN** a user answers a question correctly for the first time (existing row has `interval: 0`, `easeFactor: 2.5`, `nextDueAt: null`)
- **THEN** the system MUST set `interval = 3` (days, per new `STANDARD_INITIAL_INTERVALS[0]`), `easeFactor` unchanged (2.5), and `nextDueAt = now + 3 days` (in ms epoch)

#### Scenario: Second consecutive correct answer

- **WHEN** a user answers correctly and the existing row has `interval = 3`
- **THEN** the system MUST set `interval = 7` (per new `STANDARD_INITIAL_INTERVALS[1]`), `easeFactor` unchanged, and `nextDueAt = now + 7 days`

#### Scenario: Subsequent correct answer expands interval by easeFactor

- **WHEN** a user answers correctly and the existing row has `interval ≥ 7` (post-second-step)
- **THEN** the system MUST set `interval = round(prev.interval × prev.easeFactor)`, `easeFactor` unchanged, and `nextDueAt = now + newInterval × DAY`

#### Scenario: Correct answer clamps interval at 365-day cap

- **WHEN** a correct answer would compute `newInterval > MAX_INTERVAL_DAYS` (365) via the standard expansion
- **THEN** the system MUST set `interval = MAX_INTERVAL_DAYS` (365), `easeFactor` unchanged, and `nextDueAt = now + 365 days`

#### Scenario: Pre-existing over-cap row clamps on next correct answer

- **WHEN** an existing row has `interval = 500` (legacy value from before the cap was added) and the user answers correctly
- **THEN** the system MUST clamp the next update to `interval = MAX_INTERVAL_DAYS` (365), regardless of the legacy starting value

#### Scenario: Pre-existing one-day-interval row ages out naturally

- **GIVEN** a row with `interval = 1` written before this change shipped (under the old `STANDARD_INITIAL_INTERVALS = [1, 6]`)
- **WHEN** the row's `nextDueAt` passes and the player answers correctly
- **THEN** the next `interval` SHALL be `STANDARD_INITIAL_INTERVALS[1] = 7`
- **AND** no retroactive migration of the `interval = 1` value SHALL occur

### Requirement: Partial reset on wrong answer

The system SHALL apply a partial reset (not full SM-2 "again" reset) when the user answers a question wrong, balancing retention pressure against a养成-game friendly tone.

#### Scenario: Wrong answer reduces interval and easeFactor

- **WHEN** a user answers a question wrong (regardless of prior interval)
- **THEN** the system MUST set `interval = max(1, round(prev.interval × 0.5))`, `easeFactor = max(1.3, prev.easeFactor × 0.85)`, and `nextDueAt = now + newInterval × DAY`

#### Scenario: Wrong answer on a fresh question

- **WHEN** a user answers wrong on a question with no prior history (`interval = 0`)
- **THEN** the system MUST set `interval = 1`, `easeFactor = max(1.3, 2.5 × 0.85) = 2.125`, and `nextDueAt = now + 1 day`

#### Scenario: easeFactor floor is enforced

- **WHEN** repeated wrong answers would drive `easeFactor` below 1.3
- **THEN** the system MUST clamp `easeFactor` to 1.3 (the SM-2 floor)

### Requirement: Due queue surface via subject banner badge

The system SHALL display a "🔴 N due" chip on each subject banner, where N is the number of due cards available to the user for that subject under the current daily cap **AND under the active year-filter preference**. When N is 0 the chip MUST NOT render. When N exceeds 99 the chip MUST display "99+".

**The chip count SHALL re-evaluate within one render cycle whenever the year-filter preference changes (driven by the existing `useLiveQuery` reactivity that already subscribes to `getDueQueueAllSubjects`).**

#### Scenario: Subject with due cards shows badge

- **WHEN** a subject has at least one card with `nextDueAt ≤ now` whose `Question.meta.year` is in the active year filter AND the global daily cap has slots remaining for this subject
- **THEN** the subject banner MUST render a chip showing the per-subject due count (post-cap-allocation, post-year-filter)

#### Scenario: Subject with no due cards hides badge

- **WHEN** a subject has no card with `nextDueAt ≤ now` whose `Question.meta.year` is in the active year filter
- **THEN** the subject banner MUST NOT render the due chip (visual stays clean)

#### Scenario: High due count displays as 99+

- **WHEN** the per-subject allocated due count (post-year-filter) exceeds 99
- **THEN** the chip MUST display "99+" rather than the literal count

#### Scenario: Year filter change updates chip in real time

- **GIVEN** a subject's chip currently shows `8` due cards (year filter = all)
- **WHEN** the player narrows the year filter to `Set([115])` and 6 of those 8 due cards have `meta.year ≠ 115`
- **THEN** within one render cycle the chip SHALL update to display `2`

### Requirement: Due-first picker in quiz modal

The system SHALL prefer due cards over random new questions when the user opens the quiz modal for a subject. The due queue MUST be consumed first; only when the due queue is empty does the picker fall back to the existing `pickRandomQuestion` random new-question flow.

**The QuizModal SHALL expose a player-facing `skipSrs` toggle (per the `hospital-quiz` capability). When `skipSrs` is `true`, the picker SHALL bypass the due-queue walk entirely and SHALL call `pickRandomQuestion` directly for every「下一題」request. The `skipSrs` toggle SHALL NOT alter the underlying SRS scheduler state — due cards that are not surfaced while `skipSrs` is on SHALL remain in the due queue and SHALL be available again when `skipSrs` is toggled off (or when a fresh modal is opened with default `skipSrs = false`).**

**Answering a question while `skipSrs = true` SHALL still update `questionHistory` SRS fields (`interval`, `easeFactor`, `nextDueAt`) per the binary-input SM-2 review requirement — `skipSrs` only affects which question is surfaced next, not how the answer is recorded.**

**The due-first picker SHALL also honor the active year-filter preference (per `hospital-quiz` capability). `getDueQueueAllSubjects(now, opts?)` and `getNextDueCardForSubject(subjectId, consumedIds, opts?)` SHALL each accept an optional `opts.yearFilter?: Set<number>` and SHALL drop `questionHistory` rows whose hydrated `Question.meta.year` is not in the active filter. When `opts.yearFilter` is `undefined`, `.size === 0`, OR `.size === 10`, no year filtering SHALL be applied (no-op). When the year-filtered due queue is empty for a subject, the picker SHALL fall through to `pickRandomQuestion` with the same year filter applied, preserving the existing fall-through semantics.**

#### Scenario: Subject has due card, modal opens with due card

- **GIVEN** `skipSrs = false` (the default)
- **WHEN** a user clicks a subject banner with N ≥ 1 due cards and opens the quiz modal
- **THEN** the modal MUST display the first due card (sorted by overdue days descending), looked up by `questionHistory.questionId` from the content pack

#### Scenario: Due queue depleted, fall back to new question

- **GIVEN** `skipSrs = false`
- **WHEN** the user has consumed all due cards in the current session for a subject
- **THEN** the picker MUST call `pickRandomQuestion(subject, seenIds)` to fetch a new random question (existing behavior)

#### Scenario: Due card is not added to seenIds set

- **WHEN** a due card is surfaced and the user answers it
- **THEN** the system MUST NOT add the due card's questionId to the in-session `seenIds` set (allowing the card to re-appear immediately if it becomes due again)

#### Scenario: skipSrs toggle bypasses due queue entirely

- **GIVEN** the 內科 subject has 5 due cards in the queue
- **AND** the player has the QuizModal open with subject = 內科 and `skipSrs = true`
- **WHEN** the player clicks 「下一題」
- **THEN** the picker MUST NOT call `getNextDueCardForSubject`
- **AND** the picker MUST call `pickRandomQuestion(內科, seenIds)` directly
- **AND** the 5 due cards SHALL remain in the queue (not consumed)

#### Scenario: Answer while skipSrs=true still writes SRS state

- **GIVEN** `skipSrs = true` and the player answers question Q correctly
- **WHEN** the answer side effects run
- **THEN** `questionHistory[Q.id]` SHALL still receive an SM-2 review update (`interval`, `easeFactor`, `nextDueAt` advance per binary-input SM-2 rules)
- **AND** future modal sessions with `skipSrs = false` SHALL be able to surface Q again when its `nextDueAt` falls due

#### Scenario: Toggling skipSrs off mid-session resumes due-first

- **GIVEN** the player has been answering with `skipSrs = true` for several questions
- **AND** the 內科 due queue still contains 3 unconsumed cards
- **WHEN** the player toggles `skipSrs` off and clicks 「下一題」
- **THEN** the picker MUST resume the due-first walk and surface the first remaining due card

#### Scenario: Year filter narrows due queue, picker drops out-of-filter due cards

- **GIVEN** a subject has 5 due cards in `questionHistory` with years `[112, 110, 108, 107, 106]`
- **AND** the active year filter is `Set([115, 114, 113, 112, 111])` (Page 1 only)
- **WHEN** `getDueQueueAllSubjects(Date.now(), { yearFilter })` is called
- **THEN** the returned Map's list for that subject SHALL contain exactly 1 row (for year 112)
- **AND** the「🔴 N due」chip on that banner SHALL display `1` (not `5`)

#### Scenario: Year filter empties due queue, falls through to random new question with same filter

- **GIVEN** a subject's entire due queue (5 cards) consists of questions whose years are all outside the active year filter `Set([115, 114])`
- **AND** the subject's year-filtered random pool is non-empty
- **WHEN** the user opens the quiz modal for that subject
- **THEN** the due-first picker SHALL return `null`
- **AND** the modal SHALL fall through to `pickRandomQuestion(subjectId, seenIds, { yearFilter: Set([115, 114]) })`
- **AND** surface a year-filtered random new question

#### Scenario: skipSrs and year filter compose

- **GIVEN** `skipSrs = true` and the active year filter is `Set([115, 114])`
- **WHEN** the user clicks 「下一題」
- **THEN** the picker SHALL bypass the due queue (per existing `skipSrs` semantics)
- **AND** SHALL call `pickRandomQuestion(subjectId, seenIds, { yearFilter: Set([115, 114]) })` directly
- **AND** the returned question's `meta.year` SHALL be in `{115, 114}`

### Requirement: Global daily cap with round-robin distribution

The system SHALL enforce a global daily cap on surfaced due cards across all subjects, defaulting to 20. Allocation across subjects MUST use round-robin (one subject at a time) to prevent single-subject monopolization. Overflow due cards MUST be carried forward to the next day without compressing interval values.

#### Scenario: Daily cap allocates round-robin across subjects

- **WHEN** the daily cap is 20 and 14 subjects each have multiple due cards
- **THEN** the system MUST distribute slots one subject at a time (subject A pops 1, subject B pops 1, ... subject N pops 1, then back to subject A) until 20 slots are filled or all queues are exhausted

#### Scenario: Single subject does not exceed proportional share

- **WHEN** subject A has 100 due cards and other subjects have 1 due card each
- **THEN** subject A MUST NOT receive more than `ceil(20 / 14) = 2` slots in the round-robin allocation (other subjects each receive at least 1)

#### Scenario: Within-subject ordering is by overdue days descending

- **WHEN** a subject has multiple due cards
- **THEN** the round-robin allocation MUST pop them in order of `now - nextDueAt` descending (oldest overdue first)

#### Scenario: Overflow carries forward without interval compression

- **WHEN** total due cards across all subjects exceed the daily cap of 20
- **THEN** the un-surfaced overflow cards MUST retain their original `interval` and `nextDueAt` values (no compression or rescheduling)

### Requirement: SRS state independent from mastery and specialty match

The system SHALL keep SRS state (`interval`, `easeFactor`, `nextDueAt`) decoupled from mastery counters and from doctor specialty match bonuses. The SRS scheduler MUST NOT read mastery values when computing intervals, and MUST NOT apply specialty match multipliers to interval or easeFactor.

#### Scenario: SRS update on correct answer with high mastery

- **WHEN** a user with mastery ≥ 80% on a subject answers a question correctly
- **THEN** the SRS update MUST follow the standard SM-2 expansion rules (1d → 6d → ×EF) without any mastery-aware adjustment

#### Scenario: SRS update on correct answer with matching specialty partner

- **WHEN** the doctor partner's subject equals the quiz subject (specialty match condition)
- **THEN** the SRS update MUST NOT apply any multiplier to `interval` or `easeFactor` (the specialty match boost belongs to mastery / affinity reward only, handled outside this capability)

### Requirement: No schema migration required

The system SHALL operate entirely on existing v4 schema fields (`questionHistory.nextDueAt: number | null`, `questionHistory.interval: number`, `questionHistory.easeFactor: number`). No Dexie version bump or upgrade hook is required.

#### Scenario: Existing dogfood save reads stub values and writes real values

- **WHEN** a user with an existing v4 save (questionHistory rows with `interval: 0`, `easeFactor: 2.5`, `nextDueAt: null`) answers a question
- **THEN** the system MUST update those fields in place using the binary SM-2 scheduler, with no schema migration or version bump

### Requirement: Tunable constants centralized

The system SHALL keep SRS tunable constants (daily cap, wrong-answer interval multiplier, wrong-answer easeFactor multiplier, standard interval seeds) at the top of `packages/core/src/lib/srs.ts` with named exports, enabling dogfood-driven adjustment without scattered code changes.

#### Scenario: Constants are named exports

- **WHEN** a future change needs to adjust the daily cap or reset multipliers
- **THEN** the constants MUST be discoverable as named exports from `packages/core/src/lib/srs.ts` (e.g., `SRS_DAILY_CAP`, `WRONG_INTERVAL_MULTIPLIER`, `WRONG_EASE_MULTIPLIER`, `STANDARD_INITIAL_INTERVALS`)

### Requirement: Due queue SHALL exclude `hasOptionImages` questions from surfacing

The 二階 SRS scheduler's due-queue read (`getDueQueueAllSubjects`) SHALL drop `questionHistory` rows whose corresponding `Question` in the loaded content pack has `hasOptionImages === true`. Filtered rows SHALL:

1. NOT contribute to the per-subject「🔴 N due」chip count.
2. NOT be returned by `getNextDueCardForSubject` for the due-first picker.
3. NOT be touched on disk — the row stays in `db.questionHistory` so the user's historical answer / mastery state is preserved (the spec's "no schema migration" promise stands).

Rows whose `questionId` cannot be resolved against the loaded pack at all (orphans from older builds) keep the existing pass-through behavior — that is a separate failure class and out of scope for this requirement.

#### Scenario: Due-count chip excludes flagged due rows

- **GIVEN** the user has 5 due rows for 耳鼻喉科 in `questionHistory`, 2 of which correspond to questions with `hasOptionImages: true`
- **WHEN** `getDueQueueAllSubjects()` is called
- **THEN** the returned Map's 耳鼻喉科 list SHALL contain 3 rows
- **AND** the「🔴 N due」chip on the 耳鼻喉科 banner SHALL display `3` (not `5`)

#### Scenario: Due-first picker skips flagged rows

- **GIVEN** the daily cap is allocated and the next due row in line for 耳鼻喉科 is for a question with `hasOptionImages: true`
- **WHEN** `getNextDueCardForSubject('耳鼻喉科', new Set())` is called
- **THEN** the function SHALL return the next non-flagged due row instead
- **AND** SHALL return `null` if all remaining due rows for the subject are flagged

#### Scenario: Flagged rows persist in storage

- **GIVEN** a user previously answered a now-flagged question and the row is in `questionHistory`
- **WHEN** the user reloads the app after this filter ships
- **THEN** `db.questionHistory.toArray()` SHALL still include the row
- **AND** the row's `lastReviewedAt` / mastery counters SHALL be unchanged
- **AND** the row simply does not surface in the due queue or due chip

### Requirement: Easy modifier path (二階)

When the player clicks the 「太簡單」 button after answering correctly in `apps/medexam2-hospital-tw`, the engine SHALL apply a multiplicative escalator to the corresponding `questionHistory` row's SRS fields:

- `newEaseFactor = prev.easeFactor × 1.5`
- `newInterval = min(MAX_INTERVAL_DAYS, round(prev.interval × 3))` (clamped at 365)
- `newNextDueAt = now + newInterval × DAY`
- `lastResult = 'correct'` (unchanged from the binary correct path)
- `everWrong = false` — the player has explicitly graduated this question; remove from 「歷史曾錯」 surface

This SHALL replace the default binary correct-path SM-2 update for that answer. The default `reviewCardBinary({correct: true})` SHALL NOT run additionally — the Easy path is exclusive.

The button SHALL be debounced to prevent multi-click amplification within a single answer reveal.

The `everWrong = false` write SHALL occur in the same atomic Dexie transaction as the SRS update.

#### Scenario: 「太簡單」 click on a fresh-correct row writes both SRS and everWrong fields

- **GIVEN** a row with `interval = 3`, `easeFactor = 2.5`, `everWrong = false`
- **WHEN** the player clicks 「太簡單」 after answering correctly
- **THEN** the row SHALL update to `interval = 9`, `easeFactor = 3.75`, `everWrong = false` (unchanged), `nextDueAt = now + 9 × DAY`
- **AND** all writes SHALL occur in a single transaction

#### Scenario: 「太簡單」 click on an everWrong=true row clears the persistent flag

- **GIVEN** a row with `interval = 7`, `easeFactor = 2.5`, `everWrong = true` (player previously got this question wrong)
- **WHEN** the player now answers correctly AND clicks 「太簡單」
- **THEN** the row SHALL update to `interval = 21`, `easeFactor = 3.75`, **`everWrong = false`**, `nextDueAt = now + 21 × DAY`
- **AND** the entry SHALL no longer appear in the 「歷史曾錯」 sub-view of `/bookmarks?tab=wrong`

#### Scenario: 「太簡單」 click respects 365-day cap

- **GIVEN** a row with `interval = 200`, `easeFactor = 4.0`
- **WHEN** the player clicks 「太簡單」
- **THEN** the row SHALL clamp to `interval = 365`
- **AND** `easeFactor` SHALL update to `6.0`
- **AND** `nextDueAt = now + 365 × DAY`

### Requirement: Guessed modifier path (二階)

When the player clicks the 「我亂猜的」 button after answering correctly in `apps/medexam2-hospital-tw`, the engine SHALL apply an honesty modifier to the corresponding `questionHistory` row's SRS fields:

- `newInterval = 1`
- `easeFactor` SHALL be unchanged
- `newNextDueAt = now + 1 × DAY`
- `lastResult = 'correct'` (unchanged from the binary correct path)
- `everWrong` SHALL be unchanged
- `attempts` and `correctCount` SHALL be incremented per the standard correct-answer path

This SHALL replace the default binary correct-path SM-2 update for that answer. No lapse-like penalty SHALL be applied beyond the interval reset.

Reward dispatch (revenue, reputation, affinity, mastery, achievement triggers, leaderboard pushes) SHALL be IDENTICAL to the default correct-answer path.

#### Scenario: 「我亂猜的」 click resets interval to 1 day but preserves easeFactor

- **GIVEN** a row with `interval = 21`, `easeFactor = 3.0`, `everWrong = false`
- **WHEN** the player clicks 「我亂猜的」 after a correct answer
- **THEN** the row SHALL update to `interval = 1`, `easeFactor = 3.0` (unchanged), `everWrong = false` (unchanged), `nextDueAt = now + 1 × DAY`
- **AND** `attempts` and `correctCount` SHALL each increment by 1

#### Scenario: 「我亂猜的」 click does NOT clear everWrong

- **GIVEN** a row with `interval = 7`, `easeFactor = 2.5`, `everWrong = true`
- **WHEN** the player clicks 「我亂猜的」 after a correct answer
- **THEN** the row SHALL update to `interval = 1`, `easeFactor = 2.5`, **`everWrong = true`** (unchanged)
- **AND** the entry SHALL STILL appear in the 「歷史曾錯」 sub-view

#### Scenario: 「我亂猜的」 click preserves reward dispatch

- **GIVEN** a correct answer would normally grant revenue R and reputation +Δ to the hospital
- **WHEN** the player clicks 「我亂猜的」 instead of letting the default path run
- **THEN** the same revenue R + reputation +Δ SHALL be dispatched
- **AND** affinity / mastery / achievement counters SHALL increment identically to the default correct path
