# connectome-collection Specification

## Purpose

Implements step 3 of the `neurons-mode` Hebbian game loop: a synapse state machine (`dormant → weak → strong`), same-day cross-family co-fire detection (N=5 correct answers per family per local-TZ calendar day), LTD decay (one level after 7+ days without co-fire, never removing a synapse), a monotonic per-family Action Potential counter with a 5-step variant slot unlock threshold ladder, and a stub `/connectome` view grouping the 11 neuron families by NT branch alongside a synapse table. Daily reset runs lazily on the next user interaction crossing local-TZ midnight; all per-answer writes are wrapped in a single Dexie transaction with events emitted only after commit.

## Requirements

### Requirement: Per-family Action Potential SHALL be tracked as monotonic counter incremented by correct quiz answers

The neurons mode SHALL maintain a per-neuron-family `actionPotential` (AP) counter that:

- Starts at 0 for each of the 11 neuron families on save creation
- Increments by exactly 1 for every correct quiz answer attributed to that family
- Is monotonic (never decreases for any reason — no per-day reset, no decay, no reset on slot unlock)
- Persists across sessions via the local Dexie `familyAccrual` table

AP is the substrate for variant slot unlock (per the variant-slot requirement below); it does NOT determine variant rarity (rarity is `neuron-variant-gacha` capability's responsibility) and it is distinct from the `affinity` counter (which drives gacha pity).

#### Scenario: Initial AP is zero for all families

- **GIVEN** the player creates a new save in neurons-tw
- **THEN** every family's `actionPotential` SHALL equal 0
- **AND** the `familyAccrual` table SHALL contain one row per neuron family (11 rows total) initialized with `ap = 0`

#### Scenario: Correct answer increments AP by exactly 1

- **GIVEN** a family's current `actionPotential` is `X`
- **WHEN** the player answers a question correctly attributed to that family
- **THEN** that family's `actionPotential` SHALL become `X + 1`
- **AND** no other family's `actionPotential` SHALL be affected

#### Scenario: Incorrect answer does not change AP

- **GIVEN** a family's current `actionPotential` is `X`
- **WHEN** the player answers a question incorrectly attributed to that family
- **THEN** that family's `actionPotential` SHALL remain `X`
- **AND** no AP-related event SHALL be emitted

### Requirement: Synapse SHALL be created between two families upon first same-day co-firing reaching N=5 threshold per family

The neurons mode SHALL detect cross-family co-firing within a single calendar day (local time zone, midnight-to-midnight) using N = 5 correct answers per family as the per-family fired threshold:

- A family is `firedToday` once its same-day correct-answer count reaches 5
- The system SHALL maintain a `firedToday` boolean flag in `familyAccrual` (reset by daily lazy job — see daily reset requirement)
- When ≥ 2 families have `firedToday = true`, the system SHALL ensure a `synapse` row exists for every unordered pair among them
- Newly created synapses SHALL be in the `dormant` state
- The synapse primary key SHALL be `<smallerFamilyId>|<largerFamilyId>` (lexicographic sort) to ensure undirected uniqueness
- Synapse creation SHALL emit a `connectome.synapseFormed` event

#### Scenario: First synapse forms when two families both reach N=5 on the same day

- **GIVEN** the player has answered 5 correct questions for family `藥理學` today
- **AND** the player has answered 4 correct questions for family `解剖學` today
- **WHEN** the player answers a 5th correct question for `解剖學` today
- **THEN** a synapse with `pairKey = "藥理學|解剖學"` SHALL exist in the `synapses` table
- **AND** the synapse's `state` SHALL equal `dormant`
- **AND** the synapse's `lastCoFireDate` SHALL equal today's local date
- **AND** a `connectome.synapseFormed` event SHALL have been emitted with payload `{ pairKey, state: "dormant" }`

#### Scenario: No synapse forms below N=5 threshold

- **GIVEN** the player has answered 4 correct questions for family `藥理學` today
- **AND** the player has answered 5 correct questions for family `解剖學` today
- **THEN** no synapse SHALL exist for `pairKey = "藥理學|解剖學"`
- **AND** no `connectome.synapseFormed` event SHALL have been emitted

#### Scenario: Three families firing same day produces all 3 pairwise synapses

- **GIVEN** the player has answered ≥ 5 correct questions for each of families `A`, `B`, `C` on the same day
- **THEN** synapses SHALL exist for all three unordered pairs: `A|B`, `A|C`, `B|C` (assuming lexicographic sort)
- **AND** three `connectome.synapseFormed` events SHALL have been emitted (once each per pair on initial creation)

### Requirement: Synapse state machine SHALL implement three discrete states (dormant / weak / strong) with strengthening on subsequent same-day co-fires

The synapse state machine SHALL have exactly three states with forward transitions triggered by repeated co-firing:

| Current state | Transition trigger | Next state |
|---|---|---|
| `dormant` | Both families re-fire on a subsequent day (later than `lastCoFireDate`) | `weak` |
| `weak` | Both families re-fire on a subsequent day | `strong` |
| `strong` | Both families re-fire on a subsequent day | `strong` (no further forward transitions; `lastCoFireDate` updates) |

Transitions to `weak` or `strong` SHALL emit a `connectome.synapseStrengthened` event. Updates that only refresh `lastCoFireDate` without a state change SHALL NOT emit a strengthening event.

#### Scenario: Dormant synapse upgrades to weak after second same-day co-fire on a later day

- **GIVEN** a synapse `pairKey = "藥理學|解剖學"` exists with `state = dormant` and `lastCoFireDate = "2026-05-26"`
- **WHEN** on `"2026-05-27"` both families re-reach N=5 fired status on the same day
- **THEN** the synapse's `state` SHALL become `weak`
- **AND** the synapse's `lastCoFireDate` SHALL equal `"2026-05-27"`
- **AND** a `connectome.synapseStrengthened` event SHALL have been emitted with payload `{ pairKey, fromState: "dormant", toState: "weak" }`

#### Scenario: Strong synapse stays strong on subsequent co-fire but refreshes lastCoFireDate

- **GIVEN** a synapse exists with `state = strong` and `lastCoFireDate = "2026-05-26"`
- **WHEN** on `"2026-05-30"` both families re-reach N=5 fired status on the same day
- **THEN** the synapse's `state` SHALL remain `strong`
- **AND** the synapse's `lastCoFireDate` SHALL equal `"2026-05-30"`
- **AND** NO `connectome.synapseStrengthened` event SHALL be emitted

#### Scenario: Same-day repeated firing does not re-trigger strengthening

- **GIVEN** a synapse exists with `state = dormant` and `lastCoFireDate = today`
- **WHEN** the player continues answering more correct questions for both families on the same day
- **THEN** the synapse's `state` SHALL remain `dormant` (no same-day forward transition)
- **AND** the synapse's `lastCoFireDate` SHALL remain today's date
- **AND** NO `connectome.synapseStrengthened` event SHALL be emitted on this day

### Requirement: LTD decay SHALL downgrade synapse state by one level after 7+ days without co-fire, never removing the synapse

The daily reset job (see daily reset requirement) SHALL run an LTD decay pass:

- For every synapse where `today - lastCoFireDate` > 7 days:
  - `strong` → `weak`
  - `weak` → `dormant`
  - `dormant` → `dormant` (no further decay)
- Decay SHALL emit a `connectome.synapseDecayed` event with payload `{ pairKey, fromState, toState }`
- After decay, the system SHALL set the synapse's `lastCoFireDate` to today's date (the decay date) so that the next decay opportunity is at least 7 more days away; this prevents a single check pass from cascading multiple decay steps
- A synapse SHALL NEVER be removed from the `synapses` table (no ruptures even at full `dormant` decay)

#### Scenario: Strong synapse decays to weak after 8 days without co-fire

- **GIVEN** a synapse exists with `state = strong` and `lastCoFireDate = "2026-05-26"`
- **AND** between `2026-05-26` and today (`2026-06-03`) the two families have not co-fired on any same day
- **WHEN** the daily reset job runs on `"2026-06-03"`
- **THEN** the synapse's `state` SHALL become `weak`
- **AND** the synapse's `lastCoFireDate` SHALL be updated to `"2026-06-03"`
- **AND** a `connectome.synapseDecayed` event SHALL have been emitted with payload `{ pairKey, fromState: "strong", toState: "weak" }`

#### Scenario: Dormant synapse does not decay further (never removed)

- **GIVEN** a synapse exists with `state = dormant` and `lastCoFireDate = "2026-05-01"`
- **WHEN** the daily reset job runs on `"2026-06-15"` (45 days later)
- **THEN** the synapse SHALL still exist in the `synapses` table
- **AND** the synapse's `state` SHALL remain `dormant`
- **AND** no `connectome.synapseDecayed` event SHALL be emitted

#### Scenario: Incorrect answer does not trigger decay or downgrade

- **GIVEN** a synapse exists with `state = strong`
- **WHEN** the player answers a question incorrectly for either of its two families
- **THEN** the synapse's `state` SHALL remain `strong`
- **AND** the synapse's `lastCoFireDate` SHALL remain unchanged
- **AND** no `connectome.synapseDecayed` event SHALL be emitted

### Requirement: Variant slot unlock SHALL emit event when family AP crosses one of five threshold values

The neurons mode SHALL declare a fixed AP threshold ladder mapping to 5 variant slot indices (1-5):

| Slot index | AP threshold |
|---|---|
| 1 | 10 |
| 2 | 30 |
| 3 | 80 |
| 4 | 200 |
| 5 | 500 |

When a family's `actionPotential` crosses one of these thresholds upward (i.e., before increment was below threshold, after is at or above), the system SHALL emit a `connectome.variantSlotUnlocked` event with payload `{ familyId, slotIndex, apAtUnlock }`. The system SHALL persist a per-family `unlockedSlots` set (or equivalent) so each slot fires its event at most once over the save's lifetime.

This capability SHALL NOT implement the variant gacha logic itself (no roll-and-assign, no rarity selection); the gacha behavior is `wire-neuron-variant-gacha` capability's responsibility. This capability only exposes the unlock signal.

#### Scenario: AP crossing 10 emits slot 1 unlock event exactly once

- **GIVEN** a family's `actionPotential` is 9 and `unlockedSlots` is empty
- **WHEN** the player answers a correct question for that family
- **THEN** the family's `actionPotential` SHALL become 10
- **AND** a `connectome.variantSlotUnlocked` event SHALL have been emitted with payload `{ familyId, slotIndex: 1, apAtUnlock: 10 }`
- **AND** the family's `unlockedSlots` SHALL include 1

#### Scenario: Subsequent AP increments past 10 do not re-emit slot 1 event

- **GIVEN** a family's `actionPotential` is 10 and `unlockedSlots = {1}`
- **WHEN** the player answers another correct question for that family (AP → 11)
- **THEN** no `connectome.variantSlotUnlocked` event SHALL be emitted for slot 1
- **AND** the family's `unlockedSlots` SHALL still equal `{1}`

#### Scenario: Crossing multiple thresholds in a single answer (impossible by increment-1 rule) is therefore not a concern

- **GIVEN** AP increments by exactly 1 per correct answer (per the AP requirement)
- **THEN** at most one slot SHALL ever unlock per single correct answer

### Requirement: Daily reset SHALL run lazily on next user interaction crossing local-TZ midnight

The system SHALL use a lazy daily reset strategy rather than a background scheduler:

- A `meta.lastResetDate` value SHALL be persisted (initialized on save creation to that date)
- On every entry into `recordCorrectAnswer` and `loadConnectome` (and equivalent connectome service entry points), the system SHALL check whether `meta.lastResetDate` ≠ today's local date
- If different, the system SHALL run the daily reset sequence before continuing:
  1. Reset every `familyAccrual.firedToday` flag to `false`
  2. Run the LTD decay pass per the decay requirement
  3. Update `meta.lastResetDate` to today's local date

The reset SHALL handle multi-day gaps (user opens the app after a multi-day absence) by running decay loop checks per day-passed if needed; for the LTD decay, since post-decay `lastCoFireDate` is set to the decay date, no cascading occurs and a single pass suffices.

#### Scenario: First app entry of a new day triggers reset before processing the answer

- **GIVEN** `meta.lastResetDate = "2026-05-30"` and today is `"2026-05-31"`
- **AND** every family's `firedToday = true` (carried over from yesterday's storage)
- **WHEN** the player answers a correct question (first action of `2026-05-31`)
- **THEN** before processing the answer, every family's `firedToday` SHALL be reset to `false`
- **AND** the LTD decay pass SHALL have run
- **AND** `meta.lastResetDate` SHALL equal `"2026-05-31"`
- **AND** the player's answer SHALL then be applied (AP increments, `firedToday` for the answered family may flip to true if N=5 reached)

