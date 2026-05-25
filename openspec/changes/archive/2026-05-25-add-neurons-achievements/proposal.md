## Why

`apps/neurons-tw` 已經有完整的 progression substrate（連線層 AP 累積 / synapse 三階段狀態機 / 11 family × 5 slot variant gacha / family mastery 雙閘 P1–P5）但**沒有跨子系統的成就回饋層** — 玩家拿到第一個 P1 variant、把 synapse 推到 strong、把某個 family 練到 P2 Expert 都只有該子系統內部的 toast，缺少「全局里程碑」的辨識感。同時 `neurons-leaderboard` 已經預留 `badges_csv` column 但目前一直是空字串，等於有公開展示的位子卻沒東西展示。

借鏡 二階 `achievement-system`（2026-05-24 ship）的「7 categories × 4 tier 鑽石/金/銀/銅」pattern 是這個 track 既有的設計語彙；複用它但把 categories / dimensions / atlas 全部換成 neurons 語意（變體 / 連線 / 家族精通 / 突觸 / NT branch），同時銜接已經 reserved 的 `badges_csv` 讓 leaderboard 立刻能用。

## What Changes

- **新增 `neurons-achievements` capability**（獨立 spec，per `neurons-mode` Req 5 borrowing rules — 借鏡 二階 `achievement-system` 設計 pattern 但**不**修改 source spec、**不**reuse spec text）
- **Catalog** = 7 categories × ~30 entries 起步（量級類似 二階 42，但 neurons 子系統較少所以稍精簡）
  - `study` 學習（reading minutes / sessions）
  - `quiz` 答題（correct count + accuracy + streak）
  - `variant` 變體（collected variants + full family collection）
  - `synapse` 連線（synapses formed / strengthened / strong count）
  - `mastery` 家族精通（per-family mastery tier P5 → P1 進度）
  - `fortune` 時運（slot 4/5 pity hits + natural P1 rolls）
  - `hidden` 隱藏（cross-cutting easter eggs）
- **Tier 系統** = 4 階 P1 鑽石 / P2 金 / P3 銀 / P4 銅（mirror 二階）
- **Build-time validator**：P1 entries MUST be composite predicate (≥ 2 of 量/質/持續/廣度)；拒絕 pure-grind P1
- **Engine** = `packages/core/src/lib/achievement.ts` 已存在（二階 已 ship），neurons 直接 import 既有 `checkAchievementUnlocks` / `listUnlockedAchievements` / `listLockedAchievements` 不重寫；types `Achievement` / `AchievementTier` / `AchievementCategory` 已是 `@study-rpg/core` 公開 API，neurons 直接 consume
- **Content pack 新增** `packages/content-neurons-tw/src/achievements.ts` — ~30 entry catalog + build-time validator import
- **Dexie 升 v5**：新增 `achievements` table（PK `id`, indexed `unlockedAt`），mirror 二階 schema；不擾動既有 v4 tables
- **Sync**：neurons-tw 目前**尚未** wire cloud sync engine（per `add-neurons-deploy` follow-up），本 change ship 時 `achievements` table 純 local；adapter 設計 + 接入點預留（`buildLeaderboardPayload` 已 sketch 結構但不含 achievements），等 `add-neurons-deploy` wire R2 bundle 時把 `achievements: AchievementRow[]` 加入 schema_version 1 → 2。本 change 不**修改** sync engine（因為還不存在）
- **Trigger hooks**（3 處 service call site，apply 階段確認檔案路徑為 `apps/neurons-tw/src/lib/services/`）：
  1. `connectome.ts` `recordCorrectAnswer` 收尾 — AP / streak / synapse 三類 predicate
  2. `connectome.ts` `recordIncorrectAnswer` 收尾 — streak reset 後 predicate
  3. `variant-gacha.ts` 持久化收尾 — variant / family-complete / fortune predicate
  - `study` category 的 predicate 對應 reading-timer 累積值（目前 neurons-tw 尚未 wire reading timer — leaderboard `total_study_min = 0` placeholder per `neurons-leaderboard.ts`）；catalog 仍 ship 預備 entry，等 reading-timer 由 follow-up change 補上時自動 trigger，**不**為了補 timer 而把 scope 擴張到本 change
