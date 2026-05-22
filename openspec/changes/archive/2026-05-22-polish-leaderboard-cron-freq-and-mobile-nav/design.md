## Context

Add-hospital-leaderboard 上線後 24 hr 內 dogfood feedback 兩條：(1) cron freshness 太慢；(2) 手機 nav 切掉。兩條都是小 polish，合一個 change 跑完整 OpenSpec 流程（spec MODIFIED + CSS implementation detail）。

## Goals / Non-Goals

**Goals:**
- Cron 30 min 在免費 quota 內可行
- Mobile nav 全部 tab 可達（橫向 scroll）
- 桌機 layout 不變

**Non-Goals:**
- ❌ 改變 KV cache 結構或 query shape
- ❌ 改 nav tab 內容
- ❌ 一階 同步處理

## Decisions

### D1: Cron `"0,30 * * * *"` 而非 `"*/30 * * * *"`

**選擇**：用「逗號列舉法」`0,30 * * * *` 而非「step syntax」`*/30 * * * *`。

**理由**：兩者語意完全相同（每 30 min 在 :00 / :30 跑），但 `0,30` 明示「整點 + 半點」對 ops 人讀 cron 表更直覺。Cloudflare 兩種都接受。

### D2: 橫向 scroll 比 wrap-to-multiline 好

**選擇**：`overflow-x: auto` + `flex-wrap: nowrap` + scrollbar + mask gradient。

**Alternatives**：

| 方案 | 評估 | 結果 |
|---|---|---|
| **A: Horizontal scroll（本選擇）** | 保持 1 行高度、玩家熟悉 mobile swipe pattern、桌機完全不變 | ✅ |
| B: Wrap to 2 rows at < 400px | 全部 visible 但吃 2 倍垂直空間、桌機 layout 不變 | 拒絕：垂直空間 trade-off 不划算 |
| C: Hamburger menu | 多 1 個 affordance 點擊、需要 state mgmt | 拒絕：over-engineering for 7 tab nav |
| D: Icon-only at narrow viewport | 省最多空間但 affordance 降、跟既有 emoji-icon swap 規則打架 | 拒絕：UX 反退步 |

### D3: Mask gradient 提示右邊有更多內容

**選擇**：右邊 5% 區域用 `-webkit-mask-image: linear-gradient(...)` 淡出，暗示「還有可滑」。

**理由**：iOS/Safari + Chromium 對 mask-image 支援良好；fade 是 mobile UX 共識的「more content available」訊號。

### D4: Scrollbar 在 mobile 不顯示，桌機顯示細條

**選擇**：`scrollbar-width: thin` (Firefox) + `::-webkit-scrollbar { height: 4px }` (Chromium/WebKit)。在 touch device 上 OS 已隱藏，桌機顯示細 4px 條當 affordance。

### D5: 為什麼 cron 改 30 min 不違反 D4（design.md 原 D4「整點 cron + KV cache」）

原 D4 推理是「不需要 real-time、整點儀式感、free quota」。改 30 min 都不違背：
- ✅ 仍不是 real-time（30 min staleness）
- ✅ 半點刷新仍有節奏感（00:00 / 00:30 / 01:00 / 01:30...）
- ✅ KV free quota 仍剩 80%+
- ✅ Worker invocations 仍遠低於免費額度

唯一 trade-off 是「整點」變成「整點 + 半點」 — 不損 readability。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| KV writes 進入 quota 高水位（未來加更多 capability 時撞天花板）| 19.2% 仍有 5× headroom；未來加 capability 前先 measure 再決定升 paid |
| 橫向 scroll 部分 user 不直覺 | Mask gradient + 細 scrollbar 雙重 affordance；fallback 是 user 用 link in HelpMenu 入口 |
| iOS Safari mask-image 邊角 case | Apply `-webkit-` prefix；測試前 fallback 是「沒 gradient hint 但仍可滑」 |
| Worker 沒 redeploy → 新 cron schedule 不生效 | tasks.md 明示要手動 `wrangler deploy`；如果忘記 deploy，next cron 還是 60 min 跑 — 不會壞 only 不會更快 |

## Migration Plan

1. Edit wrangler.jsonc cron schedule
2. Edit CSS for nav overflow
3. Update spec.md MODIFIED requirement + docs
4. `openspec validate --strict`
5. Chrome MCP mobile-viewport visual verify on localhost (resize_window to 390x844 iPhone)
6. Manual `wrangler deploy` to production
7. Verify next half-hour cron actually fires via `/leaderboard/composite` `last_updated_at` timestamp
8. Archive + merge to main + gh-pages deploys CSS

**Rollback**：
- 改回 `"0 * * * *"` + `wrangler deploy` 還原 cron
- Revert styles.css change（純 CSS、無 logic）

## Open Questions

無 — 兩條 polish 都範圍小、決策清楚。
