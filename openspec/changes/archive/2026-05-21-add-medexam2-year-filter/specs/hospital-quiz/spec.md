## ADDED Requirements

### Requirement: HomePage SHALL render a two-page chevron-paginated year-filter chip group

The HomePage SHALL render a `.filter-bar` instance (sharing the visual language defined by `Better screeners for roster and training screens`) above the 14 RecruitmentBanner grid, containing a 「年份」 group whose chips represent the 10 民國 years 106 through 115. Chips SHALL be paginated into two pages with exactly 5 chips each:

- **Page 1**: 115, 114, 113, 112, 111 (in this left-to-right order)
- **Page 2**: 110, 109, 108, 107, 106 (in this left-to-right order)

The bar SHALL render a pager control immediately after the chip group consisting of:

1. A 「‹」 previous-page button (`role=button`, `aria-label="上一頁"`)
2. An indicator span showing `1 / 2` or `2 / 2` reflecting current page (1-indexed)
3. A 「›」 next-page button (`role=button`, `aria-label="下一頁"`)

The pager buttons SHALL disable (with `aria-disabled="true"` and visibly reduced opacity) at the page extremes: 「‹」 disabled on Page 1, 「›」 disabled on Page 2. No wrap-around navigation. Page index SHALL NOT persist across HomePage mounts — every HomePage navigation SHALL initialize to Page 1 (近 5 年).

