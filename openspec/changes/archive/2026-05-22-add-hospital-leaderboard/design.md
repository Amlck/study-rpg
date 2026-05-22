## Context

二階 hospital management mode 已在 2026-05-15 上線並穩定運作，玩家累積 4 個可比指標（hospital_tier / reputation / doctor_count / totalStudyMinutes）。M4 cloud sync 同步在 2026-05-17 上線並於 2026-05-19 啟動 R2 migration（dual-write Phase 2）。M4.5 in-app bug report pipeline 證明 Worker + Supabase Auth bridge + 後端表 + RLS 模式可行。

本 change 在這個 baseline 上新增一個 global leaderboard capability，刻意：

- 採 **Cloudflare D1 + KV** 作為 leaderboard 資料層（**避免**走正在縮減依賴的 Supabase Postgres 路徑），跟正在進行的 R2 migration 同陣營
- 重用既有 `study-rpg-sync-worker`（不另開 Worker），共用 Supabase JWT verify pattern
- 跟 R2 bundle push 共用 sync engine 的 debounce window（不額外發網路請求）
- 走 hourly Worker scheduled cron 預先 compute KV cache，client 讀 KV 不打 D1（free tier 限額無風險）

設計初稿來自 `~/.claude/scratch/grilled-排名-leaderboard-tab-二階-2026-05-21.md` 的 deep-mode grill-me 結果（17 個面向、3 輪 follow-up）。

## Goals / Non-Goals

**Goals:**

- 上線一個 zero-cost、零新依賴的 global leaderboard，依玩家四種指標（綜合 / 聲望 / 醫師個數 / 累積唸書時間）顯示 top 100
- 強制 opt-in + 暱稱（unique case-insensitive 2-12 char），把 PII 暴露降到最低
- 沿用既有 cloud sync 的 push window（debounced 3s），不增加 client → server 網路流量
- 為未來 M6 friend leaderboard / 一階 leaderboard fork 預留 schema 擴展空間（`app_id` 設計可加 column）
- 維持 OpenSpec change 的 ship 顆粒度：本 change 純 Phase 1，所有 polish（profanity filter / accessibility / season）走 follow-up changes

**Non-Goals:**

- ❌ 一階 medexam-tw leaderboard（另開 change，schema 已預留可擴展性但實作只做二階）
- ❌ Friend graph / 班級 / class 範圍（M6 範疇）
- ❌ Reward / cosmetic / fate card 連動（純名次）
- ❌ Real-time push（WebSocket / Supabase Realtime / Durable Object — 都付費 + 過度工程）
- ❌ HMAC sign / server-side score 重算 / outlier flag（玩家規模 < 1k + 無物質誘因 = 不值得防作弊成本）
- ❌ Profanity filter / emoji ZWJ 多字計算（Phase 2 follow-up）
- ❌ Time window（本月 / 賽季）— All-time only
- ❌ Pagination beyond top 100（早期玩家 < 1k 沒必要）

## Decisions

### D1: Backend = Cloudflare D1 + KV（不走 Supabase）

**選擇**：Worker 端寫 D1 leaderboard table + 每整點 cron 預 compute 寫 KV cache，client 讀 KV 不打 D1。

**Alternatives 評估**：

| 方案 | 評分 | 否決理由 |
|---|---|---|
| **D1 + KV（本選擇）** | ✅ | 跟 R2 migration 同陣營、免費、SQL `ORDER BY` 一行解決 |
| Supabase SQL leaderboards table | ❌ | 跟「Supabase → R2 migration」方向反向；增加 Supabase 依賴 |
| 純 R2 全掃聚合 | ❌ | O(N) R2 LIST + per-user GET，免費額度 1M Class A/月燒得快；玩家成長後撞 throttle |
| Worker + Upstash Redis ZSET | ❌ | Free tier 10K cmd/day 太緊；要綁額外 Upstash 帳號；ZSET 原生 sort 對 4 指標要 4 個 sorted sets，schema 複雜 |
| Cloudflare Durable Objects | ❌ | 要付 Workers Paid $5/mo；過度工程 |

**為何 D1 + KV 夠用**：
- D1 free tier：5 GB storage / 5M reads/day / 100K writes/day。1000 玩家 × 4 indexes × 100 字平均 row size ≈ 400 KB total，遠低於 5 GB
- KV free tier：1K writes/day / 100K reads/day。Cron 24 次/day × 4 keys = 96 writes/day，遠低於 1K；玩家讀 1k 人 × 4 tabs ≈ 4k reads/day，遠低於 100k
- D1 query `ORDER BY ... LIMIT 100` 在 1k rows 上 < 5ms

