## Context

M_3rd `apps/neurons-tw` 已 ship 10/11 capability，本機 dev server 跑得起、Chrome MCP smoke 過、achievement 系統 backfill 也跑過 — 但**尚未 deploy 到 production**。本 change 是 M_3rd 結案棒。

既有 deploy 基礎設施（從 `add-med-study-rpg-domain-migration` + `host-medexam2-images-on-r2`）已具備：
- CF Pages project `med-study-rpg-com` bind 到 `med-study-rpg.com` zone
- 既有 build pipeline 透過 `scripts/build-cf-pages-dist.mjs` 把 `apps/medexam-tw/dist` 跟 `apps/medexam2-hospital-tw/dist` 合進 `dist-cf/{1st,2nd}/` + 寫 `_redirects` SPA fallback + 從 template 寫 landing page
- Cloudflare Worker `study-rpg-sync-worker` (alias `api.med-study-rpg.com`) 已支援 R2 presign / download + `/leaderboard/neurons/*` 路由
- R2 bucket `study-rpg-state` 容納所有 bundle（per-user prefix + bundle-name suffix）
- D1 `leaderboard_neurons` table 已由 `add-neurons-leaderboard` 建好

也就是說：**Worker 端零改動、R2 / D1 schema 零改動**。本 change 主要是 client-side + build pipeline + owner manual config。

Stakeholders：
- Owner（dogfood user）— 自己即將用 neurons-tw 準備一階國考
- 朋友 / 同學 — 從 medexam-tw companion 連結點過去測 / 玩
- 未來 fork engine 的 contributor — 看到 `apps/neurons-tw/` 是「`@study-rpg/core` 可被任意主題複用」的第二個證明

## Goals / Non-Goals

**Goals:**
- neurons-tw production live at `https://med-study-rpg.com/neurons/`
- OAuth sign-in 走通（共用 Supabase Project + Google OAuth Client）
- R2 cloud sync engine 落地：自己的 `neurons-snapshot.json.gz` bundle，跟 m1 / m2 / bookmarks 完全隔離
- `onPullComplete` hook 跑三件 backfill — achievement / monotonic counter / leaderboard derived field — 確保跨裝置 pull 後狀態完整
- medexam-tw SettingsPanel 加 companion-app pointer，履行 `neurons-mode` Req 6
- F5 / direct URL / OAuth callback / cross-device pull 四項 SPA smoke 在 prod 全綠

**Non-Goals:**
- 不接 GH Pages（greenfield、無 legacy user 要 bake）— 跟 1st / 2nd 經過的 2-4 週遷移 bake 不同情境
- 不改 Worker 任何路由 / R2 / D1 schema
- 不動 Supabase Postgres（neurons-tw 從 day 1 就 R2-only，不走 dual-write）
- 不做 export/import JSON UI（M5 stretch）
- 不做朋友 leaderboard / social light（M6 stretch）
- 不寫 deprecation timeline for medexam-tw（per `neurons-mode` Req 6 — maintenance mode 不等於 EOL）
- 不改 OAuth Client ID / Google Console（共用既有 client）
- 不接 bug report flow（neurons-tw scope 內可 punt 到 M6 stretch）

## Decisions

### D1. Subpath = `/neurons/`（非 `/3rd/`）

選 `/neurons/` 而非延續 `/1st/` `/2nd/` 數字慣例：

| 評估維度 | `/3rd/` | `/neurons/` |
|---|---|---|
| 一致性 | ✓ 跟 1st / 2nd 配齊 | ✗ 跳出數字慣例 |
| 連結可讀性 | 弱 | 強（看 URL 就知道是 M_3rd） |
| Brand readability | 弱（"3rd" 不知道是什麼） | 強（"neurons" = 神經元） |
| Package name 對齊 | 弱（`neurons-tw` vs `/3rd/`） | 強（`neurons-tw` ↔ `/neurons/`） |
| 未來 M_4th 擴充 | 平凡延續 | 不影響（M_4th 自選命名） |

User 拍板：**`/neurons/`**。Package name `@study-rpg/neurons-tw` 跟 URL slug 一致，朋友從 medexam-tw 連結點來「神經元主題版」也好理解。

### D2. Deploy target = CF Pages only（非 dual GH Pages + CF Pages）

1st / 2nd 走 dual deploy 是因為要 2-4 週 bake 把舊用戶從 `fireman333.github.io/study-rpg/` 遷到 `med-study-rpg.com`。neurons-tw 沒有 legacy user — 第一個 production URL 就是 `med-study-rpg.com/neurons/`，不需要 bake、不需要 fallback。

