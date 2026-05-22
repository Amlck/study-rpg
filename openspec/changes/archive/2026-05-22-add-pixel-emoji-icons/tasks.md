## 1. Asset generation pipeline

- [x] 1.1 Grep `apps/medexam2-hospital-tw/src/` for unique emoji set → 69 hits（初版用 regex 範圍，後來發現遺漏 🩺 / ⬆️ / ⚙️）.
- [x] 1.2 Pilot evaluation：手刻 16×16 (10 min, P3-) vs Twemoji 32×32 + outline pipeline (P3) vs Twemoji 64×64 純渲染 (P3) — 結論 P3 質感不夠跟 doctor sprite 同調.
- [x] 1.3 切到 Codex `$imagegen` 路線：單張 💰 pilot 1:18 wall + 34k tokens，產出 P2 頂級質感、跟 doctor sprite roster aesthetic 對齊.
- [x] 1.4 Optimize：3×3 grid prompt（9 icon / call）達 P2 質感不掉、僅 1:46 wall + 33-60k tokens → 8 個 grid call 跑完 65 icon 約 15 min wall.

## 2. Codex batch execution

- [x] 2.1 寫 `/tmp/pixel-demo/build_grids.py` 把 61 icon + 2 padding cell 拆成 7 × 3×3 grid prompt（依 Twemoji codepoint 順序、每 grid 9 個）.
- [x] 2.2 寫 `/tmp/pixel-demo/fire_grids.sh` 平行 fire 7 codex exec 帶 `--skip-git-repo-check --sandbox workspace-write`、stdin `< /dev/null` 防 hang.
- [x] 2.3 6/7 grid 在 ~7 min 內完成、grid-1 卡牆 11 min（safety filter 觸發於「single white snake coiled around a vertical rod」Asclepius 描述）.
- [x] 2.4 Kill stuck process、重寫 grid-1 prompt：snake → 「ribbon coiling around rod, similar to medical caduceus symbol」、standalone retry 1:50 wall 成功.
- [x] 2.5 補批 grid：4 個 unique emoji（🩺 ⬆️ ⚙️ ▼）原先 regex 漏掉、單 2×2 grid 1 call 補完.

## 3. Post-process pipeline

- [x] 3.1 寫 `/tmp/pixel-demo/post_process.py`：grid PNG → `magick -crop 3x3@` 切片 → 每 slice 去白 gap（30px shave）→ chroma-key corner pixel → resize 64×64 nearest-neighbor → quantize 16 色 (median cut, PIL) → save 為 `<codepoint>.png`.
- [x] 3.2 2×2 補 batch 手動 magick pipeline：chroma-key 用 explicit `#fef5ce` cream + `#ffffff` white 兩段 fuzz 12%（chroma corner sampling 對 2×2 grid 沒 robust，因 gap 寬度比例不同）.
- [x] 3.3 全部 65 PNG output 平均 ~4 KB / 張、總 268 KB.

## 4. Stage assets into repo

- [x] 4.1 Preflight：確認 `apps/medexam2-hospital-tw/public/icons/` 不存在（避免覆蓋）.
- [x] 4.2 `mkdir -p apps/medexam2-hospital-tw/public/icons/emoji/` + copy 全 65 PNG.
- [x] 4.3 寫 `CREDITS.md`：列出 codex prompt 公式（GBA pixel art / pastel cream BG / crisp outline / 8-12 色 palette）、provenance 紀錄、license attribution、coverage 清單.

## 5. Build EmojiIcon component + manifest helper

