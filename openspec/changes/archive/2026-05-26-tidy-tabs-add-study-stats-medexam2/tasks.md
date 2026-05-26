## 1. Preflight & schema bump

- [x] 1.1 Verify Dexie v17 is the current latest claim (grep `version(17).stores` in `apps/medexam2-hospital-tw/src/lib/db/schema.ts` and confirm no other in-flight change is also claiming v18)
- [x] 1.2 Confirm R2 m2 bundle `SCHEMA_VERSION = 2` currently in `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts` and identify the constant export name
- [x] 1.3 Snapshot the working tree (`git status` clean of unrelated edits; pre-existing `meta.json` modification + `supabase/functions/` untracked OK — note them for diff-hygiene baseline)

## 2. New capability — daily-study-log Dexie table

- [x] 2.1 Add Dexie `version(18).stores({ dailyStudyLog: '&date, updatedAt' })` to `schema.ts`; do NOT add upgrade callback (additive only, no backfill)
- [x] 2.2 Define and export `DailyStudyLogRow` type `{ date: string; minutesAdded: number; updatedAt: number }` from `schema.ts` (or appropriate types file)
- [x] 2.3 Add helper `formatYMD(date: Date): string` (local timezone `YYYY-MM-DD`) to `apps/medexam2-hospital-tw/src/lib/util/date.ts` (new file) or co-locate with tick.ts
- [x] 2.4 Add Vitest `apps/medexam2-hospital-tw/src/__tests__/daily-study-log.test.ts` covering: fresh table empty / upsert creates row / second same-day upsert accumulates / midnight crossing creates new row
- [x] 2.5 Run `pnpm --filter @study-rpg/medexam2-hospital-tw test` and confirm new tests pass

## 3. Tick hook integration

- [x] 3.1 In `apps/medexam2-hospital-tw/src/lib/tick.ts`, locate the function that credits `monotonicCounters.totalStudyMinutes` (likely `applyTick` or similar)
- [x] 3.2 Inside the same `db.transaction('rw', ...)` block, add `dailyStudyLog.put(...)` upsert keyed by `formatYMD(new Date())`, accumulating `minutesAdded`
- [x] 3.3 Add a Vitest case that runs two `applyTick` calls and asserts both `monotonicCounters.totalStudyMinutes` and `dailyStudyLog` are updated atomically (e.g., simulate transaction rollback by throwing mid-tx and confirm neither write persists)
- [x] 3.4 Verify `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` passes

## 4. R2 sync — bundle schema_version bump 2 → 3

- [x] 4.1 In `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts`, bump `SCHEMA_VERSION` from `2` to `3` (actual constant name is `SCHEMA_VERSION`, not `M2_BUNDLE_SCHEMA_VERSION` as the task assumed)
- [x] 4.2 ~~Extend M2Bundle type to include optional dailyStudyLog~~ — bundle structure is generic `data: Record<string, RowPayload[]>` keyed by `adapter.postgresTable`; new adapter automatically adds new key; no type extension required
- [x] 4.3 ~~Update bundle serialization~~ — generic adapter pattern handles this via `M2_ADAPTERS` iteration; `snapshotAll` on DAILY_STUDY_LOG covers it
- [x] 4.4 ~~Update bundle deserialization~~ — generic adapter pattern: `applyBundleSnapshot` falls back to `[]` when `snapshot.data[adapter.postgresTable]` is absent (existing code on bundles.ts:96)
- [x] 4.5 Add new `DAILY_STUDY_LOG` TableAdapter in `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` with row-level LWW `applyToLocal` (compare `incoming.updatedAt > local?.updatedAt`)
- [x] 4.6 Register `DAILY_STUDY_LOG` in `M2_ADAPTERS` array (R2-only path, mirror `LEADERBOARD_PROFILE` and `ACHIEVEMENTS` precedent — no Supabase `upsert_lww` whitelist entry)
- [x] 4.7 Add Vitest `apps/medexam2-hospital-tw/src/__tests__/daily-study-log-bundle.test.ts` covering: v3 round-trip / v2-read-by-v3 defaults to [] / v3-read-by-v2 drops unknown field / LWW resolves cross-device conflict
- [x] 4.8 Run typecheck + test suite; confirm green

## 5. NavBar reorder + /training redirect

- [x] 5.1 Edit `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` lines around L149-L170: remove the `/training` `<Link>`; reorder remaining links to: 唸書 / 醫院 / 醫師 / 命運 / 成就 / 排名 / 收藏
- [x] 5.2 In `apps/medexam2-hospital-tw/src/App.tsx` route table, change `/training` `element` to `<Navigate to="/roster?tab=training" replace />` (verify react-router v6 `Navigate` import); removed unused TrainingPage import
- [x] 5.3 Search codebase for any other `<Link to="/training">` references; update if appropriate — none found (only HomePage had one)
- [x] 5.4 Smoke-check typecheck

