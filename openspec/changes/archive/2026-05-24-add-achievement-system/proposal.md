## Why

二階 hospital mode 目前有 quiz answer / 招募 gacha / 醫院 tier 升級 / fate card / event 多條 progression loop，但缺一條把這些事件**長期串起來、給予非數值性 recognition** 的系統。玩家衝刺到醫學中心、答到 3000 題、招齊全 14 科時沒有 ritual moment；speedrun (1 月) 跟 longplay (6 月) 玩家也缺差異化標記（同樣 1 個 leaderboard nickname 看不出誰投入多深）。

成就系統解決 4 件事：

1. **長期承諾的 ritual** — 跨越 milestone 那刻有勳章爆出、有名稱、有解鎖日期
2. **玩家身份差異化** — leaderboard nickname 旁顯示勳章組合，一眼看出對方專精方向（醫院經營派 vs 答題派 vs 全科派）
3. **挖掘隱藏玩法** — hidden 成就（半夜唸書、爆肝、捨不得退休）給核心玩家驚喜
4. **不破壞現有 economy** — 獎勵走 leaderboard 勳章 + cosmetic + 稱號三條路，**完全不發**裝備 / 抽卡券 / pity boost / 新 currency

## What Changes

**新增系統**：
- 預設 ~49 條成就 catalog（7 大類 × 4 tier）+ anti-grind validator（時間/次數型必須 `AND`-composed accuracy / 連續性條件）
- 7 大類：學習里程碑 / 答題大師（含累計 + streak 雙 ladder）/ 招募達人 / 醫院經營 / 時運與意外 / 隱藏彩蛋 / 科別精通（14 科獨立 + 1 capstone）
- 4-tier 制（對齊 PSN Trophy）：P1 鑽石 (composite 條件、0-3 個 / save) / P2 金 / P3 銀 / P4 銅
- 2 張 atlas sprite sheet：主 atlas (6×4 = 24 cell, 類別×tier) + subject atlas (7×2 = 14 cell, 14 科獨立 icon)
- BadgeSprite + SubjectBadgeSprite CSS sprite 元件
- 新頁 `/achievements`：pixel-table grid、locked silhouette、unlock toast、tier-P1 全屏揭示
- AchievementUnlockToast (mirror EventToast pattern, 8s 停留, celebratory polarity)

**獎勵管道（3 種，不發明新 currency）**：
- **Leaderboard 勳章** (~70%)：D1 表加 `badges_csv` + `subject_mastery_count`、LeaderboardPage 在 nickname 旁顯示 6 枚 category badges + `🩺 X/14` subject chip
- **Cosmetic** (~20%)：走既有 cosmetic.ts pipeline + `instanceFromCosmetic`、用 `achievement-*` sprite key prefix 避撞 `dorm-*`
- **稱號** (~10%)：`leaderboardProfile.selectedTitle` 加欄位、SettingsPanel 提供下拉選擇、D1 上顯示在 nickname 旁

**Persistence (Dexie v15)**：
- 新表 `achievements`: `{id, unlockedAt, notificationShown}`
- 擴充 `monotonicCounters`: 加 `totalDoctorsRecruited` / `totalP1DoctorsRecruited` / `maxDailyStreak` / `tierUpgradeCount` / `maxQuizCorrectStreak`
- 擴充 `gameCounters.singleton`: 加 `currentQuizCorrectStreak`（LWW、答錯 reset 0）
- 擴充 `leaderboardProfile`: 加 `selectedTitle`

**Sync 路徑（R2-only，**不**碰 Supabase）**：
- 新 `ACHIEVEMENTS` TableAdapter 註冊在 `M2_ADAPTERS` only（**不**放 `HOSPITAL_ADAPTERS`）
- Mirror `LEADERBOARD_PROFILE` precedent (commit `cfaaa32`)：新表「passenger of R2 m2 bundle」
- **No** Supabase migration、**no** `upsert_lww` whitelist 改動

**Trigger Hook（5 處小編輯，每處 ~5 行）**：
- `services/quiz-rewards.ts`、`lib/tick.ts`、`services/recruitment.ts`、`services/fate-card.ts`、`services/training.ts`

**Cloudflare 後端**：
- D1 migration `0002_add_badges.sql`：加 `badges_csv TEXT DEFAULT ''` + `subject_mastery_count INTEGER DEFAULT 0`
- Worker [leaderboard.ts](../../cloudflare/sync-worker/src/leaderboard.ts)：`POST /leaderboard/upsert` 接收兩個新 field、KV snapshot 帶上、hourly cron 保留
- D1 migration 手動 apply（沿用 0001 紀律）；Worker 自動 deploy

**Frontend 部署**：跟著現有 GH Pages + CF Pages 雙部署 pipeline，無新增 workflow。

## Capabilities

### New Capabilities

- `achievement-system`: 成就系統 engine（mirror cosmetic milestone pattern）+ catalog schema + tier 制 + reward dispatcher + atlas/sprite component

### Modified Capabilities

