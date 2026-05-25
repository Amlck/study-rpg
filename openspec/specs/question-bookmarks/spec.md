# question-bookmarks Specification

## Purpose

Per-question star/un-star with a `/bookmarks` list view that shows full question content + 詳解 inline, Markdown export for offline note-taking, IDB-first storage with opt-in Supabase mirror via the M4 sync engine. Created by archiving change `add-quiz-question-id-and-bookmark`.
## Requirements
### Requirement: Players SHALL be able to bookmark and un-bookmark questions from QuizModal

The system SHALL provide a bookmark toggle on every `QuizModal` render. Clicking the toggle when the current question is not bookmarked SHALL persist a `BookmarkRow` to the local `bookmarks` Dexie store with `questionId = question.id` and `addedAt = Date.now()`. Clicking the toggle when the current question is already bookmarked SHALL delete the corresponding row from the local store. The toggle SHALL operate synchronously on the local store regardless of authentication state.

#### Scenario: Bookmarking persists a row to IndexedDB

- **GIVEN** the player has no bookmark for question `106-2-醫學三-內科-Q10`
- **WHEN** the player clicks the bookmark toggle in `QuizModal` while that question is displayed
- **THEN** a new row SHALL exist in the `bookmarks` Dexie store with `questionId = "106-2-醫學三-內科-Q10"`
- **AND** `addedAt` SHALL equal `Date.now()` at the moment of the click (within tolerance for test timing)
- **AND** the toggle button SHALL re-render with the filled glyph

#### Scenario: Un-bookmarking deletes the row

- **GIVEN** a bookmark row exists for question `106-2-醫學三-內科-Q10`
- **WHEN** the player clicks the bookmark toggle in `QuizModal` while that question is displayed
- **THEN** the row SHALL be deleted from the `bookmarks` Dexie store
- **AND** the toggle button SHALL re-render with the outline glyph

#### Scenario: Bookmark operations work without authentication

- **GIVEN** the player is not signed in to a Google account
- **WHEN** the player toggles bookmarks during a quiz session
- **THEN** all bookmark mutations SHALL persist to IndexedDB successfully
- **AND** no sync push SHALL be attempted
- **AND** no error SHALL surface to the player

### Requirement: A `/bookmarks` route SHALL list all bookmarked questions with full content inline

The system SHALL expose a `/bookmarks` route accessible from the hospital home page navigation. The route SHALL host a top-level filter bar (per the shared bookmarks-page-filter-bar requirement) followed by a two-tab structure 「手動收藏」 / 「錯題」 — this requirement defines the 「手動收藏」 tab behavior. The 「錯題」 tab is owned by the `wrong-answer-list` capability. Tab state SHALL be controlled via URL query string `?tab=manual` (default — also when the param is absent or invalid) and `?tab=wrong`. Tab clicks SHALL update the query string via `history.replaceState` (no full page reload). Manual bookmark behavior described below is scoped to the 「手動收藏」 tab; navigating between tabs SHALL NOT affect the underlying `bookmarks` Dexie store. The filter bar state SHALL be preserved across tab switches.

The 「手動收藏」 tab SHALL render every row from the local `bookmarks` Dexie store that passes the active filter (per the shared filter bar requirement), sorted by `addedAt` descending (most recent first). Each list entry SHALL display the question identifier verbatim, the full question stem, all four options with their texts, the correct-answer label, and the explanation — without any truncation or "click to expand" interaction. Bookmark entries whose `questionId` is not present in the currently-loaded `questions.json` SHALL render a stub with the identifier and a "題目已不在題庫" notice plus a remove button. Orphan rows SHALL bypass the active filter (always render).

The 「手動收藏」 tab SHALL paginate at **50 rows per page** (after filter application) using the same pager pattern defined for the wrong-answer sub-views (per `wrong-answer-list` capability) — reusing `.filter-bar__pager*` CSS classes. The pager SHALL be hidden when the filtered set fits one page (≤ 50 rows). Filter selection changes SHALL reset the pager to page 1. The Markdown export SHALL export ALL filter-matching rows (across all pages), not just the current page.

The explanation in each list entry SHALL be rendered through the `ExplanationMarkdown` component, applying the same markdown parse + whitelist + sanitization rules defined in the `hospital-quiz` capability. Raw markdown control characters (`###`, `**`, `-`) SHALL NOT appear as literal text in the rendered output. Explanations that are empty, null, or whitespace-only SHALL render the placeholder `「（解析待補）」`.

