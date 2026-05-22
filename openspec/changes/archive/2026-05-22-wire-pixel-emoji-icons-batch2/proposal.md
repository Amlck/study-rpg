## Why

Batch 1 已 ship 6 個高頻 modal/banner 的 emoji-as-icon swap，但**全螢幕 page-level component** 還在用 native OS emoji：

- `LeaderboardPage.tsx` — 全二階對位榜頁面，h1 標題 🏆
- `BookmarksPage.tsx` — 我的題目頁面，含 4 個 tab + 收藏 toggle + 送分題標記
- `TrainingPage.tsx` — 醫師進修頁面，含 ticket counter / pity 保底標記 / 結果 modal（成功/失敗/退休）

這 3 個 page 是 dogfood 高頻路徑（每天會經過），美術不同調的 cost 比 modal 高（modal 看完就關，page 會停留）。本 change batch 2 把 3 個 page 內所有 standalone emoji-as-icon 換成 `<EmojiIcon>`、剩 prose-inside 跟 title attribute 內的 emoji 維持文字。

## What Changes

- `LeaderboardPage.tsx` — 1 處 swap（h1 標題 🏆）
- `BookmarksPage.tsx` — 5 處 swap（h1 📚 / tab `❌ 錯題` / hint 📌 / inline-promote `⭐ 已收藏` ↔ `☆ 加入收藏` / 送分題 `⚖️ 送分題` 標記）
- `TrainingPage.tsx` — ~10 處 swap：
  - ticket-counter chip 💰
  - history cost chip `-X 💰`
  - history row pity icon 🎯（保底成功）
  - confirm modal pity hint `🎯 下次必中`
  - quiz fallback `📷 此題含附圖但尚未補齊...`
  - 送分題標記 `⚖️ 送分題...`
  - 退休 modal h2 `👋 醫師已退休`
  - 進修成功 modal h2 `🎉 進修成功！`
  - 進修成功 pity 標記 `🎯 保底觸發`
  - 進修失敗 modal h2 `😞 進修失敗`

**保留為 native 字**：
- prose-inside 後綴 `{cost} 💰` 在 `<p>` / `<strong>` 內，不破壞段落 line-height
- title attribute 內的 emoji（HTML attribute，不支援 JSX child）
- string literal 內的 ✓/✗（不在 codex set 內、EmojiIcon 也會 fallback 為 text、邏輯一致）

範圍外：剩 ~10+ 個小 component（FateCardPage、LeaderboardOptInModal、ConflictChooserModal、ERConsultDialog、QuizBugReportSheet、AccountSwitchPrompt、Hospital、MigrationBanner 等）留給 batch 3 一次清掉.

## Capabilities

### Modified Capabilities
- `ui-emoji-icons`: ADD a new requirement listing the 3 page components covered in batch 2 + grep-able verification scenarios.

## Impact

**Affected code:**
- `apps/medexam2-hospital-tw/src/pages/LeaderboardPage.tsx`
- `apps/medexam2-hospital-tw/src/pages/BookmarksPage.tsx`
- `apps/medexam2-hospital-tw/src/pages/TrainingPage.tsx`

**Not affected:**
- 同 batch 1：core / theme / content pack 全部不動；EmojiIcon API 沒擴；asset bundle 維持 65 PNG.
- 一階 (apps/medexam-tw/) 仍 out of scope.

**Risk surface:**
- TrainingPage 是最大 page（700+ lines），含多個 modal 嵌套；逐行 grep + 區分 JSX vs prose vs title attr 容易誤判. 對策：先用 grep 列出位置 + 上下文一次決定哪些 swap.
- prose-inside emoji（`{cost} 💰` 出現在 `<p>` / `<strong>`）若誤 swap 進去會破壞段落 vertical-align baseline. 對策：明確規則「emoji 出現在純文字段落內、跟其他 text 並排呈現語意片段，不換」.
- Chrome MCP smoke 不一定覆蓋每個 modal（需 trigger 進修流程、退休流程），但 typecheck + DOM count 提供 minimum guard.
