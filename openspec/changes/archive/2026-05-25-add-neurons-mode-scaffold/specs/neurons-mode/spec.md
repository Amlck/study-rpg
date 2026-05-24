## ADDED Requirements

### Requirement: Game loop SHALL follow Hebbian 3-step learn-fire-wire cycle

The neurons mode SHALL implement a closed game loop framed by Donald Hebb's principle ("neurons that fire together, wire together"):

1. Player reads study material (reading timer accrues) AND answers exam questions filtered by subject (one of 10 一階 國考 subjects, displayed under their renamed neuron-family identities)
2. Each correct answer increases the per-neuron-family **affinity** counter (drives variant gacha unlock — see `neuron-variant-gacha` capability) AND increases the **action potential** counter for that family (drives variant collection growth — see `connectome-collection` capability)
3. When a single learning session co-fires ≥ N questions across **two distinct neuron families**, the system SHALL form (or strengthen) a **synapse** between those families in the player's connectome view; repeated co-firing potentiates the synapse (LTP); prolonged absence of co-firing decays it (LTD) without rupture

The loop is intentionally closed — answering more cross-family questions → more synapses + more potentiation → richer connectome view + more variant gacha unlocks → encourages answering more questions. No external grind / no real-money loop. The exact N value, decay rates, and synapse state machine are deferred to `add-connectome-collection`.

#### Scenario: Initial state has empty connectome

- **GIVEN** the player starts a new save in neurons-tw
- **THEN** `affinity[family] = 0` for all 10 neuron families
- **AND** the connectome view SHALL display all 10 neuron family nodes in a Linnean taxonomy tree with zero synapses between any pair
- **AND** the player MAY answer questions from any subject (answering is not gated)

#### Scenario: First synapse formation

- **GIVEN** the player has answered ≥ N questions correctly from neuron family A in the current session
- **AND** the player has answered ≥ N questions correctly from neuron family B in the same session
- **WHEN** the second cross-family threshold is crossed
- **THEN** a synapse between family A and family B SHALL be created in the dormant state
- **AND** an in-app notification SHALL surface informing the player of the new wiring
- **AND** the connectome view SHALL render the new synapse with the dormant visual style

#### Scenario: Incorrect answer does not rupture synapse

- **GIVEN** a synapse exists between two neuron families in the potentiated state
- **WHEN** the player answers a question from one of those families incorrectly
- **THEN** the synapse SHALL NOT be removed
- **AND** the synapse SHALL NOT be downgraded by more than one state level (LTD applies gradually via decay, not punitively per answer)

### Requirement: Player stats SHALL be modeled as 4 neurotransmitter levels, not medical 4-stat schema

The neurons mode SHALL replace the default 4-stat character schema used by `theme-pixel-medical` with a 4-neurotransmitter schema delivered via `ContentPackMeta.statSchema` override (per `content-pack-contract`):

| Stat key | Display name | Driven by | Visual color |
|---|---|---|---|
| `da` | Dopamine 多巴胺 | Reading session completion / streak | Yellow / gold |
| `5ht` | Serotonin 血清素 | Long-duration reading without errors | Red / coral |
| `gaba` | GABA γ-胺基丁酸 | Quiz accuracy under timed conditions | Blue / cyan |
| `glu` | Glutamate 麩胺酸 | New material learned (first-seen correct) | Green / emerald |

The mapping from gameplay events to stat increments SHALL be specified in `wire-neurons-content-and-theme`; this capability fixes only the 4 stat keys + display name semantics.

#### Scenario: Theme + content jointly deliver 4 NT stat schema

- **GIVEN** neurons-tw boots with `@study-rpg/content-neurons-tw` and `@study-rpg/theme-pixel-neurons`
- **WHEN** the engine resolves `ContentPackMeta.statSchema`
- **THEN** the schema SHALL contain exactly the four keys `da`, `5ht`, `gaba`, `glu`
- **AND** the display names SHALL be the bilingual labels specified in this requirement
- **AND** no medical 4-stat schema (knowledge / endurance / dexterity / etc.) SHALL be present

#### Scenario: Engine fallback when content pack omits statSchema

- **GIVEN** an erroneous build where `content-neurons-tw` ships without `statSchema` in meta.json
- **WHEN** the engine boots
- **THEN** the engine SHALL fall back to the default 4-stat schema from `@study-rpg/core` (per existing `content-pack-contract` behavior)
- **AND** the engine SHALL log a console warning identifying the missing override
- **NOTE** This scenario asserts engine resilience; the production build SHALL always ship statSchema (validated in `wire-neurons-content-and-theme`)