#### Scenario: Same-day repeated entry does not re-run reset

- **GIVEN** `meta.lastResetDate = "2026-05-31"` and today is `"2026-05-31"`
- **WHEN** the player answers a second correct question on the same day
- **THEN** the daily reset sequence SHALL NOT run again
- **AND** `meta.lastResetDate` SHALL remain `"2026-05-31"`

### Requirement: Stub Connectome view SHALL display all 11 families grouped by NT branch plus a synapse table

The neurons mode SHALL ship a minimal `/connectome` route view containing:

- A section organized into 4 columns labeled by NT branch (`DA` / `5-HT` / `GABA` / `Glu`), with each column listing the family cards assigned to that branch (per content pack metadata)
- Each family card SHALL display: family `displayName`, sprite (via `artKey`), current `actionPotential`, next slot threshold (or "MAX" if all 5 slots unlocked), and a `firedToday` badge when applicable
- A synapse table section listing all rows from the `synapses` table with columns: family A `displayName`, family B `displayName`, state (`dormant` / `weak` / `strong`), `lastCoFireDate`, `daysSinceCoFire`
- An empty-state message when no synapses exist explaining the N=5 same-day co-fire rule

The view SHALL NOT render any polished SVG / Canvas Linnean phylogenetic tree (deferred to a follow-up change). Synapse formation feedback to the user SHALL come from toast notifications (per the toast requirement), not from this view alone.

