## 1. Core engine — Dexie schema v17 + everWrong write

- [x] 1.1 Read current `apps/medexam2-hospital-tw/src/db/schema.ts` and `packages/core/src/lib/db.ts` to locate the active Dexie version (expecting v16 from `add-hospital-equipment-medexam2`); confirm no other in-flight change is also bumping the version
- [x] 1.2 Add Dexie schema version 17 upgrade with `everWrong: boolean` column on `questionHistory` table (default `false`); add single-column index on `everWrong`
- [x] 1.3 Extend the `QuestionHistoryRow` TypeScript type in `apps/medexam2-hospital-tw/src/db/schema.ts` (or wherever the row interface lives) to include `everWrong: boolean`
- [x] 1.4 Update `packages/core/src/lib/mastery.ts` `recordWrongAnswer` to set `everWrong = true` on the upserted row (idempotent — no-op if already `true`)
- [x] 1.5 Extend `packages/core/src/lib/mastery.ts` `recordCorrectAnswer` signature: accept an opts param `{ onTransitionToCorrect?: (questionId) => void }`; after committing the Dexie write, if previous `lastResult === 'wrong'`, invoke `opts.onTransitionToCorrect?.(questionId)` (Decision 6 — callback-required API pattern, replaces earlier return-value approach)
- [x] 1.6 Verify all callers of `recordCorrectAnswer` (grep across `apps/medexam2-hospital-tw/src/` and `packages/core/`) for usage — at minimum: `QuizModal` answer handler, `MockExamPage` submission, `MentorPage` daily, `services/er-consultation.ts`; identify any other call sites; document the list in PR description so future PRs adding new call sites can be spot-checked
- [x] 1.7 Verify `packages/core/` is content-agnostic — the new `everWrong` field and `onTransitionToCorrect` callback MUST NOT reference any 二階-specific concept (callback just takes `QuestionId`; toast emission is in app-layer module)

## 2. R2 m2 bundle schema_version bump + monotonic-OR merge for `everWrong`

- [x] 2.1 Read `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts` and identify the m2 bundle schema_version constant (currently `SCHEMA_VERSION = 1` at line 14)
- [x] 2.2 Bump m2 bundle `SCHEMA_VERSION` constant 1 → 2 in `bundles.ts`
- [x] 2.3 Update the m2 bundle's `questionHistory` TableAdapter `snapshotAll` to pass through `everWrong` field on serialize
- [x] 2.4 Update the m2 bundle's `questionHistory` TableAdapter `applyToLocal` to implement **monotonic-OR merge** for `everWrong` (NOT standard LWW): after the existing LWW resolution determines the row winner for other fields, set `finalRow.everWrong = (existing?.everWrong === true) || (incoming.everWrong === true)`. All other fields continue to follow standard LWW (Decision 8 update — neutralizes v1↔v2 race documented in Risks)
- [x] 2.5 Default missing `everWrong` (from v1 bundles or rows that pre-date migration) to `false` on deserialize — but ensure step 2.4's OR semantics treat `undefined`/`false` identically (both lose to local `true`)
- [x] 2.6 Add inline doc comment in `applyToLocal` explicitly calling out: «`everWrong` uses monotonic-OR (NOT LWW) to neutralize v1↔v2 sync race; once any client sets true, no subsequent write — regardless of `updated_at` ordering — can clear it» (so future maintainers don't 'fix' this thinking it's a bug)
- [x] 2.7 Manual test (Chrome MCP): sign in fresh → answer Q wrong → verify R2 push contains `schema_version: 2` and the row has `everWrong: true` (decode via `gunzip` of presigned-URL fetch or `globalThis.__sync` debug handle)
- [x] 2.8 Cross-version race smoke (Chrome MCP, two profiles): Profile A (v17) sets Q's `everWrong = true` and pushes; Profile B (simulated v1 — temp local schema downgrade or manual blob edit) writes the same row with `everWrong` absent and newer `updated_at`; Profile A pulls → verify final local state has `everWrong = true` preserved (monotonic-OR worked) and other fields followed LWW

