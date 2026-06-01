# srs-queue Specification

## Purpose
TBD - created by archiving change wire-srs-queue. Update Purpose after archive.
## Requirements
### Requirement: Quiz answer creates or updates an SrsCard

After every question answered in QuizModal, the engine SHALL upsert a corresponding `SrsCard` to `db.srs` keyed by `questionId`. If no card exists, `newCard(questionId)` SHALL create one; then `reviewCard(card, quality)` SHALL update it. The correct-path `interval` MUST be clamped to `MAX_INTERVAL_DAYS` (365) to prevent runaway expansion on long streaks of quality ≥ 3 answers.

The first-interval seed values SHALL be `STANDARD_INITIAL_INTERVALS = [3, 7]` — the first correct review schedules `interval = 3` days; the second consecutive correct review schedules `interval = 7` days; subsequent correct reviews compute `interval = round(prev.interval × prev.ease)` clamped at the cap.

The quality value mapping SHALL be:

| Answer outcome | Quality (0–5) | Effect |
|---|---|---|
| Correct (default path) | `4` | "Good" — interval grows per `STANDARD_INITIAL_INTERVALS` then ×ease (SM-2 standard), capped at 365 days |
| Wrong | `2` | "Lapse" — interval resets to 1 day, lapses counter bumps |

The opt-in 「太簡單」 and 「我亂猜的」 buttons (see the Easy / Guessed modifier requirements below) SHALL take precedence over the default correct-path mapping when the player clicks them after a correct answer.

#### Scenario: First-time correct answer creates a card with three-day interval

- **WHEN** a question with no prior `SrsCard` record is answered correctly in QuizModal
- **THEN** `db.srs.get(questionId)` SHALL return a card with `interval = 3` (first correct review under new `STANDARD_INITIAL_INTERVALS[0]`)
- **AND** `dueAt` SHALL be approximately `now + 3 days`
- **AND** `lapses` SHALL be `0`

#### Scenario: Second-time correct answer extends interval to seven days

- **GIVEN** a card with `interval = 3` (from the first correct answer)
- **WHEN** the player answers correctly again
- **THEN** the card SHALL update to `interval = 7` (per `STANDARD_INITIAL_INTERVALS[1]`)
- **AND** `dueAt` SHALL be approximately `now + 7 days`
- **AND** `ease` SHALL be updated per the standard SM-2 quality-4 formula

#### Scenario: Third-time correct answer extends interval by ease factor

- **GIVEN** a card with `interval = 7` and `ease = 2.6` (from prior correct answers)
- **WHEN** the player answers correctly again
- **THEN** the card SHALL update to `interval = round(7 × 2.6) = 18`
- **AND** `dueAt` SHALL be approximately `now + 18 days`

#### Scenario: First-time wrong answer creates a lapse card

- **WHEN** a question with no prior `SrsCard` is answered wrong
- **THEN** `db.srs.get(questionId)` SHALL return a card with `interval === 1`, `lapses === 1`
- **AND** `dueAt` SHALL be approximately `now + 1 day` (lapse next-day review)

#### Scenario: Long correct streak clamps interval at 365-day cap

- **WHEN** a correct answer (quality ≥ 3) would compute `newInterval > MAX_INTERVAL_DAYS` (365) via `round(card.interval × newEase)`
- **THEN** `reviewCard` MUST clamp `interval` to `MAX_INTERVAL_DAYS` (365) and set `dueAt = now + 365 × DAY`
- **AND** `ease` SHALL still update normally (the cap only constrains `interval`, not the easeFactor trajectory)

#### Scenario: Pre-existing over-cap card clamps on next correct review

- **WHEN** an existing `SrsCard` has `interval = 500` (legacy value from before the cap was added) and the user answers correctly
- **THEN** `reviewCard` MUST clamp the next update to `interval = MAX_INTERVAL_DAYS` (365), regardless of the legacy starting value

#### Scenario: Pre-existing one-day-interval card ages out naturally

- **GIVEN** a card with `interval = 1` written before this change shipped (under the old `STANDARD_INITIAL_INTERVALS = [1, 6]`)
- **WHEN** the card's `dueAt` passes and the player answers correctly
- **THEN** the next interval SHALL be `STANDARD_INITIAL_INTERVALS[1] = 7` (the new second-step value)
- **AND** no retroactive migration of the `interval = 1` value SHALL occur (the card progresses forward under the new constants)

### Requirement: Next quiz prefers due cards

When opening a new QuizModal session, the engine SHALL identify all `SrsCard` with `dueAt <= now` (filtered to the current quiz subject), and present those questions FIRST. If the due pool has fewer than the requested N (default 5) questions, the remainder SHALL be drawn at random from the fresh (never-seen) pool.

#### Scenario: 3 due cards + 2 fresh fill the quiz

- **WHEN** the SRS queue has 3 due cards for the current subject and N=5 questions are requested
- **THEN** the QuizModal SHALL render those 3 due questions in random order
- **AND** the remaining 2 slots SHALL come from random fresh (never-seen) questions
- **AND** if no fresh questions exist either, the quiz MAY proceed with fewer than 5 questions