### Requirement: Connectome visual SHALL use Linnean taxonomy, not brain anatomy

The neurons mode's primary collection visual SHALL be a **Linnean-style phylogenetic taxonomy tree** organized by neurotransmitter family, NOT a brain anatomy map (no cortex / hippocampus / amygdala anatomy) and NOT a literal C. elegans connectome (no 302-named-neuron mapping).

Tree structure:
- Root: the player's connectome
- 4 main branches: DA / 5-HT / GABA / Glu (matching the 4-stat schema)
- Each branch hosts multiple neuron family clusters (specific assignment of 10 一階 subjects → branch + cluster deferred to `wire-neurons-content-and-theme`)
- Each neuron family node displays its collected variants (P1–P5 rarity per `neuron-variant-gacha`)

Cross-cluster synapses (per the Hebbian game loop requirement) overlay the taxonomy tree as a second visual layer — the taxonomy is static phylogeny; the synapses are dynamic wiring.

#### Scenario: Connectome view never renders brain regions

- **GIVEN** the player navigates to the connectome view in neurons-tw
- **WHEN** the view renders
- **THEN** the rendered visual SHALL NOT include any brain region sprite (cortex / hippocampus / amygdala / cerebellum / brainstem etc.)
- **AND** the visual SHALL NOT include any anatomical brain outline sprite
- **AND** the visual SHALL render a phylogenetic tree with 4 NT-labeled root branches

#### Scenario: Cluster placement on NT branches is content-pack-driven

- **GIVEN** the connectome view loads
- **WHEN** neuron family nodes are positioned
- **THEN** each family's NT-branch assignment SHALL be read from `content-neurons-tw` metadata (not hardcoded in the app or theme)
- **AND** changing a family's NT-branch assignment in the content pack SHALL be reflected in the view without engine code change

### Requirement: Neurons mode SHALL be data-independent from medexam-tw and medexam2-hospital-tw

The neurons mode SHALL maintain complete data isolation from the other two apps in this monorepo (`apps/medexam-tw` and `apps/medexam2-hospital-tw`):

- **Storage isolation**: `apps/neurons-tw` SHALL use its own Dexie database with no shared tables with the other two apps
- **Cloud sync isolation**: cloud sync (when wired in `add-neurons-deploy` follow-up) SHALL push to its own R2 bundle (e.g. `users/<user_id>/neurons-snapshot.json.gz`) separate from `m1-snapshot` / `m2-snapshot` / `bookmarks` bundles
- **Save migration absence**: there SHALL be no import-from-medexam-tw button, no automatic migration prompt on first launch, no cross-app save-data reconciliation
- **Cross-app recognition absence**: neurons-tw SHALL NOT display any achievement badge, leaderboard entry, cosmetic unlock, or progress indicator referencing the player's medexam-tw or medexam2-hospital-tw saves
- **Streak independence**: a daily streak in neurons-tw SHALL accrue independently from streaks in the other two apps

This isolation reflects deliberate design discussion captured in `~/.claude/scratch/grilled-neurons-tw-spec-prep-2026-05-25.md` Facets 1, 2, and 6.

#### Scenario: First-time neurons-tw login does not surface medexam-tw data

- **GIVEN** a player with an existing medexam-tw save and existing R2 `m1-snapshot` bundle
- **WHEN** that player signs into neurons-tw for the first time with the same OAuth account
- **THEN** neurons-tw SHALL initialize with a fresh empty player state
- **AND** neurons-tw SHALL NOT prompt to import medexam-tw progress
- **AND** neurons-tw SHALL NOT display any medexam-tw achievement / cosmetic / streak / level reference

#### Scenario: Streak counters are per-app

- **GIVEN** a player has a 30-day streak in medexam-tw
- **WHEN** the same player opens neurons-tw for the first time
- **THEN** the neurons-tw streak counter SHALL display 0 (or the equivalent fresh-start state)
- **AND** answering questions in medexam-tw SHALL NOT increment neurons-tw's streak counter

### Requirement: Neurons mode SHALL borrow design patterns from 二階 capabilities while declaring independent capability specs

The neurons mode SHALL deliver feature parity with `medexam2-hospital-tw` in four design areas — variant gacha, family mastery tracking, public leaderboard, achievement system — by **borrowing the design pattern** (rarity tiers / pity / affinity gate / D1+KV cron / 4-tier badge atlas) from 二階 capabilities, but SHALL declare **independent capability specs** for each, scoped to neurons semantics.