## 3. Grace toast — module + emission

- [x] 3.1 Create new module `apps/medexam2-hospital-tw/src/lib/grace-toast.ts` exporting: `emitGraceToast(payload: { questionId, questionTitle? }): void`, `useGraceToasts(): Toast[]` React hook, `dismissGraceToast(id)`, `bookmarkFromGraceToast(questionId)` (wraps existing `toggleBookmark`)
- [x] 3.2 Implement toast queue with in-memory `Set<Toast>` + 10-second auto-dismiss timer; max-visible cap = 3, additional toasts queued
- [x] 3.3 Implement `GraceToastContainer` React component (fixed-position bottom-right corner, stacked vertically); render via portal at App root level
- [x] 3.4 Wire `GraceToastContainer` into `App.tsx` root render
- [x] 3.5 Write copy: 「{question identifier} 已答對，從「目前未答對」移除（10 秒內可加星）」 with explicit ⭐ + ✕ buttons
- [x] 3.6 Wire emission into `QuizModal` answer-correct path: pass `{ onTransitionToCorrect: (qid) => emitGraceToast({ questionId: qid }) }` to `recordCorrectAnswer` opts
- [x] 3.7 Wire emission into `MockExamPage` submission path: same opts wiring (per-question correct-answer transition handled inside the loop)
- [x] 3.8 Wire emission into `MentorPage` daily answer path: same opts wiring
- [x] 3.9 Wire emission into `services/er-consultation.ts` (and any other call site found in 1.6) correct-answer path: same opts wiring
- [x] 3.10 Verify the sync apply path in `tables.ts` for `questionHistory` does NOT call `recordCorrectAnswer` (it writes Dexie directly via `db.questionHistory.put`); confirm toasts cannot fire on sync apply because no callback is ever invoked through that path
- [x] 3.11 Document the «every call site of `recordCorrectAnswer` MUST pass `onTransitionToCorrect`» rule in inline doc on `recordCorrectAnswer` JSDoc and in PR description; this is the regression防線 per Decision 6
- [x] 3.12 Manual test (Chrome MCP): in QuizModal, answer Q wrong → answer same Q correct → verify toast appears with ⭐ button → click ⭐ → verify `bookmarks` table has new row for Q → toast dismisses

## 4. Filter bar component (visually mirrors `YearFilterBar` + `DoctorRoster` rarity filter)

- [x] 4.1 Create new component `apps/medexam2-hospital-tw/src/components/BookmarkFilterBar.tsx` accepting props: `availableYears: number[]`, `availableSubjects: SubjectId[]`, `selectedYears: Set<number>`, `selectedSubjects: Set<SubjectId>`, `onYearsChange`, `onSubjectsChange`, `visibleCount: number`, `totalCount: number`
- [x] 4.2 Render structure: outer `.filter-bar` container with two `.filter-bar__group` children (年份 + 科別) and one `.filter-bar__count` element right-aligned showing `{visibleCount} / {totalCount} 題`. Mirror layout of `YearFilterBar.tsx:33-91` and `DoctorRoster.tsx:79-117`
- [x] 4.3 Each group has structure: `.filter-bar__label` (年份 / 科別) + `.filter-chip-group` (chip cluster with 全部 button + individual chips); use `filter-chip` class with `aria-pressed` toggle
- [x] 4.4 Single 全部 button per group only — clicking clears that group's chip selection (empty = match-all per spec). When selection is empty, 全部 button SHALL render with `aria-pressed='true'`. NO 全不選 / 反選 buttons (matches existing design language)
- [x] 4.5 Year chips: sort descending, paginate via PAGES pattern from `YearFilterBar.tsx:10-13` (5 chips/page); render `.filter-bar__pager` controls (`‹` button + `1/N` indicator + `›` button) using `.filter-bar__pager-btn` class. Pager state = `useState<number>(0)` local to BookmarkFilterBar
- [x] 4.6 Subject chips: render in canonical content-pack order, paginate 5/page (independent pager state from year chips) — per 2026-05-25 dogfood iteration, keeps 「年份」/「科別」 labels visually aligned on left edge (1 row per dimension)
- [x] 4.7 Year chip display format = plain numeric (matches `YearFilterBar.tsx:54` rendering `{year}` without 「年」 suffix)
- [x] 4.8 Component MUST NOT import or call `services/year-filter.ts` — filter is local state, not the gameplay year filter
- [x] 4.9 Add ARIA labels matching existing `YearFilterBar` convention (`aria-pressed` per chip, `role="group"` per chip group, `aria-label` on outer `.filter-bar`)
- [x] 4.10 Responsive smoke (< 768 px viewport): subject chips wrap onto 2-3 rows; year chip pagination still functions; count badge stays right-aligned

