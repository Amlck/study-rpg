# neurons-mode Specification

## Purpose
TBD - created by archiving change add-neurons-mode-scaffold. Update Purpose after archive.

## Requirements

### Requirement: Game loop SHALL follow Hebbian 3-step learn-fire-wire cycle

The neurons mode SHALL implement a closed game loop framed by Donald Hebb's principle ("neurons that fire together, wire together"):

1. Player reads study material (reading timer accrues) AND answers exam questions filtered by subject (one of 10 一階 國考 subjects, displayed under their renamed neuron-family identities)
2. Each correct answer increases the per-neuron-family **affinity** counter (drives variant gacha unlock — see `neuron-variant-gacha` capability) AND increases the **action potential** counter for that family (drives variant collection growth — see `connectome-collection` capability)
3. When ≥ 2 distinct neuron families each reach the same-day fired threshold (N = 5 correct answers per family within the same local-TZ calendar day), the system SHALL form (or strengthen) a **synapse** between those families in the player's connectome view; repeated same-day co-firing on subsequent days potentiates the synapse through a 3-state machine (`dormant → weak → strong`); prolonged absence of co-firing decays it (LTD) downward by one level after 7+ days without same-day co-fire, **never** removing the synapse

The loop is intentionally closed — answering more cross-family questions → more synapses + more potentiation → richer connectome view + more variant gacha unlocks → encourages answering more questions. No external grind / no real-money loop. The exact N value, decay timing, state machine transitions, AP threshold ladder, and connectome view rendering are specified by the `connectome-collection` capability.

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

#### Scenario: connectome-collection capability is in effect after archive

- **GIVEN** the `add-connectome-collection` change has archived
- **WHEN** the `neurons-mode` capability spec is read
- **THEN** the game loop's Hebbian step-3 mechanics (N value, state machine, decay rules, AP counter, view rendering) SHALL be defined by the `connectome-collection` capability spec at `openspec/specs/connectome-collection/spec.md`
- **AND** the umbrella spec SHALL NOT redefine those mechanics independently

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

### Requirement: Subject IDs in content-neurons-tw SHALL map to content-medexam-tw via documented many-to-one OR one-to-many mapping, with per-question subject resolution invariant

The `content-neurons-tw` content pack SHALL ship a `subjects.json` whose every `Subject.id` value derives from a corresponding `Subject.id` in `content-medexam-tw` via a documented mapping. The mapping SHALL support:

- **1-to-1 direct mapping** (the default): a neurons-tw subject id equals a medexam-tw subject id verbatim (whitespace-insensitive, case-sensitive). Only `Subject.displayName` differs (renamed to neuron family per `neurons-mode` Requirement 3).
- **1-to-N controlled split**: a single medexam-tw subject id MAY split into multiple neurons-tw subject ids, provided each question originally classified under the medexam-tw subject can be re-classified into exactly ONE of the resulting neurons-tw subject ids via a deterministic, build-time-verifiable rule (e.g., source markdown per-question metadata tag).

Per-question resolution invariant: **every question in the shared corpus SHALL resolve to exactly one neurons-tw subject id** after applying the mapping. No question SHALL map to zero or multiple neurons-tw subjects.

For the current `wire-neurons-content-and-theme` change scope, the mapping is:
- 9 subjects (`藥理學` / `公共衛生學` / `寄生蟲學` / `組織學` / `生物化學` / `病理學` / `解剖學` / `生理學` / `胚胎學`): 1-to-1 direct
- 1 subject split: `微生物暨免疫學` → `微生物學` + `免疫學`, classified via source markdown per-Q `**科目**：<tag>` lookup (see `add-neurons-mode-scaffold` design.md Decision 4 for split heuristic)

The build script for content-neurons-tw SHALL assert the per-question resolution invariant at build time and fail loudly if any question fails to resolve or resolves to multiple subjects.

Future changes that introduce a brand-new subject in content-neurons-tw (with no corresponding medexam-tw subject, e.g., adding 醫學倫理 if medexam-tw adds it) SHALL update this requirement AND provide a corpus path for the new subject's questions.

#### Scenario: 9 直送 subject ids match medexam-tw verbatim

