# achievement-system Specification

## Purpose

Defines a milestone-recognition system for 二階 `apps/medexam2-hospital-tw`. Players unlock 像素勳章 (pixel badges) for crossing meaningful thresholds across 7 categories (學習 / 答題 / 招募 / 經營 / 事件 / 隱藏 / 科別精通) at 4 difficulty tiers (P1 鑽石 / P2 金 / P3 銀 / P4 銅, aligned with PSN Trophy). Catalog is pure data (mirror existing `cosmetic.ts` predicate pattern) — new achievement = one JSON entry, zero engine code. Reward dispatcher routes unlocks to three channels: leaderboard 勳章 (displayed in nickname row), cosmetic (existing dorm pipeline), 稱號 (text chip). No new currency, no equipment integration.

## ADDED Requirements

### Requirement: Achievement catalog entry shape

The system SHALL define each achievement as a declarative record with predicate-based unlock condition. Each entry MUST have: unique id, name (zh-TW), description, tier (one of `P1`/`P2`/`P3`/`P4`), category (one of `study`/`quiz`/`recruit`/`hospital`/`fortune`/`hidden`/`subject`), hidden flag, predicate function taking (`Player`, `Stats`) and returning boolean, reward descriptor. Catalog SHALL live in `packages/content-medexam2-tw/src/achievements.ts` and be exported as a readonly array.

#### Scenario: Adding a new achievement requires no engine code

- **WHEN** a developer wants to add a new milestone「累積唸書 200 hr」
- **THEN** they SHALL only need to append one entry to the catalog array; no changes to `packages/core/src/lib/achievement.ts` or any service file are required

#### Scenario: Catalog includes 7 categories at launch

- **WHEN** the system loads the achievement catalog
- **THEN** the catalog SHALL contain entries spanning all 7 categories: study (學習里程碑) / quiz (答題大師 — 累計 + streak sub-ladder) / recruit (招募達人) / hospital (醫院經營) / fortune (時運與意外) / hidden (隱藏彩蛋) / subject (14 科精通 + 1 全科 capstone)

### Requirement: Diff-based unlock detection

The system SHALL provide `checkAchievementUnlocks(prev: Player, next: Player, stats: Stats, catalog: readonly Achievement[]): Achievement[]` that returns achievements whose predicate transitions from false (prev state) to true (next state). Already-unlocked achievements MUST NOT be re-emitted. Implementation MUST mirror existing [`checkMilestoneUnlocks`](../../../../packages/core/src/lib/cosmetic.ts) shape.

#### Scenario: Newly-crossed predicate returns unlock

- **WHEN** prev state has `totalQuestionsAnswered = 99` and next state has `totalQuestionsAnswered = 100`, and a P4 achievement requires `totalQuestionsAnswered >= 100`
- **THEN** `checkAchievementUnlocks` SHALL return that achievement in its result array

#### Scenario: Already-unlocked predicate does not re-emit

- **WHEN** both prev and next states satisfy a predicate (already unlocked at prev)
- **THEN** the achievement SHALL NOT appear in the returned array

### Requirement: P1 鑽石 composite condition enforcement

Every achievement with `tier: 'P1'` SHALL have a composite predicate combining at least two of: (量, 質, 持續, 廣度). Single-threshold P1 entries SHALL fail the build-time validator. The validator MUST run during `packages/content-medexam2-tw` build.

#### Scenario: Pure-grind P1 rejected at build

- **WHEN** a developer adds a P1 entry「累積唸書 100 hr」 without any AND clause
- **THEN** the build of `@study-rpg/content-medexam2-tw` SHALL fail with a validator error indicating the entry violates the composite-condition rule

#### Scenario: Composite P1 accepted

- **WHEN** a developer adds a P1 entry「累積唸書 100 hr **且** 連續登入 ≥ 30 天」 (量 × 持續)
- **THEN** the build SHALL succeed and the entry SHALL appear in the catalog

### Requirement: 4-tier system (P1 鑽石 / P2 金 / P3 銀 / P4 銅)

The system SHALL classify achievements at exactly 4 tiers. Tier values `'P1' | 'P2' | 'P3' | 'P4'` are the only valid options for the `tier` field. Type system SHALL reject other values.

#### Scenario: TypeScript prevents tier outside the 4-tier set

- **WHEN** a developer attempts to assign `tier: 'P5'` or `tier: 'platinum'` to an achievement entry
- **THEN** the TypeScript compiler SHALL emit a type error

### Requirement: Unlock toast and full-screen modal UI

The system SHALL display an `AchievementUnlockToast` component when achievements unlock at tiers P4/P3/P2 (8s auto-dismiss, celebratory polarity, mirror `EventToast` pattern, includes 64px BadgeSprite + name + reward chip). Tier P1 unlocks SHALL trigger a full-screen reveal modal instead (mirror `RecruitmentResultModal` pattern but with badge display).

#### Scenario: P4 banner appears non-blocking

- **WHEN** a player unlocks a P4 銅 achievement
- **THEN** the system displays a toast in the corner that auto-dismisses after 8 seconds, does NOT block other interactions