## 5. BookmarksPage — wire filter bar + sub-tab + filter logic

- [x] 5.1 Read current `apps/medexam2-hospital-tw/src/pages/BookmarksPage.tsx` to map existing structure (tab switcher, manual/wrong tab bodies, questionsById join)
- [x] 5.2 Lift filter state into `BookmarksPage`: `useState<{ years: Set<number>, subjects: Set<SubjectId> }>({ years: new Set(), subjects: new Set() })`
- [x] 5.3 Compute `availableYears` from `Object.values(questionsById).map(q => q.meta?.year)` filtering non-numbers, deduplicated, sorted DESC
- [x] 5.4 Compute `availableSubjects` from the 二階 content pack's canonical subject list (read from `packages/content-medexam2-tw` exports or similar source of truth)
- [x] 5.5 Render `<BookmarkFilterBar />` above the existing tab switcher; wire selected state + callbacks; pass `visibleCount` (post-filter row count for active sub-tab/sub-view) + `totalCount` (pre-filter total) for the count badge
- [x] 5.6 Implement `matchesFilter(questionId)` helper: orphan rows always pass; otherwise join `questionsById[questionId]` → check year ∈ selected (or empty selected) AND subject ∈ selected (or empty selected)
- [x] 5.7 Apply `matchesFilter` to the 手動收藏 tab rendering (filter the `bookmarks` rows before map); compute counts via `useMemo`
- [x] 5.8 Apply `matchesFilter` to the markdown export — exporter takes the filtered set, not all bookmarks
- [x] 5.9 Update the empty-state copy to distinguish "no bookmarks at all" vs "filter active but no matches" (per spec scenario)
- [x] 5.10 Count badge SHALL update when switching tabs / sub-views — re-compute on each tab/sub-view render
- [x] 5.11 Add 50-row pagination to 「手動收藏」 tab: slice the filtered + sorted bookmarks array; render `.filter-bar__pager*` controls below the list when total > 50; pager state = `useState<number>(0)` per tab; hide pager when total ≤ 50
- [x] 5.12 Pager state resets to page 0 when filter selection changes (use `useEffect` watching the filter Set identities)
- [x] 5.13 Markdown export still exports ALL filter-matching rows (across all pages), NOT just the current page — verify export reads the pre-pagination filtered set

## 6. Wrong-answer sub-tabs