- **GIVEN** `packages/content-medexam-tw/dist/subjects.json` lists 10 subjects including `'藥理學'`, `'生理學'`, `'解剖學'`, `'病理學'`, `'生物化學'`, `'寄生蟲學'`, `'公共衛生學'`, `'組織學'`, `'胚胎學'`, and `'微生物暨免疫學'`
- **WHEN** `pnpm --filter @study-rpg/content-neurons-tw build` runs
- **THEN** the produced `packages/content-neurons-tw/dist/subjects.json` SHALL contain the 9 直送 subject ids verbatim (set equality on this subset)
- **AND** every `Subject.displayName` for these 9 ids SHALL be different from the corresponding medexam-tw displayName (renamed per Linnean taxonomy decision)

#### Scenario: 微生物暨免疫學 split into 微生物學 + 免疫學 via source markdown per-Q tag

- **GIVEN** the source markdown directory `$MEDEXAM_SOURCE_ROOT/醫學二/微生物暨免疫學/*.md` contains question blocks with `**科目**：<tag>` per-Q metadata
- **WHEN** the build script processes the `微生物暨免疫學` subject's questions
- **THEN** each question SHALL be re-classified into either `微生物學` OR `免疫學` based on the per-Q tag (per documented split heuristic in design.md Decision 4)
- **AND** the resulting `subjects.json` SHALL contain BOTH `微生物學` AND `免疫學` as distinct subject entries
- **AND** the original `微生物暨免疫學` subject id SHALL NOT appear in neurons-tw `subjects.json`
- **AND** the union of questions assigned to `微生物學` + `免疫學` SHALL equal the original count of questions under `微生物暨免疫學` in medexam-tw

#### Scenario: Question subject references resolve against neurons-tw subject list

- **WHEN** the neurons-tw app loads `getContentPack()` and the engine evaluates `question.subject`
- **THEN** for every question in the corpus, there SHALL exist exactly one `Subject` in the neurons-tw `subjects[]` whose `id` equals `question.subject`
- **AND** the engine SHALL never encounter an unresolved subject id reference

#### Scenario: Untagged 微生物暨免疫學 question gets default split route

- **GIVEN** a question in `微生物暨免疫學` source markdown lacks a `**科目**：<tag>` per-Q line (or the tag is malformed / unrecognized)
- **WHEN** the build script processes this question
- **THEN** the question SHALL be assigned to the documented default subject for this scenario (currently `微生物學` per design.md Decision 4)
- **AND** the build script SHALL log a warning naming the offending question
- **AND** the build SHALL continue (not fail) when `MEDEXAM_ALLOW_SKIPS=1` is set; otherwise SHALL fail loudly

#### Scenario: Future addition of new neurons-tw subject without medexam-tw counterpart is rejected

- **WHEN** a future change introduces a new `Subject.id` in `content-neurons-tw/subjects.json` that does NOT derive from any `content-medexam-tw/subjects.json` id via the documented mapping
- **THEN** the build script SHALL exit non-zero with a clear error message identifying the orphan subject id
- **AND** the change proposing the divergence SHALL update this requirement AND provide a separate corpus path for the new subject's questions

### Requirement: Each neuron family SHALL have an identity-distinguishing sprite registered in `theme-pixel-neurons`