- **Streak counter**：correct-answer streak (`currentQuizCorrectStreak` LWW + `maxQuizCorrectStreak` MAX-merge)；wrong answer reset；mirror 二階 規則
- **2 張 atlas asset**：
  - `badge-atlas.png` 4×4（4 tier × 7 category，但拿掉一行 → 7 row × 4 col = 7×4 grid 512×896；視覺仍 GBA pixel style）
  - `family-mastery-atlas.png` 11×5（11 family × P1-P5 tier，128×128 cell → 1408×640）
  - 走 codex CLI / Gemini MCP（per `image_gen_routing.md` 路由）
- **UI components**：
  - `AchievementsPage` mounted at `/achievements` route — 2 sub-tab (已解鎖 / 全 catalog) + 3 filter (category / tier / hidden-only) + 嚴格 hidden filtering
  - `AchievementCard` + `BadgeSprite` + `FamilyMasteryBadgeSprite` (CSS atlas sprites)
  - `AchievementUnlockToast` (P2–P4, 8s auto-dismiss, source `TOAST_AUTO_DISMISS_MS` from `neurons-motion-library`)
  - `AchievementUnlockModal` (P1 全屏 dismiss-required)
  - Toast queue singleton `lib/achievement-toast-queue.ts` + `useAchievementToasts` hook
  - `AchievementTitleSelector` 嵌入 `LeaderboardSettingsControls` 讓玩家選稱號公開
- **Leaderboard 整合**：
  - 客戶端 `lib/sync/leaderboard.ts` 加 `deriveAchievementSnapshot()`：把每個 category 的 max tier 串成 `badges_csv = "study:P2,quiz:P1,..."`
  - 沿用 `add-neurons-leaderboard` 已存在的 `badges_csv` 欄位，**不需 D1 migration**
  - `LeaderboardPage` 在 nickname 旁渲染 inline 20px badges（`NicknameWithBadges` helper）
- **Reward dispatcher** 2 channels（neurons-tw 目前無 cosmetic system，砍掉 cosmetic channel；mirror 二階 其餘 2 channel）：
  - Leaderboard 勳章（自動 — `badges_csv` 走 push payload）
  - 稱號 / Title（persisted to `leaderboardProfile.selectedTitle` + selectable in `LeaderboardSettingsControls`）
  - Reward type 用 discriminated union — `cosmetic` kind 暫時不出現（TypeScript 不收），未來 neurons cosmetic system 上線再加
  - **絕不**發 ticket / 變體 / AP / synapse boost / 新貨幣
- **Silent backfill on app boot**（mirror variant-gacha 既有 backfill pattern）：app boot 完成 content pack load 後跑一次 `backfillAchievementsFromCurrentStats()` — diff `listUnlockedAchievements(...)` vs Dexie `achievements` table，缺的 `bulkPut({ notificationShown: true })`，**不**派 toast、**不**派 modal、**不** dispatch reward；**未來** sync engine wire（`add-neurons-deploy`）時再加 `onPullComplete` hook 重跑同一 backfill 函數
- **`/spec` skill 強制**：本 change 在 cross-checking neurons mechanism description（例 streak semantics 對應神經科學的 spike rate / synaptic strength）時依 `project.md` 規則必先走 `/oe` 查 PubMed-anchored 證據，不憑泛用 LLM 知識決定

## Capabilities

### New Capabilities

- `neurons-achievements`: 7-category × 4-tier milestone recognition for neurons-tw — catalog shape / engine consumption / Dexie v5 / R2 m1 sync passenger / 4 trigger hook integration / build-time composite validator / atlas display / leaderboard badge derivation / silent pull backfill / 3-channel reward dispatcher

### Modified Capabilities