#### Scenario: Connectome view renders all 11 families in correct NT-branch columns

- **GIVEN** the player navigates to `/connectome`
- **WHEN** the page renders
- **THEN** there SHALL be exactly 4 NT-branch columns labeled `DA`, `5-HT`, `GABA`, `Glu`
- **AND** every family from the content pack SHALL appear in exactly one column matching its `ntBranch` field
- **AND** every family card SHALL display `displayName`, sprite via `artKey`, `actionPotential`, and next slot threshold

#### Scenario: Empty-state message appears when no synapses exist

- **GIVEN** the `synapses` table is empty
- **WHEN** the page renders
- **THEN** the synapse table section SHALL show an empty-state message that names the rule (≥ 5 correct in 2 families on the same day forms a synapse)
- **AND** no rows SHALL appear in the synapse table

#### Scenario: Synapse table renders one row per synapse with state and lastCoFireDate

- **GIVEN** the `synapses` table contains a row with `pairKey = "藥理學|解剖學"`, `state = weak`, `lastCoFireDate = "2026-05-30"`
- **AND** today is `"2026-06-02"`
- **WHEN** the page renders
- **THEN** the synapse table SHALL contain a row showing family A `藥理學`, family B `解剖學`, state `weak`, `lastCoFireDate` `2026-05-30`, `daysSinceCoFire` `3`