- `hospital-leaderboard`: D1 `leaderboard` 表加 2 個 column (`badges_csv` + `subject_mastery_count`)；Worker `/leaderboard/upsert` + KV snapshot + LeaderboardPage 顯示 6 枚 category badges + subject mastery chip
- `cloud-sync`: 新 `ACHIEVEMENTS` TableAdapter 註冊在 `M2_ADAPTERS`（R2-only，mirror `LEADERBOARD_PROFILE` pattern）；不需 Supabase 端任何改動
- `cosmetic-system`: 成就解鎖時呼叫既有 `instanceFromCosmetic` 注入新 cosmetic instance；catalog 加 `achievement-*` sprite key prefix 群組

## Impact

**Affected code**:
- `packages/core/src/lib/achievement.ts`（新檔，< 100 行）
- `packages/core/src/types.ts`（加 `Achievement` / `AchievementTier` / `AchievementCategory` types）
- `packages/content-medexam2-tw/src/achievements.ts`（新檔，~49 條 catalog + validator）
- `apps/medexam2-hospital-tw/src/db/schema.ts`（Dexie v15 migration + 新表 + 擴充欄位）
- `apps/medexam2-hospital-tw/src/lib/sync/tables.ts`（新 `ACHIEVEMENTS` adapter + `M2_ADAPTERS` 註冊）
- `apps/medexam2-hospital-tw/src/lib/sync/migration.ts`（fresh-start / silent-pull 路徑加 achievements 初始化）
- `apps/medexam2-hospital-tw/src/services/{quiz-rewards,recruitment,fate-card,training}.ts`（5 處 hook）
- `apps/medexam2-hospital-tw/src/lib/tick.ts`（hook）
- `apps/medexam2-hospital-tw/src/pages/AchievementsPage.tsx`（新檔）
- `apps/medexam2-hospital-tw/src/components/{BadgeSprite,SubjectBadgeSprite,AchievementUnlockToast,AchievementCard}.tsx`（新檔）
- `apps/medexam2-hospital-tw/src/pages/HomePage.tsx`（加入口）
- `apps/medexam2-hospital-tw/src/components/{HelpMenu,SettingsPanel}.tsx`（加文檔 + title selector）
- `apps/medexam2-hospital-tw/src/pages/LeaderboardPage.tsx`（顯示 badges + subject chip）
- `apps/medexam2-hospital-tw/src/assets/achievements/badge-atlas.png` + `subject-atlas.png`（新 sprite sheet）
- `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts`（push 帶 `badges_csv` + `subject_mastery_count`）

**Cloudflare**:
- `cloudflare/sync-worker/migrations/0002_add_badges.sql`（新 D1 migration）
- `cloudflare/sync-worker/src/leaderboard.ts`（upsert + read endpoints + KV snapshot 擴充）

**Deploy targets (沿用既有 pipeline，無新 workflow)**:
- **GH Pages** (`fireman333.github.io/study-rpg/hospital/`) — `.github/workflows/deploy.yml` 任何 push to main 自動 deploy
- **CF Pages** (`med-study-rpg.com`) — `.github/workflows/deploy-cf-pages.yml` 任何 push to main 自動 deploy；今天 (2026-05-23) 才 archive 的 `align-cf-pages-deploy-with-gh-actions` change codify 此 workflow
- **CF Worker** (`api.med-study-rpg.com`) — `.github/workflows/deploy-worker.yml` 當 `cloudflare/sync-worker/**` 改動才 deploy
- **D1 migration** — **手動 1 次** `wrangler d1 migrations apply study-rpg-leaderboard --remote`（沿用既有 0001_leaderboard.sql 紀律）
- Frontend = 雙部署：同一份 Vite build 同時上 GH Pages + CF Pages，兩處都要在 verify 階段 SPA 三件套 (in-app nav / direct URL / F5) smoke

**New dependencies**: 無（CSS sprite + Dexie 升 v15 都是現有依賴）

**Migration risk**:
- Dexie v15 upgrade 需處理 fresh-start vs migrate-from-v14 路徑（mirror leaderboard v14 pattern）
- D1 `ALTER TABLE ADD COLUMN` 必須 nullable / 有 default（`DEFAULT ''` 符合）
- Speedrun (1 月) 玩家拿不到任何 subject mastery badge 是設計取捨（不是 bug）
- R2 adapter 漂移風險：`LEADERBOARD_PROFILE` precedent 2026-05-21 才 ship，實作前需 `git log --since="2 weeks ago" apps/medexam2-hospital-tw/src/lib/sync/` 對齊最新 shape

**Out of scope**:
- 跟 Equipment PR #7 整合（PR 已定 defer、本 plan 完全獨立、不發裝備獎勵）
- 一階 (`apps/medexam-tw/`) 成就系統（本 plan 只做二階；如果 M3 fork validation 想做、再開新 change）
- 跨 app 成就（一階達成 → 二階解鎖之類）
- Steam-like achievement points / gamerscore 累計
- 朋友 social leaderboard 顯示朋友的成就（M6 範圍）