The Markdown export flow (`匯出 Markdown` button) SHALL remain unchanged in scope but SHALL respect the active filter: when the export button is clicked, the downloaded file SHALL contain ONLY the manual bookmarks visible under the current filter (i.e., the same set of rows being rendered). The exported file SHALL echo the raw `corpus.explanation` source string (NOT the rendered DOM). The export button SHALL be scoped to the 「手動收藏」 tab.

#### Scenario: Bookmarks list renders all bookmarks most-recent-first (no filter)

- **GIVEN** the player has 3 bookmarks with `addedAt` values T1 < T2 < T3
- **AND** no filter is active (both chip groups have empty selection)
- **WHEN** the player navigates to `/bookmarks` (or `/bookmarks?tab=manual`)
- **THEN** the 「手動收藏」 tab SHALL be active
- **AND** the page SHALL render 3 entries
- **AND** the entry with `addedAt = T3` SHALL appear first
- **AND** the entry with `addedAt = T1` SHALL appear last

#### Scenario: Each entry shows full question content inline

- **GIVEN** the player has bookmarked question `106-2-醫學三-內科-Q10`
- **WHEN** the player views `/bookmarks?tab=manual`
- **THEN** the entry SHALL display the literal identifier `106-2-醫學三-內科-Q10`
- **AND** the full question stem SHALL be visible
- **AND** all four option labels (A, B, C, D) and their text SHALL be visible
- **AND** the correct answer label SHALL be visible
- **AND** the explanation text SHALL be visible
- **AND** no further click SHALL be required to reveal any of the above

#### Scenario: Explanation renders markdown structure inline

- **GIVEN** the player has bookmarked a question whose `corpus.explanation` contains `### 選項詳解\n\n**A. ...**\n  - ✗ 錯誤 [P1 夯]\n  - 詳解：...`
- **WHEN** the player views `/bookmarks?tab=manual`
- **THEN** the entry's explanation region SHALL contain at least one `<h3>` element with text content `選項詳解`
- **AND** the explanation region SHALL contain `<strong>` elements wrapping option labels (`A. ...`)
- **AND** the explanation region SHALL contain a `<ul>` element with `<li>` children for the option bullets
- **AND** the literal characters `###`, `**`, and `  - ` (leading dash-space) SHALL NOT appear as visible text in the rendered output

#### Scenario: Empty explanation renders placeholder

- **GIVEN** the player has bookmarked a question whose `corpus.explanation` is `""`, `null`, undefined, or whitespace-only
- **WHEN** the player views `/bookmarks?tab=manual`
- **THEN** the entry's explanation region SHALL display the placeholder text `「（解析待補）」`
- **AND** no error SHALL be thrown
- **AND** no markdown parser SHALL be invoked for that entry

#### Scenario: Tab navigation preserves bookmarks state and filter selection

- **GIVEN** the player is on `/bookmarks?tab=manual` viewing 3 bookmarks
- **AND** the player has selected year chip `109`
- **WHEN** the player clicks the 「錯題」 tab, then clicks back to the 「手動收藏」 tab
- **THEN** the 「手動收藏」 tab SHALL still render the same 3 bookmarks (filtered identically)
- **AND** the year chip `109` SHALL still be selected
- **AND** no Dexie writes SHALL have occurred as a side effect of tab navigation

#### Scenario: Filter narrows 手動收藏 visible list

- **GIVEN** the player has 5 bookmarks: 3 in 內科 (years 108/109/110) and 2 in 外科 (years 109/110)
- **WHEN** the player selects subject chip `內科`
- **THEN** the 「手動收藏」 tab SHALL render exactly 3 entries
- **AND** the 2 外科 entries SHALL be hidden

#### Scenario: Markdown export respects active filter

- **GIVEN** the player has 5 bookmarks
- **AND** the player has selected year chip `109` such that 2 bookmarks are visible
- **WHEN** the player clicks 「匯出 Markdown」
- **THEN** the exported `.md` file SHALL contain exactly 2 sections (the 2 currently-visible 109 年 bookmarks)
- **AND** the exported file SHALL contain the raw `corpus.explanation` string verbatim (with `###`, `**`, `-` characters intact)

#### Scenario: Markdown export with no filter exports all bookmarks

- **GIVEN** the player has 5 bookmarks
- **AND** no filter is active
- **WHEN** the player clicks 「匯出 Markdown」
- **THEN** the exported file SHALL contain all 5 sections in `addedAt` DESC order

