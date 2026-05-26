## Why

二階 app 目前頂層 7 個 tab 排序不直覺（進修跟醫師分散兩處）、且玩家沒有方法看到自己的學習趨勢（只有 lifetime monotonic counter，無 per-day 切片）。Owner 自己 dogfood 想釐清「最近 30 天答題進度」沒辦法做到。把進修收進醫師 subtab 釋出一個頂層位置，順道加「統計」sub-tab 補學習儀表板缺口，同時為未來 daily-streak / weekly-summary 等功能鋪資料層基礎。

## What Changes

- **重排頂層 tab 順序為：唸書 / 醫院 / 醫師 / 命運 / 成就 / 排名 / 收藏**（只動 NavBar render order，route path 不變，零 backward-compat 風險）
- **進修頁面收進醫師 tab subtab**：醫師 page 變 `?tab=roster|training` 兩 sub-tab（mirror BookmarksPage `?tab=manual|wrong` pattern），預設 `roster`；切 subtab 時 unmount 另一邊 state；進修戰鬥進行中切換要彈 confirm guard
- **保留 `/training` 舊 route + 加 redirect**：`/training` → `/roster?tab=training`，老分享 link 不死
- **成就頁面新增「統計」sub-tab**：第三個 sub-tab（與 main / subject 平級），顯示兩張獨立長條圖（上=每日唸書分鐘、下=每日答對題數）+ 時間範圍 chip（7d/30d/90d/全部，預設 30d）+ 分科 filter chip（複用 `BookmarkFilterBar`）+ 頂部 summary chip
- **新增 `dailyStudyLog` Dexie table**（v17 → **v18**）：forward-only per-day snapshot `{ date PK, minutesAdded, updatedAt }`，hook 在 `lib/tick.ts` 每次累加分鐘時同步 upsert 當日 row
- **R2 m2 bundle schema_version bump 2 → 3**：新增 `dailyStudyLog` array key；row-level LWW on `updatedAt`（不像 `everWrong` 需 monotonic-OR carve-out，無 cross-version race）；雙向 tolerant（v2 client drop v3 unknown field、v3 client default empty for v2 bundle）

不做（明確 out-of-scope）：

- 不引入 chart library（recharts / d3）— 手寫 SVG 或 CSS bars，避免 bundle bloat
- 不處理「全部」range > 90 天的 weekly aggregate（forward-only 短期 < 90 天，留 follow-up）
- 不重命名 `/training` 為 `/doctors`（Q6 已決議只動 render order）
- 不為 range chip 加 URL searchParam（React state 即可；deep link share 留 follow-up）
- 不改 `monotonicCounters.totalStudyMinutes`（繼續是 lifetime truth source、不動）
- 不重建「答對題數」歷史精度（接受 `lastAnsweredAt + lastResult==='correct'` best-effort，同題同天答兩次只算 1）

## Capabilities

### New Capabilities

- `daily-study-log`: Forward-only per-day snapshot of study minutes for use by stats dashboards. New Dexie table + tick-time hook + R2 sync semantics (row-level LWW, schema_version bump). Source of truth for time-series study data; coexists with lifetime `totalStudyMinutes` monotonic counter.

### Modified Capabilities

- `hospital-management-mode`: Add tab order requirement (7-tab NavBar sequence); add 醫師 sub-tab navigation (`?tab=roster|training`); add `/training` route redirect; add active-battle subtab-switch confirm guard
- `achievement-system`: Add stats sub-tab (third sub-tab alongside main / subject); add daily chart requirements (two bar charts, range chip, subject filter, summary chip with historical-residual note)

## Impact

**Affected code**:
- `apps/medexam2-hospital-tw/src/App.tsx` — NavBar order + `/training` redirect entry
- `apps/medexam2-hospital-tw/src/components/NavBar.tsx`（或當前承擔 NavBar 角色的 component）— render order array
- `apps/medexam2-hospital-tw/src/components/DoctorRoster.tsx`（或對應檔）— 包成 subtab container
- `apps/medexam2-hospital-tw/src/components/TrainingPage.tsx` — 仍存在但 mount 點改在 DoctorRoster 內
- `apps/medexam2-hospital-tw/src/components/AchievementsPage.tsx` — 第三 sub-tab + stats panel
- 新檔 `apps/medexam2-hospital-tw/src/components/StatsPanel.tsx`（暫名）— 兩張 SVG/CSS bar chart + range chip + filter
- `apps/medexam2-hospital-tw/src/lib/db/schema.ts` — Dexie v18 + `dailyStudyLog` 表
- `apps/medexam2-hospital-tw/src/lib/tick.ts` — hook upsert dailyStudyLog 當日 row
- `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts` 與 `tables.ts` — schema_version 3 + 新表 adapter + LWW 邏輯
- `apps/medexam2-hospital-tw/src/__tests__/` — 新增 Vitest（dailyStudyLog upsert + bundle round-trip v2↔v3 + chart data shape）

**Affected data**:
- Dexie schema v17 → v18（新 table）；既有玩家升級 schema 是 additive，不丟資料
- R2 m2 bundle schema_version 2 → 3；dual-write 期間（add-r2-cloud-sync-migration Phase 3 estimated 2026-05-29 前）保持 forward + backward tolerance

**Affected dependencies**: 無新 npm 套件（手寫 SVG bar chart）

**Multi-agent git safety**: dual-worktree（`~/coding-scratch/study-rpg-m2/` on `track-m2` branch）；implementation 時遵守 explicit file-by-file `git add` 紀律