#### Scenario: 0 due cards falls back to fresh

- **WHEN** no due cards exist (all reviewed questions have `dueAt > now`)
- **THEN** the quiz SHALL pick 5 random questions from the fresh pool (current behavior)

### Requirement: SrsCard state persists across reload

The `db.srs` table SHALL survive page reload via IndexedDB persistence (per `persistence` capability).

#### Scenario: Wrong-answered question reappears after reload

- **WHEN** a player answers question Q1 wrong, closes the quiz, reloads the page, and opens a new quiz
- **THEN** Q1 SHALL be in the due pool (its `dueAt` was set to `~now + 1 day` but the freshly opened quiz still counts cards whose `dueAt` falls within the next few minutes if testing manually)
- **AND** the SRS-prefer behavior SHALL include Q1 in the 5 questions presented
- **AND** Q1's `SrsCard.lapses` SHALL still equal `1`

NOTE: in real player time, "due tomorrow" means Q1 reappears the next day, not immediately. For test purposes, examining `db.srs.get(qid)` directly verifies the lapse state.

### Requirement: Card schema is immutable across versions until SrsCard delta

The `SrsCard` interface fields SHALL remain `{ questionId, ease, interval, dueAt, lapses }`. Changing field shape requires a delta proposal modifying both this capability and the engine SrsCard type.

#### Scenario: Existing saved cards survive code reload

- **WHEN** the page reloads with existing `db.srs` records from a previous session
- **THEN** each saved record SHALL deserialize as a valid `SrsCard` without runtime errors
- **AND** `reviewCard` SHALL operate on it without needing migration

### Requirement: Quality scale exposure to player

The player SHALL NOT see or pick a numeric quality rating (0–5). The system SHALL infer quality from the binary correct/wrong outcome by default. After a correct answer, the player MAY optionally click one of two opt-in buttons in the QuizModal action bar — 「太簡單」 (escalator) or 「我亂猜的」 (honesty modifier) — to override the default quality-4 mapping. These buttons SHALL be hidden in the wrong-answer state. No `Again / Hard / Good / Easy` 4-tier picker SHALL be surfaced (the FSRS-style self-rating modal is explicitly out of scope).

#### Scenario: No numeric quality picker visible

- **WHEN** the player is viewing the reveal/explanation panel after answering
- **THEN** the UI SHALL NOT display a `0/1/2/3/4/5` rating control
- **AND** the UI SHALL NOT display a `Again / Hard / Good / Easy` 4-tier control

#### Scenario: Opt-in buttons surface on correct answer

- **WHEN** the player answers a question correctly and the reveal panel is shown
- **THEN** the action bar SHALL display 「太簡單」 + 「我亂猜的」 buttons alongside the existing 下一題 button
- **AND** clicking either is OPTIONAL — proceeding via 下一題 without clicking either applies the default quality-4 mapping

#### Scenario: Opt-in buttons hidden on wrong answer

- **WHEN** the player answers a question incorrectly and the reveal panel is shown
- **THEN** the action bar SHALL NOT display 「太簡單」 or 「我亂猜的」

### Requirement: Due-count is surfaced on the main app screen

The main app screen SHALL render a player-visible action labelled `📋 複習到期（N 題）`（or equivalent localized phrasing）where `N` is `dueQuestionIds.length` at render time.

The action SHALL update reactively when `dueQuestionIds` changes (e.g., after a quiz session writes new SRS cards and `refreshDueQueue` runs).

#### Scenario: Due count visible after hydration

- **WHEN** the app finishes mount and hydration with `dueQuestionIds.length === 3`
- **THEN** the main screen SHALL display a button labelled `📋 複習到期（3 題）` (or similar localized form)
- **AND** the button SHALL be enabled (clickable)

#### Scenario: Due count refreshes after quiz

- **WHEN** the player completes a reading-mode quiz that creates 2 new lapse cards (wrong answers), bumping due count from 0 to 2
- **THEN** after the quiz modal closes and `refreshDueQueue` completes, the main screen due-count action SHALL re-render to show `2`
- **AND** the action SHALL become enabled (was disabled at 0)

### Requirement: Due-count action is disabled at N=0

When `dueQuestionIds.length === 0`, the due-count action SHALL be disabled (not clickable) and SHALL display a hint (e.g., `目前沒有到期複習，繼續累積中`) so the player understands why no action is available.

#### Scenario: Empty queue disables review action

- **WHEN** `dueQuestionIds.length === 0` after hydration (fresh player, no quiz history)
- **THEN** the `📋 複習到期` action SHALL be disabled
- **AND** the hint text SHALL communicate that there are currently no due reviews

### Requirement: Clicking the action opens review-mode quiz

When the player clicks the enabled due-count action, the app SHALL open a `QuizModal` with `mode='review'` and pass the current `dueQuestionIds` as a prop. The modal's selection logic (per the `quiz-runner` capability) SHALL pull only due cards (no fresh filler) and cap at `REVIEW_BATCH_SIZE`.

#### Scenario: Click opens review modal with due cards only