- [x] 6.1 Read current `apps/medexam2-hospital-tw/src/hooks/wrong-answers.ts` to understand the live query pattern
- [x] 6.2 Add new hook `useWrongAnswerHistory(): WrongAnswerHistoryRow[]` that returns `questionHistory` rows where `everWrong === true` ORDER BY `lastAnsweredAt` DESC, joined with bookmarks membership flag (mirror existing wrong-answers hook structure)
- [x] 6.3 In `BookmarksPage.tsx`, when `?tab=wrong` is active, render a secondary sub-tab control with 「目前未答對」 (default) / 「歷史曾錯」 inside the existing 錯題 tab body
- [x] 6.4 Sub-tab state = local React state on a child component (no URL param change)
- [x] 6.5 「目前未答對」 sub-view renders existing wrong-answers query results + applies `matchesFilter`
- [x] 6.6 「歷史曾錯」 sub-view renders `useWrongAnswerHistory()` results + applies `matchesFilter`
- [x] 6.7 Add state chip to each 「歷史曾錯」 entry: `🔴 仍未答對` if `lastResult === 'wrong'`, `✅ 已答對 N 次` if `lastResult === 'correct'` (N = `correctCount`)
- [x] 6.8 ★ promote toggle works on both sub-views — reuse existing `PromoteStar` component (verify behavior is identical regardless of source sub-view)
- [x] 6.9 Orphan rows in 「歷史曾錯」 render the same 「題目已不在題庫」 stub as orphan rows in 「目前未答對」
- [x] 6.10 Update the 「錯題」 helper banner copy to explain (a) both sub-views (b) the grace toast mechanism (c) ★ promotion to 「手動收藏」 (d) **the migration-gap note: 「歷史曾錯」 紀錄從升級當下開始累積；之前的錯題會在下次答到時自動補上紀錄**
- [x] 6.11 Add 50-row pagination to BOTH 「目前未答對」 and 「歷史曾錯」 sub-views: slice filtered + sorted array; render `.filter-bar__pager*` controls below each sub-view's list; per-sub-view pager state = `useState<number>(0)` (independent per sub-view); hide pager when total ≤ 50
- [x] 6.12 Pager state resets to page 0 when filter selection changes OR when sub-view changes — verify with `useEffect` deps

## 7. Empty states

- [x] 7.1 「目前未答對」 sub-view empty state copy: 「目前還沒有答錯的題目 — 答錯後會自動收進這裡」 (refine in apply)
- [x] 7.2 「歷史曾錯」 sub-view empty state copy: 「目前還沒有歷史錯題紀錄 — 答錯題目後會永久記錄在這裡」
- [x] 7.3 Filter-active-but-no-matches copy for any sub-view: 「沒有符合篩選條件的題目」 (distinguishes from no-data)
- [x] 7.4 Verify helper banner + sub-tab control still render even when list is empty

## 8. CSS + visual polish

- [x] 8.1 Verify all `.filter-bar*` / `.filter-chip*` classes from `apps/medexam2-hospital-tw/src/styles.css:838-953` are reused as-is (no new filter-bar styles should be needed since shared design system already exists)
- [x] 8.2 Verify `BookmarkFilterBar` renders pixel-identical to `YearFilterBar` (HomePage) and `DoctorRoster` rarity filter section — side-by-side visual diff on dev server
- [x] 8.3 Add state chip styles for 「歷史曾錯」 entries (`🔴` / `✅` color tokens align with project pixel palette) — new CSS, scope under `.wrong-answer-entry` or similar
- [x] 8.4 Add grace toast styles (bottom-right fixed, slide-in animation, max-width on narrow viewports) — new CSS
- [x] 8.5 Verify filter bar wrap behavior on mobile (< 768 px viewport): subject chips wrap to multiple rows; year pagination still works; count badge stays right-aligned
- [x] 8.6 Verify dark/light theme parity if applicable (project uses CSS variables per CLAUDE.md)

## 9. Cross-device + sync verification

- [x] 9.1 Manual test (two Chrome profiles or Chrome MCP + incognito): Device A answers Q wrong → push → Device B pulls → verify Device B's 「目前未答對」 and 「歷史曾錯」 both contain Q
- [x] 9.2 Manual test: Device B answers Q correctly → push → Device A pulls → verify Device A's 「目前未答對」 no longer contains Q, 「歷史曾錯」 still contains Q with `✅` chip
- [x] 9.3 Manual test: Verify NO grace toast fires on Device A during step 9.2 (sync apply path, not local quiz)
- [x] 9.4 Manual test: Verify Performance API (per CLAUDE.md `read_network_requests` gotcha) confirms R2 PUT happened with v2 schema_version payload
- [x] 9.5 Edge case: Sign-out → sign-in flow → verify v17 schema is applied on first authed open of a previously-existing local DB