#### Scenario: P1 鑽石 triggers full-screen reveal

- **WHEN** a player unlocks a P1 鑽石 achievement
- **THEN** the system displays a full-screen modal with the badge prominent center, the achievement name, and the reward; player must dismiss to continue

### Requirement: Hidden achievement strict UI filtering

Achievements with `hidden: true` SHALL be excluded from all `/achievements` page renders until unlocked. They MUST NOT appear in tooltips, search results, locked-card silhouettes, filter dropdowns, or any other UI surface prior to unlock.

#### Scenario: Locked hidden achievement is invisible

- **WHEN** a hidden achievement is locked (predicate not satisfied) and a player visits `/achievements`
- **THEN** there SHALL be no card, silhouette, count, or text reference to that achievement anywhere on the page

#### Scenario: Unlocked hidden achievement displays normally

- **WHEN** a hidden achievement is unlocked
- **THEN** it SHALL appear on `/achievements` with full art, name, description, and unlock date — same treatment as non-hidden achievements

### Requirement: Achievement table persistence (Dexie v15)

The system SHALL introduce a Dexie v15 table `achievements` keyed by achievement id with shape `{ id: string, unlockedAt: number, notificationShown: boolean }`. The schema upgrade SHALL handle both fresh-start and upgrade-from-v14 paths, mirror the v14 `leaderboardProfile` migration pattern.

#### Scenario: Fresh install initializes empty table

- **WHEN** a new player loads the app for the first time
- **THEN** the `achievements` Dexie table SHALL exist and be empty; no errors

#### Scenario: Upgrade from v14 preserves existing tables

- **WHEN** an existing player loads the app with Dexie v14 IndexedDB
- **THEN** the schema SHALL upgrade to v15, the new `achievements` table SHALL be created empty, and all existing tables (hospital_state, doctors, mastery, question_history, leaderboard_profile, etc.) SHALL remain intact

### Requirement: Achievement state syncs via R2 m2 bundle only

The achievements table SHALL be wrapped in a `TableAdapter` registered in `M2_ADAPTERS` only. It MUST NOT be added to `HOSPITAL_ADAPTERS`. No Supabase migration shall be authored for this table. Mirror `LEADERBOARD_PROFILE` precedent (commit `cfaaa32`).

#### Scenario: New table is R2 passenger

