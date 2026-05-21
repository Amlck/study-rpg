## Why

二階題庫含 10 個民國年（106~115，共 6080 題），但現有 quiz launcher / picker 沒有讓玩家以年份收緊題池的方式。玩家若想專攻近 3 年熱門考點、或反過來想複習 5 年前舊題，目前都辦不到 —— 只能依科目 + SRS due + 已抽過 seenIds 三條軸切。加入年份多選 filter 後，玩家可同時收緊「科目 × 年份 × SRS 狀態」三條軸，貼近準備國考時「先打近三年」「再回頭啃 109 之前」這種真實節奏。

設計語言沿用 PR #3 (Better screeners) — `.filter-bar` + `.filter-chip-group` + `.filter-chip` 多選 pill — 但因為 10 個年份按鈕一字排開會擠爆 mobile viewport，**分兩頁**：Page 1 = 115/114/113/112/111（近 5 年），Page 2 = 110/109/108/107/106（早 5 年），左右 chevron `‹ ›` + 中間「1 / 2」指示器切換。

## What Changes

- 在 HomePage 頂部加 `.filter-bar`「年份」群組，含 10 個年份 chip + chevron 分頁器，沿用 PR #3 chip 樣式與 `aria-pressed` 多選交互。
- 年份多選 state 持久化到 Dexie `meta` table（KV key `quiz.yearFilter`），不上 cloud sync（純 per-device UI 偏好）。
- 預設全選 10 個年份（zero-friction：玩家不挑也能直接打題）。
- 年份 filter **AND** 現有 subject / SRS due / seenIds 篩選：`pickRandomQuestion` / `getDueQueueAllSubjects` / `loadSubjectQuestionIds` 都讀同一份年份偏好並過濾 pool。
- 0 題保護：當 「年份 × 科目」 combo 篩到 0 題，HomePage 對應 subject card 的「📚 學習」按鈕 disable，並 inline 顯示「此組合 0 題，請放寬篩選」；QuizModal 開啟中遇 0 題（玩家中途縮緊篩選）顯示同訊息並 disable「下一題」。
- ER consult 隨機 picker **不受** 年份 filter 影響（事件驅動 spawn pool，若被玩家年份偏好掐到 0 會讓 consult 沉默 starve；spec 顯式排除）。
- 出處：題目本身的 `question.meta.year`（numeric `106..115`）已存在於 corpus，不需 ingest 階段改 schema。

## Capabilities

### New Capabilities
<!-- none — purely additive requirement on existing capabilities -->

### Modified Capabilities
- `hospital-quiz`: ADD a new requirement — random-pool picker SHALL honor a per-device year-filter preference (defaults to all 10 years selected), and HomePage SHALL render a two-page chevron-paginated year-multi-select chip group whose state persists to Dexie `meta['quiz.yearFilter']`. ADD a corollary requirement — when the year × subject combo filters the pool to 0, the subject's 學習 launcher SHALL disable and surface inline copy directing the player to relax the filter.
- `hospital-srs`: MODIFY the due-queue picker requirement — `getDueQueueAllSubjects` SHALL filter rows whose hydrated `Question.meta.year` falls outside the active year-filter, so SRS due cards align with the global year preference (consistent with the AND combine model).
- `er-consultation`: ADD an explicit non-modification clause — ER consult random picker SHALL NOT consult the year-filter preference (event spawn pool stays full corpus to avoid starvation).

## Impact

**Affected code:**
- `apps/medexam2-hospital-tw/src/db/schema.ts` — bump to v13; no new index needed (KV `meta` table already exists)
- `apps/medexam2-hospital-tw/src/lib/quiz.ts` — `pickRandomQuestion(subjectId, seenIds, opts?)` gains optional `yearFilter: Set<number>` param; `loadSubjectQuestionIds` likewise; `loadPoolSizeMap` unchanged (whole-pack metric)
- `apps/medexam2-hospital-tw/src/lib/srs-scheduler.ts` — `getDueQueueAllSubjects(now, opts?)` accepts `yearFilter`; filters rows by hydrated `Question.meta.year`
- `apps/medexam2-hospital-tw/src/services/year-filter.ts` — **NEW** thin wrapper around `meta` table for get/set/listen of `quiz.yearFilter`, plus `getEffectivePool(subjectId, yearFilter)` helper for "0 題" UI gate
- `apps/medexam2-hospital-tw/src/components/YearFilterBar.tsx` — **NEW** UI component (chevron-paginated chip group following PR #3 `.filter-bar` design language)
- `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` — render `<YearFilterBar />` above subject cards; pass year filter to per-subject pool-size check; disable per-subject 「📚 學習」 button when pool=0
- `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` — read year filter via `useLiveQuery`, pass to picker calls; mid-session 0-題 fallback messaging
- `apps/medexam2-hospital-tw/src/components/RecruitmentBanner.tsx` — pool-size & disabled-state hookup for 「📚 學習」 button
- `apps/medexam2-hospital-tw/src/services/er-consultation.ts` — verify it does NOT thread year filter (likely already doesn't; just confirm + add comment)
- `apps/medexam2-hospital-tw/src/styles.css` — extend `.filter-bar` family with chevron pager classes (`.filter-bar__pager`, `.filter-bar__pager-btn`, `.filter-bar__pager-indicator`)
- 14 quiz subjects × 10 years × pool-size derivation cached locally — no perf concern (pool size O(6080); year filter is a set membership check)

**Not affected:**
- Cloud sync bundle schema (UI preference is local-only, mirrors `quiz.companionDoctorId` precedent)
- Content pack (`packages/content-medexam2-tw/`) — `meta.year` field is already populated; nothing to ingest
- Theme pack — no new sprites/colors; reuses PR #3 chip CSS variables
- 一階 (`apps/medexam-tw/`) — explicitly out of scope this change
- 模擬考 (`mock-exam` capability) — already paper-scoped, no integration needed

**Migration:**
- Dexie v12 → v13 is purely additive (KV table `meta` already exists). On first read, `getYearFilter()` returns `null` → caller treats as "全選 10 年" default.
- No backfill needed; no schema upgrade hook required.