無 — `neurons-mode` 已預告本 capability 的 deferred 狀態（Req 5 borrowing table 第 4 列），不需 delta；`neurons-leaderboard` 已預告 `badges_csv` 由本 change 填充（Req 11），也不需 delta；`neurons-motion-library` 已暴露 `TOAST_AUTO_DISMISS_MS`、本 change 直接 import 不修改。`core-npm-package` 既有 `Achievement*` types 已是公開 API，本 change consume 不修改。

## Impact

**Code**
- 新增：`packages/content-neurons-tw/src/achievements.ts`（catalog + validator wire）
- 新增：`apps/neurons-tw/src/services/achievement.ts`（trigger orchestrator + stats builder + backfill）
- 新增：`apps/neurons-tw/src/services/achievement-reward.ts`（3-channel dispatcher）
- 新增：`apps/neurons-tw/src/pages/AchievementsPage.tsx` + route registration
- 新增：`apps/neurons-tw/src/components/{AchievementCard,BadgeSprite,FamilyMasteryBadgeSprite,AchievementUnlockToast,AchievementUnlockModal,AchievementTitleSelector,NicknameWithBadges}.tsx`
- 新增：`apps/neurons-tw/src/lib/achievement-toast-queue.ts` + `apps/neurons-tw/src/hooks/useAchievementToasts.ts`
- 新增：`apps/neurons-tw/src/assets/achievements/{badge-atlas.png,family-mastery-atlas.png}`
- 修改：`apps/neurons-tw/src/lib/db.ts` — Dexie v4 → v5（add `achievements` table），extend `LeaderboardProfileRow` with `selectedTitle?: string | null`
- 修改：`apps/neurons-tw/src/services/connectome.ts` — 2 處 hook（correct / incorrect answer 收尾）
- 修改：`apps/neurons-tw/src/services/variant-gacha.ts` — 1 處 hook（variant 持久化收尾）
- 修改：reading-time accumulator（檔案路徑 apply 階段確認）— 1 處 hook
- 修改：`apps/neurons-tw/src/lib/sync/engine.ts` 或 equivalent — `ACHIEVEMENTS` TableAdapter 註冊 + `onPullComplete` 接 `backfillAchievementsFromCurrentStats`
- 修改：`apps/neurons-tw/src/lib/sync/leaderboard.ts` — add `deriveAchievementSnapshot()` + 接入 push payload
- 修改：`apps/neurons-tw/src/pages/LeaderboardPage.tsx` — render badges + title chips inline

**Data**
- Dexie schema v4 → v5（additive — 不破壞既有 4 table）
- R2 neurons bundle schema bump（`achievements: AchievementRow[]` key 新增；schema_version 1 → 2 if neurons bundle 還沒 versioned）
- D1 `leaderboard_neurons.badges_csv`（已存在 — 從空字串開始被填充，**no migration**）

**Worker / Backend**
- Worker `POST /leaderboard/neurons/upsert` 已驗 `badges_csv` regex（per `neurons-leaderboard` Req 5）— **no Worker code change**
- Worker `runNeuronsLeaderboardCron` 已 include `badges_csv` 進 KV snapshot（其 SELECT * 自動含）— **no cron change**

**Build & CI**
- `packages/content-neurons-tw` build 加入 catalog validator（fail fast on rule violation）
- 不影響 GitHub Actions / Cloudflare Pages pipeline（純 client-side + 自動 sync）

**Dependencies**
- 不新增 npm dependency；Framer Motion / Dexie / 既有 motion library 全部 already in tree
- atlas asset 走 codex / Gemini MCP one-shot，不引入 build-time dependency

**Out of scope**
- ❌ Equipment / shop / 任何新貨幣 integration
- ❌ Cross-app achievement recognition（neurons 不會頒 medexam-tw 的成就，反之亦然 — per `neurons-mode` Req 4 data isolation）
- ❌ Achievement-driven gameplay modifier（成就只是 recognition，不影響 AP / variant gacha 機率）
- ❌ D1 migration（沿用 `add-neurons-leaderboard` 預留的 `badges_csv` 即可）
- ❌ Audit / share-to-社群 button（M6+ 才考慮）