**參考實作**：[Zakkaus/cloudflare-stats-worker](https://github.com/Zakkaus/cloudflare-stats-worker) — D1 + KV cache 模式，幾乎一比一可借鑑

### D2: Push timing = 跟 cloud sync 同 debounce 3s

**選擇**：Leaderboard adapter 走 sync engine push pipeline（跟 R2 bundle 同 3s debounce window）。

**Alternatives 評估**：

| 方案 | 否決理由 |
|---|---|
| **同 sync push（本選擇）** | 零新網路流量、跟既有 sync engine 共用 retry/auth/error path |
| Worker scheduled cron 從 R2 bundle 拉聚合 | O(N) list R2 + read N blobs / hour，免費 R2 list 1M Class A/月，1k 玩家 × 24 hr = 24k list/day 雖然撐得住但 cost ratio 差；且 R2 LIST API 一次最多 1000 keys，要 paginate |
| 雙手雙腳（client push + Worker cron sweep） | 過度工程；本 change 不防作弊，不需要 reconciliation |
| 進 leaderboard tab 時才 push | 玩家不打開 tab 就永遠不上榜，動能歸零 |

### D3: 完全信任 anti-cheat policy

**選擇**：Worker 只做最基本 sanity bounds（tier ∈ [1,3], reputation ≥ 0, doctor_count ∈ [0,50], study_min ≥ 0）。Leaderboard footer 永久顯示「資料為玩家本機記錄、自填無驗證」。

**理由**：
- 玩家規模 < 1k + 無金錢誘因 + 個人 side project：HMAC sign 或 server-side 重算的 dev cost > 阻擋 1-2 個作弊者帶來的 trust gain
- 「自填無驗證」label 主動降低信任預期，把這變成一個誠實的展示頁面而非競賽工具
- 若未來有付費 / 物質獎勵連動才升級（Phase 2+ follow-up change）

### D4: 整點 cron + KV cache（不真即時）

**選擇**：Worker `scheduled` cron `0 * * * *` 每整點 :00 跑 4 個 D1 query → 寫 4 個 KV keys。Client 讀 KV，不打 D1。UI 顯示「上次更新：HH:MM」timestamp。

**理由**：
- Real-time 推送（Supabase Realtime / DO）成本不對稱 — 玩家不會盯 leaderboard 看分數變化
- 整點刷新有「定期儀式感」，玩家可預期「下小時開始的整點再看一次」
- KV cache 把 D1 reads 上限從 5M/day 降到「玩家數 × 4 tab 切換次數」（< 10K/day），永遠不會撞 quota
- 即使 cron 失敗也只是 stale 1-2 小時，UI footer timestamp 揭露透明度

### D5: Opt-out = is_public=0 / Delete account = 真刪 row

**選擇**：兩階保留機制：

- 設定面板「公開到排行榜」toggle off → `is_public = 0`，D1 row 保留、KV 排除
- `delete_my_account()` 觸發 → Worker DELETE D1 row

**理由**：
- 玩家反覆開關 opt-in 不應該失去 rank history
- 真正想離開的玩家走 delete account RPC，跟既有資料生命週期一致（不另開 leaderboard-only deletion flow）
- 跟 Supabase RPC `delete_my_data` / `delete_my_account` 既有 pattern 對齊

### D6: Nickname = 2-12 codepoint + case-insensitive unique

**選擇**：
- 長度用 `[...str].length`（codepoint 計法），中文 1 字 = 1 char、emoji ZWJ 算多 char
- Unique 用 `nickname_lower` column（client + Worker 同步 `nickname.normalize('NFKC').toLowerCase()`）
- 隨意改、無 cooldown
- Blank 時 fallback Google name（受同 length + unique 規則）

**理由**：
- Codepoint 計法是 JS / SQLite 原生最簡單可實作；grapheme cluster 要 ICU 庫，過度工程
- Case-insensitive 防 homograph collision（WLK vs wlk vs Wlk）
- 無 cooldown 因為 anti-cheat 已選「完全信任」，不防「改名搬風」
- Google name fallback 讓懶人玩家零摩擦上榜（但 Google name 可能太長 / 跟既有玩家撞 → 那時候才強制設）

### D7: UI = Top 100 全 list + my-rank chip（不 paginate / 不 infinite scroll）

**選擇**：單頁 scroll、無 pagination；玩家自己名次永遠 sticky chip 顯示。

**理由**：
- < 1k 玩家規模、Top 100 一頁 list 約 5KB JSON，client render 不痛
- Pagination 增加 UI 複雜度但對 < 1k 玩家無實用價值
- my-rank chip 是「我在哪」的核心 motivation，不能藏在 list 內
- 早期 < 100 玩家全展開 + 加「目前 N 位」counter，避免假空

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **V6 migration `totalStudyMinutes` 歸 0 老玩家被新人追上** → 老玩家社群不滿 | UI footer + opt-in modal 都明示「累積唸書計時自 V6 (YYYY-MM-DD) 起算」；同時把「綜合排名」放預設 tab，study time tab 只是其中之一 |
| **Cron 跑掛 → KV cache 永遠 stale** | UI surface「上次更新：HH:MM」；Worker 加 `console.error` 結構化 log，月底 check log 看 cron 健康度 |
| **D1 + R2 atomicity 失敗**（R2 寫成功 D1 失敗 or vice versa）| LWW `updated_at` 自然 reconcile；下次 sync push 會帶最新值；不需要 distributed transaction |
| **Nickname homograph attack**（用 Cyrillic А 混 Latin A）| Phase 2 follow-up 加 NFKC normalize + 中文黑名單；Phase 1 不防 |
| **早期玩家 < 50 leaderboard 看起來空**（dampens social proof）| UI 顯示「目前 N 位玩家加入排行」counter；my-rank chip 也告知自己當 N 中第 X 名 |
| **Worker scheduled cron 在 free tier 有 unguaranteed scheduling**（CF 文件提：busy times 可能 skip）| 接受 stale 風險（最差也只是 1-2 小時 stale），KV cache 不會空 |
| **R2 migration 還在 Phase 2 → D1 leaderboard 邏輯依賴的 Worker 還在演化** | 跟 R2 Phase 3 cutover 解耦：leaderboard endpoint 加在 Worker 的獨立 module，不碰既有 sync 路徑；R2 read backend flip 不影響 leaderboard |
| **Supabase Auth JWT verify 在 Worker 端遇 token expiry** | 沿用既有 sync-worker JWT verify pattern；client 已有 refresh-token flow，無 net 新邏輯 |
| **CF D1 free tier 限額** | 5 GB / 5M reads/day — 一千玩家四 indexes 全 row ≈ 400KB；20× safety margin。萬一未來撞限額才升 D1 paid（$5/月 100M reads/day） |

## Migration Plan

**Phase 1（本 change）— Foundation**:

1. **D1 schema**（migration 0002_leaderboard.sql）：建表 + 4 indexes
2. **KV namespace**：在 `wrangler.toml` 加 `LEADERBOARD_KV` binding；Cloudflare dashboard 建 namespace
3. **Worker module**（`cloudflare/sync-worker/src/leaderboard.ts`）：
   - 5 endpoints（upsert / get×4 filters / opt-out / delete / nickname-check）
   - 1 scheduled cron handler
4. **`wrangler.toml`** 加 `[triggers] crons = ["0 * * * *"]`
5. **App 整合**（`apps/medexam2-hospital-tw/`）：
   - 新 route `/leaderboard` + `LeaderboardPage.tsx`
   - `LeaderboardOptInModal.tsx` + `NicknameField.tsx`
   - `lib/sync/leaderboard.ts` adapter + hook 進 `engine.ts`
   - SettingsPanel 新 section「公開到排行榜」+ toggle
6. **Smoke test**：在本機跑 Worker dev + 用 chrome MCP 驗 SPA routing F5 三件套（dev + prod 都要）

**Rollback strategy**:
- Feature flag `VITE_LEADERBOARD_ENABLED` 環境變數（unset = hidden tab + 不 push）
- D1 schema 只 ADD，不影響既有 `bug_reports` / 任何 sync table
- 出問題：unset flag 重 deploy = 隱藏 tab；D1 / KV row 不需要清（無 side effect 給 R2 bundle）

**Deploy 順序**：
1. Worker 先 deploy（D1 migration + KV bind + cron + endpoints）— 沒 client 用也安全
2. 跑 cron 手動 trigger 一次驗 KV write
3. App 後 deploy（含 tab UI），帶 `VITE_LEADERBOARD_ENABLED=true`
4. 自己 dogfood 24 hr 觀察 cron 是否準時跑、D1 是否正確 upsert
5. Bug reports / 三日內無重大 issue → 給朋友 / 同學 share URL

## Open Questions

1. **Worker D1 migration apply 流程** — `wrangler d1 migrations apply` vs 手動 SQL editor？建議 `wrangler d1 migrations apply <db-name> --remote`（local 已有 wrangler binary 用過了，CI 走同條路）
2. **Nickname 中含「\n」/「\t」/「\r」/ 控制字元**處理 — 建議 client + Worker 都 reject any char < U+0020 except space；P3 細節，task 內補
3. **Empty state 文案** — 「目前 N 位玩家加入排行」N=0 時顯示「期待第一個上榜的玩家！」之類；P4 polish，PR review 時定
4. **Settings panel section 排序** — 既有面板已有 cloud sync / bug report，「公開到排行榜」要放在哪一段？建議 cloud sync section 內，跟「啟用雲端同步」並列 — 都是「資料隱私」類設定