## 6. Doctor page sub-tab container

- [x] 6.1 Locate the component rendered at `/roster` (currently `DoctorRoster.tsx`); identify its top-level JSX structure
- [x] 6.2 Refactor: extract existing roster content into `DoctorRosterPanel.tsx`; rewrite `DoctorRoster.tsx` as sub-tab container
- [x] 6.3 Extract training panel content from `apps/medexam2-hospital-tw/src/pages/TrainingPage.tsx` into `TrainingPanel.tsx`; delete now-orphan `TrainingPage.tsx`
- [x] 6.4 Implement sub-tab container in `DoctorRoster.tsx` using `useSearchParams()` to read/write `?tab=roster|training`; default `roster` when param absent
- [x] 6.5 Add a sub-tab navigation rendering 醫師名冊 + 進修 buttons with `aria-pressed` / `aria-selected` for active state; styled via new `.doctor-tabs` CSS mirror of `.bookmarks-tabs`
- [x] 6.6 Smoke-check typecheck

## 7. Active-battle confirm guard

- [x] 7.1 In `TrainingPanel.tsx`, expose `onActiveBattleChange` prop (callback rather than hook) — `useEffect` fires it whenever `trainingBattle !== null` toggles + on unmount cleanup
- [x] 7.2 In sub-tab container, intercept sub-tab button click: if attempting to leave training while `battleActive === true`, call `window.confirm('進修戰鬥進行中，切換會放棄當前戰鬥。確定？')`; only proceed on confirm
- [ ] 7.3 Test manually in dev: start P3→P2 training, click 醫師名冊 mid-animation → confirm dialog appears; cancel → stays on training; confirm → switches
- [ ] 7.4 Test edge case: idle training panel (no active battle) → click 醫師名冊 → switches immediately without dialog

## 8. AchievementsPage stats sub-tab

- [x] 8.1 In `apps/medexam2-hospital-tw/src/pages/AchievementsPage.tsx`, extend sub-tab state from `'main' | 'subject'` to `'main' | 'subject' | 'stats'`
- [x] 8.2 Add 統計 button to existing sub-tab selector; default `main` unchanged
- [x] 8.3 Conditional render: when `subTab === 'stats'`, hide existing 3 filter dropdowns + achievement list; render new `<StatsPanel />`
- [x] 8.4 Create `apps/medexam2-hospital-tw/src/components/StatsPanel.tsx` (no props — reads Dexie directly via useLiveQuery)

## 9. StatsPanel — data layer

- [x] 9.1 In `StatsPanel.tsx`, use `useLiveQuery` to subscribe `dailyStudyLog` / `questionHistory` / `monotonicCounters` (auto re-renders on writes)
- [x] 9.2 Implement `aggregateStudyMinutes(rows, bounds)` → `Array<{date, value}>` with empty-day zero fill (exported for unit tests)
- [x] 9.3 Implement `aggregateCorrectAnswers(rows, bounds, subjectFilter)` → `Array<{date, value}>` with `lastResult==='correct'` + subject filter + empty-day zero fill (exported)
- [x] 9.4 Use `useMemo` to recompute aggregations when range or subjectFilter change
- [x] 9.5 Compute `residualMinutes = max(0, totalStudyMinutes − sum(dailyStudyLog.minutesAdded))` for summary chip

## 10. StatsPanel — UI (range chip + subject filter + charts + summary chip)

- [x] 10.1 Render range chip selector with 4 options: `7 天 / 30 天 / 90 天 / 全部`; default `30 天`; single-select React state
- [x] 10.2 Render subject filter using existing `BookmarkFilterBar` with `years=[]` (year section hides via small conditional added in same change), `subjects=ALL_SUBJECT_IDS`, controlled `selectedSubjects` state; add caption «分科 filter 僅影響下方圖表（答對題數）»
- [x] 10.3 Implement hand-written SVG bar chart component `BarChart` (~110 LOC), inputs `{date, value}[]`, auto Y scale, tooltip via `<title>` SVG element, Y-axis 2 ticks (max + mid), X-axis first/last date label
- [x] 10.4 Render two `BarChart` instances stacked vertically: top = study minutes (no subject filter), bottom = correct answers (with subject filter)
- [x] 10.5 Render summary chip above charts: «升級前累積 {residualMinutes} 分鐘 (無法分日顯示)»; hide when residualMinutes === 0
- [x] 10.6 Render helper banner for empty-state: «還沒有資料 — 開始唸書後會在這裡顯示趨勢» when both charts have all-zero data OR range='全部' with no data
- [x] 10.7 Mobile RWD probe (per `~/.claude/imports/chrome_mcp_rwd_probe.md`): verified in §12.9 — SVG with viewBox auto-scales at 360 / 414 / 600 / 1024 px; 30 bars stay readable (~10 px wide on iPhone SE viewport); no list-view fallback needed

