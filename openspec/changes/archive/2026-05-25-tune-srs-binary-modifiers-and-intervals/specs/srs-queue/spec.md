## MODIFIED Requirements

### Requirement: Quiz answer creates or updates an SrsCard

After every question answered in QuizModal, the engine SHALL upsert a corresponding `SrsCard` to `db.srs` keyed by `questionId`. If no card exists, `newCard(questionId)` SHALL create one; then `reviewCard(card, quality)` SHALL update it. The correct-path `interval` MUST be clamped to `MAX_INTERVAL_DAYS` (365) to prevent runaway expansion on long streaks of quality ≥ 3 answers.

The first-interval seed values SHALL be `STANDARD_INITIAL_INTERVALS = [3, 7]` — the first correct review schedules `interval = 3` days; the second consecutive correct review schedules `interval = 7` days; subsequent correct reviews compute `interval = round(prev.interval × prev.ease)` clamped at the cap.

The quality value mapping SHALL be:

| Answer outcome | Quality (0–5) | Effect |
|---|---|---|
| Correct (default path) | `4` | "Good" — interval grows per `STANDARD_INITIAL_INTERVALS` then ×ease (SM-2 standard), capped at 365 days |
| Wrong | `2` | "Lapse" — interval resets to 1 day, lapses counter bumps |

The opt-in 「太簡單」 and 「我亂猜的」 buttons (see the new Easy / Guessed modifier requirements below) SHALL take precedence over the default correct-path mapping when the player clicks them after a correct answer.

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

### Requirement: Quality scale exposure to player

The player SHALL NOT see or pick a numeric quality rating (0–5). The system SHALL infer quality from the binary correct/wrong outcome by default. After a correct answer, the player MAY optionally click one of two opt-in buttons in the QuizModal action bar — 「太簡單」 (escalator) or 「我亂猜的」 (honesty modifier) — to override the default quality-4 mapping. These buttons SHALL be hidden in the wrong-answer state. No `Again / Hard / Good / Easy` 4-tier picker SHALL be surfaced (the FSRS-style self-rating modal is explicitly out of scope).

#### Scenario: No numeric quality picker visible

- **WHEN** the player is viewing the reveal/explanation panel after answering
- **THEN** the UI SHALL NOT display a `0/1/2/3/4/5` rating control
- **AND** the UI SHALL NOT display a `Again / Hard / Good / Easy` 4-tier control

#### Scenario: Opt-in buttons surface on correct answer

- **WHEN** the player answers a question correctly and the reveal panel is shown
- **THEN** the action bar SHALL display 「太簡單」 + 「我亂猜的」 buttons alongside the existing 🐞 bug-report + 下一題 buttons
- **AND** clicking either is OPTIONAL — proceeding via 下一題 without clicking either applies the default quality-4 mapping

#### Scenario: Opt-in buttons hidden on wrong answer

- **WHEN** the player answers a question incorrectly and the reveal panel is shown
- **THEN** the action bar SHALL display ONLY the existing 🐞 bug-report + 下一題 buttons (no 「太簡單」, no 「我亂猜的」)

## ADDED Requirements

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
- **AND** `ease` SHALL still update to `6.0` (ease is not capped — see Open Question 1 in design.md)
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
