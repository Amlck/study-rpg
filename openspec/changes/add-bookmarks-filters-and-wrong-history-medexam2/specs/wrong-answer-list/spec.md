## ADDED Requirements

### Requirement: The `questionHistory` store SHALL persist an `everWrong` flag set on first wrong answer and never unset

The `questionHistory` Dexie store SHALL include a column `everWrong: boolean` (default `false`) introduced in Dexie schema version 17. A single-column index on `everWrong` SHALL be added to support efficient query of `everWrong === true` rows.

The `recordWrongAnswer` flow (per `hospital-quiz` capability) SHALL set `everWrong = true` on the upserted row whenever the row is being written with `lastResult = 'wrong'`. If the row already has `everWrong = true`, the write SHALL be idempotent (no-op flip).

The `recordCorrectAnswer` flow SHALL NOT modify `everWrong` — once set to `true`, it remains `true` for the lifetime of the row regardless of subsequent answer outcomes.

The Dexie v17 migration SHALL NOT backfill `everWrong` on pre-existing rows. Rows existing before the migration retain `everWrong = false` until the next write touches them. This is acceptable because (a) currently-wrong rows still appear in 「目前未答對」 sub-view via the existing `lastResult === 'wrong'` query (unchanged), and (b) players' active study loops naturally re-touch questions, migrating them forward.

The R2 `m2` bundle schema_version SHALL bump from `1` to `2` in this change. The bundle's `questionHistory` adapter SHALL pass through the `everWrong` field on serialize. On deserialize, missing `everWrong` (from older payloads) SHALL be treated as `false`. v2-aware clients pulling v1 bundles SHALL apply the default; v1 clients pulling v2 bundles SHALL drop the unknown field harmlessly.