附帶效益：
- GH Pages artifact 配額不再被 neurons-tw 啃食（之前 2nd 的 396 PNG 已經啃掉 144 MB / day，再加一個 app 會更緊）
- CF Pages 零 egress，符合 R2 migration 的省成本初衷
- 一次失誤可立即 CF Pages dashboard rollback build

Trade-off：若 CF Pages 整個 outage（少見）neurons-tw 直接 down。可接受 — 沒有 SLA 承諾、玩家 IndexedDB 本機都還在、隔天回來就好。

### D3. R2 bundle = `neurons-snapshot.json.gz`（per-user，獨立於 m1 / m2 / bookmarks）

R2 key 格式：`users/<user_id>/neurons-snapshot.json.gz`（跟 m1 / m2 / bookmarks 同 prefix pattern、bundle 名不同）。schema_version 從 1 起跑。

**為什麼 schema 完全獨立**（per `neurons-mode` Req 4）：
- neurons-tw 的 Dexie schema 不同（5 個 tables: connectome / achievements / leaderboardProfile / meta / ?）
- 沒有共用 row → 沒辦法 merge 進 m1 bundle
- 玩家是否 dogfood neurons-tw 是個人選擇，bundle 獨立 = 玩家停玩 neurons-tw 也不污染 m1 / m2

**Worker 端 mini-change**：`cloudflare/sync-worker/src/presign.ts` 對 bundle name 走 whitelist (`'m1' | 'm2' | 'bookmarks'`)，需要加 `'neurons'` + 新的 `bundleKey()` case (→ `users/<sub>/neurons-snapshot.json.gz`)。`delete.ts` / `backup.ts` 走 `users/<sub>/*` prefix 列舉、不需改。Worker redeploy by owner via `wrangler deploy`（或 GH Actions `deploy-worker.yml`）。R2 bucket / D1 schema 都不改 — D1 `leaderboard_neurons` table 已由 `add-neurons-leaderboard` 建好、本 change 不動。

### D4. Sync engine = minimum viable R2-only（不走 dual-write）

醫考 1st 走 Supabase → R2 dual-write → R2-only 的三階段是為了**遷移 legacy user 不漏資料**。neurons-tw greenfield、沒 legacy user、沒 Supabase row。直接走 R2-only 從 day 1，省掉：
- Supabase migration `0001_init_cloud_sync.sql` 對應 neurons-tw 的版本（不寫）
- `upsert_lww` RPC neurons table whitelist 擴充（不做）
- `MigrationBanner` / `MigrationUploadPrompt` / `ConflictChooserModal`（不寫）

僅需的 sync engine 結構：
```
apps/neurons-tw/src/lib/sync/
  engine.ts              # 抽象 sync engine（pull / push / pushAll / pullAll / pause / resume）
  r2/
    client.ts            # /presign + /download + /upload fetch wrappers
    bundles.ts           # bundle adapter — Dexie row ↔ snapshot.json
    engine-r2.ts         # R2-specific SyncEngine 實作（LWW on updated_at）
  useSync.ts             # React hook（debounce push + visibilitychange pull）
  tables.ts              # TableAdapter for each Dexie store（snapshot/apply per table）
```

仿 medexam2-hospital-tw 的 R2-only path（後者 Phase 4 cutover 後也是 R2-only），但更簡（沒 dual-write 路徑、沒 backfill from Supabase 路徑）。

### D5. `onPullComplete` triple-backfill 順序與冪等性

每次 pull 落地後（apply 完 R2 bundle 進 Dexie），依序跑：

1. **MAX-merge counter backfill** — 先跑，因為 achievement check 依賴 counter 狀態
   - `meta['currentQuizCorrectStreak']` 不做 MAX-merge（streak 可漲可跌、LWW 即可）
   - `meta['maxQuizCorrectStreak']` MAX-merge：取 `max(local, incoming)`
   - 其他 monotonic counter 同模式（待 implement 階段列詳細清單）
2. **Achievement backfill** — `backfillAchievementsFromCurrentStats()`（`add-neurons-achievements` 預留），idempotent：對所有 catalog entry 重算 stats，若 unlocked predicate true 但 Dexie 沒對應 row 就 `bulkPut` with `notificationShown: true`（不 dispatch / 不 toast）
3. **Leaderboard derived field backfill** — `deriveBadgesCsvFromDexie()` + `deriveAchievementSnapshot()` 重算 `leaderboardProfile.badges_csv`，下次 push 就帶最新 badges 上 D1

**冪等性保證**：每步函式都對「目前 Dexie 狀態」重算，不 depend on prev pull artifact。同一次 pull complete 重跑兩次 = 同樣結果（不會重複加 row、不會重複 dispatch toast）。