#### Scenario: Orphaned bookmark renders stub with remove option and bypasses filter

- **GIVEN** the player has a bookmark for `questionId = "999-9-醫學一-X-Q99"`
- **AND** that identifier is not present in the currently-loaded `questions.json`
- **AND** the player has selected year chip `109`
- **WHEN** the player views `/bookmarks?tab=manual`
- **THEN** the orphan entry SHALL be visible despite no `meta.year` to compare against the filter
- **AND** the entry SHALL display the identifier
- **AND** the entry SHALL display the text `題目已不在題庫`
- **AND** the entry SHALL display a remove-bookmark button
- **AND** the page SHALL NOT throw or crash

#### Scenario: Empty state when no bookmarks exist

- **GIVEN** the `bookmarks` Dexie store contains zero rows
- **WHEN** the player navigates to `/bookmarks?tab=manual`
- **THEN** the page SHALL display the message `還沒有收藏題目。答題時點右上 ⭐ 把題目收藏起來。`
- **AND** no list entries SHALL render
- **AND** the export button SHALL be disabled
- **AND** the 「錯題」 tab SHALL remain available for switching to
- **AND** the filter bar SHALL still render (empty selection)

#### Scenario: Filter active but no rows match — empty state shown

- **GIVEN** the player has 3 bookmarks all in 內科
- **WHEN** the player selects subject chip `外科` (which has zero bookmarks)
- **THEN** the 「手動收藏」 tab list area SHALL render an empty-state message such as 「沒有符合篩選條件的收藏題目」 or equivalent (exact copy is UI polish)
- **AND** no list entries SHALL render
- **AND** the export button MAY be disabled or remain enabled with no-op behavior (exporting 0 rows produces an empty-section file — either acceptable)

### Requirement: Players SHALL be able to remove bookmarks from the list view

The system SHALL render a remove control on every entry in `/bookmarks`. Activating the control SHALL delete the underlying `bookmarks` Dexie row and update the rendered list within the current navigation. A confirmation step SHALL prevent accidental removal.

#### Scenario: Remove control deletes bookmark with confirmation

- **GIVEN** the player has 3 bookmarks visible on `/bookmarks`
- **WHEN** the player clicks the remove control on the entry for question `106-2-醫學三-內科-Q10`
- **AND** confirms the removal in the resulting dialog
- **THEN** the corresponding row SHALL be deleted from the `bookmarks` Dexie store
- **AND** the entry SHALL disappear from the rendered list
- **AND** the list SHALL now display 2 entries

#### Scenario: Cancelling removal preserves bookmark

- **GIVEN** the player has clicked the remove control on a bookmark entry
- **WHEN** the player cancels the confirmation dialog
- **THEN** the bookmark row SHALL remain in the Dexie store
- **AND** the entry SHALL remain in the rendered list

### Requirement: Players SHALL be able to export all bookmarks to a downloadable Markdown file

The system SHALL render an "匯出 Markdown" button on `/bookmarks` whenever at least one bookmark exists. Activating the button SHALL trigger a browser download of a Markdown file named `bookmarks-YYYY-MM-DD.md`. The file SHALL contain a header line with the total count and export timestamp, followed by one section per bookmark in the same order shown in the list view. Each section SHALL include the question identifier as a heading, the full stem, all four options as a bulleted list, the correct answer label, and the explanation. The export SHALL run entirely client-side without any network call.

#### Scenario: Export downloads file with all bookmarks

- **GIVEN** the player has 5 bookmarks
- **WHEN** the player clicks the 「匯出 Markdown」 button
- **THEN** a file named `bookmarks-<today's date in YYYY-MM-DD>.md` SHALL be downloaded by the browser
- **AND** the file content SHALL start with a heading containing the count `5` and the export timestamp
- **AND** the file SHALL contain 5 sections, one per bookmark, in the same order as displayed
- **AND** each section SHALL include the question identifier, stem, options, correct answer, and explanation
- **AND** no network request SHALL be made

#### Scenario: Export button disabled when no bookmarks exist

- **GIVEN** the `bookmarks` Dexie store contains zero rows
- **WHEN** the player views `/bookmarks`
- **THEN** the 「匯出 Markdown」 button SHALL be disabled or not rendered
- **AND** no download SHALL be triggered

### Requirement: Bookmarks SHALL be mirrored to Supabase via the existing M4 sync engine when authenticated