| Design pattern source (二階) | Neurons capability (this track) |
|---|---|
| `recruitment-gacha` + `affinity-specialty-bonus` | `neuron-variant-gacha` (deferred to `wire-neuron-variant-gacha`) |
| `hospital-mastery` | `neuron-family-mastery` (deferred to `wire-neuron-family-mastery`) |
| `hospital-leaderboard` | `neurons-leaderboard` (deferred to `add-neurons-leaderboard`) |
| `achievement-system` | `neurons-achievements` (deferred to `add-neurons-achievements`) |

Borrowing rules:
- Each follow-up change's design.md SHALL explicitly cite the 二階 source capability name AND list semantic differences (doctor → neuron variant / hospital room → NT branch / hospital tier → mastery level / etc.)
- The follow-up change SHALL NOT modify the 二階 source capability spec
- The follow-up change SHALL NOT reuse the 二階 capability spec text — each neurons capability spec is independently authored

The neurons-* capability spec text MAY repeat structural language (e.g. "5-tier rarity P1–P5 mapped to a power multiplier") from the 二階 source where the semantics genuinely match, but MUST rename all domain-specific terms (no "doctor" / "醫師" / "醫院" / "tycoon" / "room" in neurons spec).

#### Scenario: Variant gacha design borrows recruitment-gacha pattern but declares own spec

- **GIVEN** the follow-up change `wire-neuron-variant-gacha` is in propose phase
- **WHEN** the change's design.md is authored
- **THEN** the design.md SHALL include a reference line of the form "借鏡自 二階 `recruitment-gacha` + `affinity-specialty-bonus`"
- **AND** the design.md SHALL list semantic mappings (e.g. "doctor → neuron variant", "醫師招募券 → seed factor" or similar)
- **AND** the change SHALL create a new capability spec `specs/neuron-variant-gacha/spec.md`
- **AND** the change SHALL NOT modify `openspec/specs/recruitment-gacha/spec.md`

#### Scenario: Leaderboard infrastructure may be shared but spec is independent

- **GIVEN** the follow-up change `add-neurons-leaderboard` is in propose phase
- **WHEN** the design.md decides whether to extend the existing D1 + KV Worker (with an `app_id` column or new table) versus deploying a fresh Worker
- **THEN** the decision SHALL be argued in design.md
- **AND** regardless of infrastructure choice, a new capability spec `specs/neurons-leaderboard/spec.md` SHALL be created with neurons-specific scoring fields (connectome completeness / variant count / phylogenetic depth / nickname / streak)
- **AND** the change SHALL NOT modify `openspec/specs/hospital-leaderboard/spec.md`

### Requirement: medexam-tw SHALL enter maintenance mode upon neurons-tw active development

Concurrent with the start of M_3rd track (this scaffold change), `apps/medexam-tw` SHALL transition from active development to **maintenance mode**. Operational semantics:

- **No new feature development**: new gameplay features (e.g. additional boss types, new cosmetic categories, new mentor flows) SHALL be developed in `apps/neurons-tw` only
- **Critical bug fixes preserved**: medexam-tw SHALL continue to receive critical bug fixes (per Bug Triage Workflow in `openspec/project.md` — L1 hotfix worktree pattern); maintenance mode is NOT EOL
- **No deprecation timeline written into this spec**: no enforced sunset date; if medexam-tw is later EOL'd, a separate dedicated change SHALL author that decision
- **Banner directing players to neurons-tw**: medexam-tw SHALL surface a small persistent UI element (footer link or settings entry) directing players to neurons-tw with framing as a "new neurons-themed companion app" (not a forced replacement). Banner content and placement deferred to `add-neurons-deploy`
- **medexam-tw save data SHALL continue to function**: existing medexam-tw players SHALL keep accessing their saves indefinitely; this requirement does not authorize any data deletion or forced migration

#### Scenario: Bug-fix workflow remains available for medexam-tw

- **GIVEN** a player reports a critical crash in medexam-tw after M_3rd scaffold lands
- **WHEN** the issue is triaged
- **THEN** a hotfix change MAY be authored against medexam-tw using the existing L1 hotfix worktree pattern (per `openspec/project.md` Bug Triage Workflow)
- **AND** maintenance mode SHALL NOT block this hotfix
- **AND** new feature requests against medexam-tw SHALL be declined with a pointer to neurons-tw

#### Scenario: Feature development split is enforced at proposal review

- **GIVEN** a proposed change introduces a brand new game mechanic (not a bug fix, not a refactor)
- **WHEN** the proposal targets `apps/medexam-tw`
- **THEN** the proposal SHALL be rejected with feedback to target `apps/neurons-tw` instead
- **AND** the rejection SHALL cite this requirement