The `questionHistory` adapter's `applyToLocal` (or equivalent merge function) SHALL implement **monotonic-OR merge semantics** for the `everWrong` field specifically — distinct from the standard LWW merge applied to all other fields. After the LWW resolution determines which row wins for other fields (`lastResult`, `attempts`, `correctCount`, `lastAnsweredAt`, `nextDueAt`, `interval`, `easeFactor`), the final row's `everWrong` value SHALL be `(existing?.everWrong === true) || (incoming.everWrong === true)`. Once any client writes `everWrong: true` to a row, NO subsequent sync write (regardless of `updated_at` timestamp ordering, regardless of incoming client's schema_version) SHALL clear it.

#### Scenario: First wrong answer sets everWrong to true

- **GIVEN** the player has no `questionHistory` row for question `Q_A`
- **WHEN** the player selects an incorrect option for `Q_A` and `recordWrongAnswer` writes the row
- **THEN** the row SHALL exist with `lastResult = 'wrong'`, `attempts = 1`, `everWrong = true`

#### Scenario: Subsequent correct answer preserves everWrong

- **GIVEN** `questionHistory[Q_A] = { lastResult: 'wrong', attempts: 1, correctCount: 0, everWrong: true }`
- **WHEN** the player answers `Q_A` correctly and `recordCorrectAnswer` writes the row
- **THEN** the row SHALL update to `{ lastResult: 'correct', attempts: 2, correctCount: 1, everWrong: true }`
- **AND** `everWrong` SHALL remain `true`

#### Scenario: Player who never got Q wrong has everWrong false

- **GIVEN** `questionHistory[Q_B]` has been written only via `recordCorrectAnswer` (correct on first attempt)
- **THEN** `questionHistory[Q_B].everWrong` SHALL equal `false`

#### Scenario: Migration v17 does not backfill historical wrong-answer rows

- **GIVEN** before deploying this change, the player has `questionHistory[Q_C] = { lastResult: 'wrong', attempts: 3, correctCount: 0 }` (no `everWrong` column existed)
- **WHEN** the v17 migration runs on app upgrade
- **THEN** `questionHistory[Q_C]` SHALL be `{ lastResult: 'wrong', attempts: 3, correctCount: 0, everWrong: false }` (`everWrong` defaulted on insert, not backfilled to reflect history)
- **AND** `Q_C` SHALL still appear in the 「目前未答對」 sub-view (because `lastResult === 'wrong'`)

#### Scenario: Re-answering migrated wrong row correctly leaves everWrong false (acceptable migration gap)

- **GIVEN** after migration, `questionHistory[Q_C] = { lastResult: 'wrong', ..., everWrong: false }`
- **WHEN** the player answers `Q_C` correctly and `recordCorrectAnswer` fires
- **THEN** `questionHistory[Q_C]` SHALL update to `{ lastResult: 'correct', ..., everWrong: false }`
- **AND** `Q_C` SHALL leave the 「目前未答對」 sub-view
- **AND** `Q_C` SHALL NOT appear in the 「歷史曾錯」 sub-view (because `everWrong = false` from migration gap)
- **AND** this gap is accepted; player's future wrong answers on other questions populate 「歷史曾錯」 normally

#### Scenario: Re-answering migrated wrong row incorrectly sets everWrong to true

- **GIVEN** after migration, `questionHistory[Q_C] = { lastResult: 'wrong', ..., everWrong: false }`
- **WHEN** the player answers `Q_C` incorrectly again and `recordWrongAnswer` fires
- **THEN** `questionHistory[Q_C]` SHALL update with `everWrong = true`
- **AND** `Q_C` SHALL now appear in 「歷史曾錯」 sub-view going forward

#### Scenario: Cross-device pull preserves local everWrong via monotonic-OR merge

- **GIVEN** device A is on v17 (has `everWrong` column) with `questionHistory[Q_X] = { lastResult: 'wrong', everWrong: true, lastAnsweredAt: T_old }`
- **AND** device B is on an older deploy (writes `m2` bundle v1 without `everWrong`)
- **WHEN** device A pulls device B's v1 bundle containing `Q_X` with `lastAnsweredAt: T_new` (T_new > T_old)
- **THEN** device A's `questionHistory[Q_X]` SHALL end up with `everWrong = true` (preserved via monotonic-OR — local `true` || incoming undefined/false = true)
- **AND** all other fields (`lastResult`, `attempts`, `correctCount`, `lastAnsweredAt`) SHALL follow standard LWW (incoming wins because T_new > T_old)
- **AND** no error SHALL be thrown

#### Scenario: Incoming everWrong=true wins regardless of LWW for that field

- **GIVEN** device A's local `questionHistory[Q_Y] = { lastResult: 'correct', everWrong: false, lastAnsweredAt: T_local }`
- **AND** incoming sync row has `{ lastResult: 'correct', everWrong: true, lastAnsweredAt: T_old }` where T_old < T_local (incoming would normally lose LWW)
- **WHEN** the adapter merges
- **THEN** local `everWrong` SHALL be promoted to `true` (monotonic-OR: false || true = true)
- **AND** other fields SHALL remain unchanged (LWW: incoming loses → local wins)
- **AND** the merge SHALL be idempotent — running it twice produces the same result

#### Scenario: Both sides true stays true (no flapping)

- **GIVEN** device A and device B both write `everWrong: true` for `Q_Z` (race condition)
- **WHEN** either side pulls the other's write
- **THEN** the merged row SHALL have `everWrong: true`
- **AND** subsequent pull cycles in either direction SHALL NOT flap the value

### Requirement: The 「錯題」 tab SHALL split into 「目前未答對」 and 「歷史曾錯」 sub-views

The 「錯題」 tab on `/bookmarks?tab=wrong` SHALL render a secondary sub-tab control with exactly two sub-views:

- 「目前未答對」 — derived live view of `questionHistory` rows where `lastResult === 'wrong'`. Default landing for the 「錯題」 tab. Sort by `lastAnsweredAt` DESC. Behavior matches the existing wrong-answer-list rendering (entries auto-leave on next correct answer).
- 「歷史曾錯」 — derived live view of `questionHistory` rows where `everWrong === true`. Sort by `lastAnsweredAt` DESC. Entries NEVER auto-leave this view (even after correct answer).

Each entry in 「歷史曾錯」 SHALL display a state chip indicating current status:
- `🔴 仍未答對` when `lastResult === 'wrong'`
- `✅ 已答對 N 次` when `lastResult === 'correct'` (where N = `correctCount`)

Entries in 「目前未答對」 sub-view do NOT require a state chip (all entries are by definition `lastResult === 'wrong'`).

Both sub-views SHALL respect the active filter selection from the page-level filter bar (per `question-bookmarks` capability filter bar requirement). Filtering applies AFTER the sub-view's primary predicate (`lastResult === 'wrong'` or `everWrong === true`).

Sub-view state SHALL be local React state on `BookmarksPage` or its child component; URL query string SHALL NOT add a new param (the existing `?tab=wrong` deep-links to the 「錯題」 tab, defaulting to 「目前未答對」 sub-view on entry).

Each entry in both sub-views SHALL preserve the existing wrong-answer-tab affordances: full question content inline (stem + options + correct-answer label + explanation), ★ promote toggle to add/remove from manual `bookmarks`, and the existing 「題目已不在題庫」 stub treatment for orphans.

Both sub-views SHALL paginate at **50 rows per page** to bound render cost for heavy users. Pagination state is local React state, separate per sub-view, defaulting to page 1 on landing. Pager UI SHALL reuse `.filter-bar__pager` / `.filter-bar__pager-btn` / `.filter-bar__pager-indicator` CSS classes (same visual language as year-chip pager). The pager SHALL display `‹ <page>/<total> ›` and SHALL be hidden when total rows fit on one page (≤ 50 rows). Pagination SHALL apply AFTER the filter — filter narrows the set first, then pagination slices the visible page from the filtered set. Changing the filter selection SHALL reset the active sub-view's pager to page 1.

The 「手動收藏」 tab SHALL ALSO paginate at 50 rows per page for the same reason (filter applied first, then pagination). This is a unified pagination behavior across all three list surfaces on the `/bookmarks` route.

#### Scenario: 「錯題」 tab opens to 「目前未答對」 sub-view by default

- **GIVEN** the player navigates to `/bookmarks?tab=wrong`
- **WHEN** the page renders
- **THEN** the 「錯題」 tab SHALL be active
- **AND** the secondary sub-tab control SHALL be visible
- **AND** the 「目前未答對」 sub-view SHALL be active by default
- **AND** the list SHALL render rows where `lastResult === 'wrong'`

#### Scenario: Switching to 「歷史曾錯」 shows persistent record

- **GIVEN** the player has `questionHistory[Q_D] = { lastResult: 'correct', correctCount: 2, everWrong: true, lastAnsweredAt: T }`
- **WHEN** the player clicks the 「歷史曾錯」 sub-tab
- **THEN** the list SHALL contain `Q_D`
- **AND** the entry SHALL display the state chip `✅ 已答對 2 次`
- **AND** `Q_D` SHALL NOT appear in the 「目前未答對」 sub-view (since `lastResult !== 'wrong'`)

#### Scenario: 「歷史曾錯」 includes still-wrong entries with red chip

- **GIVEN** the player has `questionHistory[Q_E] = { lastResult: 'wrong', correctCount: 0, everWrong: true }`
- **WHEN** the player views the 「歷史曾錯」 sub-view
- **THEN** `Q_E` SHALL be in the list
- **AND** `Q_E` SHALL display the state chip `🔴 仍未答對`
- **AND** `Q_E` SHALL ALSO appear in the 「目前未答對」 sub-view

#### Scenario: 「歷史曾錯」 sorts by lastAnsweredAt DESC

- **GIVEN** the player has 3 questions in `questionHistory` with `everWrong = true` and `lastAnsweredAt` T1 < T2 < T3
- **WHEN** the player views the 「歷史曾錯」 sub-view
- **THEN** the entry with `lastAnsweredAt = T3` SHALL appear first
- **AND** the entry with `lastAnsweredAt = T1` SHALL appear last

#### Scenario: Filter applies to both sub-views

- **GIVEN** the player has 4 questions with `everWrong = true` — 2 in 內科 (years 109/110) and 2 in 外科 (years 109/110)
- **WHEN** the player on the 「歷史曾錯」 sub-view selects subject chip `內科` AND year chip `109`
- **THEN** exactly 1 entry SHALL be visible (109 年 內科)
- **AND** switching to the 「目前未答對」 sub-view SHALL also apply the same filter

#### Scenario: Sub-view switch preserves filter

- **GIVEN** the player has selected year chip `109` and subject chip `內科`
- **AND** the player is on the 「目前未答對」 sub-view
- **WHEN** the player clicks the 「歷史曾錯」 sub-tab
- **THEN** the year `109` and subject `內科` chips SHALL remain selected
- **AND** the 「歷史曾錯」 list SHALL show only 109 年 內科 entries with `everWrong = true`

#### Scenario: Star toggle works identically in both sub-views

- **GIVEN** the player views an entry for `Q_F` in the 「歷史曾錯」 sub-view (`everWrong = true`)
- **AND** no `bookmarks` row exists for `Q_F`
- **WHEN** the player clicks the ★ toggle on the entry
- **THEN** a new `bookmarks` row SHALL be created with `questionId = "Q_F"`
- **AND** the toggle SHALL re-render with the filled ★ glyph
- **AND** the `questionHistory[Q_F]` row SHALL remain unchanged

#### Scenario: Orphan entry in 「歷史曾錯」 renders stub

- **GIVEN** `questionHistory[Q_ORPHAN].everWrong = true`
- **AND** `Q_ORPHAN` is not present in the currently-loaded `questions.json`
- **WHEN** the player views the 「歷史曾錯」 sub-view
- **THEN** the entry SHALL display the identifier
- **AND** the entry SHALL display the text 「題目已不在題庫」
- **AND** the orphan entry SHALL bypass the page-level filter (always renders)

#### Scenario: Empty state for 「歷史曾錯」

- **GIVEN** no `questionHistory` row has `everWrong = true`
- **WHEN** the player views the 「歷史曾錯」 sub-view
- **THEN** an empty-state message SHALL be displayed (e.g., 「目前還沒有歷史錯題紀錄 — 答錯題目後會永久記錄在這裡」 or equivalent)
- **AND** no list entries SHALL render

#### Scenario: Pagination kicks in when sub-view has > 50 rows

- **GIVEN** the player has 130 `questionHistory` rows with `everWrong = true`, no filter active
- **WHEN** the player views the 「歷史曾錯」 sub-view
- **THEN** the first 50 entries (by `lastAnsweredAt` DESC) SHALL render
- **AND** a pager SHALL be visible at the bottom of the list showing `‹ 1/3 ›`
- **AND** clicking `›` SHALL advance to page 2 showing entries 51–100

#### Scenario: Pager hidden when filtered set fits one page

- **GIVEN** the player has 130 「歷史曾錯」 rows total
- **WHEN** the player selects year chip `109` such that only 20 entries match the filter
- **THEN** all 20 entries SHALL render on one page
- **AND** the pager SHALL NOT be visible

#### Scenario: Filter change resets pager to page 1

- **GIVEN** the player is on page 2 of 「歷史曾錯」 (rows 51-100 visible)
- **WHEN** the player selects a subject chip that narrows the filter
- **THEN** the active page SHALL reset to page 1
- **AND** the first 50 (or fewer) entries of the new filtered set SHALL render

### Requirement: A grace toast SHALL surface on wrong→correct transition with a 10-second ⭐ promote window

When `recordCorrectAnswer` updates a `questionHistory` row and detects that the previous `lastResult` value was `'wrong'` (i.e., transition `'wrong' → 'correct'`), the system SHALL emit a transient toast notification to the player. The toast SHALL:

- Display Traditional Chinese copy explaining the entry has been answered correctly and removed from the 「目前未答對」 sub-view, with a clear instruction that the player has 10 seconds to ⭐ star the question for permanent retention. Exact copy is implementation detail but SHALL convey both pieces.
- Provide an explicit ⭐ action button that, when clicked, invokes the existing `toggleBookmark(questionId)` flow (per `question-bookmarks` capability) — adding the question to the local `bookmarks` Dexie store identical to manual ⭐ from QuizModal.
- Auto-dismiss after 10 seconds without player interaction.
- Be dismissable manually via an `×` close button.
- Be suppressed if the wrong→correct transition originates from a cross-device sync apply (not from a local quiz answer). This is achieved by gating emission to the call sites of `recordCorrectAnswer` (`QuizModal`, `MockExamPage`, `MentorPage`, ER consultation answer handlers) rather than on Dexie change observation.

Multiple toasts MAY stack visually (max 3 visible at once). If more than 3 transitions fire in a 10-second window, additional toasts SHALL be queued and shown after earlier ones dismiss.

The toast SHALL NOT block the player's input — the player can continue using the app while the toast is visible.

#### Scenario: Wrong-to-correct transition on local quiz answer emits toast

- **GIVEN** `questionHistory[Q_G].lastResult = 'wrong'`
- **AND** the player is in QuizModal viewing `Q_G`
- **WHEN** the player selects the correct option and `recordCorrectAnswer` writes the row
- **THEN** a toast SHALL appear with copy mentioning `Q_G` removed from 「錯題」 and a 10-second ⭐ window
- **AND** the toast SHALL contain an explicit ⭐ button
- **AND** the toast SHALL contain an `×` close affordance

#### Scenario: ⭐ button in toast adds to bookmarks

- **GIVEN** a grace toast for `Q_G` is currently visible
- **AND** no `bookmarks` row exists for `Q_G`
- **WHEN** the player clicks the ⭐ button on the toast
- **THEN** a new `bookmarks` row SHALL be created with `questionId = "Q_G"` and `addedAt = Date.now()`
- **AND** the toast SHALL dismiss
- **AND** if the player navigates to `/bookmarks?tab=manual`, `Q_G` SHALL appear in the manual bookmarks list

#### Scenario: Toast auto-dismisses after 10 seconds

- **GIVEN** a grace toast appears at time T
- **WHEN** 10 seconds pass without the player interacting with the toast
- **THEN** the toast SHALL no longer be visible
- **AND** no `bookmarks` write SHALL have occurred as a side effect

#### Scenario: Toast dismissed manually via close button

- **GIVEN** a grace toast is visible
- **WHEN** the player clicks the `×` close button
- **THEN** the toast SHALL dismiss
- **AND** no `bookmarks` write SHALL occur

#### Scenario: Cross-device sync pull does NOT emit toast

- **GIVEN** device A's local `questionHistory[Q_H].lastResult = 'wrong'`
- **AND** the player is signed in on devices A and B
- **WHEN** device B answers `Q_H` correctly
- **AND** device A pulls the updated m2 bundle from R2
- **AND** device A's `questionHistory[Q_H].lastResult` flips to `'correct'` via the sync apply path
- **THEN** no toast SHALL appear on device A
- **AND** `Q_H` SHALL naturally leave the 「目前未答對」 sub-view on device A
- **AND** `Q_H` SHALL appear in the 「歷史曾錯」 sub-view on device A (since `everWrong = true` was also synced)

#### Scenario: Correct-to-correct write (already correct) does NOT emit toast

- **GIVEN** `questionHistory[Q_I].lastResult = 'correct'` already
- **WHEN** the player answers `Q_I` correctly again
- **THEN** `recordCorrectAnswer` SHALL update `correctCount` and `lastAnsweredAt`
- **AND** no toast SHALL appear (transition flag `wasWrong = false`)

#### Scenario: Multiple transitions in quick succession stack visually

- **GIVEN** the player rapidly answers 4 previously-wrong questions correctly in mock exam mode
- **WHEN** the 4 transitions fire within a 3-second window
- **THEN** 3 toasts SHALL be visible simultaneously (stacked)
- **AND** the 4th toast SHALL be queued and appear after the first dismisses or auto-expires
- **AND** each toast's ⭐ button SHALL independently bookmark its respective question

## MODIFIED Requirements

### Requirement: `/bookmarks` route SHALL host a 「錯題」 tab alongside the 「手動收藏」 tab

The `/bookmarks` route SHALL render a top-level tab control with exactly two tabs: 「手動收藏」 (manual bookmarks, default landing) and 「錯題」 (derived wrong-answer list). The active tab SHALL be reflected in the URL query string via `?tab=manual` (default, also when the param is absent or invalid) or `?tab=wrong`. Tab clicks SHALL update the query string via `history.replaceState` (no full page reload). Direct navigation to `/bookmarks?tab=wrong` SHALL land on the 「錯題」 tab.

The page-level filter bar (per `question-bookmarks` capability) SHALL render above the tab switcher and apply to BOTH tabs.

The 「手動收藏」 tab SHALL render manual bookmarks per the `question-bookmarks` spec (existing behavior, scoped to that tab, with filter applied).

The 「錯題」 tab SHALL render a secondary sub-tab control (per the `「錯題」 tab sub-view split` requirement above) containing 「目前未答對」 and 「歷史曾錯」 sub-views. Both sub-views SHALL respect the page-level filter.

Each list entry in either sub-view SHALL display the question identifier verbatim, the full question stem, all four options with their texts, the correct-answer label, and the explanation — using the same `ExplanationMarkdown` render pipeline as the 「手動收藏」 tab. Wrong-answer entries whose `questionId` is not present in the currently-loaded `questions.json` SHALL render a stub with the identifier and a 「題目已不在題庫」 notice (no remove button — wrong-answer entries are auto-managed by `lastResult` / `everWrong` flags).

#### Scenario: Default landing is 「手動收藏」 tab

- **GIVEN** the player navigates to `/bookmarks` (no query string)
- **WHEN** the page renders
- **THEN** the 「手動收藏」 tab SHALL be visually active
- **AND** the URL SHALL be updated to `/bookmarks?tab=manual` (or remain at `/bookmarks` if no replaceState; either acceptable)
- **AND** the manual bookmarks list SHALL be rendered
- **AND** the filter bar SHALL be visible above the tab switcher

#### Scenario: Direct deep-link to wrong-answer tab lands correctly

- **GIVEN** the player opens `/bookmarks?tab=wrong` directly (e.g., from a shared link or F5 reload)
- **WHEN** the page loads
- **THEN** the 「錯題」 tab SHALL be visually active
- **AND** the secondary sub-tab control SHALL be visible
- **AND** the 「目前未答對」 sub-view SHALL be active by default
- **AND** the filter bar SHALL be visible above the tab switcher

#### Scenario: Tab click switches view without full page reload

- **GIVEN** the player is on `/bookmarks?tab=manual`
- **WHEN** the player clicks the 「錯題」 tab
- **THEN** the URL SHALL update to `/bookmarks?tab=wrong` via `history.replaceState`
- **AND** the secondary sub-tab control with 「目前未答對」 / 「歷史曾錯」 SHALL render
- **AND** the 「目前未答對」 sub-view SHALL be active
- **AND** no full page reload SHALL occur

#### Scenario: Invalid tab query string falls back to manual

- **GIVEN** the player opens `/bookmarks?tab=invalid_value_xyz`
- **WHEN** the page loads
- **THEN** the 「手動收藏」 tab SHALL be active
- **AND** the URL MAY be normalized to `/bookmarks?tab=manual`

#### Scenario: Filter bar visible on all tab + sub-view combinations

- **GIVEN** the player navigates to any of `/bookmarks?tab=manual`, `/bookmarks?tab=wrong` (current sub-view), `/bookmarks?tab=wrong` (history sub-view)
- **THEN** the year × subject filter bar SHALL render at the top of the page in all three cases
- **AND** the filter selection SHALL be consistent across all switches

### Requirement: The 「錯題」 list SHALL be derived from `hospital_question_history` at read time, not stored separately

The system SHALL define the 「錯題」 (wrong-answer) list as live derived views of the `questionHistory` Dexie store:

- 「目前未答對」 sub-view: filter `lastResult === 'wrong'`
- 「歷史曾錯」 sub-view: filter `everWrong === true`

There SHALL be no separate `wrongAnswers` Dexie store, no `question_wrong_answers` Supabase table, and no dedicated cloud-sync adapter for wrong-answers. The wrong-answer lists update automatically whenever `questionHistory[questionId]` is written — by the existing `recordWrongAnswer` / `recordCorrectAnswer` flow in `lib/mastery.ts` (per `hospital-quiz` capability) and synced cross-device via the existing R2 m2 bundle's `questionHistory` adapter.

The `questionHistory` Dexie store SHALL include:
- A compound index `[lastResult+lastAnsweredAt]` (added in Dexie schema version 11) so the 「目前未答對」 query can use the index
- A single-column index on `everWrong` (added in Dexie schema version 17) so the 「歷史曾錯」 query can use the index

#### Scenario: Wrong answer appears in 「目前未答對」 immediately

- **GIVEN** the player has no `questionHistory` row for question `106-2-醫學三-內科-Q10`
- **WHEN** the player selects an incorrect option for that question in `QuizModal`
- **AND** `recordWrongAnswer` writes `questionHistory[106-2-醫學三-內科-Q10] = { lastResult: 'wrong', everWrong: true, ... }`
- **THEN** the derived 「目前未答對」 list SHALL contain that question
- **AND** the derived 「歷史曾錯」 list SHALL ALSO contain that question
- **AND** the 「目前未答對」 entry SHALL update via `useLiveQuery` without manual reload

#### Scenario: Correct answer removes from 「目前未答對」 but preserves in 「歷史曾錯」

- **GIVEN** `questionHistory[106-2-醫學三-內科-Q10] = { lastResult: 'wrong', everWrong: true }`
- **WHEN** the player selects the correct option for that question
- **AND** `recordCorrectAnswer` writes `lastResult = 'correct'` (everWrong stays `true`)
- **THEN** the derived 「目前未答對」 list SHALL no longer contain that question
- **AND** the derived 「歷史曾錯」 list SHALL STILL contain that question
- **AND** a grace toast SHALL appear (per the grace toast requirement above)
- **AND** the 「目前未答對」 entry SHALL disappear via `useLiveQuery` reactivity

#### Scenario: Cross-device — correct answer on device B updates both lists on device A

- **GIVEN** the player is authenticated on devices A and B
- **AND** device A's local `questionHistory[Q_W] = { lastResult: 'wrong', everWrong: true }` (Q_W appears in both sub-views on A)
- **WHEN** the player on device B answers `Q_W` correctly
- **AND** device B's `recordCorrectAnswer` updates `questionHistory[Q_W]` to `{ lastResult: 'correct', everWrong: true }` locally
- **AND** the sync engine pushes the updated m2 bundle to R2
- **AND** device A pulls (on tab focus or pull cycle)
- **THEN** device A's local `questionHistory[Q_W]` SHALL equal `{ lastResult: 'correct', everWrong: true }` (LWW newer wins)
- **AND** the derived 「目前未答對」 list on device A SHALL no longer contain `Q_W`
- **AND** the derived 「歷史曾錯」 list on device A SHALL STILL contain `Q_W` with `✅ 已答對` chip
- **AND** no grace toast SHALL appear on device A (sync apply path)

#### Scenario: A question can simultaneously be in 「歷史曾錯」 and 「手動收藏」

- **GIVEN** the player has manually bookmarked question `106-2-醫學三-內科-Q10` (row exists in `bookmarks`)
- **AND** `questionHistory[106-2-醫學三-內科-Q10] = { lastResult: 'wrong', everWrong: true }`
- **THEN** the question SHALL appear in 「手動收藏」 tab
- **AND** the question SHALL appear in 「目前未答對」 sub-view
- **AND** the question SHALL appear in 「歷史曾錯」 sub-view
- **AND** the `bookmarks` row SHALL remain unchanged across subsequent wrong/correct answer cycles

### Requirement: The 「錯題」 tab SHALL surface a header helper banner explaining ephemeral behavior and promote affordance

The 「錯題」 tab SHALL render a fixed helper banner at the top of the list area (above the secondary sub-tab control OR above the first entry — implementation choice, sticky or non-scrolling). The banner SHALL contain the following in Traditional Chinese:

1. A brief explanation that 「目前未答對」 = currently-wrong questions (auto-leave on next correct answer) and 「歷史曾錯」 = persistent record of any question ever answered wrong (never auto-leave).
2. A pointer to the grace toast: instruct players that when they answer correctly, a 10-second window appears with ⭐ to save the question to 「手動收藏」.
3. A promote affordance hint: clicking ★ on any entry adds the question to 「手動收藏」 for permanent retention.
4. A migration-gap note: 「歷史曾錯」 紀錄從升級當下開始累積；之前已經答錯但尚未再次答題的題目，會在下次答到時自動補上紀錄。Or equivalent copy that conveys: the persistent history starts accruing from upgrade time, pre-existing wrong-answer rows backfill naturally on next answer.

The exact copy is implementation-detail (UI polish in apply phase) but SHALL include all four pieces above. The banner SHALL remain visible while the player scrolls through the list (sticky positioning at tab top, OR rendered as the first non-scrolling element above a scrollable list — either acceptable).

#### Scenario: Helper banner renders on wrong-answer tab landing

- **WHEN** the player lands on `/bookmarks?tab=wrong`
- **THEN** a helper banner SHALL be rendered above the sub-tab control or list area
- **AND** the banner SHALL explain both sub-views (「目前未答對」 ephemeral, 「歷史曾錯」 persistent)
- **AND** the banner SHALL mention the grace toast on wrong→correct transition
- **AND** the banner SHALL mention ★ promotion to 「手動收藏」
- **AND** the banner SHALL include a migration-gap note explaining the 「歷史曾錯」 record starts accruing from upgrade time

#### Scenario: Helper banner does NOT render on manual tab

- **WHEN** the player is on `/bookmarks?tab=manual`
- **THEN** the wrong-answer helper banner SHALL NOT be visible (it is wrong-answer-tab-scoped)
- **AND** the filter bar SHALL still be visible

### Requirement: Wrong-answer list entries SHALL expose a ★ toggle to promote to 「手動收藏」

Each entry in BOTH 「目前未答對」 and 「歷史曾錯」 sub-views SHALL include a ★ toggle. Clicking the toggle when the question is NOT in `bookmarks` SHALL add a new row to the `bookmarks` Dexie store (with `addedAt = Date.now()`, behavior identical to `QuizModal` bookmark toggle per `question-bookmarks` spec). Clicking the toggle when the question IS already in `bookmarks` SHALL remove the bookmark row (un-bookmark). The toggle's visual state (filled ★ vs outline ☆) SHALL reflect the current `bookmarks` membership. The wrong-answer derivation itself SHALL NOT be affected by this toggle — sub-view membership is determined by `questionHistory.lastResult` / `questionHistory.everWrong`, orthogonal to manual bookmark state.

#### Scenario: Promoting a wrong-answer entry adds a bookmark row

- **GIVEN** `questionHistory[106-2-醫學三-內科-Q10] = { lastResult: 'wrong', everWrong: true }` and no `bookmarks` row for that question
- **WHEN** the player clicks the ★ toggle on that entry in either 「目前未答對」 or 「歷史曾錯」 sub-view
- **THEN** a new `bookmarks` row SHALL exist with `questionId = "106-2-醫學三-內科-Q10"` and `addedAt = Date.now()`
- **AND** the `questionHistory` row SHALL remain unchanged
- **AND** the toggle SHALL re-render with the filled ★ glyph

#### Scenario: Un-promoting (toggling ★ off) removes the bookmark row but keeps the wrong-answer entry

- **GIVEN** both `bookmarks[106-2-醫學三-內科-Q10]` exists and `questionHistory[106-2-醫學三-內科-Q10] = { lastResult: 'wrong', everWrong: true }`
- **WHEN** the player clicks the ★ toggle (now filled) on either wrong-answer sub-view entry
- **THEN** the `bookmarks` row SHALL be deleted
- **AND** the `questionHistory` row SHALL remain unchanged
- **AND** the entry SHALL still appear in both 「目前未答對」 and 「歷史曾錯」 sub-views

#### Scenario: Subsequent correct answer removes from 「目前未答對」 but bookmark persists in 「手動收藏」 if promoted

- **GIVEN** both `bookmarks[Q]` exists and `questionHistory[Q] = { lastResult: 'wrong', everWrong: true }` (after promoting via ★)
- **WHEN** the player answers Q correctly
- **AND** `recordCorrectAnswer` flips `lastResult = 'correct'` (everWrong stays `true`)
- **THEN** Q SHALL no longer appear in the 「目前未答對」 sub-view
- **AND** Q SHALL STILL appear in the 「歷史曾錯」 sub-view with `✅ 已答對 1 次` chip
- **AND** the `bookmarks[Q]` row SHALL persist
- **AND** Q SHALL continue to appear in the 「手動收藏」 tab

### Requirement: Wrong-answer list SHALL render an empty-state placeholder when no entries exist

When the active sub-view's primary predicate matches zero rows (after filter application), the sub-view SHALL render a friendly empty-state message in Traditional Chinese:

- 「目前未答對」 empty: e.g., 「目前還沒有答錯的題目 — 答錯後會自動收進這裡」 or equivalent
- 「歷史曾錯」 empty: e.g., 「目前還沒有歷史錯題紀錄 — 答錯題目後會永久記錄在這裡」 or equivalent
- Filter-active-but-no-matches: e.g., 「沒有符合篩選條件的錯題」 or equivalent

Exact copy is UI polish. The helper banner SHALL still render above the empty state. The secondary sub-tab control SHALL still render (so the player can switch sub-views).

#### Scenario: Empty state renders when no rows match in 「目前未答對」

- **GIVEN** no `questionHistory` row has `lastResult = 'wrong'`
- **WHEN** the player navigates to `/bookmarks?tab=wrong` (defaults to 「目前未答對」 sub-view)
- **THEN** the helper banner SHALL be visible at the top
- **AND** the secondary sub-tab control SHALL be visible
- **AND** a friendly empty-state message SHALL be displayed in the list area
- **AND** no list entries SHALL render
- **AND** the player CAN click the 「歷史曾錯」 sub-tab to switch

#### Scenario: Empty state in 「歷史曾錯」 when no rows have everWrong = true

- **GIVEN** no `questionHistory` row has `everWrong = true`
- **WHEN** the player clicks the 「歷史曾錯」 sub-tab
- **THEN** a friendly empty-state message SHALL be displayed
- **AND** no list entries SHALL render

#### Scenario: Filter-active empty state distinguishes from no-data empty state

- **GIVEN** the player has 3 questions with `lastResult = 'wrong'` all in 內科
- **WHEN** the player selects subject chip `外科` on the 「目前未答對」 sub-view
- **THEN** an empty-state message SHALL be displayed referencing the active filter
- **AND** no list entries SHALL render
