## ADDED Requirements

### Requirement: Achievement-sourced cosmetics use `achievement-*` sprite key prefix

Cosmetics granted as achievement rewards SHALL use catalog `id` and `artKey` values prefixed with `achievement-` (e.g., `achievement-white-coat`, `achievement-stethoscope-charm`). This prefix MUST be distinct from the existing `dorm-*` prefix used for milestone-unlocked dorm cosmetics. The prefix convention enables visual filtering, telemetry segmentation, and conflict prevention.

#### Scenario: Achievement-granted cosmetic uses correct prefix

- **WHEN** an achievement with `reward: { kind: 'cosmetic', cosmeticId: 'achievement-white-coat' }` unlocks
- **THEN** the resulting `ItemInstance` created via `instanceFromCosmetic` SHALL have an `id` of the form `cosmetic-achievement-white-coat-<timestamp>-<rand>`; the underlying catalog entry's `id` is `achievement-white-coat`

#### Scenario: Dorm and achievement cosmetics coexist without collision

- **WHEN** the cosmetic catalog contains both `dorm-pixel-curtain` (existing) and `achievement-white-coat` (new from this change)
- **THEN** both SHALL exist independently; neither overwrites the other; `listUnlockedCosmetics(player, catalog)` returns both if both unlock conditions met

### Requirement: Achievement-cosmetic unlock bypasses standard milestone predicate

Cosmetics granted via achievement rewards SHALL be added to inventory directly when the parent achievement unlocks, NOT via the existing `checkMilestoneUnlocks(prev, next, catalog)` diff path. The reward dispatcher SHALL call `instanceFromCosmetic` and write to the local item inventory immediately.

The Cosmetic entry's own `unlockCondition` MAY be set to `() => false` (never unlocks via milestone path) to avoid double-grant.

#### Scenario: Achievement unlock writes cosmetic directly

- **WHEN** an achievement with `reward: { kind: 'cosmetic', cosmeticId: 'achievement-white-coat' }` unlocks
- **THEN** the reward dispatcher SHALL synchronously call `instanceFromCosmetic(catalog.get('achievement-white-coat'))` and add the result to the player's inventory

#### Scenario: Milestone path does not double-grant

- **WHEN** the same `achievement-white-coat` cosmetic catalog entry is checked via `checkMilestoneUnlocks` on the next state transition
- **THEN** because its `unlockCondition` always returns false, it SHALL NOT appear in the returned newly-unlocked array; no duplicate `ItemInstance` is created