Each year chip SHALL be a `<button>` with `className="filter-chip"`, `aria-pressed` reflecting its membership in the active year-filter set, and `onClick` that toggles year membership (add if absent, remove if present). A 「全部」 reset chip SHALL precede the 10 year chips and SHALL be `aria-pressed={yearFilter.length === 10 || yearFilter.length === 0}`; clicking 「全部」 SHALL select all 10 years (the chip group's "everything is selected" state — semantically identical to the empty / default state per Requirement below).

The active filter set SHALL be sourced via `useLiveQuery` from `getYearFilter()` (Dexie `meta` KV); when the row is absent or its value array is empty, the effective filter SHALL be 「全選 10 年」 (per the default requirement below). Toggle actions SHALL write the new filter array back to Dexie via `setYearFilter(years: number[])` immediately (no debounce).

A 「目前 N 個年份」counter SHALL render at the right edge of the filter bar (mirroring PR #3 `.filter-bar__count`) showing the count of active years (e.g. `5 / 10 年`).

#### Scenario: Initial HomePage render shows year filter bar with all chips active

- **GIVEN** the player opens HomePage on a fresh save with no `meta['quiz.yearFilter']` row
- **WHEN** HomePage finishes rendering
- **THEN** the year filter bar SHALL be visible above the banner grid
- **AND** Page 1 SHALL be active (chips for 115, 114, 113, 112, 111 visible)
- **AND** all 10 year chips (across both pages) SHALL render with `aria-pressed="true"`
- **AND** the 「全部」 chip SHALL render with `aria-pressed="true"`
- **AND** the 「‹」 button SHALL be `aria-disabled="true"` and the 「›」 button enabled
- **AND** the indicator SHALL display `1 / 2`
- **AND** the counter SHALL display `10 / 10 年`

#### Scenario: Click chevron right switches to Page 2

- **GIVEN** the year filter bar is on Page 1
- **WHEN** the player clicks the 「›」 button
- **THEN** Page 1 chips SHALL unmount and Page 2 chips (110, 109, 108, 107, 106) SHALL render in left-to-right order
- **AND** the indicator SHALL display `2 / 2`
- **AND** the 「›」 button SHALL become `aria-disabled="true"` and 「‹」 SHALL be enabled
- **AND** the active year-filter state SHALL NOT change (chips switching is purely visual)

#### Scenario: Click year chip toggles membership and persists to Dexie

- **GIVEN** the year filter is `{106..115}` (all selected) and Page 1 is showing
- **WHEN** the player clicks the `113` chip
- **THEN** the `113` chip SHALL switch to `aria-pressed="false"`
- **AND** `meta['quiz.yearFilter']` SHALL be persisted as `[115, 114, 112, 111, 110, 109, 108, 107, 106]` (order may vary; membership is what matters)
- **AND** the counter SHALL update to `9 / 10 年`
- **AND** the 「全部」 chip SHALL switch to `aria-pressed="false"`

#### Scenario: Click 「全部」 reset chip restores all 10 years

- **GIVEN** the year filter has fewer than 10 years selected
- **WHEN** the player clicks the 「全部」 chip
- **THEN** all 10 year chips (across both pages) SHALL render with `aria-pressed="true"`
- **AND** `meta['quiz.yearFilter']` SHALL be persisted as an array containing all 10 years
- **AND** the counter SHALL display `10 / 10 年`

#### Scenario: Page index resets to 1 on HomePage remount

- **GIVEN** the player navigated chevron to Page 2 and then routed away from HomePage
- **WHEN** the player returns to HomePage
- **THEN** the year filter bar SHALL re-initialize to Page 1
- **AND** the active year-filter set SHALL remain whatever was persisted in Dexie

### Requirement: Year-filter preference SHALL persist to Dexie `meta` table with all-selected default semantics

The year-filter preference SHALL be stored in the existing Dexie `meta` table under key `quiz.yearFilter`, with value type `number[]` (an array of 民國 years in the range `106..115` inclusive). A new service module `services/year-filter.ts` SHALL expose:

- `async function getYearFilter(): Promise<number[] | null>` — returns the persisted array, or `null` when the row is absent
- `async function setYearFilter(years: number[]): Promise<void>` — writes the array (idempotent put)
- `function effectiveYearSet(persisted: number[] | null): Set<number>` — derives the effective filter Set from persisted state, returning `Set([106..115])` when input is `null` OR when input is an empty array
- `async function effectivePoolSize(subjectId: SubjectId, yearFilter: Set<number>): Promise<number>` — counts playable questions in the subject pool whose `meta.year` is in `yearFilter`

The persisted value SHALL NOT participate in cloud sync (R2 or Supabase bundles) — it is a per-device UI preference, mirroring the precedent set by `quiz.companionDoctorId`. The Dexie schema SHALL bump to v13 to mark the version that introduces this key; no upgrade hook is required (additive KV row).

The default semantics — `null` AND `[]` BOTH map to 「全選 10 年」 — SHALL be enforced exclusively in `effectiveYearSet`, so every caller (HomePage chips, picker plumbing, 0-題 gate) reads consistent behavior.

#### Scenario: First read on fresh save returns null and effectively means all years

- **GIVEN** a save with no `meta['quiz.yearFilter']` row
- **WHEN** `getYearFilter()` is called
- **THEN** the returned value SHALL be `null`
- **AND** `effectiveYearSet(null)` SHALL equal `Set([106, 107, 108, 109, 110, 111, 112, 113, 114, 115])`

#### Scenario: Empty array persisted treated identically to null

- **GIVEN** a save where `meta['quiz.yearFilter']` was previously written as `[]`
- **WHEN** `effectiveYearSet([])` is called
- **THEN** the returned Set SHALL equal `Set([106, 107, 108, 109, 110, 111, 112, 113, 114, 115])`

#### Scenario: setYearFilter writes idempotently

- **GIVEN** `meta['quiz.yearFilter']` does not exist
- **WHEN** `setYearFilter([115, 114, 113])` is called
- **THEN** `getYearFilter()` SHALL return `[115, 114, 113]` (or an equivalent permutation; membership is what matters)
- **AND** a subsequent `setYearFilter([113, 114, 115])` (same membership) SHALL be a no-op-effectively (same row contents post-write)

#### Scenario: Schema bumps to v13 without data loss

- **GIVEN** a player at Dexie schema v12 with existing hospital data
- **WHEN** the app boots after the v13 deploy
- **THEN** the Dexie open SHALL succeed
- **AND** all v12 data (doctors, rooms, gameCounters, etc.) SHALL be preserved untouched
- **AND** `meta` table SHALL be writable for the new `quiz.yearFilter` key

### Requirement: Random-pool picker SHALL honor the optional year-filter parameter

The `pickRandomQuestion(subjectId, seenIds, opts?)` function in `apps/medexam2-hospital-tw/src/lib/quiz.ts` SHALL accept an optional `opts.yearFilter?: Set<number>`. When `opts.yearFilter` is provided AND its `.size > 0` AND its `.size < 10`, the picker SHALL filter the per-subject pool to only questions whose `Question.meta.year ∈ opts.yearFilter` before random selection. When `opts.yearFilter` is `undefined` OR `opts.yearFilter.size === 0` OR `opts.yearFilter.size === 10` (all years selected), the picker SHALL operate on the full per-subject pool (no-op filter).

Likewise, `loadSubjectQuestionIds(subjectId, opts?)` SHALL accept and honor `opts.yearFilter` with identical semantics, returning the filtered id list.

The re-roll-up-to-3-times-on-seen-collision behavior (per existing `Quiz session SHALL be continuous single-question with no batch boundary` scenario) SHALL apply over the year-filtered sub-pool, not the original pool.

When the year-filtered sub-pool is empty (i.e. no question in the subject matches the year filter), the picker SHALL return `null` (the existing null-return contract for unknown subjects also covers this case).

#### Scenario: Picker returns only questions in active year filter

- **GIVEN** the 外科 pool contains 640 questions across years 106-115 (~64 per year)
- **AND** `opts.yearFilter = Set([115, 114, 113])`
- **WHEN** `pickRandomQuestion('外科', new Set(), { yearFilter })` is called 100 times
- **THEN** every returned question's `meta.year` SHALL be in `{115, 114, 113}`
- **AND** no question with `meta.year ∈ {106..112}` SHALL be returned

#### Scenario: Picker returns null when year filter intersects subject pool to empty

- **GIVEN** a (hypothetical) subject `X` whose pool contains only questions from year 107
- **AND** `opts.yearFilter = Set([115])`
- **WHEN** `pickRandomQuestion('X', new Set(), { yearFilter })` is called
- **THEN** the return value SHALL be `null`

#### Scenario: Undefined / full-selection / empty filter is treated as no-op

- **GIVEN** the 內科 pool contains 640 questions across years 106-115
- **WHEN** `pickRandomQuestion('內科', new Set())` is called (no opts)
- **AND** `pickRandomQuestion('內科', new Set(), { yearFilter: new Set() })` is called
- **AND** `pickRandomQuestion('內科', new Set(), { yearFilter: new Set([106,107,108,109,110,111,112,113,114,115]) })` is called
- **THEN** all three calls SHALL draw from the full 640-question pool with equal probability

### Requirement: QuizModal SHALL thread year-filter preference to picker calls and gate empty pools

The `QuizModal` component SHALL subscribe to the year-filter preference via `useLiveQuery(() => getYearFilter())` and pass `effectiveYearSet(persisted)` into every picker call: `pickRandomQuestion(subjectId, seenIds, { yearFilter })` and `loadSubjectQuestionIds(subjectId, { yearFilter })`. The due-first picker delegated to `getNextDueCardForSubject` SHALL also receive the year filter per `hospital-srs` capability.

When the picker returns `null` (subject's year-filtered pool is empty) at any point during the modal session, the modal SHALL:

- Disable the option buttons (A/B/C/D) and the 「下一題」 button
- Replace the question stem region with the message `「此組合 0 題，請放寬篩選或切換科目」`
- Leave the subject dropdown enabled so the player can pivot to a subject whose year-filtered pool is non-empty
- Leave the close (X) button enabled

The mid-session toggling of year chips on HomePage (if HomePage and QuizModal are both mounted, which is the current overlay pattern) SHALL be observed by the QuizModal via the `useLiveQuery` subscription, causing the modal to re-pick or fall into the 0-題 fallback state on the next render cycle.

#### Scenario: Modal opens with year filter applied to first question

- **GIVEN** `meta['quiz.yearFilter']` is `[115, 114]`
- **AND** the player opens QuizModal from the 內科 banner
- **WHEN** the modal renders the first question
- **THEN** the question's `meta.year` SHALL be either 115 or 114
- **AND** never any other year

#### Scenario: Mid-session year filter narrow to 0 displays fallback message

- **GIVEN** QuizModal is open on a subject `X` with `yearFilter = Set([115])` and pool size 64
- **AND** the player has answered all 64 distinct 115-year questions for subject `X` this session (seenIds = 64)
- **AND** the player clicks 「下一題」, the picker exhausts re-rolls and the existing pool-exhausted toast fires
- **THEN** subsequent behavior is per existing `pool-exhausted toast` requirement (questions still served from same pool with repeats), NOT the 0-題 fallback (which only triggers when filter narrows the pool itself to 0)

#### Scenario: Empty filter result mid-session disables next button and shows message

- **GIVEN** QuizModal is open for 內科 and the year filter is currently `Set([115, 114])` with playable pool size > 0
- **WHEN** the player switches the subject dropdown to a (hypothetical) subject `Y` whose year-filtered pool size is 0
- **THEN** the modal SHALL display `「此組合 0 題，請放寬篩選或切換科目」` in the question region
- **AND** the option buttons SHALL be disabled
- **AND** the 「下一題」 button SHALL be disabled
- **AND** the subject dropdown SHALL remain interactive

### Requirement: HomePage banner 「📚 學習」 button SHALL disable when year-filtered pool is 0 for its subject

Each `RecruitmentBanner`'s 「📚 學習」 button SHALL be disabled when `effectivePoolSize(banner.subjectId, effectiveYearSet(persisted)) === 0`. When disabled:

- The button SHALL render with `disabled` attribute and visually-muted styling
- Hover/focus tooltip SHALL display `此組合 0 題，請放寬年份篩選`
- The banner SHALL also display an inline small-text caption directly below the button: `📷 此組合 0 題，請放寬年份篩選` (mirrors the `.quiz-modal__image-missing` muted appearance for visual consistency)

The 「🎫 招募」 button on the same banner SHALL NOT be affected by this requirement (招募 is gacha, not quiz; year filter is irrelevant to recruitment).

When the year-filter preference changes via the HomePage filter bar (or any other channel), each banner's button state SHALL re-evaluate within one render cycle via the existing `useLiveQuery` reactivity.

#### Scenario: All-years selected leaves 學習 button enabled

- **GIVEN** `meta['quiz.yearFilter']` is `null` (default = 全選 10 年)
- **WHEN** HomePage renders
- **THEN** every banner's 「📚 學習」 button SHALL be enabled (assuming the subject's full pool > 0, which is always true in production)
- **AND** no `0 題` inline caption SHALL render

#### Scenario: Narrow filter to 1 year and 1 subject results in disabled button + caption

- **GIVEN** the player sets year filter to `[115]` only
- **AND** a (hypothetical) subject whose 115-year pool is 0 (corpus reality: 115 has only 320 questions but each subject still has > 0 — this scenario is defensive against future corpus drift)
- **WHEN** HomePage re-renders after the filter change
- **THEN** that subject's banner 「📚 學習」 button SHALL render with `disabled` attribute
- **AND** the caption `此組合 0 題，請放寬年份篩選` SHALL render below the button
- **AND** the same banner's 「🎫 招募」 button SHALL retain its existing enabled/disabled state per recruitment rules

#### Scenario: Loosening the filter re-enables the button without page reload

- **GIVEN** a banner's 「📚 學習」 button is currently disabled due to 0-題 filter combo
- **WHEN** the player clicks the 「全部」 reset chip on the year filter bar
- **THEN** the same banner's button SHALL re-enable within one render cycle
- **AND** the inline caption SHALL disappear

### Requirement: TrainingPage random picker SHALL honor year-filter preference

The TrainingPage's `pickRandomQuestion` call inside `confirmStartTraining` and the in-battle 「下一題」 flow SHALL pass `{ yearFilter: effectiveYearSet(persisted) }` resolved from the same Dexie `meta['quiz.yearFilter']` key. The training success-rate formula and pity-counter logic SHALL be unchanged by this requirement — only the question source pool SHALL be year-filtered.

When the year-filtered pool for the doctor's `subjectId` is empty, the TrainingPage SHALL display an inline message in the training-modal area: `「目前年份篩選下，{subjectId} 0 題可用，請至首頁放寬篩選」`, and the 「開始進修」 button SHALL be disabled.

#### Scenario: Training pulls from year-filtered pool

- **GIVEN** the player has year filter set to `[115, 114]`
- **AND** the player initiates training for a 外科 doctor
- **WHEN** `pickRandomQuestion('外科', seenIds, { yearFilter: Set([115, 114]) })` resolves
- **THEN** the training question's `meta.year` SHALL be in `{115, 114}`

#### Scenario: Training disabled when year filter empties subject pool

- **GIVEN** a doctor's `subjectId` is `X` and the player has year filter narrowed such that `X`'s pool is empty
- **WHEN** the player attempts to start training for that doctor
- **THEN** the 「開始進修」 button SHALL be disabled
- **AND** the inline message `目前年份篩選下，X 0 題可用，請至首頁放寬篩選` SHALL display
