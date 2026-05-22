## Why

Batch 1 (6 components, 24 sites) + batch 2 (3 pages, 17 sites) + batch 3 (12 components, 48 sites) 已 ship 共 89 處 emoji-as-icon JSX swap。本 batch 4 mop-up 收乾剩 7 個 < 5 emoji 密度的小檔，達成 medexam2 hospital app 內所有 emoji-bearing component 都通過 EmojiIcon swap pipeline 的目標（即使有些 component 內所有 emoji 都不在 codex set、最終仍是 text fallback，但語意已明確標記為 "icon position 而非 prose"）。

收尾完後，剩餘 emoji 都在合法的非 JSX 位置（string literal、HTML attribute、prose paragraph、`<option>` child、`<select>` value），確認 UI chrome 全面對齊 GBA pixel art baseline.

## What Changes

7 個 component swap：

- **MigrationBanner.tsx** — 4 處 banner icon span（🔄 / ⏳ / ✅ / ⚠）
- **StudySessionPage.tsx** — 3 處 state conditional JSX（🌙 idle / 📖 active / ⏸ paused）
- **DoctorRoster.tsx** — 2 處（sprite fallback 🩺 + rename button ✏）
- **RenameDoctorModal.tsx** — 2 處（h2 ✏ + error ⚠）
- **LeaderboardSettingsControls.tsx** — 2 處（link 🏆 / button ✏ 修改暱稱）
- **TargetedDrawTutorialOverlay.tsx** — 1 處 + COPY data structure split（把 emoji 從 title 字串拆成獨立 icon 欄位，render 時用 EmojiIcon）
- **RoomCard.tsx** — 2 處（sprite fallback 🩺 / 加成 chip ✨）

**不換**：
- `NicknameField.tsx` 的 ✓ / ✕ — 不在 codex set，swap 效果跟 keep-as-text 相同（EmojiIcon 自動 fallback），跳過避免 noise commit.
- DoctorRoster L169 `' ✦'` 同上 — 不在 set、保留為 text.
- LeaderboardSettingsControls L172 `'✓ 公開...' / '✗ 已隱藏...'` — 同上.

範圍外：
- App.tsx 內 2 個 emoji 在 code comment（非 JSX）— 不入 swap.
- services/ + lib/sync/ 內 1 個 emoji 在 string template literal — 不入 swap.

## Capabilities

### Modified Capabilities
- `ui-emoji-icons`: ADD a new requirement listing the 7 components covered in batch 4 + verification scenarios + final-coverage summary.

## Impact

**Affected code:** 7 files in `apps/medexam2-hospital-tw/src/components/` and `apps/medexam2-hospital-tw/src/pages/`.

**Not affected:** core / theme / content / asset bundle / 一階 / EmojiIcon API. 同 batch 1-3.

**Risk surface:**
- TargetedDrawTutorialOverlay 改 COPY data shape 是唯一 structural change — 加 `icon` field、render 拆出來。Risk: typecheck catches; 其他 case 純 inline swap.
- StudySessionPage 三 state conditional 是 single-character expression `state === 'idle' && '🌙 ...'`，改成 JSX fragment 要小心 truthy 判斷不變.

**Final cumulative coverage（含本 batch）**：
- 5 changes（add-pixel-emoji-icons + wire 4 batches）
- ~106 JSX swap sites
- 29 unique component / page files
- 65 pixel-art PNG asset bundle 不變
