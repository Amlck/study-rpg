## MODIFIED Requirements

### Requirement: BadgeSprite component SHALL render category × tier badges from sprite atlas

The system SHALL ship a `<BadgeSprite category={c} tier={t} size={n} locked={b} />` component at `apps/neurons-tw/src/components/BadgeSprite.tsx` that renders category × tier badges from the sprite atlas at `apps/neurons-tw/src/assets/achievements/badge-atlas.png` (896×512 px = 7 columns × 4 rows × 128 px cells, 16-color GBA pixel-art palette, transparent background).

Column index maps to category (study=0, quiz=1, variant=2, synapse=3, mastery=4, fortune=5, hidden=6); row index maps to tier (P4=0, P3=1, P2=2, P1=3).

Note: dimensions 896×512 = 7 × 128 cols by 4 × 128 rows. The original spec text in `add-neurons-achievements` mistakenly declared "7 rows × 4 columns" which is dimensionally inconsistent with the 896×512 size; this change corrects the row/column ordering to match dimensions.

The component SHALL use CSS `background-image` + `background-position` + `background-size` to slice the atlas. Vite asset pipeline (`import url from '../assets/achievements/badge-atlas.png'`) provides the asset URL with cache-busting hash.

The component MAY provide a defensive fallback rendering (e.g., neutral square) if the atlas asset fails to load, but the spec assumes the asset exists and is loadable.

`locked={true}` SHALL apply CSS `filter: grayscale(80%) opacity(0.6)` (or equivalent treatment) to dim the cell visual without changing the atlas slice.

Public API (`category` / `tier` / `size` / `locked` props) is unchanged from `add-neurons-achievements` ship.

#### Scenario: BadgeSprite renders correct cell for every (category, tier) pair

- **WHEN** any of the 7 × 4 = 28 valid (category, tier) prop combinations is rendered
- **THEN** the component SHALL render the corresponding atlas cell via CSS background-position
- **AND** the rendered output SHALL be visually distinguishable from other (category, tier) combinations

#### Scenario: BadgeSprite consumer files unchanged from add-neurons-achievements

- **GIVEN** atlas mode now ships
- **WHEN** any of these consumers render BadgeSprite: `AchievementCard.tsx`, `AchievementToastHost.tsx`, `AchievementUnlockModal.tsx`, `AchievementsPage.tsx`, `NicknameWithBadges` helper in `LeaderboardPage.tsx`
- **THEN** the consumer site SHALL NOT have changed shape (props passed remain `category` / `tier` / `size` / `locked` only)

#### Scenario: Locked prop applies dimming filter

- **WHEN** `<BadgeSprite category="variant" tier="P1" size={48} locked={true} />` is rendered
- **THEN** the rendered element SHALL have CSS `filter: grayscale(...)` (or equivalent) applied
- **AND** the underlying atlas slice SHALL remain at the same row/column position

### Requirement: FamilyMasteryBadgeSprite component SHALL ship with atlas + consumer site

The system SHALL ship a `<FamilyMasteryBadgeSprite familyId={f} masteryTier={t} size={n} />` component at `apps/neurons-tw/src/components/FamilyMasteryBadgeSprite.tsx` that renders per-family per-mastery-tier badges from the atlas at `apps/neurons-tw/src/assets/achievements/family-mastery-atlas.png` (1408×640 px, 11 columns × 5 rows × 128 px cells, 16-color GBA palette, transparent background).

Column index SHALL map to family id via the exported constant `FAMILY_INDEX_BY_ID: Record<string, number>` declared alongside the component, using alphabetical sort of the 11 family IDs: `公共衛生學`=0 / `免疫學`=1 / `寄生蟲學`=2 / `微生物學`=3 / `病理學`=4 / `生物化學`=5 / `生理學`=6 / `組織學`=7 / `胚胎學`=8 / `解剖學`=9 / `藥理學`=10.

Row index SHALL map to mastery tier: P5=0 / P4=1 / P3=2 / P2=3 / P1=4. When `masteryTier === 'none'`, the component SHALL return `null` (don't render anything — no atlas cell exists for the no-data state).

At least ONE consumer site SHALL render this component at initial ship — currently `apps/neurons-tw/src/routes/ConnectomePage.tsx` family cards rendering the badge alongside the existing `<MasteryChip>` text.

#### Scenario: FamilyMasteryBadgeSprite renders correct cell

- **WHEN** `<FamilyMasteryBadgeSprite familyId="藥理學" masteryTier="P3" size={48} />` is rendered
- **THEN** the component SHALL show the cell at column 10 (藥理學 alphabetical position), row 2 (P3 Proficient)

#### Scenario: FamilyMasteryBadgeSprite returns null for none-tier

- **WHEN** `<FamilyMasteryBadgeSprite familyId="藥理學" masteryTier="none" size={48} />` is rendered
- **THEN** the component SHALL return `null` (no DOM element emitted)

#### Scenario: ConnectomePage renders FamilyMasteryBadgeSprite per family card

- **WHEN** the player visits `/connectome`
- **THEN** each of the 11 family cards SHALL render `<FamilyMasteryBadgeSprite>` for the family whose mastery tier is currently P5 or better (the badge appears next to the existing MasteryChip text)
- **AND** family cards whose mastery tier is `'none'` (insufficient attempts) SHALL NOT render the badge (per the null-return rule above)

#### Scenario: FAMILY_INDEX_BY_ID is alphabetical and complete

- **WHEN** a consumer imports `FAMILY_INDEX_BY_ID` from `FamilyMasteryBadgeSprite.tsx`
- **THEN** the record SHALL contain exactly 11 entries
- **AND** values SHALL be 0..10 with no gaps
- **AND** ordering SHALL match alphabetical sort of zh-TW family ids (公共衛生學 first, 藥理學 last)