## 11. Vitest coverage

- [x] 11.1 Add `apps/medexam2-hospital-tw/src/__tests__/stats-aggregation.test.ts` covering: aggregateStudyMinutes empty input / single row / multi-row same date / range bounds / aggregateCorrectAnswers with subjectFilter / empty subject set = no-filter fallback (11 tests)
- [x] 11.2 Add `apps/medexam2-hospital-tw/src/__tests__/doctor-subtab.test.ts` covering the parseSubTab URL contract (4 tests; default tab / explicit value / unknown fallback). Full unmount-on-switch behavior is exercised by the dev smoke instead — pure-React harness would add jsdom dependency for marginal value
- [x] 11.3 Run full app test suite `pnpm --filter @study-rpg/medexam2-hospital-tw test` and confirm all pass (45/45 ✓)

## 12. Dev server smoke

- [x] 12.1 Start dev: `pnpm --filter @study-rpg/medexam2-hospital-tw dev` (boots on port 5174 per vite.config.ts; verified http://localhost:5174/study-rpg/hospital/ returns 200 OK)
- [x] 12.2 Chrome MCP preflight: `mcp__Claude_in_Chrome__list_connected_browsers` returned Browser 1 (macOS, local)
- [x] 12.3 Navigate to home: verified 7 nav links in exact spec order 唸書 / 醫院 / 醫師 / 命運 / 成就 / 排名 / 收藏 via DOM query
- [x] 12.4 Click 醫師 → 醫師名冊 sub-tab default ✓; click 進修 → URL becomes `#/roster?tab=training` + training panel mounted ✓
- [x] 12.5 Direct URL `#/training` → auto-redirects to `#/roster?tab=training` + training panel mounted ✓
- [x] 12.6 F5 (location.reload) on `#/roster?tab=training` → training sub-tab still active after reload ✓
- [x] 12.7 Active-battle confirm guard verified via code path + TrainingPanel `onActiveBattleChange` useEffect + DoctorRoster `setTab` interception (window.confirm with spec-canonical zh-TW text). Manual gameplay verification deferred to dogfood — requires P3 doctor + revenue ≥ 25000 to start a real training attempt
- [x] 12.8 `/achievements` → 統計 sub-tab → 4 range chips (`30 天` default-pressed) ✓ + 2 SVG charts with 30 bars each ✓ + residual chip showing «升級前累積 6 分鐘 (無法分日顯示)» ✓ + subject filter bar with chips ✓ + clicking «7 天» rescaled to 7 bars per chart ✓
- [x] 12.9 RWD probe at 360 / 414 / 600 / 1024px viewports — SVG with viewBox + preserveAspectRatio auto-scales correctly; all 30 bars render at every width without clipping; chart proportions stay readable (bars ~10px wide at 360px)

## 13. Production smoke (prod-equivalent F5 + direct URL)

- [ ] 13.1 After deploy to GitHub Pages, re-run §12.5 and §12.6 on production URL `https://fireman333.github.io/study-rpg/hospital/` (POST-DEPLOY — user-driven after PR merge)
- [ ] 13.2 If Cloudflare Pages deploy is active (`https://med-study-rpg.com/2nd/`), re-run same probes there (POST-DEPLOY)
- [ ] 13.3 Confirm GH Pages SPA `404.html` redirect trick covers `/training` direct URL hit (POST-DEPLOY)

## 14. Final verify + commit

- [ ] 14.1 Run `/opsx:verify` and confirm completeness / correctness / coherence all green (USER-DRIVEN — invoke after reviewing this completion summary)
- [x] 14.2 `/verify` end-to-end Chrome MCP probe — performed inline as §12 smoke; all 7 nav links / sub-tab switching / `/training` redirect / F5 persistence / stats panel charts / RWD widths all green
- [x] 14.3 Self-simplify review — no over-engineering detected. SVG bar chart is ~110 LOC (chose vs ~30 KB chart lib per design D5). Date utility functions (`formatYMD`/`startOfDay`/`subDays`/`dateRangeYMD`) are 1-2 lines each but kept for testability + shared use. TrainingPanel is surgical extract — preserves original TrainingPage logic verbatim. `(USER-DRIVEN — to formally invoke /simplify, run separately)`
- [x] 14.4 `git status` review: 12 modified + 8 untracked = 20 files for this change; 2 pre-existing dirty (`meta.json` + `supabase/functions/`) confirmed unchanged and explicitly excluded from commit scope
- [x] 14.5 Explicit `git add` file-by-file (per multi-agent git safety rule); 25 entries staged (20 modifications + 4 new test files + 1 rename `TrainingPage.tsx → TrainingPanel.tsx` auto-detected at 94% similarity); pre-existing `meta.json` + `supabase/functions/` explicitly excluded
- [x] 14.6 Committed as `ce2454c` on `track-m2` branch (25 files / +2484 / -326). Commit message uses canonical `spec(impl): wire <change-name>` format per project history
- [ ] 14.7 Run `/opsx:archive tidy-tabs-add-study-stats-medexam2` to finalize and sync delta into main specs (USER-DRIVEN — invoke after commit lands)

## 15. UI consistency polish — chip-style filters across all achievement sub-tabs (added 2026-05-26 during /opsx:verify review)

User feedback: 成就 / 科別精通 sub-tab filters used `<select>` dropdowns; 統計 sub-tab used chip-style. Unify all three on the chip pattern for visual consistency.

- [x] 15.1 In `AchievementsPage.tsx`, replace the 3 `<label className="achievements-filter">` blocks with `.filter-bar__group + .filter-chip-group + .filter-chip` chip groups (same class pattern as StatsPanel range chips and DoctorRoster rarity chips). 類別 = 7 chips (全部 + 6 categories), 級別 = 5 chips (全部 + P1–P4), 狀態 = 3 chips (全部 / 已解鎖 / 未解鎖). All single-select, `aria-pressed` for active state.
- [x] 15.2 Subject sub-tab continues to skip the 類別 group (only 級別 + 狀態 visible), matching the prior conditional render
- [x] 15.3 Remove orphan `.achievements-filter` + `.achievements-filter select` CSS rules; keep `.achievements-page__filters` wrapper (flex layout) with an inline note pointing to the shared `.filter-bar__group` classes
- [x] 15.4 Smoke-verify in Chrome MCP: 成就 (3 groups: 7+5+3 chips) / 科別精通 (2 groups: 5+3 chips) / 統計 (achievement filters hidden, stats panel mounts); single-select chip toggle confirmed (clicking P1 chip flips 全部 to unpressed)
- [x] 15.5 Readability polish — chip-group labels (類別 / 級別 / 狀態 / 區間 / 稀有度 / 保底 / 年份 / 科別) were too light against the pixel-paper background. Set `.filter-bar__label` `color: var(--ink)` (#1a1410). Cascades to every chip-group label app-wide (BookmarkFilterBar / DoctorRosterPanel rarity / TrainingPanel rarity+pity / YearFilterBar / StatsPanel range / AchievementsPage 3-filter row)
- [x] 15.6 Readability polish — 說明欄 (instruction cards) text was inheriting a too-light color. Set `.surface-hint__title` + `.surface-hint__text` + `.training-info` all to `color: var(--ink)`. Verified ink (`rgb(26,20,16)`) on Chrome MCP across /achievements, /roster?tab=training, /bookmarks pages
- [x] 15.7 Layout polish — change `.achievements-page__filters` from `flex-wrap` to `flex-direction: column` so each filter dimension (類別 / 級別 / 狀態) sits on its own row. Satisfies user request "科別精通subtab的選單 級別和狀態要分成兩列"; also benefits 成就 sub-tab (3 dims stacked) for visual hierarchy
- [x] 15.8 RWD probe across all 3 achievement sub-tabs at 360 / 414 / 600 / 1024 px (class-override technique). Findings: 類別 row wraps to 3 lines at 360px (worst case); 級別 wraps to 2 lines at ≤414px (acceptable); 狀態 / 區間 always 1 line; subject filter inside 統計 sub-tab already uses BookmarkFilterBar's built-in pagination
- [x] 15.9 Add responsive pagination to the 類別 chip group (mirror BookmarkFilterBar's `useSubjectChipsPerPage` pattern): `useCategoryChipsPerPage()` hook returns 3 chips/page on `(max-width: 768px)`, 6 chips/page (all on one page, no pager) on desktop. Pager UI uses existing `.filter-bar__pager*` classes. Verified desktop path: 7 chips visible, no pager shown when `matchMedia` returns desktop — same pattern as production-verified BookmarkFilterBar. Mobile rendering trusted via shared code path (class-override probe can't change `matchMedia` viewport per `~/.claude/imports/chrome_mcp_rwd_probe.md` documented gotcha)
- [x] 15.10 Final typecheck + test — 45/45 tests pass, typecheck clean
