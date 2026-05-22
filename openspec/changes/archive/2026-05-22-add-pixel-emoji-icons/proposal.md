## Why

二階 hospital mode 目前 UI 散佈 ~250+ 處 emoji（💰 ⏰ ⚠ 🏥 🚑 等 69 個 unique），由 OS 字型 native render — 風格跟 doctor sprite roster / event modal icon / hospital scene 全套 GBA pixel art 美術完全不同調，inline 看是 cartoon vector，跟周圍的 P2 頂級 pixel art chrome 並排顯得突兀。新增 pixel-art emoji icon 套件讓 UI 視覺統一到 GBA aesthetic、跟 doctor sprite / fate card pack art / event modal icon 同調。

選在此時做的理由：(1) doctor sprite roster + event modal icons 已 ship 並建立 GBA pixel art baseline、其他 UI chrome（按鈕、chip、help menu icon）跟 baseline mismatch 已成可見的視覺債；(2) Codex `$imagegen` pipeline 已驗證可行（單張 ~1:50 wall + 33-60k tokens）、跟 doctor sprite 用同套工具產出同調風格；(3) 純 additive infrastructure（新 PNG asset + 新 React component + lookup map），不動 engine API / spec contract / content pack。

## What Changes

- 新增 65 張 64×64 GBA-style pixel-art PNG asset 到 `apps/medexam2-hospital-tw/public/icons/emoji/<codepoint>.png`，檔名沿用 Twemoji codepoint 規範（lowercase hex，例 `1f4b0.png` = 💰）。
- 透過 Codex CLI `$imagegen` 共 8 個 grid prompt 平行 batch 產出（7 × 3×3 + 1 × 2×2，~30 min wall + ~280k tokens）。
- 新增 `<EmojiIcon char="💰" size={20} />` React component（`apps/medexam2-hospital-tw/src/components/EmojiIcon.tsx`），無對應 PNG 時 fallback 為原生 emoji `<span>`。
- 新增 manifest helper `apps/medexam2-hospital-tw/src/lib/emoji-icons.ts` 提供 `emojiIconUrl(emoji)` / `hasEmojiIcon(emoji)`，內含 emoji → 檔名 lookup map + VS-16 (U+FE0F) normalization。
- Pilot integration：`HelpMenu.tsx` 5 處 emoji swap（❓ FAB / 13 個 section icons / 💬 開啟回報表單 / 🔁 重置此帳號進度），保留 prose-inside emoji 為文字（不破壞段落 layout）。
- 剩餘 ~240+ 處 emoji 使用拆到後續 `wire-pixel-emoji-icons-batch*` change 漸進遷移（不在本 change 範圍）。
- 4 個 ASCII tree drawing 字（`─` `└` `├`）刻意 **不換** — 它們是 code comment / UI structure marker，非 emoji。

## Capabilities

### New Capabilities
<!-- none — purely additive UI infrastructure, no domain capability touched -->

### Modified Capabilities
<!-- none — no behavior change to existing capability specs. Pilot HelpMenu swap is presentation-layer only, doesn't change documented HelpMenu requirements. -->

## Impact

**Affected code:**
- `apps/medexam2-hospital-tw/public/icons/emoji/<codepoint>.png` — **NEW** 65 PNG assets (~268 KB total, ~4 KB/張 average)
- `apps/medexam2-hospital-tw/public/icons/emoji/CREDITS.md` — **NEW** provenance + license attribution
- `apps/medexam2-hospital-tw/src/lib/emoji-icons.ts` — **NEW** manifest + lookup helpers
- `apps/medexam2-hospital-tw/src/components/EmojiIcon.tsx` — **NEW** React component (img with fallback)
- `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` — pilot swap of 4 emoji usage sites

**Not affected:**
- `packages/core/` — pure UI app addition, no engine API touched
- `packages/theme-pixel-hospital/` — emoji icons are app-level chrome, not theme sprite assets
- `packages/content-medexam2-tw/` — content pack unchanged
- 一階 (`apps/medexam-tw/`) — explicitly out of scope; can reuse pipeline later if desired but separate change
- Cloud sync / R2 / Supabase — pure static asset, no data plane
- Build / deploy — Vite serves `public/` as-is via existing `base: '/study-rpg/hospital/'`; no config change

**Migration:**
- None. Pure addition. Existing emoji usage sites continue to work（fallback `<span>` matches current behavior 1:1）until later batch sweep migrates them to `<EmojiIcon>`.

**Tokens / cost:**
- ~280k Codex tokens consumed for 8 grid generations + 1 reroll (grid-1 stuck at snake/Asclepius wording, retried with "ribbon coiling around rod" mitigation).
- Total wall time ~30 min (parallel batch + 1 sequential retry + post-process).
- Output: 65 × ~4 KB PNG = 268 KB asset bundle.

**License / attribution:**
- Codex-generated content; project license applies (engine AGPL-3.0, content pack CC-BY-NC-4.0).
- Prompt formula recorded in `CREDITS.md` for reproducibility.
