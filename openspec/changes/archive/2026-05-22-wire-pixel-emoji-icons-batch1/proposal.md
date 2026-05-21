## Why

`add-pixel-emoji-icons` 已 ship 65 張 GBA-style pixel-art PNG + `<EmojiIcon>` component + HelpMenu pilot integration（5 處 swap）。剩餘 ~240 處 emoji 使用點仍是 native OS font render，跟周邊 pixel art chrome 美術不同調。本 change 是漸進遷移 batch1：6 個 hot-path component swap 完，把使用者最常碰到的 modal / banner / quiz UI 統一到 pixel art baseline。

選在此時做的理由：(1) HelpMenu pilot dogfood 觀察沒有 console error / 視覺崩、verify pipeline 跑通；(2) Chrome MCP smoke + typecheck 雙保險已建立、整批可重複跑；(3) Codex 又跑一次補回 4 個遺漏 emoji（🩺 ⬆️ ⚙️ ▼），manifest 已可覆蓋 batch1 用到的所有 emoji；(4) 提早分批 ship 比一次性 250+ 處 diff 容易 review / 容易出問題單獨 revert。

## What Changes

- 6 個 component swap inline emoji → `<EmojiIcon>` for non-prose JSX usage points:
  - `EventModal.tsx` — event spawn modal banner icons + button label prefixes
  - `BugReportModal.tsx` — form section header icons + submit button prefix
  - `QuizModal.tsx` — option indicators + status badges
  - `RecruitmentBanner.tsx` — banner header icon + locked subject badges
  - `RecruitmentResultModal.tsx` — gacha result rarity icons + close button
  - `HomePage.tsx` — chip header icons + section labels
- **Prose-inside emoji 不換**：emoji 出現在段落文字（`<p>{...some text with 💰 inline...}`）保留為 native char，避免段落 wrap + line height + 字體一致性破壞。
- **String-literal-inside emoji 不換**：`setMessage('✓ 已完成')` 之類 setState 字串內的 emoji 留作文字（HTML render 為段落、無 JSX scope）。
- **Select option 不換**：`<option>💰 經營</option>` 之類 `<select>` 內部 emoji 留作 native（HTML select 不支援 img child）。
- 範圍外：剩 ~150+ 處 emoji 散在 LeaderboardPage / BookmarksPage / TrainingPage / FateCardPage / 其他 modal、留給後續 `wire-pixel-emoji-icons-batch2` ... `batch3`.

## Capabilities

### New Capabilities
<!-- none — extends existing ui-emoji-icons capability with integration coverage requirement -->

### Modified Capabilities
- `ui-emoji-icons`: ADD a new requirement documenting batch 1 integration coverage — list the 6 components that must import + use `<EmojiIcon>` for emoji-as-icon JSX position, with grep-able verification scenarios.

## Impact

**Affected code:**
- `apps/medexam2-hospital-tw/src/components/EventModal.tsx`
- `apps/medexam2-hospital-tw/src/components/BugReportModal.tsx`
- `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`
- `apps/medexam2-hospital-tw/src/components/RecruitmentBanner.tsx`
- `apps/medexam2-hospital-tw/src/components/RecruitmentResultModal.tsx`
- `apps/medexam2-hospital-tw/src/pages/HomePage.tsx`

**Not affected:**
- `packages/core/` — UI-only swap
- `packages/theme-pixel-hospital/` — no theme asset change
- `apps/medexam2-hospital-tw/public/icons/emoji/` — no new asset; uses existing 65-icon bundle
- `EmojiIcon.tsx` / `emoji-icons.ts` — no API change
- 一階 (`apps/medexam-tw/`) — out of scope; will need separate change if/when pixel-art icons port over

**Migration:**
- None. Per-component edits; old `{emoji}` renders fall back automatically if any usage gets missed (graceful degradation).

**Risk surface:**
- JSX context error: a swap that puts `<EmojiIcon>` inside a `<select>` / string literal / non-JSX position breaks typecheck.
- Visual regression: emoji inside `<button>` label may shift due to vertical-align baseline difference; `<EmojiIcon>` already sets `verticalAlign: middle` to mitigate.
- Chrome MCP smoke per component to catch console errors / visual breaks.

**Out of scope（明確留給後續 batch）:**
- LeaderboardPage.tsx (166 lines)
- BookmarksPage.tsx (146 lines)
- TrainingPage.tsx (20)
- FateCardPage.tsx (8)
- LeaderboardOptInModal.tsx (8)
- ConflictChooserModal.tsx (7)
- ERConsultDialog.tsx (6)
- QuizBugReportSheet.tsx (6)
- AccountSwitchPrompt.tsx (6)
- Hospital.tsx (5)
- 小於 5-line 的 component 留到最後一個 batch 一次清掉