The system SHALL include `bookmarks` in the Dexie sync hook scope so that local writes trigger debounced pushes via the existing M4 sync engine. When the player is signed in, every bookmark mutation SHALL be persisted to the Supabase `question_bookmarks` table via the `upsert_lww` RPC. Conflict resolution SHALL follow the same Last-Write-Wins semantics as other synced tables (`updated_at` newest wins; cloud wins on tie). When the player is not signed in, no push SHALL be attempted and no error SHALL surface.

#### Scenario: Authenticated bookmark write pushes to cloud within debounce window

- **GIVEN** the player is signed in
- **AND** sync is enabled (`VITE_CLOUD_SYNC_ENABLED=true`)
- **WHEN** the player toggles a bookmark on
- **AND** waits 4 seconds without further interaction
- **THEN** a single batched push SHALL occur targeting the `question_bookmarks` table via `upsert_lww`
- **AND** the cloud row SHALL contain matching `question_id`, `added_at`, and `updated_at`

#### Scenario: Bookmark sync round-trip across two devices

- **GIVEN** device A and device B are both signed in to the same account
- **AND** device A bookmarks question `106-2-醫學三-內科-Q10`
- **AND** device A's debounced push completes
- **WHEN** device B's next pull fires (on tab focus, per `cloud-sync` spec)
- **THEN** device B's local `bookmarks` store SHALL contain the same row
- **AND** device B's `/bookmarks` page SHALL display the entry

#### Scenario: Unauthenticated bookmark write does not attempt push

- **GIVEN** the player is not signed in
- **WHEN** the player toggles a bookmark on
- **THEN** no network request to Supabase SHALL be made
- **AND** the local IndexedDB row SHALL persist normally
- **AND** the toggle SHALL succeed without surfacing any error

### Requirement: `/bookmarks` route SHALL render a year × subject multi-select filter bar shared across all sub-tabs

The `/bookmarks` route SHALL render a filter bar positioned above the sub-tab switcher (「手動收藏」 / 「錯題」). The filter bar SHALL contain two independent multi-select chip groups: one for 年份 (year,民國年 e.g. 109/110/111) and one for 科別 (subject — the 14 二階 subjects defined in `packages/content-medexam2-tw`).

The filter bar visual structure SHALL match the existing design language used by `YearFilterBar` (HomePage 年份, at `apps/medexam2-hospital-tw/src/components/YearFilterBar.tsx`) and the rarity filter in `DoctorRoster` (醫師 tab). It SHALL reuse the existing shared CSS classes defined in `apps/medexam2-hospital-tw/src/styles.css`: `.filter-bar`, `.filter-bar__group` (per dimension), `.filter-bar__label` (group label), `.filter-chip-group` (chip cluster), `.filter-chip` with `aria-pressed='true'` (toggle visual), `.filter-bar__count` (right-aligned count badge), and `.filter-bar__pager` / `.filter-bar__pager-btn` / `.filter-bar__pager-indicator` (for year chip pagination).

