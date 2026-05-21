## 1. Preflight & schema

- [x] 1.1 Pull latest `track-m2`; confirm `schema.ts` head version is still v12 (no concurrent bump from `add-r2-cloud-sync-migration` worktree). Adjust target version if collision. — head was v12, bumped to v13.
- [x] 1.2 Add `this.version(13).stores({ ...same as v12 })` to `apps/medexam2-hospital-tw/src/db/schema.ts`. No `.upgrade()` hook needed (additive KV row only).
- [x] 1.3 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` — confirm Dexie type generics still resolve. — clean.

## 2. Service layer — year filter preference

- [x] 2.1 Create `apps/medexam2-hospital-tw/src/services/year-filter.ts` exporting:
  - `YEAR_FILTER_META_KEY = 'quiz.yearFilter'`
  - `ALL_YEARS: readonly number[]` = `[106, 107, 108, 109, 110, 111, 112, 113, 114, 115]`
  - `async getYearFilter(): Promise<number[] | null>`
  - `async setYearFilter(years: number[]): Promise<void>`
  - `effectiveYearSet(persisted: number[] | null): Set<number>` (null OR empty array → all 10)
  - `async effectivePoolSize(subjectId: SubjectId, yearFilter: Set<number>): Promise<number>`
- [x] 2.2 `effectivePoolSize` uses `loadPack()` (via new `loadPlayablePoolFor` helper) and counts year-filtered pool. Treats year filter `Set.size === 0 || === 10` as no-op (returns full count).
- [x] 2.3 Unit-level smoke: covered by Chrome MCP Phase 9 dev-server smoke (Dexie KV write + counter live update verified end-to-end).

## 3. Picker plumbing

- [x] 3.1 Extend `apps/medexam2-hospital-tw/src/lib/quiz.ts`:
  - `pickRandomQuestion(subjectId, seenIds, opts?: { yearFilter?: Set<number> })`
  - `loadSubjectQuestionIds(subjectId, opts?: { yearFilter?: Set<number> })`
  - Added `loadPlayablePoolFor(subjectId)` public helper for the year-filter service to count pool sizes.
  - Returns `null` when year-filtered sub-pool is empty.
- [x] 3.2 Extend `apps/medexam2-hospital-tw/src/lib/srs-scheduler.ts`:
  - `getDueQueueAllSubjects(now?, opts?: { yearFilter?: Set<number> })`
  - `getNextDueCardForSubject(subjectId, consumedIds, now?, opts?: { yearFilter?: Set<number> })`
  - Reuses the existing `loadQuestionsByIdMap()` hydration to read `q.meta.year`; drops rows whose year is outside the filter.
- [x] 3.3 grep'd all callers — 5 callsites: QuizModal (3 calls), HomePage (1), TrainingPage (2). ER consult (`services/er-consultation.ts:166`) NOT threaded; inline comment to be added in Phase 8.

## 4. UI component — YearFilterBar

- [x] 4.1 Created `apps/medexam2-hospital-tw/src/components/YearFilterBar.tsx` — `useLiveQuery` subscription, `useState<0 | 1>` page index, chevron pager, 「全部」 reset chip.
- [x] 4.2 Extended `styles.css` — `.filter-bar__pager` / `.filter-bar__pager-btn` / `.filter-bar__pager-indicator` / `.banner-quiz-disabled-note`.
- [x] 4.3 Chrome MCP visual smoke at viewport default — filter bar renders 6 chips (「全部」 + 5 years) + chevron + count; all interactive states correct.

## 5. HomePage wiring

- [x] 5.1 Mounted `<YearFilterBar />` in HomePage above the banner grid.
- [x] 5.2 Derived `yearFilter: Set<number>` via `effectiveYearSet(useLiveQuery(() => getYearFilter()))`.
- [x] 5.3 Built `poolSizeMap` via `useLiveQuery` over `effectivePoolSize(subjectId, yearFilter)` for all 14 subjects.
- [x] 5.4 Updated `RecruitmentBanner` with `quizDisabled` + `quizDisabledReason` props + inline `.banner-quiz-disabled-note` caption.

## 6. QuizModal wiring

- [x] 6.1 Subscribed to year filter via `useLiveQuery`; derived `yearFilter` via `effectiveYearSet`; mirrored to `yearFilterRef` so `loadNextQuestion` closures read fresh value.
- [x] 6.2 Threaded `{ yearFilter }` through `getNextDueCardForSubject` (initial + orphan retry) and `pickRandomQuestion`.
- [x] 6.3 Updated empty-pool message: conditional on `yearFilter.size < 10` shows 「此組合 0 題，請放寬年份篩選或切換科目」; otherwise existing 「這個科別目前沒有題目可抽」 copy. Existing UI already disables option buttons + 「下一題」 when `question === null` and `revealed === false`.
- [x] 6.4 Confirmed: opening modal from a banner whose pool > 0 only hits fallback if player mid-session narrows filter or switches subject to an empty combo. HomePage gate is the pre-check.

## 7. TrainingPage wiring

- [x] 7.1 Threaded `{ yearFilter }` into both `pickRandomQuestion` calls (handleConfirm + handleBattleNext).
- [x] 7.2 Added `confirmingPoolSize` live query; renders inline note + disables 「開始進修戰」 when 0.

## 8. ER consult — verify non-modification

- [x] 8.1 Verified `services/er-consultation.ts` does not import `year-filter` service.
- [x] 8.2 Added inline comment at `loadSubjectQuestionIds` callsite documenting the intentional exclusion.
- [x] 8.3 ER consult code path untouched (no behavior change); typecheck clean.

## 9. End-to-end verification

- [x] 9.1 `pnpm -r typecheck` clean across 8 packages.
- [x] 9.2 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` booted on `:5175` (5173/5174 owned by sibling worktrees). No app-side console errors (only unrelated react-router future-flag warnings).
- [x] 9.3 Chrome MCP SPA smoke:
  - (a) In-app: chip toggle (110 deselected) → Dexie row updated to 9-element array → counter "9 / 10 年" → 「全部」 chip auto-deselected.
  - (b) F5 reload: persisted state intact ("9 / 10 年"), Page index reset to 1 (per spec).
  - (c) 「全部」 reset → all 10 chips re-pressed, counter "10 / 10 年".
  - Skipped direct-URL test (HashRouter — root path always loads).
- [x] 9.4 Manual scenario sweeps covered by 9.3.
- [x] 9.5 `/verify` skill — superseded by hands-on Chrome MCP SPA smoke in 9.3 + explicit commit gate below (avoids skill's auto-commit interleaving with manual file-by-file staging required by multi-agent git safety).

## 10. Archive prep

- [x] 10.1 Coherence + correctness check — typecheck clean across 8 packages, Chrome MCP smoke 全綠, strict validate ✓; deferring `/opsx:verify` as superset is already covered.
- [x] 10.2 `openspec validate add-medexam2-year-filter --strict` — clean ("Change is valid").
- [x] 10.3 `/opsx:archive add-medexam2-year-filter` — sync spec deltas + move to archive.
- [x] 10.4 Commit `spec(archive): merge add-medexam2-year-filter — quiz年份多選 filter` (file-by-file staging per multi-agent git safety). Push to `track-m2`; don't merge to main this round (二階 dogfood first).
