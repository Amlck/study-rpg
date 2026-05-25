## ADDED Requirements

### Requirement: QuizModal action bar SHALL surface 「太簡單」 and 「我亂猜的」 opt-in buttons in correct-answer state (二階)

When the player has answered a question correctly in `apps/medexam2-hospital-tw`'s QuizModal and the reveal panel is shown, the action bar SHALL render two opt-in buttons alongside the existing 🐞 bug-report and 下一題 affordances:

- **「太簡單」** — visual label with a「✨」 (or equivalent visual cue). On click, invokes the Easy modifier path on the corresponding `questionHistory` row (per `hospital-srs` capability's `Easy modifier path (二階)` requirement). This path ALSO sets `everWrong = false` (per `wrong-answer-list` capability's modified `everWrong` flag requirement).
- **「我亂猜的」** — visual label with a 「🤔」 (or equivalent visual cue). On click, invokes the Guessed modifier path on the corresponding `questionHistory` row (per `hospital-srs` capability's `Guessed modifier path (二階)` requirement). `everWrong` is NOT modified by this path.

Both buttons SHALL be hidden when the player answered incorrectly. The action bar in the wrong-state SHALL contain only 🐞 + 下一題 (current behavior, unchanged).

Both buttons SHALL be debounced (single click = single application) and SHALL provide visual confirmation feedback after click.

Both buttons SHALL be optional — clicking 下一題 without engaging either modifier proceeds with the default binary correct-path mapping.

The buttons SHALL NOT alter the reward dispatch path (revenue, reputation, affinity, mastery, achievement triggers, leaderboard pushes) — they only modify SRS state and (for 「太簡單」) the `everWrong` flag.

These buttons SHALL be visually distinguished from the inline ★ promote-to-manual-bookmark affordance (per `hospital-quiz` capability's existing `QuizModal answer-feedback region SHALL surface an inline ★ promote-to-manual-bookmark affordance` requirement), which lives in the explanation region and writes a different Dexie table (`bookmarks`, not `questionHistory`).

The action bar layout SHALL match the same visual order as the 一階 QuizModal (per `quiz-runner` capability's analogous requirement): 🐞 bug-report, ✨ 「太簡單」, 🤔 「我亂猜的」, 下一題. Cross-track visual parity is intentional so players moving between apps recognize the affordances immediately.

#### Scenario: Correct answer reveal shows both opt-in buttons

- **GIVEN** the player answers a question correctly in 二階 QuizModal
- **WHEN** the reveal panel renders
- **THEN** the action bar SHALL display in order: 🐞 bug-report, ✨ 「太簡單」, 🤔 「我亂猜的」, 下一題

#### Scenario: Wrong answer reveal hides opt-in buttons

- **GIVEN** the player answers a question incorrectly in 二階 QuizModal
- **WHEN** the reveal panel renders
- **THEN** the action bar SHALL display ONLY 🐞 bug-report and 下一題

#### Scenario: 「太簡單」 click clears everWrong and applies Easy modifier atomically

- **GIVEN** a `questionHistory[Q]` row with `interval = 7`, `easeFactor = 2.5`, `everWrong = true`, `lastResult = 'wrong'` (player previously got Q wrong)
- **WHEN** the player answers Q correctly AND clicks 「太簡單」
- **THEN** within a single Dexie transaction, the row SHALL update to `interval = 21`, `easeFactor = 3.75`, `everWrong = false`, `lastResult = 'correct'`, `lastAnsweredAt = now`
- **AND** Q SHALL no longer appear in 「歷史曾錯」 sub-view
- **AND** Q SHALL no longer appear in 「目前未答對」 sub-view (already removed since `lastResult` flipped)

#### Scenario: 「我亂猜的」 click resets interval but preserves everWrong

- **GIVEN** a `questionHistory[Q]` row with `interval = 21`, `easeFactor = 3.0`, `everWrong = true`
- **WHEN** the player answers Q correctly AND clicks 「我亂猜的」
- **THEN** the row SHALL update to `interval = 1`, `easeFactor = 3.0` (unchanged), `everWrong = true` (unchanged), `lastResult = 'correct'`, `lastAnsweredAt = now`
- **AND** Q SHALL STILL appear in 「歷史曾錯」 sub-view (with 「✅ 已答對 N 次」 chip)

#### Scenario: Click 「太簡單」 then 下一題 advances and applies modifier

- **GIVEN** the reveal panel is open after a correct answer in 二階
- **WHEN** the player clicks 「太簡單」 then clicks 下一題
- **THEN** the SRS update + `everWrong = false` write SHALL complete in a single transaction
- **AND** the modal SHALL advance to the next question (via existing due-first picker per `hospital-srs` capability)

#### Scenario: Click neither button proceeds with default binary correct path

- **GIVEN** the reveal panel is open after a correct answer
- **WHEN** the player clicks 下一題 without touching either modifier
- **THEN** the row SHALL be updated per the default binary correct path (existing `Binary-input SM-2 review on answer` requirement, now using `[3, 7]` first-interval seeds)
- **AND** `everWrong` SHALL be untouched

#### Scenario: 「我亂猜的」 click preserves reward dispatch

- **GIVEN** a correct answer in 二階 would normally grant revenue R + reputation +Δ + affinity to the partner doctor
- **WHEN** the player clicks 「我亂猜的」
- **THEN** the same revenue R + reputation +Δ + affinity SHALL be dispatched
- **AND** achievement counters (e.g., `correctStreak`, `subjectMastery`) SHALL update identically to the default correct path
- **AND** leaderboard push SHALL fire on the next sync engine `onPushComplete` callback as usual

#### Scenario: 「太簡單」 in 二階 keeps reward dispatch intact

- **GIVEN** a correct answer in 二階 with partner specialty match would normally grant revenue R + reputation +Δ (with specialty bonus)
- **WHEN** the player clicks 「太簡單」
- **THEN** the same revenue R + reputation +Δ SHALL be dispatched (no penalty for graduating the question)
- **AND** affinity / mastery / achievement counters SHALL update identically
