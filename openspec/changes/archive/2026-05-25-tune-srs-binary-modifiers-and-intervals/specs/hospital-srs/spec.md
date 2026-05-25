## MODIFIED Requirements

### Requirement: Binary-input SM-2 review on answer

The system SHALL update each question's `interval`, `easeFactor`, and `nextDueAt` after every quiz answer using a binary (correct / wrong) input variant of SM-2. Mastery, affinity, and SRS state updates MUST happen in a single atomic Dexie transaction. The correct-path `interval` MUST be clamped to `MAX_INTERVAL_DAYS` (365) to prevent runaway expansion on long streaks of correct answers.

The first-interval seed values SHALL be `STANDARD_INITIAL_INTERVALS = [3, 7]` — the first correct review schedules `interval = 3` days; the second consecutive correct review schedules `interval = 7` days; subsequent correct reviews compute `interval = round(prev.interval × prev.easeFactor)` clamped at the cap.

The opt-in 「太簡單」 and 「我亂猜的」 buttons (see the new Easy / Guessed modifier requirements below) SHALL take precedence over the default binary correct-path mapping when the player clicks them after a correct answer.

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

## ADDED Requirements

### Requirement: Easy modifier path (二階)

When the player clicks the 「太簡單」 button after answering correctly in `apps/medexam2-hospital-tw`, the engine SHALL apply a multiplicative escalator to the corresponding `questionHistory` row's SRS fields:

- `newEaseFactor = prev.easeFactor × 1.5`
- `newInterval = min(MAX_INTERVAL_DAYS, round(prev.interval × 3))` (clamped at 365)
- `newNextDueAt = now + newInterval × DAY`
- `lastResult = 'correct'` (unchanged from the binary correct path)
- `everWrong = false` — the player has explicitly graduated this question; remove from 「歷史曾錯」 surface

This SHALL replace the default binary correct-path SM-2 update for that answer. The default `reviewCardBinary({correct: true})` SHALL NOT run additionally — the Easy path is exclusive.

The button SHALL be debounced to prevent multi-click amplification within a single answer reveal.

The `recordEverWrongFalse(questionId)` helper (or equivalent helper in `apps/medexam2-hospital-tw/src/services/mastery.ts`) SHALL be invoked as part of the same atomic Dexie transaction as the SRS update, ensuring `everWrong = false` and the new SRS state are written together or not at all.

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
