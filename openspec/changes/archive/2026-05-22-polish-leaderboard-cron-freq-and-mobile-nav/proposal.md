## Why

兩個 post-launch dogfood feedback：

1. **Cron 60-min 太慢**：dogfooder 反映「上次更新：09:00」+ 等到 10:00 才看到自己變化。把 KV snapshot 刷新頻率從 hourly (`0 * * * *`) 改成 every 30 min (`0,30 * * * *`)，max staleness 從 60 min 降到 30 min。Cost 仍在 Cloudflare KV free tier 內（19.2% 配額 → 之前是 9.6%）。

2. **手機 nav tab 擠壓**：7 個 nav tab（唸書/醫院/進修/命運/醫師/收藏/排名）在 iPhone viewport（< 390px）會把「排名 →」切掉。User 看不到入口。

## What Changes

- 把 `cloudflare/sync-worker/wrangler.jsonc` 的 cron 從 `"0 * * * *"` 改成 `"0,30 * * * *"`（每整點 + 每半點）
- 更新 `openspec/specs/hospital-leaderboard/spec.md` 對應 Requirement 描述（hourly → twice per hour）
- 更新 `docs/LEADERBOARD.md` 各處 hourly mentions → "twice per hour"
- 修 `apps/medexam2-hospital-tw/src/styles.css` `.app-header__meta` 加 `flex-wrap: nowrap` + `overflow-x: auto` + scroll-snap，讓 nav 在窄 viewport 可橫向滑動
- 加 mask gradient hint（右邊 fade）讓玩家知道有更多 tabs 在右邊
- Worker 需要 manual redeploy (`wrangler deploy`) 才會 pick up 新 cron schedule

## Capabilities

### Modified Capabilities

- `hospital-leaderboard`: cron 頻率從 hourly 改成 30 min。Spec MODIFIED Requirement "Hourly KV cache refresh"。

## Impact

**Code 影響**：
- `cloudflare/sync-worker/wrangler.jsonc`（1 行）
- `apps/medexam2-hospital-tw/src/styles.css`（~15 行新增 CSS）
- `docs/LEADERBOARD.md`（~3 處字串改動）
- `openspec/specs/hospital-leaderboard/spec.md`（MODIFIED 1 個 requirement 描述）

**Infrastructure**：
- Cloudflare KV free tier writes: 9.6% → 19.2%（仍遠低於 100%）
- Worker 額外 24 invocations/day（總 48/day vs 100K/day free tier — trivial）
- 無新 dependency / 無 schema 變動

**Deploy**：
- Worker 要手動 `wrangler deploy`（CI `CLOUDFLARE_API_TOKEN` 還沒設）
- gh-pages 自動 deploy（CSS 改動）

**Non-goals**：
- ❌ 不改 nav 內容 / 不加新 tab
- ❌ 不改其他 page 的 mobile layout
- ❌ 不改桌機 layout（横向 scroll 只在窄 viewport 觸發）
- ❌ 不改一階 app（一階 nav tabs 數量不同，另外處理）
