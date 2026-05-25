## ADDED Requirements

### Requirement: Per-family mastery SHALL track correct and total attempt counts in a dedicated Dexie table

The neurons mode SHALL persist a per-neuron-family mastery row in a new `familyMastery` Dexie table (schema version 2, additive over v1's `familyAccrual` / `synapses` / `meta`). Each row stores `familyId: string` (primary key matching subject id), `correct: number` (monotonic-increment on correct quiz attempts), and `total: number` (monotonic-increment on every quiz attempt regardless of correctness).

The table SHALL be initialized lazily on first read via `initFamilyMasteryIfEmpty(pack)`: when row count is zero, seed 11 rows (one per neuron family in the content pack) with `correct: 0, total: 0`.

#### Scenario: New player has all 11 families seeded at zero

- **GIVEN** a fresh player starts neurons-tw
- **WHEN** any consumer first reads mastery state
- **THEN** the `familyMastery` table SHALL contain exactly 11 rows
- **AND** each row SHALL have `correct: 0` and `total: 0`

#### Scenario: Correct attempt increments both counters

- **GIVEN** a family currently has `correct: 5, total: 7`
- **WHEN** the player attempts a question for that family and answers correctly
- **THEN** the row SHALL update to `correct: 6, total: 8`

#### Scenario: Incorrect attempt increments only total

- **GIVEN** a family currently has `correct: 5, total: 7`
- **WHEN** the player attempts a question for that family and answers incorrectly
- **THEN** the row SHALL update to `correct: 5, total: 8`

### Requirement: Mastery tier SHALL be derived by pure function with count + accuracy double-gate

The mastery module SHALL export a pure function `deriveMasteryTier(correct, total): 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'none'` that maps `(correct, total)` to one of six tier labels. The function SHALL NOT depend on Dexie / React / any side effect.

Tier thresholds (count AND accuracy must both meet to qualify):

- **P1 Master**: `correct ≥ 200` AND `accuracy ≥ 0.90`
- **P2 Expert**: `correct ≥ 80` AND `accuracy ≥ 0.80`
- **P3 Proficient**: `correct ≥ 30` AND `accuracy ≥ 0.70`
- **P4 Familiar**: `correct ≥ 10` AND `accuracy ≥ 0.60`
- **P5 Novice**: at least 5 attempts but not P4+
- **'none'**: fewer than 5 attempts (`total < 5`) — insufficient data to assess

`accuracy = correct / total` when `total > 0`, else 0.

#### Scenario: Fresh player below assessment threshold

- **GIVEN** a family with `correct: 2, total: 4`
- **WHEN** `deriveMasteryTier(2, 4)` is called
- **THEN** the function SHALL return `'none'`

#### Scenario: P1 master achieved with both gates met

- **GIVEN** a family with `correct: 200, total: 220` (accuracy 0.909)
- **WHEN** `deriveMasteryTier(200, 220)` is called
- **THEN** the function SHALL return `'P1'`

#### Scenario: Count met but accuracy below P1 gate

- **GIVEN** a family with `correct: 200, total: 250` (accuracy 0.80)
- **WHEN** `deriveMasteryTier(200, 250)` is called
- **THEN** the function SHALL return `'P2'` (drops one tier because accuracy gate failed for P1)

#### Scenario: Accuracy met but count below P1 gate

- **GIVEN** a family with `correct: 100, total: 100` (accuracy 1.0)
- **WHEN** `deriveMasteryTier(100, 100)` is called
- **THEN** the function SHALL return `'P2'` (count fails P1 200-threshold, falls to P2 which 100 satisfies)

### Requirement: Mastery writes SHALL share Dexie transaction with connectome AP writes for atomicity

Whenever `services/connectome.ts` `recordCorrectAnswer(familyId)` or `recordIncorrectAnswer(familyId)` is invoked, the same Dexie transaction SHALL ALSO update the `familyMastery` row for that family (incrementing `correct` on correct answer + `total` on every answer).

This ensures AP counter (from connectome) and mastery counter (from this capability) never diverge — both either commit together or roll back together.

#### Scenario: Correct answer atomically updates AP and mastery

- **GIVEN** a player answers question for family `藥理學` correctly
- **WHEN** `services/connectome.ts` `recordCorrectAnswer('藥理學')` runs
- **THEN** within a single Dexie transaction: `familyAccrual.ap` for `藥理學` SHALL increment by 1
- **AND** `familyMastery.correct` for `藥理學` SHALL increment by 1
- **AND** `familyMastery.total` for `藥理學` SHALL increment by 1

#### Scenario: Incorrect answer increments mastery total but not AP

- **GIVEN** a player answers question for family `生物化學` incorrectly
- **WHEN** `services/connectome.ts` `recordIncorrectAnswer('生物化學')` runs
- **THEN** within a single Dexie transaction: `familyAccrual.ap` for `生物化學` SHALL be unchanged (per connectome-collection Req 1)
- **AND** `familyMastery.correct` SHALL be unchanged
- **AND** `familyMastery.total` SHALL increment by 1

### Requirement: Mastery chip UI SHALL render per family using motion library NumberTickUp for animated count

For every neuron family rendered on the overview page (`/`) and the connectome page (`/connectome`), the UI SHALL display a mastery chip containing:

1. Tier badge (color-coded label e.g. "P3 Proficient", or "—" for tier `'none'`)
2. `<NumberTickUp>` (imported from `'../lib/motion'`) animating the displayed correct count when it changes
3. Accuracy percentage (formatted as integer %, e.g., "84%") or "—" when total = 0

The chip SHALL re-render when its underlying `familyMastery` row updates (subscribe via Dexie live query, useEffect polling, or explicit reactive trigger).

#### Scenario: Mastery chip displays tier and animated count

- **GIVEN** a family with `correct: 15, total: 18` (tier P4, accuracy 83%)
- **WHEN** the overview page renders the mastery section for this family
- **THEN** the chip SHALL display "P4 Familiar" tier label
- **AND** the chip SHALL contain a `<NumberTickUp>` showing "15"
- **AND** the chip SHALL display "83%" accuracy

#### Scenario: Mastery chip displays no-tier state for fresh family

- **GIVEN** a family with `correct: 1, total: 3` (tier 'none' — below 5 threshold)
- **WHEN** the overview page renders the mastery section for this family
- **THEN** the chip SHALL display "—" or equivalent neutral label (not a P-tier)
- **AND** the chip SHALL still show count "1" and accuracy "33%"

#### Scenario: Correct answer triggers animated count update

- **GIVEN** a family chip currently shows correct count "5"
- **WHEN** the player triggers a correct answer (via debug panel or future quiz)
- **AND** the mastery row updates to `correct: 6`
- **THEN** the `<NumberTickUp>` SHALL animate from 5 to 6 over ~600ms (or snap instantly if `prefers-reduced-motion`)
