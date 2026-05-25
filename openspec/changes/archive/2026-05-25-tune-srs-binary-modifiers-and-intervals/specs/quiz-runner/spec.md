## ADDED Requirements

### Requirement: QuizModal action bar SHALL surface 「太簡單」 and 「我亂猜的」 opt-in buttons in correct-answer state

When the player has answered a question correctly in `apps/medexam-tw`'s QuizModal and the reveal panel is shown, the action bar SHALL render two opt-in buttons alongside the existing 下一題 affordance:

- **「太簡單」** — visual label with a「✨」 (or equivalent visual cue). On click, invokes the Easy modifier path on the corresponding `SrsCard` (per `srs-queue` capability).
- **「我亂猜的」** — visual label with a 「🤔」 (or equivalent visual cue). On click, invokes the Guessed modifier path on the corresponding `SrsCard` (per `srs-queue` capability).

The 🐞 bug-report affordance MAY live in the action bar (二階 / `hospital-quiz` capability) OR in the modal header (一階 / current `quiz-runner` capability) — both arrangements are acceptable. Cross-track visual parity of the bug-report placement is out of scope for this change.

Both buttons SHALL be hidden when the player answered incorrectly. The action bar in the wrong-state SHALL contain only 下一題 (plus 🐞 if 🐞 is in the action bar for that app — unchanged from prior behavior).

Both buttons SHALL be debounced (single click = single application) and SHALL provide visual confirmation feedback after click (e.g., button briefly dims or shows a check mark) so the player knows the click registered.

Both buttons SHALL be optional — clicking 下一題 without engaging either modifier proceeds with the default quality-4 SM-2 update.

The buttons SHALL NOT alter the reward dispatch path (XP, fate-card draws, mastery, achievements, etc.) — they only modify SRS state.

These buttons SHALL be visually distinguished from the inline ★ promote-to-manual-bookmark affordance (per `question-bookmarks` capability), which lives in the explanation region (not the action bar) and writes a different Dexie table (`bookmarks`, not `srs`).

#### Scenario: Correct answer reveal shows both opt-in buttons

- **GIVEN** the player answers a question correctly in QuizModal
- **WHEN** the reveal panel renders
- **THEN** the action bar SHALL display ✨ 「太簡單」 and 🤔 「我亂猜的」 between any existing affordances and 下一題 — concretely the visible order MAY be `[🐞 (if present in action bar) ,] ✨ 太簡單, 🤔 我亂猜的, 下一題`
- **AND** the 🐞 bug-report affordance SHALL remain accessible somewhere in the QuizModal (action bar OR modal header — 一階 keeps 🐞 in header; 二階 keeps 🐞 in footer per `hospital-quiz` capability)
- **AND** all visible action-bar affordances SHALL be enabled

#### Scenario: Wrong answer reveal hides opt-in buttons

- **GIVEN** the player answers a question incorrectly in QuizModal
- **WHEN** the reveal panel renders
- **THEN** the action bar SHALL display ONLY 下一題 (plus 🐞 if 🐞 lives in the action bar for this app)
- **AND** 「太簡單」 SHALL NOT be visible
- **AND** 「我亂猜的」 SHALL NOT be visible

#### Scenario: Click 「太簡單」 then 下一題 advances to next question with Easy modifier applied

- **GIVEN** the reveal panel is open after a correct answer
- **WHEN** the player clicks 「太簡單」 then clicks 下一題
- **THEN** the corresponding `SrsCard` SHALL be updated per the Easy modifier path (per `srs-queue` capability)
- **AND** the modal SHALL advance to the next question

#### Scenario: Click neither button proceeds with default quality-4 mapping

- **GIVEN** the reveal panel is open after a correct answer
- **WHEN** the player clicks 下一題 without touching 「太簡單」 or 「我亂猜的」
- **THEN** the corresponding `SrsCard` SHALL be updated per the default quality-4 mapping (existing `Quiz answer creates or updates an SrsCard` requirement)
- **AND** the modal SHALL advance to the next question

#### Scenario: Click 「我亂猜的」 does not penalize rewards

- **GIVEN** a correct answer would grant N reading-buff XP + 1 fate-card slot per the default path
- **WHEN** the player clicks 「我亂猜的」
- **THEN** the same N XP + 1 fate-card slot SHALL be dispatched
- **AND** the SRS row SHALL receive `interval = 1` (per Guessed modifier path)

#### Scenario: Buttons are debounced

- **GIVEN** the reveal panel is open after a correct answer
- **WHEN** the player rapidly double-clicks 「太簡單」 within 500 ms
- **THEN** exactly one Easy modifier application SHALL be queued
- **AND** the second click SHALL be discarded (visual feedback may or may not appear)
