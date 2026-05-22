## Why

二階 hospital management mode 上線後玩家累積進度（醫院 tier / 聲望 / 醫師數 / 累積唸書時間）目前只能自己看，缺乏「跟其他玩家比較」的 social motivation。新增 leaderboard tab 讓玩家看自己 vs global 全二階玩家的排名，激發長期 engagement，同時為未來 M6 friend leaderboard 鋪 schema 基礎。

選在此時做的理由：(1) M_2nd track 已 ship 8 個 archived changes，二階 gameplay loop 穩定可比；(2) R2 cloud sync migration 進入 Phase 2，新 capability 可以直接接 R2 + Worker pattern、不用走 Supabase（不增加正在收斂的 backend 依賴）；(3) M4.5 bug report pipeline 證明 Worker + 後端表 + RLS 模式可行。

## What Changes

- 新增 **「排名」tab** 到 `apps/medexam2-hospital-tw`，含 4 個 filter：綜合排名（醫院 tier → 聲望 → 醫師個數）/ 聲望單獨 / 醫師個數單獨 / 累積唸書時間（`totalStudyMinutes`）
- 新增 **Cloudflare D1 資料庫** + **KV namespace** 存 leaderboard rows + pre-computed top-100 snapshot
- 新增 **Cloudflare Worker endpoints**（複用既有 `study-rpg-sync-worker`）：`POST /leaderboard/upsert`、`GET /leaderboard/:filter`、`POST /leaderboard/opt-out`、`DELETE /leaderboard/me`、`GET /leaderboard/nickname-check`
- 新增 **Worker scheduled cron `0 * * * *`** 每整點 pre-compute top-100 寫入 KV cache，玩家請求讀 KV 不打 D1
- **R2 + D1 雙寫**：既有 sync engine 加一個 `leaderboard-adapter`，跟 R2 bundle push 同 debounce 3s window 觸發 D1 upsert
- 新增 **進場 modal opt-in 流程**：首次點 leaderboard tab → 列出公開欄位 + unchecked checkbox「同意公開」+ 設暱稱（2–12 char、case-insensitive unique）
- 新增 **設定面板 toggle**「公開到排行榜」：opt-out = `is_public=0` 隱藏（D1 row 保留可再開）；既有 `delete_my_account()` RPC 觸發時連同刪 D1 row
- Leaderboard footer 明記「資料為玩家本機記錄、自填無驗證」+「累積唸書計時自 V6（2026-05-XX）起算」
- UI 顯示 Top 100 一路 list 到底 + 玩家自己名次 sticky chip

## Capabilities

### New Capabilities
- `hospital-leaderboard`: 二階全玩家 global leaderboard — opt-in、4 filter tabs、整點 KV cache 刷新、暱稱 unique、隱藏 / 刪除自助、無 reward tie-in 無作弊驗證

### Modified Capabilities
- (none) — leaderboard 是獨立 capability，不修改 `cloud-sync` / `hospital-onboarding` / `hospital-tycoon-engine` 的 requirement-level 行為（只新增整合點，屬實作細節）

## Impact

**Code 影響**：
- `apps/medexam2-hospital-tw/src/pages/LeaderboardPage.tsx`（新）+ route 加 `/leaderboard`
- `apps/medexam2-hospital-tw/src/components/LeaderboardOptInModal.tsx`（新）
- `apps/medexam2-hospital-tw/src/components/NicknameField.tsx`（新，含 debounced unique check）
- `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts`（新 adapter）+ `apps/medexam2-hospital-tw/src/lib/sync/engine.ts`（hook）
- `apps/medexam2-hospital-tw/src/components/SettingsPanel.tsx`（新 toggle「公開到排行榜」section）
- `cloudflare/sync-worker/src/leaderboard.ts`（新 endpoints + cron handler）
- `cloudflare/sync-worker/wrangler.toml`（新 D1 binding + KV namespace binding + `[triggers] crons = ["0 * * * *"]`）
- `cloudflare/sync-worker/migrations/0002_leaderboard.sql`（D1 schema：1 table、4 indexes）

**Infrastructure**：
- Cloudflare D1 free tier（5 GB / 5M reads/day / 100K writes/day）— 充足
- Cloudflare KV free tier（1K writes/day / 100K reads/day）— 充足
- Worker scheduled cron 加一個 trigger
- `.env`：無新環境變數（Worker URL 沿用既有 `VITE_SYNC_WORKER_URL`）

**APIs / Schema**：
- D1 table `leaderboard_m2`（user_id PK / nickname / nickname_lower UNIQUE / hospital_tier / reputation / doctor_count / total_study_min / is_public / updated_at）
- KV keys `leaderboard:m2:top100:<filter>` 4 個

**依賴**：
- 無新 npm package（nickname uniqueness 用 Worker `LIKE` 查 D1，profanity filter Phase 2 才加）
- 已有 `@supabase/supabase-js` JWT verify on Worker 端（複用 sync-worker pattern）

**Non-goals（不在本 change 內）**：
- ❌ 一階 medexam-tw 的 leaderboard（另開 follow-up change）
- ❌ Friend / 班級 / class 範圍（保留給 M6）
- ❌ Reward / cosmetic / badge / fate card tie-in
- ❌ HMAC sign / server-side 重算 / outlier flag（完全信任設計）
- ❌ Profanity filter（讀識字過濾、emoji ZWJ 多字計算）— Phase 2 follow-up change
- ❌ Time window（本月 / 賽季）— All-time only
- ❌ Real-time push（WebSocket / Supabase Realtime / Durable Object）