The neurons-mode umbrella SHALL ensure that every neuron family (the 11 entries declared by `wire-neurons-content-and-theme` Requirement 7's subject-id mapping) has a corresponding real pixel-art sprite registered under the `subject:<id>` key in `theme-pixel-neurons`'s `SPRITE_MAP`. "Real sprite" means: a per-family PNG file at `packages/theme-pixel-neurons/sprites/subjects/<subjectId>.png`, not the 1×1 transparent-PNG data URI placeholder from the scaffold phase.

Each sprite SHALL visually communicate at least three identity dimensions:

1. **Real neuron morphology hint** matching the family's source neuron type (e.g., Cerebellar Purkinje cell → elaborate dendritic-tree silhouette; Cortical Pyramidal L5 → triangular soma)
2. **NT branch color tint** drawn from the four-color CSS variable palette (DA gold `#d4a04d` / 5HT red `#c44d4d` / GABA blue `#6a9bc4` / Glu green `#6a8c3f`)
3. **Persona accessory** matching the family's narrative role label (e.g., "Mathematician" → small abacus motif; "Judge" → tiny gavel; "Scout" → compass)

Sprites SHALL be 384×384 PNG with transparent background and 16-color quantization (GBA-era pixel-art aesthetic), consistent with the documented `image_gen_routing.md` recipe for Gemini-generated pixel-art assets.

This requirement supersedes the scaffold-phase placeholder mapping for subject keys only. Other sprite categories (items / cosmetics / skill placeholders / 6 core scaffold keys) MAY remain on the transparent-PNG placeholder until their respective consumer capabilities (variant gacha, achievements, dorm view, etc.) require them.

#### Scenario: Theme pack ships real sprite per neuron family

- **GIVEN** the neurons-mode umbrella is active and `theme-pixel-neurons` is loaded
- **WHEN** any consumer (overview page, connectome page, future variant gacha, etc.) reads `SPRITE_MAP['subject:藥理學']`
- **THEN** the resolved URL SHALL point to a real PNG file under `packages/theme-pixel-neurons/sprites/subjects/`
- **AND** the resolved URL SHALL NOT be the 1×1 transparent-PNG data URI used during scaffold phase

#### Scenario: All 11 families covered

- **GIVEN** the 11 neuron family IDs declared by `wire-neurons-content-and-theme` (藥理學 / 公共衛生學 / 寄生蟲學 / 組織學 / 生物化學 / 病理學 / 免疫學 / 解剖學 / 生理學 / 胚胎學 / 微生物學)
- **WHEN** the developer iterates over those IDs and checks `SPRITE_MAP['subject:' + id]`
- **THEN** each lookup SHALL return a unique real PNG URL
- **AND** no two families SHALL share the same sprite

#### Scenario: Sprite visual identity reflects family persona

- **GIVEN** the human reviewer opens `packages/theme-pixel-neurons/sprites/subjects/胚胎學.png` (Cajal-Retzius — Pioneer Architect)
- **THEN** the sprite SHALL display a Cajal-Retzius-style morphology cue (horizontal-bipolar dendrite signature) and a Glu-branch green color tint
- **AND** the sprite SHALL display an architect-related accessory (blueprint roll, hardhat, or similar)
- **AND** the same reviewer opening `生物化學.png` (Cerebellar Purkinje — Mathematician) SHALL see Purkinje-style elaborate dendritic-tree morphology, GABA blue tint, and abacus / equation / chalkboard accessory

#### Scenario: Other sprite categories may remain placeholder until consumer ships

- **GIVEN** items / cosmetics / skill placeholders / core scaffold keys' consumer capabilities have not yet shipped
- **WHEN** the developer reads `SPRITE_MAP['cosmetic-head-soma-newcomer-halo']` or similar non-subject key
- **THEN** the resolved URL MAY still be the transparent-PNG placeholder
- **AND** this is acceptable until the respective consumer capability requires real assets (separate future change)

### Requirement: ConnectomePage SHALL surface a first-time empty-state callout pointing users to the interaction surface

The `neurons-mode` umbrella SHALL ensure that when a user opens `/connectome` and their persisted state has zero formed synapses (`snapshot.synapses.length === 0`), the page prominently surfaces a friendly first-time callout that:

1. Welcomes the user and explains the game-loop mechanic in plain Traditional Chinese (1-2 sentences, ≤ 120 chars total)
2. Directs visual attention (via an arrow / pointer / clearly worded "向下" reference) toward the page's primary interaction surface — whichever component below the SVG actually records correct answers (currently `ConnectomeDebugPanel`; future change MAY replace it with a real quiz UI without invalidating this requirement)
3. Auto-disappears the moment `snapshot.synapses.length` becomes ≥ 1 (user's first action removes the callout naturally; no manual close button needed)

The callout SHALL be:
- Visible above the fold on standard desktop viewport (≥ 1024 px width)
- Mobile-friendly (does not break layout at 360-820 px viewport widths)
- Annotated for accessibility (`role="region"` + Chinese `aria-label`)
- Stateless — visibility derived entirely from current `synapses.length`; NO localStorage / Dexie / SYNCED_META_KEYS flag persisted

This requirement supersedes the prior implicit-only empty-state, which relied solely on a buried italic mechanic line under the page header.

#### Scenario: First-time user sees the callout above the fold

- **GIVEN** a user signs in and visits `/connectome` for the first time (no synapses formed yet)
- **WHEN** the page loads and `snapshot.synapses.length === 0`
- **THEN** the callout SHALL render between the page header and the connectome SVG
- **AND** the callout text SHALL include both a welcome opener and a 1-sentence game-loop mechanic explanation
- **AND** the callout SHALL include a visual cue (arrow / Unicode pointer / clear "向下捲動" copy) pointing toward the interaction surface below the SVG

#### Scenario: Callout auto-dismisses on first synapse

- **GIVEN** the callout is currently visible (synapses.length === 0)
- **WHEN** the user records correct answers and the first synapse forms (synapses.length becomes 1)
- **THEN** the next page render SHALL NOT include the callout
- **AND** the page SHALL transition smoothly without layout jank above the SVG
- **AND** no localStorage / Dexie state SHALL be written to track the dismissal (visibility is purely derived)

#### Scenario: Returning user with existing synapses never sees the callout

- **GIVEN** a returning user with `snapshot.synapses.length >= 1`
- **WHEN** the page loads
- **THEN** the callout SHALL NOT render
- **AND** the rest of the page (header, SVG, debug panel) SHALL render as before — no regression

#### Scenario: User who resets state sees the callout again

- **GIVEN** a user who previously had synapses but used `重設存檔（不可復原）` to reset
- **WHEN** the page reloads after reset and `snapshot.synapses.length === 0`
- **THEN** the callout SHALL render again
- **AND** this is acceptable / intentional — after a reset, the user IS effectively in the empty-state again

#### Scenario: Callout is responsive on mobile viewport

- **GIVEN** the callout is visible (synapses.length === 0)
- **WHEN** the viewport width is between 360 px and 820 px (typical phone widths)
- **THEN** the callout SHALL render without horizontal overflow
- **AND** the callout SHALL remain readable (text does not get clipped or truncated)
- **AND** the arrow / pointer cue SHALL remain visible

### Requirement: neurons-tw SHALL surface a user-facing quiz UI that presents content-pack questions and routes answers through recordCorrectAnswer / recordIncorrectAnswer

The `neurons-mode` umbrella SHALL ensure that the neurons-tw application includes a user-facing quiz UI that:

1. Presents one question at a time from the loaded `ContentPack.questions` pool
2. Shows the question stem + all options as clickable / tappable selections
3. On user selection (reveal): records the result via the existing `recordCorrectAnswer(subjectId)` or `recordIncorrectAnswer(subjectId)` services so that downstream effects fire (synapse formation, variant gacha rolls, DMN behavior-axis triggers, achievement progress, mastery tier updates, streak counter)
4. Provides a way to advance to the next question and a way to exit the quiz at any time
5. Has an entry point reachable from the application's main routes (overview page at minimum)

The quiz UI MAY be feature-light for v1 (no SRS due-bias, no quality modifiers, no bookmarks, no bug reports inline) — these are deferred to follow-up changes. What MUST be true is that exam questions actually appear in front of users AND that selecting an option triggers the answer-recording chain.

Questions with `hasOptionImages === true` MAY be filtered out of the v1 quiz pool until image-option rendering ships.

Questions with `disputed === true` (送分題) SHALL be treated as auto-correct on any selection.

This requirement supersedes the prior implicit state where `ConnectomeDebugPanel`'s dev-flavored buttons were the only interaction surface.

#### Scenario: Quiz UI is reachable from the overview page

- **GIVEN** a user signs into neurons-tw and lands on the overview page (`/`)
- **WHEN** the page renders
- **THEN** an obvious entry button SHALL be visible to start a quiz (e.g., 「🎯 開始答題」 or similar Chinese CTA copy)
- **AND** clicking the button SHALL open the quiz UI

#### Scenario: Selecting an option records the result and advances the engine state

- **GIVEN** the quiz UI is open showing a question with `subject: '藥理學'` and `answer: 'B'`
- **WHEN** the user clicks option `B`
- **THEN** the quiz UI SHALL show that the answer is correct (visual cue + explanation)
- **AND** the service `recordCorrectAnswer('藥理學')` SHALL be invoked
- **AND** downstream effects SHALL fire (familyAccrual increment, possible synapse formation if today's other-family threshold met, possible variant slot unlock, possible DMN behavior-axis +1 draw, possible achievement unlock, mastery counter update)

#### Scenario: Selecting a wrong option records incorrect and resets streak

- **GIVEN** the quiz UI is open showing a question with `subject: '免疫學'` and `answer: 'C'`
- **WHEN** the user clicks option `A`
- **THEN** the quiz UI SHALL show that the answer is wrong + reveal the correct option `C` + show the explanation
- **AND** the service `recordIncorrectAnswer('免疫學')` SHALL be invoked
- **AND** the existing streak-break logic SHALL fire (resetting `currentQuizCorrectStreak` to 0)

#### Scenario: Disputed question (送分題) accepts any selection as correct

- **GIVEN** the quiz UI is open showing a question with `disputed: true`
- **WHEN** the user clicks any option
- **THEN** the quiz UI SHALL treat the selection as correct
- **AND** invoke `recordCorrectAnswer(question.subject)`
- **AND** display a notice (e.g., 「⚠️ 此題為送分題，任何選項皆計為答對」) before the explanation

#### Scenario: User can exit mid-quiz without committing all answers

- **GIVEN** the quiz UI is open and the user has answered 2 questions
- **WHEN** the user clicks 「結束」 or the close button BEFORE clicking 下一題
- **THEN** the modal SHALL close
- **AND** the 2 already-recorded answers SHALL remain persisted (no rollback)
- **AND** no error or warning SHALL block the close

#### Scenario: Image-option questions are filtered from the v1 quiz pool

- **GIVEN** the `pack.questions` corpus contains some questions with `hasOptionImages === true`
- **WHEN** the quiz UI initializes its in-session question pool
- **THEN** questions with `hasOptionImages === true` SHALL be excluded
- **AND** this is acceptable until image-option rendering ships (separate future change)

### Requirement: neurons-tw SHALL provide a reading-timer that accrues study minutes and publishes ticks to the DMN time-axis subscriber

The `neurons-mode` umbrella SHALL ensure that the neurons-tw application provides a reading-timer service that:

1. Lets the user start / stop a reading session via a button reachable from a main route (overview page at minimum)
2. While reading is active, accrues elapsed time in-memory at a configurable tick interval
3. Each time accrued time crosses a 60-second (1 game-minute) boundary, fires BOTH of the following minute side-effects:
   - Increment `meta['totalStudyMinutes']` (a synced LWW counter — already in `SYNCED_META_KEYS` per `add-neurons-dmn-fate-card`)
   - Call `dmnReadingTimerSubscriber.onMinutesAccrued(1)` (the published interface at `dmn-trigger.ts:170` — activates DMN time-axis accrual per `neurons-dmn-fate-cards` Requirement)
4. Auto-pauses when the browser tab becomes hidden (via `visibilitychange` event)
5. Auto-pauses when the user has been idle for ≥ 90 seconds (no mousemove / keydown / touchstart events)
6. Does NOT auto-resume on tab focus return — explicit user action SHALL restart reading
7. Exposes its state (status / accumulated seconds / current minute count / pause reason) to UI consumers via a React hook

The achievement-stats builder (`apps/neurons-tw/src/lib/services/achievement.ts buildAchievementStats`) SHALL read the current value of `meta['totalStudyMinutes']` so the 4 `study-*` achievements (`study-warmup` / `study-hours-5` / `study-hours-20` / `study-marathon`) can unlock when the user accumulates sufficient reading time.

This requirement supersedes the prior implicit state where `totalStudyMinutes` was hardcoded to 0 in achievement stats and the DMN time-axis was inactive.

#### Scenario: User starts reading and 60 seconds of accrued time fires both minute side-effects

- **GIVEN** the user clicks 「📖 開始閱讀」 on the overview page
- **WHEN** 60 seconds of accrued reading time pass (with no idle pauses, no tab-hidden pauses)
- **THEN** `meta['totalStudyMinutes']` SHALL be incremented by 1 (from N to N+1)
- **AND** `accrueReadingMinutes(1)` SHALL be invoked, advancing the DMN time-axis accrual counter
- **AND** if DMN time-axis accrual crosses a 30-minute threshold, a +1 DMN draw SHALL be granted (per `neurons-dmn-fate-cards` Requirement)

#### Scenario: Visibility change auto-pauses the timer

- **GIVEN** the timer is in reading state (accrued seconds > 0, not paused)
- **WHEN** the user switches to another browser tab or window (`document.hidden` becomes true; `visibilitychange` fires)
- **THEN** the timer state SHALL transition to `paused` with reason `'visibility'`
- **AND** no further tick increments SHALL occur until the user explicitly resumes

#### Scenario: 90s idle auto-pauses the timer

- **GIVEN** the timer is in reading state and the user has not generated a `mousemove` / `keydown` / `touchstart` event for ≥ 90 seconds
- **WHEN** the 90-second idle threshold elapses
- **THEN** the timer state SHALL transition to `paused` with reason `'idle'`
- **AND** no further tick increments SHALL occur until the user explicitly resumes

#### Scenario: No auto-resume on tab focus return

- **GIVEN** the timer is in `paused` state with reason `'visibility'` (user switched to another tab)
- **WHEN** the user returns to the neurons-tw tab (`document.hidden` becomes false)
- **THEN** the timer SHALL remain in `paused` state
- **AND** the UI SHALL still show the pause indicator
- **AND** the user MUST explicitly click resume / restart to continue accruing

#### Scenario: Manual stop clears in-memory accumulated state but preserves persisted minute count

- **GIVEN** the timer has accrued 47 seconds of partial-minute time and 3 full minutes (3 prior side-effect fires already persisted to `meta['totalStudyMinutes']`)
- **WHEN** the user clicks 「⏹ 結束閱讀」
- **THEN** the timer state SHALL return to `idle`
- **AND** `accumulatedSeconds` SHALL reset to 0
- **AND** the 47 seconds of in-flight partial-minute progress SHALL be lost (NOT carried forward to next session — accepted trade-off)
- **AND** `meta['totalStudyMinutes']` SHALL retain the +3 from this session (the 3 minute side-effects already fired during the session)

#### Scenario: Study-category achievements unlock when totalStudyMinutes thresholds are crossed

- **GIVEN** the user has accumulated 9 reading minutes (totalStudyMinutes = 9)
- **WHEN** the user accrues 1 more minute (totalStudyMinutes becomes 10)
- **THEN** the `study-warmup` achievement (predicate: studyMin(10)) SHALL evaluate as unlocked on next achievement check
- **AND** the achievement-trigger chain MAY emit toast / modal per existing `achievement` capability behaviors
- **AND** the same pattern applies at 300 minutes (`study-hours-5`), 1200 minutes (`study-hours-20`), and 3000 minutes (`study-marathon`)
### Requirement: Overview SHALL surface a family subject picker that filters the active quiz pool

The neurons-tw Overview page SHALL render a family chip grid that lets the player narrow the quiz question pool to a single neuron family (one of the 11 families enumerated by `content-neurons-tw`) without changing any downstream gameplay mechanic (rewards / SRS / DMN trigger / family mastery accrual remain unchanged). The picker SHALL also include an explicit "全部" chip that restores the default behavior of drawing questions from the unrestricted pool.

The picker SHALL behave as a **pure filter**, not as a dedicated mode:

- Selection state is held in transient React state (or URL search param) at the Overview level. **No** Dexie row, **no** sync table, **no** state machine across sessions.
- When the player launches quiz with a family selected, the quiz-pool helper SHALL receive that `familyId` as an optional argument and restrict candidate questions to those whose `subjectId` resolves to that family per the existing subject-resolution invariant.
- When the player launches quiz with no family selected (or "全部" chip active), the helper SHALL fall back to the unrestricted pool (existing behavior).
- After a quiz session ends, the picker selection state is preserved on Overview (so the player can repeat the same family without re-clicking) but is NOT persisted across page reload (transient).

Chip visual SHALL source identity from the `content-neurons-tw` family roster (family `displayName`, family sprite key from `theme-pixel-neurons`, NT-branch-derived accent color). Chips SHALL NOT hardcode any family name or color.

The picker SHALL be responsive: desktop renders an 11-chip grid (single row or wrapped); narrow viewport (e.g., mobile < 600px) renders a 2-column scrollable grid. The "全部" chip SHALL be visually distinct (e.g., larger, different accent) so it's discoverable as the reset entry-point.

#### Scenario: Family chip click restricts quiz pool

- **GIVEN** the player is on Overview with the "藥理學" chip selected
- **WHEN** the player clicks 🎯 開始答題
- **THEN** the QuizModal SHALL open with a candidate pool restricted to questions whose `subjectId` resolves to family `藥理學`
- **AND** no question outside `藥理學` SHALL be served in this session
- **AND** the rewards / SRS / DMN trigger pipelines SHALL operate identically to the unrestricted case

#### Scenario: 全部 chip restores random pool

- **GIVEN** the player previously had "藥理學" selected and now clicks "全部"
- **WHEN** the player clicks 🎯 開始答題
- **THEN** the QuizModal SHALL open with the unrestricted question pool
- **AND** the served questions SHALL span any family per random selection

#### Scenario: Picker selection does not persist across reload

- **GIVEN** the player selects "藥理學" chip on Overview
- **WHEN** the player reloads the page (F5)
- **THEN** the picker SHALL reset to "全部" default
- **AND** no Dexie row, no localStorage key, no sync table SHALL retain the selection

#### Scenario: Picker chip identity sources from content pack

- **GIVEN** a developer changes the `displayName` of family `生理學` in `content-neurons-tw` to `生理學 (Physiology)`
- **WHEN** the Overview re-renders
- **THEN** the corresponding family chip SHALL display the new name without any code change in `apps/neurons-tw/`

### Requirement: Rarity reveal animations SHALL share a centralized timing baseline with rarity-tiered minimums

All rarity-based reveal UI in neurons-tw — including `VariantUnlockModal` from `neuron-variant-gacha` and `DmnCardReveal` from `neurons-dmn-fate-cards` — SHALL consume reveal timing constants from `neurons-motion-library` (`apps/neurons-tw/src/lib/motion.ts` or equivalent module). No reveal component SHALL declare inline numeric duration literals for the rarity-tiered ceremony.

The motion library SHALL export a `RARITY_REVEAL_TIMINGS` (or equivalent named) constant mapping each rarity grade to a `{ durationMs, spinTurns }` pair. The mapping SHALL satisfy:

- **All 5 rarity grades** (P1 / P2 / P3 / P4 / P5) SHALL have `durationMs >= 1000`. No rarity is permitted to flash by faster than 1000ms.
- **P1 鑽** SHALL have `spinTurns >= 3` and `durationMs >= 1500`, producing a multi-rotation spectacle ("快轉 → 減速 → 定位" three-stage feel) befitting the rarest tier.
- **P2 金 / P3 銀 / P4 銅 / P5** SHALL have `spinTurns === 0` (no spin; use fade + scale + flash only). These tiers are reserved for the simpler ceremony.

The exact monotonic ordering and values (e.g., P5 = 1000ms, P4 = 1000ms, P3 = 1100ms, P2 = 1200ms, P1 = 1500ms) are an implementation detail tuned by the motion library and may evolve, **but the two hard constraints above (all ≥ 1000ms; P1 ≥ 3 spin turns) are normative and may not be relaxed without a new change**.

Components SHALL respect OS `prefers-reduced-motion`:

- When `useRespectsReducedMotion()` returns `true`, all reveal animations SHALL degrade to opacity-only fade-in of the same total duration.
- Spin rotation SHALL NOT play under reduced-motion preference, regardless of rarity.

#### Scenario: P1 reveal plays multi-rotation spectacle

- **GIVEN** a player triggers a P1 reveal (e.g., variant gacha P1 unlock or DMN P1 draw)
- **WHEN** the reveal modal mounts
- **THEN** the modal SHALL animate with a CSS / Framer Motion variant that rotates the artwork at least 3 full turns
- **AND** the animation total duration SHALL be at least 1500ms
- **AND** the easing SHALL produce a clear deceleration (e.g., ease-out cubic or equivalent) so the artwork "snaps into place" at the end

#### Scenario: All non-P1 reveals meet 1000ms baseline

- **GIVEN** a player triggers a P2, P3, P4, or P5 reveal
- **WHEN** the reveal modal or toast renders
- **THEN** the animation total duration SHALL be at least 1000ms
- **AND** no rotation SHALL be applied

#### Scenario: Reduced-motion users get opacity-only fade

- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce`
- **WHEN** any rarity reveal mounts
- **THEN** the reveal SHALL use only opacity fade-in over the same total duration
- **AND** rotation, scale bounce, and translate transforms SHALL NOT apply

#### Scenario: Reveal components forbid inline timing literals

- **GIVEN** a developer audits `apps/neurons-tw/src/components/VariantUnlockModal.tsx` (or any reveal component)
- **WHEN** the developer searches for numeric literals `1000`, `1500`, `3000` etc. in animation duration / turns position
- **THEN** those literals SHALL NOT appear inline
- **AND** the file SHALL import `RARITY_REVEAL_TIMINGS` (or the equivalent named export) from `'../lib/motion'` (or the motion library path)

### Requirement: Production build SHALL NOT surface dev-only diagnostic UI

The neurons-tw production build (`pnpm build`, deployed to `med-study-rpg.com/neurons/` and `fireman333.github.io/study-rpg/` if applicable) SHALL NOT render or expose dev-only diagnostic UI to end users. Specifically:

- The `/motion-demo` route SHALL NOT be linked from the main `<nav>` element. The route itself MAY remain reachable by direct URL for developer self-verification, but no user-facing entry point SHALL exist.
- The `ConnectomeDebugPanel` component (containing buttons such as「重設存檔」/「+1 答對」/「時間 +1 天」) SHALL NOT render in `ConnectomePage` or any other production page. The component MAY be deleted from the codebase entirely.
- The `ConnectomeTreeSvg` `fireRandomCascade` demo button (typically labeled「⚡ 觸發傳遞 (demo)」) and its driving function SHALL NOT render or be invocable in production.

Diagnostic capability for developers SHALL be available via DEV-only hooks (e.g., `import.meta.env.DEV` gated `globalThis.__db` / `globalThis.__sync` / Dexie browser devtools), not via production-visible UI surfaces.

#### Scenario: Production navbar omits motion-demo

- **GIVEN** the production build is deployed
- **WHEN** the player loads any page and inspects the top `<nav>` element
- **THEN** no `<a>` or `<button>` SHALL link to `/motion-demo`
- **AND** the 5 user-facing tabs (or however many are decided post-polish) SHALL be the only nav entries

#### Scenario: ConnectomePage does not render debug panel in production

- **GIVEN** a user visits `/connectome` on the production build
- **WHEN** the page renders
- **THEN** the component tree SHALL NOT include `<ConnectomeDebugPanel>` or any component containing dev-only reset / counter-bump buttons
- **AND** the page header / sidebar SHALL only contain user-facing content (empty state callout, family card grid, etc.)

#### Scenario: ConnectomeTreeSvg has no cascade demo button

- **GIVEN** a user views the connectome SVG on `/connectome`
- **WHEN** the SVG renders
- **THEN** no button labeled "⚡ 觸發傳遞" or marked `(demo)` SHALL exist in the SVG overlay
- **AND** the `fireRandomCascade` function (if it ever existed) SHALL either be deleted or be unreachable from any production render path

### Requirement: Leaderboard push SHALL include real reading minutes from totalStudyMinutes counter

The neurons-tw leaderboard upsert payload (sent by `neurons-leaderboard.ts` to the Cloudflare Worker's `/leaderboard/upsert` endpoint and persisted to D1 column `total_study_min`) SHALL reflect the real `meta['totalStudyMinutes']` counter accrued by the `reading-timer` service. The previously-shipped placeholder value of hardcoded `0` SHALL be replaced with the actual counter read via the existing `readTotalStudyMinutes()` helper.

The Worker D1 schema, KV cron snapshot columns, and leaderboard UI rendering SHALL NOT change — the column has always accepted this field but the client was sending 0. After this requirement is implemented, the column SHALL begin reflecting non-zero values for any user with active reading-timer sessions.

#### Scenario: Leaderboard push reads totalStudyMinutes

- **GIVEN** a user has accrued 42 minutes via the reading-timer (i.e., `meta['totalStudyMinutes'] === 42`)
- **WHEN** the leaderboard sync runs (e.g., on `onPushComplete` after a sync session)
- **THEN** the POST body to `/leaderboard/upsert` SHALL include `total_study_min: 42`
- **AND** the D1 row for that user SHALL be updated to `total_study_min = 42` (LWW per `updated_at`)
- **AND** the next leaderboard KV snapshot cron SHALL surface that value in the relevant `top100` filter (if applicable)

#### Scenario: First-time user with zero accrual still pushes zero (no regression)

- **GIVEN** a fresh user who has never started the reading-timer (i.e., `meta['totalStudyMinutes']` undefined or 0)
- **WHEN** the leaderboard sync runs
- **THEN** the POST body SHALL include `total_study_min: 0`
- **AND** no exception SHALL be raised due to missing meta key
