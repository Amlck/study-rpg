## 1. Cloudflare backend setup

- [x] 1.1 建 D1 database `study-rpg-leaderboard` via `wrangler d1 create`（`database_id = 365a3809-4960-4373-8b0f-f864b2323c65`）
- [x] 1.2 建 KV namespace `LEADERBOARD_KV` via `wrangler kv namespace create`（`id = f0afc16989654688b5c98d420d468e28`）
- [x] 1.3 撰寫 `cloudflare/sync-worker/migrations/0001_leaderboard.sql`（首個 Worker D1 migration，跟 supabase/ migrations 不共享 number space）：建 `leaderboard_m2` table + 4 indexes（composite / reputation / doctor_count / study_min），all WHERE `is_public = 1`
- [x] 1.4 在 `cloudflare/sync-worker/wrangler.jsonc` 加 `d1_databases` array binding `LEADERBOARD_DB` + `kv_namespaces` array binding `LEADERBOARD_KV`（hourly cron `"0 * * * *"` 延到 Phase 2.8 加，避免在 `scheduled()` handler 還沒 dispatch 前每小時都跑既有 daily R2 backup）
- [x] 1.5 跑 `wrangler d1 migrations apply study-rpg-leaderboard --local`（6 commands ✓）+ `--remote` deploy 到 production（6 commands in 0.99ms ✓）

## 2. Worker endpoints

- [x] 2.1 新增 `cloudflare/sync-worker/src/leaderboard.ts` module（重用 `auth.ts` 的 `extractBearer` + `verifyJWT`，並把 `Env` 從 `./index` import）
- [x] 2.2 實作 `POST /leaderboard/upsert` — JWT verify → sanity bounds（tier ∈ [1,3], rep ≥ 0, doctor ∈ [0,50], study_min ≥ 0）→ pre-check unique conflict（409 if taken by another user_id）→ D1 UPSERT with `WHERE updated_at < excluded.updated_at` (LWW)
- [x] 2.3 實作 `GET /leaderboard/:filter`（regex match composite / reputation / doctor / study）— 讀 KV `leaderboard:m2:top100:<filter>`；KV miss 回 `{rows: [], last_updated_at: null, total_count: 0}`
- [x] 2.4 實作 `GET /leaderboard/nickname-check?n=<candidate>` — JWT verify（防 enumeration）→ NFKC + toLowerCase → D1 `SELECT 1 WHERE nickname_lower = ? LIMIT 1` → `{available: boolean}`
- [x] 2.5 實作 `POST /leaderboard/opt-out` — JWT verify → `UPDATE is_public = 0, updated_at = Date.now() WHERE user_id = ?`（bump updated_at 防 client 舊 cache 還原 is_public=1）
- [x] 2.6 實作 `DELETE /leaderboard/me` — JWT verify → `DELETE WHERE user_id = ?` → 回 `{ok: true, deleted: <changes>}`
- [x] 2.7 在 `src/index.ts` `scheduled()` 加 dispatch by `event.cron`，分流到 `runBackupCron`（daily）或 `runLeaderboardCron`（hourly）；未知 cron 印 warn 不執行
- [x] 2.8 在 `wrangler.jsonc` 把 `triggers.crons` 擴成 `["0 0 * * *", "0 * * * *"]`（2.7 dispatch 已就位後才加）
- [x] 2.9 實作 `runLeaderboardCron` — 4 個 D1 query (`ORDER BY ... LIMIT 100 WHERE is_public = 1`) + 1 個 COUNT → 寫 4 個 KV keys + 一行 `console.log [leaderboard cron] computed snapshots`
- [x] 2.10 加 `/leaderboard/*` startsWith match 進 `fetch()`，dispatch 給 `handleLeaderboard`（不影響既有 `/presign` `/delete-account` `/reset` `/health` routes）；`cors.ts` Allow-Methods 擴成 `GET, POST, DELETE, OPTIONS`
- [ ] 2.11 deploy Worker 到 production（不含 client UI，先讓 backend 站穩）

## 3. Shared types (@study-rpg/core)

- [x] 3.1 在 `packages/core/src/lib/leaderboard-types.ts`（沿用 `bug-report-types.ts` convention，非 root `types.ts`）加 `LeaderboardFilter` const array + `LeaderboardRow` + `LeaderboardSnapshot` + `LeaderboardUpsertPayload` + `LeaderboardNicknameCheckResponse` + `LEADERBOARD_FILTER_LABELS` (繁中)
- [x] 3.2 在 `packages/core/src/index.ts` re-export 上述 11 個 symbol
- [x] 3.3 加 `LEADERBOARD_NICKNAME_MIN_CODEPOINTS = 2` / `_MAX = 12` 常數 + `normalizeNickname()` (NFKC + toLowerCase) + `countNicknameCodepoints()` + `isValidNicknameLength()` helpers
- [x] 3.4 `pnpm --filter @study-rpg/core build` ✓ (ESM 29.87 KB + DTS 46.81 KB); `pnpm -r typecheck` ✓ 全 8 packages clean

## 4. Sync engine integration

- [ ] 4.1 新增 `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` adapter — snapshot helper 從 hospital_state / hospital_doctors / study-session 抽 `{tier, reputation, doctor_count, total_study_min}`
- [ ] 4.2 在 `apps/medexam2-hospital-tw/src/lib/sync/engine.ts` push pipeline hook：每次 R2 bundle push 後（同 debounce 3s window）若玩家曾 opt-in → 順手 POST `/leaderboard/upsert`
- [ ] 4.3 未 opt-in 玩家 skip 整個 leaderboard adapter；opted-out（is_public=0）玩家仍 push（with `is_public: 0`），讓 row 維持新鮮
- [ ] 4.4 加 `apps/medexam2-hospital-tw/src/lib/leaderboard/api.ts` client helper（fetch top-100 / opt-out / delete / nickname-check / debounce）