**為什麼順序固定**：counter (1) 必須先於 achievement (2)，否則用 stale counter 算 achievement 會漏；leaderboard (3) 必須在 (2) 之後，否則 derive 出來的 badges_csv 是舊狀態。

### D6. Companion-app pointer in medexam-tw SettingsPanel（履行 `neurons-mode` Req 6）

選 SettingsPanel section 而非 footer link：
- Footer link 在 1st / 2nd / neurons 三 app 滿屏，主畫面噪音高
- SettingsPanel 是「設定 + Help + About」自然棲息地，新 entry 不干擾主視野
- 點開 entry 顯示一個小 modal：「神經元主題版（neurons-themed companion app）」+「全新 Hebbian 同步學習機制」+「資料獨立、不影響此存檔」+「前往 https://med-study-rpg.com/neurons/」 button
- 文案明確標 companion，不是 forced replacement（per `neurons-mode` Req 6 wording）

按鈕走 `target="_blank" rel="noopener"` 新 tab 開、不離開 medexam-tw。

### D7. SPA route discipline — F5 / direct URL / OAuth callback 三件套

CF Pages 沿用既有 `_redirects` SPA pattern，但 neurons-tw 用 hash router（HashRouter, `/#/connectome` 等），所以：
- F5 / direct URL：URL pure root 路徑 `/neurons/`，hash 後面任意 → 不會撞 CF Pages 404
- OAuth callback：Supabase redirect 回 `/neurons/`（不帶 hash），Supabase auth helper 從 URL fragment 抽 token → 不會撞 router

對 `~/.claude/imports/chrome_mcp_preflight.md` 的 SPA route 三件套：
1. In-app navigation ✓（hash router 內 click，URL 改 hash 不重新 load）
2. Direct URL `https://med-study-rpg.com/neurons/` ✓（root path SPA fallback）
3. F5 on hash route ✓（reload 還是同一 hash router state）

三件套不適用 OAuth callback URL pattern — Supabase callback `code` param 在 query string 而非 hash，需要 hash router 先 load 後從 query 抽 code。Auth 流程獨立驗證。

### D8. GH Actions workflow strategy = 擴充既有 `deploy.yml`，不開新 workflow

選擇 extend 而非新建：
- Single source of truth — 三 app build 順序、env var、artifact 路徑都在同一檔
- 共用 setup steps（pnpm install / Node setup）— 不重複 ~20 行
- CF Pages dashboard 一個 build pipeline 監聽 main branch、build command 內含三 app 連 build + bundle，不需 GH Actions 直接 deploy

對 deploy.yml 的 patch：
- 新 env block（mostly empty，neurons-tw 不需 R2 dual-write flags）
- Build step 加 `VITE_DEPLOY_BASE=/neurons/ pnpm --filter @study-rpg/neurons-tw build`
- 接著 `node scripts/build-cf-pages-dist.mjs` 已包含新 route 後三 app 都進 `dist-cf/`

`build-cf-pages-dist.mjs` `ROUTES` array 從 2 entry → 3 entry：
```js
const ROUTES = [
  { src: 'apps/medexam-tw/dist', dest: '1st' },
  { src: 'apps/medexam2-hospital-tw/dist', dest: '2nd' },
  { src: 'apps/neurons-tw/dist', dest: 'neurons' },  // NEW
]
```

`_redirects` 寫入邏輯自動產生新 `/neurons/...` 規則，不需手改。Landing template 加一個 row 指向 `/neurons/`。

## Risks / Trade-offs