## 10. Migration + backward compat verification

- [x] 10.1 Simulate v16 → v17 upgrade: load a save with pre-existing `questionHistory` rows (`lastResult === 'wrong'`); confirm rows survive migration with `everWrong = false` default; confirm 「目前未答對」 still shows them
- [x] 10.2 Simulate v17 client receiving v1 m2 bundle from older device (decode via `globalThis.__sync.pullNow()` after manually downgrading bundle in R2): confirm rows apply with `everWrong = false`
- [x] 10.3 Simulate v1 client receiving v2 bundle: spot-check older device deploy (or skip if no v1 device available; covered by code review of `apply` function tolerating extra fields)
- [x] 10.4 Confirm v17 typecheck clean: `pnpm -r typecheck`

## 11. Core unit tests (Vitest) — safety net for non-UI logic

These 10 tests are the regression safety net. UI scenarios stay in §11.x Chrome MCP smoke. Test files SHALL live at `packages/core/src/lib/mastery.test.ts` and `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.test.ts` (mirroring co-location convention).

- [x] 11.A.1 `recordWrongAnswer` writes row with `everWrong: true` (pure-function Dexie write)
- [x] 11.A.2 `recordWrongAnswer` idempotent: calling twice on a row with `everWrong: true` leaves it `true` (no flap)
- [x] 11.A.3 `recordCorrectAnswer` does NOT modify `everWrong` (call on a row with `everWrong: true`, assert post-state still `true`)
- [x] 11.A.4 `recordCorrectAnswer` invokes `onTransitionToCorrect` callback exactly once when previous `lastResult === 'wrong'`
- [x] 11.A.5 `recordCorrectAnswer` does NOT invoke `onTransitionToCorrect` when previous `lastResult === 'correct'` (no spurious toast)
- [x] 11.A.6 `matchesFilter`: empty year + empty subject Sets → every row passes
- [x] 11.A.7 `matchesFilter`: both filters active → AND combination (row passes ONLY if year ∈ selected AND subject ∈ selected)
- [x] 11.A.8 `matchesFilter`: orphan row (no entry in `questionsById`) always passes regardless of filter selection
- [x] 11.A.9 m2 bundle adapter `snapshot → gzip → gunzip → applyToLocal` round-trip preserves `everWrong: true`
- [x] 11.A.10 m2 bundle adapter monotonic-OR merge: local `{ everWrong: true, lastAnsweredAt: T_old }` + incoming `{ everWrong: undefined, lastAnsweredAt: T_new }` (T_new > T_old) → final row has `everWrong: true` (preserved despite incoming winning LWW for other fields)

## 12. Verification + handoff

- [x] 12.1 Run `pnpm --filter @study-rpg/core build` (cold checkout discipline per CLAUDE.md monorepo dist staleness rule)
- [x] 12.2 Run `pnpm -r typecheck` — all clean
- [x] 12.3 Run `pnpm -r test` (Vitest) — verify the 10 core unit tests from §11 all pass
- [x] 12.4 Run Chrome MCP three-tier SPA route smoke (in-app nav + direct URL `/bookmarks?tab=wrong` + F5 on `/bookmarks?tab=wrong`)
- [x] 12.5 Verify Chrome MCP `read_console_messages` shows no error on:
  - filter chip clicks
  - sub-tab switches
  - pager controls clicks
  - grace toast emit + dismiss + ⭐ action
  - empty-state renders
- [x] 12.6 Run `/opsx:verify` for the change (completeness / correctness / coherence pass)
- [x] 12.7 Update CLAUDE.md if needed: bumped Dexie version (v17), m2 bundle schema_version (2), new `BookmarkFilterBar` component, new `lib/grace-toast.ts` module, `everWrong` monotonic-OR merge convention
- [ ] 12.8 Stage explicit files (no `git add -A` per multi-agent git safety) and commit when user confirms