- **WHEN** the sync engine pushes the m2 bundle to R2
- **THEN** the gzipped snapshot data SHALL include the achievements table contents (via the adapter's `snapshotAll`)

#### Scenario: New table is not pushed to Supabase

- **WHEN** the sync engine runs its Supabase per-row push path during dual-write window
- **THEN** no Supabase write SHALL be issued for the achievements table; no row appears in any Supabase table for achievements

### Requirement: Reward dispatcher — three channels, no new currency

The system SHALL define exactly three reward channels: leaderboard 勳章 (badges_csv update + subject_mastery_count update), cosmetic (call existing `instanceFromCosmetic`), 稱號 (set `leaderboardProfile.selectedTitle`). The reward type field MUST be a discriminated union over these three. The dispatcher SHALL NOT grant equipment, tickets, pity progress, or any new currency.

#### Scenario: Cosmetic reward routes to existing pipeline

- **WHEN** an achievement with `reward: { kind: 'cosmetic', cosmeticId: 'achievement-white-coat' }` unlocks
- **THEN** the dispatcher SHALL call `instanceFromCosmetic(catalog.get('achievement-white-coat'))` and add the resulting `ItemInstance` to inventory

#### Scenario: Title reward updates profile

- **WHEN** an achievement with `reward: { kind: 'title', title: '畢業生' }` unlocks
- **THEN** the dispatcher SHALL surface the new title in SettingsPanel's selectable list (player chooses whether to display it)

#### Scenario: Equipment reward type rejected at build

- **WHEN** a developer attempts to add `reward: { kind: 'equipment', ... }` to an achievement entry
- **THEN** the TypeScript compiler SHALL emit a type error indicating that `equipment` is not a valid reward kind

### Requirement: Anti-grind composite enforcement for cumulative achievements

Achievements whose primary predicate is a pure cumulative count or time threshold (e.g., `totalStudyMinutes >= N`, `totalQuestionsAnswered >= N`) MUST include an additional dimension constraint (accuracy threshold, streak requirement, or recency requirement) at tier P1 鑽石. The validator SHALL inspect predicate function source / metadata and reject single-dimension P1 grind achievements.

#### Scenario: Pure cumulative time at P3 銀 allowed

- **WHEN** a developer adds「累積唸書 30 hr」at tier P3
- **THEN** the validator SHALL accept it (P3 is not subject to anti-grind rule)

#### Scenario: Pure cumulative count at P1 鑽石 rejected

- **WHEN** a developer adds「答對 3000 題」at tier P1 with no other dimension
- **THEN** the validator SHALL reject the entry; the developer must add accuracy or streak clause

## Atlas / Sprite Display Requirements

### Requirement: Main badge atlas (6×4 grid)

The system SHALL render category × tier badges from a single sprite atlas at `apps/medexam2-hospital-tw/src/assets/achievements/badge-atlas.png` of dimensions 512×768 px with 6 rows × 4 columns × 128×128 px cells. Row index maps to category (study=0, quiz=1, recruit=2, hospital=3, fortune=4, hidden=5). Column index maps to tier (P4=0, P3=1, P2=2, P1=3). Atlas MUST use 16-color GBA-style palette with transparent background.

#### Scenario: BadgeSprite component shows correct cell

- **WHEN** `<BadgeSprite category="quiz" tier="P1" size={24} />` is rendered
- **THEN** the component SHALL show the cell at row 1 (quiz), column 3 (P1) — the「鑽石十字」 design

#### Scenario: Atlas missing fails Vite build

- **WHEN** the developer removes `badge-atlas.png` and tries to build
- **THEN** Vite SHALL fail the build with an unresolved import error

### Requirement: Subject mastery atlas (7×2 grid)

The system SHALL render per-subject mastery badges from a separate atlas `subject-atlas.png` of dimensions 896×256 px with 7 columns × 2 rows × 128×128 px cells. All cells SHALL share the P2 金 base styling with a distinct medical specialty icon overlay per cell. Mapping (col, row): 內科 (0,0) / 家醫科 (1,0) / 小兒科 (2,0) / 皮膚科 (3,0) / 神經內科 (4,0) / 精神科 (5,0) / 麻醉科 (6,0) / 外科 (0,1) / 泌尿科 (1,1) / 骨科 (2,1) / 婦產科 (3,1) / 復健科 (4,1) / 眼科 (5,1) / 耳鼻喉科 (6,1).

#### Scenario: SubjectBadgeSprite shows correct subject

- **WHEN** `<SubjectBadgeSprite subjectId="外科" size={48} />` is rendered
- **THEN** the component SHALL show the cell at column 0, row 1 — the「外科達人」 design with scalpel/suture icon and P2 金 base

### Requirement: Subject icon recognizability at small sizes

Subject mastery icons SHALL remain visually distinguishable at 24px, 48px, and 64px rendered sizes. Verification SHALL occur via side-by-side rendering review during atlas generation. If recognizability fails at 24px, the atlas MUST be regenerated with fallback strategy (e.g., add 1-2 Chinese character overlay in corner).

#### Scenario: 24px atlas verification

- **WHEN** the atlas is generated and the team reviews at 24px size
- **THEN** all 14 subject icons MUST be distinguishable by visual inspection; ambiguous icons (e.g., eye-icon vs glasses-icon collision) require regeneration

## Trigger Hook Integration Requirements

### Requirement: Five service hook points

The system SHALL trigger achievement evaluation at exactly five service call sites in `apps/medexam2-hospital-tw/src/`:

1. `services/quiz-rewards.ts` (after quiz answer reward applied)
2. `lib/tick.ts` (after tier upgrade or event resolution)
3. `services/recruitment.ts` (after gacha pull resolved)
4. `services/fate-card.ts` (after fate card drawn)
5. `services/training.ts` (after training success, retire, or pity trigger)

Each hook SHALL call `checkAchievementUnlocks(prev, next, stats, catalog)` and emit `AchievementUnlockToast` (or full-screen modal for P1) for each returned achievement.

#### Scenario: Quiz answer triggers achievement check

- **WHEN** a player answers a quiz question correctly and `applyQuizReward` completes
- **THEN** the system SHALL call `checkAchievementUnlocks` with the pre/post state and surface any newly-unlocked achievements via the appropriate UI component

#### Scenario: Equipment service NOT hooked

- **WHEN** the player opens an equipment supply box (post-PR-merge, if equipment system exists)
- **THEN** NO achievement evaluation hook fires for equipment-related events; achievements remain decoupled from equipment

### Requirement: Streak counter integration

The system SHALL maintain a streak counter for consecutive correct quiz answers. The counter SHALL be persisted at `gameCounters.currentQuizCorrectStreak` (LWW, can decrease) and `monotonicCounters.maxQuizCorrectStreak` (MAX-merge, monotonic). Reset rules:

- Correct answer (fresh or non-fresh) → `currentQuizCorrectStreak += 1`; if it exceeds max, also update `maxQuizCorrectStreak`
- Wrong answer → `currentQuizCorrectStreak = 0`; max preserved
- Skipped question (送分題退費) → no change to current or max
- `isDisputed` 送分題 (always-grants-reward) → treated as correct, `currentQuizCorrectStreak += 1`
- Session end / page refresh / day boundary → no change (streak persists across sessions)

#### Scenario: Wrong answer resets current but preserves max

- **WHEN** a player has `currentQuizCorrectStreak = 15`, `maxQuizCorrectStreak = 20`, and answers wrong
- **THEN** `currentQuizCorrectStreak` becomes 0; `maxQuizCorrectStreak` stays 20

#### Scenario: New max triggers streak achievement

- **WHEN** a player's current streak reaches 5 (first time) and a P4 achievement requires `maxQuizCorrectStreak >= 5`
- **THEN** the achievement unlocks immediately on that correct answer