## 5. Opt-in modal & nickname UX

- [ ] 5.1 建 `apps/medexam2-hospital-tw/src/components/LeaderboardOptInModal.tsx` — 列出公開欄位（tier / 聲望 / 醫師個數 / 累積唸書 / 暱稱）+ unchecked checkbox「同意公開以上資訊」+ 暱稱輸入 + 「了解更多 — 隱私說明」link
- [ ] 5.2 建 `apps/medexam2-hospital-tw/src/components/NicknameField.tsx` — 輸入 + debounced 400ms 唯一性檢查 + 長度錯誤 + 空白允許（blank fallback Google name 邏輯內含）
- [ ] 5.3 加「不再顯示」二次選項（dismiss persistent for current device，存 IndexedDB local state，不上 cloud sync）
- [ ] 5.4 寫 nickname 提交 mutation：成功後寫 IndexedDB `leaderboardProfile` table + trigger 一次 sync push
- [ ] 5.5 把「曾否 opted in / opted out」狀態加進 Dexie schema（bump 到 next version）

## 6. Leaderboard page UI

- [ ] 6.1 新增 route `/leaderboard` 進 `apps/medexam2-hospital-tw/src/App.tsx` router
- [ ] 6.2 建 `apps/medexam2-hospital-tw/src/pages/LeaderboardPage.tsx` — 4 filter tabs（segmented control）+ Top 100 list + my-rank sticky chip + 「上次更新：HH:MM」timestamp + footer 二行 disclosure
- [ ] 6.3 第一次進入 page 偵測「未 opted in 且未 dismissed」→ render LeaderboardOptInModal
- [ ] 6.4 Tab 切換時不重新 fetch（KV 同小時 cache client-side），改 toggle local state sorting
- [ ] 6.5 < 100 玩家時顯示 counter「目前 N 位玩家加入排行」；N = 0 時顯示空態文案
- [ ] 6.6 把「排名」加進 home page 主導覽（HelpMenu 也加說明 entry）

## 7. Settings & lifecycle

- [ ] 7.1 在 `apps/medexam2-hospital-tw/src/components/SettingsPanel.tsx` 加「公開到排行榜」section — toggle on/off + 改暱稱按鈕（同 NicknameField 驗證）
- [ ] 7.2 Toggle off → call `/leaderboard/opt-out` + 本地 state 改為 hidden
- [ ] 7.3 Toggle on（從 opt-out 重回）→ leaderboard adapter 下次 push 帶 `is_public: 1`，無需重設暱稱 / 重 consent
- [ ] 7.4 接 `delete_my_account()` flow — 在既有 Supabase RPC 流程後加一步 `DELETE /leaderboard/me`
- [ ] 7.5 接 `delete_my_data()` flow — 同 7.4，刪 D1 leaderboard row

## 8. Smoke testing

- [ ] 8.1 本機跑 `wrangler dev` Worker + `pnpm --filter @study-rpg/medexam2-hospital-tw dev`，手動 opt-in + 看 D1 row + 手動 trigger cron + 看 KV key 寫入
- [ ] 8.2 Chrome MCP preflight `list_connected_browsers` → 在 localhost 跑 SPA route 三件套：(1) home click 到 leaderboard tab、(2) 直接 navigate `/leaderboard`、(3) `/leaderboard` 上 F5；三輪都 render
- [ ] 8.3 跑 nickname 邊界 case：1 char（reject）/ 13 char（reject）/ 12 char（accept）/「wlk」+「WLK」collision（reject 第二個）/ 含 emoji ZWJ（count > 12 reject）
- [ ] 8.4 跑 opt-out → 下次 cron 後 verify 不在 KV snapshot
- [ ] 8.5 跑 delete account → verify D1 row 不存在
- [ ] 8.6 在 production prod URL 重跑 SPA 三件套（GH Pages 404.html redirect 已存在，但本 route 第一次驗）

## 9. Documentation & release notes

- [ ] 9.1 更新 `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` 加「排名」accordion section — opt-in 流程、隱私、改名、停用排行
- [ ] 9.2 在 root `CLAUDE.md` 的 hospital app 區段補 leaderboard endpoints / D1 / KV reference + Worker module pointer
- [ ] 9.3 在 `openspec/project.md` Roadmap 加新 row「M_2nd ext — 排名 leaderboard」並標記 shipped 日期（archive 時填）
- [ ] 9.4 在 `docs/` 加 `LEADERBOARD.md`（類似 `BUG_REPORTING.md` 範本）：data model / endpoints / migration apply / monitoring

## 10. Pre-archive verification

- [ ] 10.1 跑 `openspec validate add-hospital-leaderboard` — 三維檢查 completeness / correctness / coherence
- [ ] 10.2 跑 `/verify` — Chrome MCP end-to-end smoke（含 SPA route F5 三件套）+ visual QA
- [ ] 10.3 確認 `pnpm -r typecheck` 全綠（含 worker package）
- [ ] 10.4 確認 D1 production 已 migrate；KV namespace production 已 bind；cron `0 * * * *` 在 production 已啟用
- [ ] 10.5 跑 `/simplify` 對本 change 觸碰的程式碼做 final pass