| 風險 | 嚴重度 | Mitigation |
|---|---|---|
| Supabase Site URL allowlist 沒加 `med-study-rpg.com/neurons/` → 第一次 OAuth callback 422 | P2 頂級 | Owner manual checklist：deploy 前必須完成 Supabase Auth dashboard 設定，本 change tasks 第 §6 列為硬條目 |
| `onPullComplete` counter backfill 順序錯 → 某成就漏 unlock 直到下次 quiz fired | P3 人上人 | D5 鎖死 1 → 2 → 3 順序 + design 寫進 spec scenario；單元測試覆蓋三步串聯 |
| Cross-device first-time pull race：device A push 後 device B 還沒 pull 就先答題 → race window | P4 NPC | LWW on `updated_at` 保證最終一致；可接受 < 60s window |
| `_redirects` SPA fallback 規則對 `/neurons/assets/...` static asset 誤導向 index.html | P3 人上人 | 既有 `build-cf-pages-dist.mjs` 已處理 5 個 asset 子資料夾 explicit 規則；neurons-tw build output 結構相同（vite 預設 `assets/` `content/` `fonts/` etc.），規則自動 cover |
| neurons-tw 啟動時讀 OAuth session 找不到（cookie domain 不對） | P3 人上人 | 共用 `med-study-rpg.com` apex zone，cookie 自動同源；不需特殊設定 |
| medexam-tw companion-app entry 文案被誤解為強制遷移 | P4 NPC | 文案明確標「companion app」「資料獨立、不影響此存檔」；點開 modal 而非 hard redirect |
| Owner 忘記 Cloudflare Pages dashboard 改 build command → next push deploy 不包 neurons | P2 頂級 | Tasks §6 列 owner manual steps + 設 alarm；first verify 跑 `curl https://med-study-rpg.com/neurons/` 確認 |
| Worker URL `api.med-study-rpg.com` 在 OAuth-authed fetch 撞 CORS | P3 人上人 | Worker `cors.ts` 已 allow `med-study-rpg.com` zone；neurons subpath 自動 cover |
| neurons-tw 包含的內容 / 圖檔太大、CF Pages build artifact 接近 25 MB limit | P4 NPC | neurons-tw 沒醫療影像 PNG（純題目文字 + theme sprite），總包 ~5 MB，遠低於限制 |

## Migration Plan

**Phase A — Code changes（this change apply）**：
1. 新檔 `apps/neurons-tw/src/lib/{auth,sync}/` 結構
2. 新檔 `apps/neurons-tw/src/components/AuthGate.tsx`（minimum viable sign-in modal）
3. 接 `onPullComplete` 進 `useSync.ts`
4. 修 `scripts/build-cf-pages-dist.mjs` `ROUTES` + `scripts/cf-landing-template.html`
5. 擴充 `.github/workflows/deploy.yml` 加 neurons-tw build step
6. 修 `apps/medexam-tw/src/components/SettingsPanel.tsx` 加 companion-app entry
7. Verify locally：`pnpm -r build` 全綠、`scripts/build-cf-pages-dist.mjs` 跑完 `dist-cf/neurons/index.html` 存在

**Phase B — Infrastructure setup（owner manual）**：
1. CF Pages dashboard：擴充 `med-study-rpg-com` Pages project 的 build command 帶 neurons-tw build
2. Supabase Auth dashboard：Site URL allowlist 加 `https://med-study-rpg.com/neurons/`，Redirect URLs 加同
3. `docs/AUTH_REDIRECT_URIS.md` 加兩條紀錄

**Phase C — Live deploy + verify**：
1. Push commit → GH Actions trigger → CF Pages auto-build
2. Owner 自帳號 (`tony85314@gmail.com`) 開 `https://med-study-rpg.com/neurons/` Chrome MCP smoke：
   - Root URL load 不噴 404
   - Direct URL `/neurons/#/connectome` F5 不噴 404
   - 答 10 題（觸發 backfill 路徑）
   - Sign-in / sign-out cycle
   - 跨裝置 pull cycle（手機 + 桌機）
3. medexam-tw SettingsPanel 確認 companion entry 顯示 + 點擊新 tab 開 neurons-tw OK

**Phase D — Maintenance mode 履行（M_3rd 結案）**：
1. neurons-tw smoke 全綠後 archive change
2. Track-neurons merge 回 main
3. `openspec/project.md` Roadmap row 標 ✓ shipped 11/11
4. `apps/medexam-tw` 後續 PR 一律標 maintenance（per `neurons-mode` Req 6）— 文檔層面而非 lint 自動化（後者 punt 到後續需要時再做）

**Rollback strategy**：
- 若 Phase C smoke 失敗：CF Pages dashboard 「View Deployments」rollback 到 prev build（即 1st / 2nd only）
- 若 Phase B OAuth 失敗：Supabase Auth dashboard 直接修 allowlist 即可，無需 redeploy
- 若 onPullComplete backfill bug 造成數據污染：hotfix change + Chrome MCP DEV mode `globalThis.__sync.pause()` 暫停 sync 至 fix 上線

## Open Questions

- 是否需要 Cloudflare Pages dashboard side 設定 `_headers` 補 `Cache-Control` 給 neurons-tw 的 atlas PNG？目前 1st / 2nd 沒設、效能也 OK，預設 punt。實作階段若 smoke 發現首屏慢可再加。
- AuthGate UI 風格要不要套 `theme-pixel-neurons` 的 GBA 像素風？預設先做 minimum-viable plain CSS，dogfood 後若顯眼再美化。
- 是否要 `_redirects` 加一條 `/3rd/* /neurons/* 301`（萬一未來想統一 1st / 2nd / 3rd 命名）？預設不加，YAGNI。