- **WHEN** the player clicks the `📋 複習到期（7 題）` action
- **THEN** a QuizModal SHALL open with `mode='review'`
- **AND** the modal SHALL render exactly 7 questions, all from the due pool
- **AND** the review-mode banner SHALL be visible

#### Scenario: Large backlog caps at batch size

- **WHEN** the player clicks the action with `dueQuestionIds.length === 35`
- **THEN** the QuizModal SHALL render exactly 20 questions
- **AND** after completing the session, the remaining 15 cards SHALL still be due in `db.srs`
- **AND** the main screen action SHALL refresh and now show `📋 複習到期（15 題）` (per the existing reactive update requirement)

### Requirement: Easy modifier path

When the player clicks the 「太簡單」 button after answering correctly, the engine SHALL apply a multiplicative escalator to the corresponding `SrsCard`:

- `newEase = card.ease × 1.5`
- `newInterval = min(MAX_INTERVAL_DAYS, round(card.interval × 3))`
- `newDueAt = now + newInterval × DAY`
- `lapses` SHALL be unchanged

This SHALL replace the default quality-4 SM-2 update for that answer. The default `reviewCard(card, 4)` SHALL NOT run additionally — the Easy path is exclusive.

The button SHALL be debounced to prevent multi-click amplification within a single answer reveal (single click = single application).

#### Scenario: Single 「太簡單」 click on fresh card

- **GIVEN** a card with `interval = 3`, `ease = 2.5` (a fresh-correct card under new defaults)
- **WHEN** the player clicks 「太簡單」
- **THEN** the card SHALL update to `interval = 9`, `ease = 3.75`, `dueAt = now + 9 × DAY`
- **AND** `lapses` SHALL remain `0`

#### Scenario: Multiple sessions of 「太簡單」 compound multiplicatively

- **GIVEN** a card with `interval = 7`, `ease = 2.5`
- **WHEN** the player clicks 「太簡單」 once (interval → 21, ease → 3.75)
- **AND** ~21 days later the card becomes due and the player clicks 「太簡單」 again
- **THEN** the card SHALL update to `interval = 63`, `ease = 5.625`
- **AND** further click would push to `interval = 189` (still under 365 cap)
- **AND** the click after that clamps at `interval = MAX_INTERVAL_DAYS = 365`

#### Scenario: 「太簡單」 click respects 365-day cap

- **GIVEN** a card with `interval = 200`, `ease = 4.0`
- **WHEN** the player clicks 「太簡單」 (would compute `interval = 600`)
- **THEN** the card SHALL clamp to `interval = MAX_INTERVAL_DAYS = 365`
- **AND** `ease` SHALL still update to `6.0` (ease is not capped — follow-up cap deferred to dogfood)
- **AND** `dueAt = now + 365 × DAY`

#### Scenario: Rapid double-click is debounced to one application

- **GIVEN** a card with `interval = 7`, `ease = 2.5`
- **WHEN** the player double-clicks the 「太簡單」 button within 500 ms
- **THEN** exactly one application SHALL occur (`interval = 21`, `ease = 3.75`)
- **AND** the second click within the debounce window SHALL be discarded

### Requirement: Guessed modifier path

When the player clicks the 「我亂猜的」 button after answering correctly, the engine SHALL apply an honesty modifier to the corresponding `SrsCard`:

- `newInterval = 1`
- `newEase` SHALL be unchanged
- `newDueAt = now + 1 × DAY`
- `lapses` SHALL be unchanged

This SHALL replace the default quality-4 SM-2 update for that answer (no lapse bump — the player answered correctly per the canonical outcome). The default `reviewCard(card, 4)` SHALL NOT run additionally.

Reward dispatch (XP, fate cards, achievements, mastery) SHALL be IDENTICAL to the default correct-answer path — clicking 「我亂猜的」 SHALL NOT alter rewards downstream of the SRS write.

#### Scenario: 「我亂猜的」 click resets interval to 1 day

- **GIVEN** a card with `interval = 21`, `ease = 3.0`, `lapses = 0`
- **WHEN** the player clicks 「我亂猜的」 after a correct answer
- **THEN** the card SHALL update to `interval = 1`, `ease = 3.0` (unchanged), `lapses = 0` (unchanged)
- **AND** `dueAt = now + 1 × DAY`

#### Scenario: 「我亂猜的」 click on a fresh-correct card

- **GIVEN** a question with no prior `SrsCard`
- **WHEN** the player answers correctly and clicks 「我亂猜的」
- **THEN** the card SHALL be created with `interval = 1`, `ease = DEFAULT_EASE = 2.5`, `lapses = 0`
- **AND** `dueAt = now + 1 × DAY`

#### Scenario: 「我亂猜的」 click preserves reward dispatch

- **GIVEN** a correct answer would normally grant N reading-buff XP + 1 fate-card slot
- **WHEN** the player clicks 「我亂猜的」 instead of letting the default path run
- **THEN** the same N XP + 1 fate-card slot SHALL be dispatched
- **AND** the difference SHALL be limited to the SRS table write (interval reset to 1)

