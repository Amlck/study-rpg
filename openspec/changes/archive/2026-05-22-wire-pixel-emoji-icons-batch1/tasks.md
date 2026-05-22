## 1. Preflight

- [x] 1.1 `git status` clean — HEAD = `ac9ab72 add-pixel-emoji-icons`，僅 supabase/functions/ untracked foreign（不碰）.
- [x] 1.2 `openspec validate wire-pixel-emoji-icons-batch1 --strict` — `Change is valid`.
- [x] 1.3 Grep 6 components 列 emoji 位置 — 每個 component 區分了 JSX-position vs string-literal vs prose vs `<option>` child.

## 2. Per-component swap

- [x] 2.1 `EventModal.tsx` — import EmojiIcon + 5 處 h2 swap（⚠ × 2 / 🌟 / 🚑 / 📋）.
- [x] 2.2 `BugReportModal.tsx` — import EmojiIcon + 1 處 h2 swap（💬）. 16 個 CATEGORY_LABELS / SEVERITY_LABELS 內的 emoji 因為都 render 成 `<option>` child 無法 swap，保留原 char.
- [x] 2.3 `QuizModal.tsx` — import EmojiIcon + 9 處 swap：標題 📚 / 醫師 sprite fallback 🩺 / 加成 chip ✨ / 缺圖 banner 📷 / 送分題 ⚖ / bug 觸發 🐞 / 收藏 toggle ⭐☆ × 2.
- [x] 2.4 `RecruitmentBanner.tsx` — import EmojiIcon + 5 處 swap：due chip 🔴 / completion chip 🏆/✅ / 學習 📚 / 招募 🎫 / 缺圖 banner 📷.
- [x] 2.5 `RecruitmentResultModal.tsx` — import EmojiIcon + 3 處 swap：phone sprite 📞 / caller-icon 👤 / sprite fallback 🩺.
- [x] 2.6 `HomePage.tsx` — import EmojiIcon + 1 處 swap：ticket counter 🎟. ✓/✗ 不 swap（不在 codex set 內、EmojiIcon 自動 fallback）.

## 3. Verify

- [x] 3.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` — 0 errors.
- [x] 3.2 Chrome MCP smoke — navigate localhost:5174 → JS query 確認 **45 EmojiIcon img tags 在 HomePage 上 render**：sample 含 2753.png ❓ / 1f39f.png 🎟 / 2705.png ✅ / 1f4da.png 📚 / 1f3ab.png 🎫；ticket counter ✓、14 banner 學習 buttons ✓、14 banner 招募 buttons ✓.
- [x] 3.3 Console clean — `read_console_messages onlyErrors: true` 回 `No console errors or exceptions found`.
- [x] 3.4 `openspec validate wire-pixel-emoji-icons-batch1 --strict` (re-validate) — `Change is valid`.
- [x] 3.5 `/opsx:verify wire-pixel-emoji-icons-batch1` 3-dim check — 0 CRITICAL / 0 WARNING / 0 SUGGESTION; ready for archive.

## 4. Archive prep

- [ ] 4.1 `/opsx:archive wire-pixel-emoji-icons-batch1` — sync delta（MODIFIED requirement 加進 `openspec/specs/ui-emoji-icons/spec.md`）+ 移動至 `archive/2026-05-22-wire-pixel-emoji-icons-batch1/`.
- [ ] 4.2 Commit `spec(archive): merge wire-pixel-emoji-icons-batch1 — 6 components swap`（file-by-file staging per multi-agent git safety；不 push）.

## 5. Follow-up（NOT in this change）

- Batch 2 候選：LeaderboardPage.tsx (166)、BookmarksPage.tsx (146)、TrainingPage.tsx (20).
- Batch 3 候選：FateCardPage.tsx (8)、LeaderboardOptInModal.tsx (8)、ConflictChooserModal.tsx (7)、ERConsultDialog.tsx (6)、QuizBugReportSheet.tsx (6)、AccountSwitchPrompt.tsx (6)、Hospital.tsx (5)、剩餘 < 5 line component 一次掃完.
- 一階（`apps/medexam-tw/`）port 需獨立 change.