Filter state SHALL be held as React local state on `BookmarksPage` (NOT persisted to Dexie, NOT persisted to URL query string, NOT shared with the gameplay `services/year-filter.ts` Dexie singleton). State SHALL be shared across all sub-tabs (toggling between 「手動收藏」 / 「錯題」 / 「歷史曾錯」 SHALL preserve the player's filter selection). Page reload SHALL reset to the implicit "no filter" state (both chip groups have empty selection).

The filter bar SHALL provide exactly **one** control button per chip group, labeled 全部. Clicking 全部 SHALL clear that chip group's selection (since empty selection = match-all per the filter combination semantics below). The 全部 button SHALL render with `aria-pressed='true'` styling when the chip group's selection is empty (visually conveying "currently showing all"). No 全不選 nor 反選 buttons SHALL be present — matching the existing design language where both `YearFilterBar` and `DoctorRoster` rarity filter expose only the single 全部 control.

The filter bar SHALL render a `.filter-bar__count` badge right-aligned showing `N / M 題` where N is the number of currently visible rows in the active sub-tab/sub-view and M is the total number of rows before filter (matches DoctorRoster precedent at `DoctorRoster.tsx:114`).

The set of available chips SHALL be derived dynamically. BOTH year and subject chip groups SHALL paginate at 5 chips per page when the chip count exceeds 5:
- **Year chips** = the union of `meta.year` values present in the currently-loaded `questionsById` map (the corpus, NOT only currently-displayed rows). Sorted descending (most recent year first). Paginated via the same PAGES pattern as `YearFilterBar.tsx:10-13` — 5 chips per page, navigable via `‹ ›` pager buttons with a `1/N` indicator. The 全部 button and pager controls SHALL remain visible regardless of active page.
- **Subject chips** = the 14 二階 subjects in their canonical content-pack order. Also paginated at 5 chips per page (3 pages: 5 + 5 + 4). Same pager UI pattern. Independent page state from the year chip group.

Both groups SHALL share the same visual pattern so the `年份` and `科別` labels visually align on the left edge of the filter bar (1 row per dimension).

Filter combination semantics SHALL be: a row matches the active filter if AND ONLY IF its joined `meta.year` ∈ selected years (treating empty year selection as match-all) AND its joined `subject` ∈ selected subjects (treating empty subject selection as match-all). Empty selection on a dimension means that dimension is unfiltered (full set); selecting zero of N chips is equivalent to selecting all N chips for filtering purposes.

Orphan rows (bookmarks or wrong-answer entries whose `questionId` is not in current `questionsById`) SHALL bypass the filter and ALWAYS render with the existing 「題目已不在題庫」 tag, regardless of filter selection. Orphan rows SHALL be counted in both N and M of the count badge.

#### Scenario: Filter bar renders above sub-tab switcher

- **GIVEN** the player navigates to `/bookmarks`
- **WHEN** the page renders
- **THEN** the filter bar SHALL be visible at the top of the page
- **AND** the filter bar SHALL contain a 年份 chip group and a 科別 chip group
- **AND** the sub-tab switcher (「手動收藏」 / 「錯題」) SHALL appear below the filter bar
- **AND** both chip groups SHALL initialize with empty selection (no chips visually pressed)

#### Scenario: Year chip selection narrows the 手動收藏 list

- **GIVEN** the player has bookmarks for question IDs spanning years 108, 109, 110
- **AND** the player is on the 「手動收藏」 tab with no filter active (all 3 bookmarks visible)
- **WHEN** the player clicks the `109` year chip
- **THEN** only the bookmark whose `meta.year === 109` SHALL be visible
- **AND** clicking the `110` year chip additionally SHALL expand the visible set to include the year-110 bookmark
- **AND** the 108-year bookmark SHALL remain hidden

#### Scenario: Subject chip selection combines with year filter as AND

- **GIVEN** the player has 6 bookmarks: 3 in 內科 (years 108, 109, 110), 3 in 外科 (years 108, 109, 110)
- **WHEN** the player selects year chip `109` AND subject chip `內科`
- **THEN** exactly 1 bookmark SHALL be visible — the 109 年 內科 entry
- **AND** the 109 年 外科 entry SHALL be hidden (subject mismatch)
- **AND** the 110 年 內科 entry SHALL be hidden (year mismatch)

#### Scenario: Empty selection on a dimension means no filter on that dimension

- **GIVEN** the player has 6 bookmarks across 內科 and 外科, years 108–110
- **WHEN** the player selects subject chip `內科` (with year chip group empty)
- **THEN** all 3 內科 bookmarks SHALL be visible regardless of year
- **AND** all 3 外科 bookmarks SHALL be hidden

#### Scenario: Filter selection persists across sub-tab switches

- **GIVEN** the player has selected year `109` + subject `內科` on the 「手動收藏」 tab
- **WHEN** the player clicks the 「錯題」 tab
- **THEN** the year chip `109` SHALL remain visually pressed
- **AND** the subject chip `內科` SHALL remain visually pressed
- **AND** the 「錯題」 tab list SHALL respect the same filter

#### Scenario: Page reload resets filter to empty selection

- **GIVEN** the player has selected year `109` + subject `內科`
- **WHEN** the player reloads `/bookmarks` (F5 or direct URL navigation)
- **THEN** both chip groups SHALL render with empty selection
- **AND** the gameplay `YearFilterBar` persisted state SHALL NOT have been read or written

#### Scenario: 全部 button clears chip selection in a group

- **GIVEN** the year chip group has chips `109`, `110`, `111` selected
- **WHEN** the player clicks the 年份 group's 全部 button
- **THEN** all year chips SHALL become unpressed
- **AND** the year filter dimension SHALL be unfiltered (empty selection = match-all)
- **AND** the 全部 button SHALL now render with `aria-pressed='true'` to indicate "showing all"

#### Scenario: 全部 button is visually pressed when no chips selected

- **GIVEN** the year chip group has empty selection (no chips pressed)
- **WHEN** the player views the filter bar
- **THEN** the 年份 group's 全部 button SHALL render with `aria-pressed='true'`
- **AND** all individual year chips SHALL render with `aria-pressed='false'`

#### Scenario: Year chip group paginates when more than 5 chips available

- **GIVEN** the corpus has years `108, 109, 110, 111, 112, 113, 114, 115, 116` (9 years)
- **WHEN** the player views the filter bar
- **THEN** the 年份 chip group SHALL render 5 chips on the visible page (descending: `116, 115, 114, 113, 112` on page 0)
- **AND** the pager indicator SHALL show `1/2`
- **AND** the `‹` button SHALL be disabled (at first page)
- **AND** the `›` button SHALL be enabled

#### Scenario: Pager advances to next page of year chips

- **GIVEN** the year chip group is on page 0 showing `116, 115, 114, 113, 112`
- **WHEN** the player clicks the `›` pager button
- **THEN** the visible chips SHALL update to `111, 110, 109, 108` (page 1, 4 chips)
- **AND** the pager indicator SHALL show `2/2`
- **AND** the `›` button SHALL be disabled (at last page)
- **AND** previously-selected chips on page 0 SHALL retain their pressed state when navigating back

#### Scenario: Subject chip group paginates at 5 per page

- **GIVEN** the 14 二階 subjects are available
- **WHEN** the player views the filter bar
- **THEN** the 科別 chip group SHALL render the first 5 subject chips on page 0
- **AND** the pager indicator SHALL show `1/3` (14 / 5 = 3 pages)
- **AND** the `›` button SHALL be enabled
- **AND** the 年份 and 科別 labels SHALL visually align on the left edge (one row per dimension)

#### Scenario: Subject pagination is independent from year pagination

- **GIVEN** the player has the year chip group on page 0 and the subject chip group on page 2
- **WHEN** the player clicks `›` on the 年份 group
- **THEN** the year group advances to page 1
- **AND** the subject group SHALL remain on page 2 (independent pager state)

#### Scenario: Filter bar count badge shows visible / total

- **GIVEN** the player has 10 bookmarks in 「手動收藏」 tab
- **AND** the player has selected year chip `109` such that 4 bookmarks match
- **WHEN** the player views the filter bar
- **THEN** the `.filter-bar__count` badge SHALL render the text `4 / 10 題`
- **AND** the badge SHALL be right-aligned via existing CSS

#### Scenario: Count badge updates when switching sub-tabs

- **GIVEN** the player has 10 manual bookmarks and 25 wrong-answer entries (no filter active)
- **WHEN** the player is on 「手動收藏」 tab, count SHALL show `10 / 10 題`
- **AND** clicking 「錯題」 tab → 「目前未答對」 sub-view, count SHALL update to reflect that sub-view's row count
- **AND** clicking 「歷史曾錯」 sub-view, count SHALL update again

#### Scenario: Orphan row bypasses filter

- **GIVEN** the player has a bookmark for `questionId = "999-9-X-Q99"` (not in current `questionsById`)
- **AND** the player has selected year chip `109` (filter active)
- **WHEN** the player views `/bookmarks?tab=manual`
- **THEN** the orphan bookmark SHALL still be visible with the existing 「題目已不在題庫」 tag
- **AND** the orphan row SHALL render regardless of filter selection

#### Scenario: Available year chips reflect corpus, not currently-displayed rows

- **GIVEN** the corpus (`questionsById`) contains years 108–116
- **AND** the player has bookmarks only in 109 and 110
- **WHEN** the player views the filter bar
- **THEN** the year chip group SHALL render all 9 chips (108–116)
- **AND** clicking the `116` chip (no bookmark in that year) SHALL produce an empty visible list (filter is functional but matches nothing)

#### Scenario: Filter component does not interact with gameplay year filter

- **GIVEN** the player has set the gameplay `YearFilterBar` to only include years `113` and `114` (via HomePage drill setting)
- **WHEN** the player navigates to `/bookmarks` and selects year chip `109` in the bookmarks filter bar
- **THEN** the gameplay year filter SHALL remain unchanged at `[113, 114]`
- **AND** subsequent quiz draws SHALL still draw from years 113 and 114 only
- **AND** the bookmarks display SHALL be scoped to year 109