- [x] 5.1 寫 `apps/medexam2-hospital-tw/src/lib/emoji-icons.ts`：65-entry `ICON_FILES` array → `Map` 結構、`normalize(emoji)` strip VS-16 (U+FE0F)、`emojiIconUrl(emoji)` 用 `import.meta.env.BASE_URL` 拼絕對路徑、`hasEmojiIcon(emoji)` predicate.
- [x] 5.2 寫 `apps/medexam2-hospital-tw/src/components/EmojiIcon.tsx`：default size=20，img with `imageRendering: pixelated` + `verticalAlign: middle`；no PNG fallback to `<span style={{fontSize: size}}>{char}</span>`.
- [x] 5.3 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` — clean.

## 6. Pilot integration — HelpMenu.tsx

- [x] 6.1 Import `EmojiIcon` from `./EmojiIcon`.
- [x] 6.2 Swap ❓ FAB（line 268-ish）：button content `❓` → `<EmojiIcon char="❓" size={28} />`.
- [x] 6.3 Swap 13 個 section icon span：`<span className="help-menu__icon" aria-hidden>{section.icon}</span>` → 同 span 內套 `<EmojiIcon char={section.icon} size={24} />`. 10 / 13 改成 pixel art，剩 3（🩺 ⬆️ ⚙️）原本就會 fallback 為 text，後來 task 2.5 補完成功.
- [x] 6.4 Swap bug-report 按鈕 label `💬 開啟回報表單` → `<EmojiIcon char="💬" size={18} /> 開啟回報表單`.
- [x] 6.5 Swap account-reset 按鈕 label `🔁 重置此帳號進度` → `<EmojiIcon /> ...`，因為 conditional branch 改成 fragment 包 fallback.
- [x] 6.6 Typecheck clean.
- [x] 6.7 Chrome MCP smoke：dev server 5174 → navigate /study-rpg/hospital/ → click FAB → 截圖確認 modal 開、10 個 section icon pixel art 渲染、3 個 fallback span 渲染原 emoji、console clean（only React Router v7 future flag warnings 無關）.

## 7. Top-up batch — 4 missing emoji

- [x] 7.1 Codex 2×2 grid prompt：🩺 stethoscope / ⬆ up-arrow blue button / ⚙ gear / ▼ down-arrow blue button.
- [x] 7.2 Post-process（2×2 slice + explicit cream+white chroma + 64×64 + 16 色 quantize）.
- [x] 7.3 Stage 進 `public/icons/emoji/` + 更新 `emoji-icons.ts` ICON_FILES 加 4 entry + CREDITS.md coverage 段更新.
- [x] 7.4 Re-typecheck + Chrome MCP HelpMenu modal smoke：3 個 fallback span 全部變 pixel art img、🩺 teal stethoscope / ⬆ blue 上箭頭 button / ⚙ grey 齒輪 / ▼ blue 下三角 button 全部 swap 成功.

## 8. Verify

- [x] 8.1 跑 `pnpm -r typecheck` — 8 / 8 packages clean（cloudflare/sync-worker / core / content-medexam{,2}-tw / theme-pixel-{medical,hospital} / apps/medexam{,2-hospital}-tw 全綠）.
- [x] 8.2 跑 `openspec validate add-pixel-emoji-icons --strict` — `Change 'add-pixel-emoji-icons' is valid`.
- [x] 8.3 `/opsx:verify add-pixel-emoji-icons` — 0 CRITICAL / 0 WARNING / 0 SUGGESTION; off-by-one (66→65) fixed during verify; final report says "All checks passed. Ready for archive."

## 9. Archive prep

- [ ] 9.1 `/opsx:archive add-pixel-emoji-icons` — 移到 `openspec/changes/archive/2026-05-22-add-pixel-emoji-icons/`.
- [ ] 9.2 Commit `spec(archive): merge add-pixel-emoji-icons — 二階 UI emoji 改 pixel art baseline` — file-by-file staging per multi-agent git safety；不 merge 到 main（dogfood track-m2 first）.

## 10. Follow-up（NOT in this change — recorded for handoff）

- C2 bulk sweep：剩 ~240+ 處 emoji 使用點散在 30+ component，需 `wire-pixel-emoji-icons-batch1` ... `batch3` 漸進處理（method B：per-component manual review，避免 sed 誤改 prose-inside emoji）.
- 高頻 components：`HospitalScene.tsx` / `EventModal.tsx` / `BugReportModal.tsx` / `SettingsPanel.tsx` / `QuizModal.tsx` / `MentorDialog.tsx`.
- 邊角 emoji 個別重生：dogfood 中如發現某 icon 質感不夠（例如 🌟 跟 ⭐ 太像、🎟 跟 🎫 撞臉、😞 不夠 disappointed），記在後續 change 的 reroll list.