### Requirement: Synapse formation and strengthening SHALL surface user-facing toast notification, decay SHALL NOT

The system SHALL render a toast notification when the user is in the app and one of the following events fires:

- `connectome.synapseFormed`: toast with copy naming both family `displayName`s and the wiring relation
- `connectome.synapseStrengthened`: toast with copy naming both family `displayName`s and the new state (`weak` or `strong`)

Toasts SHALL auto-dismiss after 8 seconds. Toasts SHALL NOT block input or pause gameplay.

Decay events (`connectome.synapseDecayed`) SHALL NOT trigger toast notifications (to avoid negative-feedback fatigue). Decay is visible only via the synapse table's state and `daysSinceCoFire` columns.

#### Scenario: New synapse formation triggers a toast naming both families

- **WHEN** a `connectome.synapseFormed` event fires for `pairKey = "藥理學|解剖學"`
- **THEN** a toast SHALL render containing both family `displayName`s (the renamed neuron family names per `wire-neurons-content-and-theme`)
- **AND** the toast SHALL auto-dismiss after 8 seconds

#### Scenario: Synapse decay does NOT trigger a toast

- **WHEN** a `connectome.synapseDecayed` event fires
- **THEN** no toast SHALL render
- **AND** the user discovers the decay only by inspecting the synapse table or seeing a future strengthening event

### Requirement: Connectome service SHALL wrap all writes in a single Dexie transaction with events emitted after commit

The connectome service layer SHALL perform all per-answer state writes (AP increment, `firedToday` flag update, synapse creation or strengthening, daily reset if triggered, `lastCoFireDate` update, `unlockedSlots` mutation) inside a single Dexie `transaction()` block. Event emissions SHALL be deferred until after the transaction commits successfully, to ensure subscribers do not observe partial state.

If the transaction fails, no events SHALL be emitted and the in-memory state SHALL remain consistent with the pre-transaction Dexie state.

#### Scenario: Transaction failure rolls back all writes and emits no events

- **GIVEN** a `recordCorrectAnswer` call begins a Dexie transaction
- **WHEN** the transaction throws partway through (e.g., due to storage quota exceeded)
- **THEN** AP, `firedToday`, `synapses`, and `unlockedSlots` SHALL remain at their pre-call values
- **AND** no `connectome.*` event SHALL have been emitted

#### Scenario: All writes commit before any event fires

- **WHEN** a `recordCorrectAnswer` call succeeds and triggers both AP slot unlock and synapse formation
- **THEN** all Dexie writes SHALL have committed before either `connectome.variantSlotUnlocked` or `connectome.synapseFormed` event handlers run
- **AND** event subscribers reading from Dexie SHALL observe the committed post-call state
