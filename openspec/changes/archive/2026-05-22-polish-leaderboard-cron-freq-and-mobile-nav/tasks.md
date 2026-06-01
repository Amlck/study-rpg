## 1. Cron 30-min frequency

- [x] 1.1 改 `cloudflare/sync-worker/wrangler.jsonc` `triggers.crons` 把 `"0 * * * *"` 改成 `"0,30 * * * *"`
- [x] 1.2 更新 `cloudflare/sync-worker/wrangler.jsonc` 上方註解 hourly → every-30-min
- [x] 1.3 更新 `cloudflare/sync-worker/src/leaderboard.ts` file-header docstring（hourly → 30-min；cron expression 顯式更新）
- [ ] 1.4 `wrangler deploy` 到 production；確認 `wrangler deployments list` 有新 version 且 `schedule: 0,30 * * * *` 出現

## 2. Mobile nav overflow

- [x] 2.1 改 `apps/medexam2-hospital-tw/src/styles.css` `.app-header__meta` 加 `flex-wrap: nowrap` + `overflow-x: auto` + `-webkit-overflow-scrolling: touch` + `scrollbar-width: thin` + `scroll-snap-type: x proximity`
- [x] 2.2 加 `.app-header__meta > .nav-link { flex-shrink: 0; scroll-snap-align: start }` 防止 tab 壓扁
- [x] 2.3 加 `.app-header__meta::-webkit-scrollbar { height: 4px }` + `::-webkit-scrollbar-thumb` 桌機 affordance
- [x] 2.4 加 `@media (max-width: 480px) { ... mask-image: linear-gradient(to right, black 92%, transparent 100%) }` 右邊 fade hint

## 3. Documentation & spec

- [x] 3.1 更新 `docs/LEADERBOARD.md` 4 處 hourly mentions → 30-min（diagram + cron section header + cron rationale + monitoring + KV ops 數字 4→8/hr）
- [x] 3.2 撰寫 delta spec `## MODIFIED Requirements: Hourly KV cache refresh` (description "twice per hour at :00/:30") + scenario "30-min cron pre-computes all four filters" + "two consecutive scheduled slots" wording

## 4. Verification

- [x] 4.1 `openspec validate polish-leaderboard-cron-freq-and-mobile-nav --strict` 通過 ✓
- [x] 4.2 `pnpm -r typecheck` 全綠（8 packages clean post-edit）✓
- [x] 4.3 Chrome MCP localhost narrow viewport (606px, Chrome MCP min)：`.app-header__meta` `scrollWidth: 716 > clientWidth: 558` overflow detected, scroll right 157.5px brings 「排名 →」 into view at right edge 582 (< viewport 606) ✓
- [x] 4.4 Chrome MCP desktop viewport (1280×800)：`scrollWidth === clientWidth (716)`, overflows: false, scrollbar not visible, all 7 tabs inline ✓ — 桌機 layout 零 regression

## 5. Pre-archive

- [ ] 5.1 production worker redeployed (`wrangler deploy`) 且 cron 在 `wrangler deployments list` 顯示 `0,30 * * * *`
- [ ] 5.2 prod URL `/leaderboard` 等下個半點，`last_updated_at` 確實在 :30 推進
- [ ] 5.3 production gh-pages deploy 完成（merge → main + push 後自動觸發）+ 開 mobile viewport 在 prod 驗 nav scroll
