## 1. Preflight

- [x] 1.1 `git status` clean — HEAD = `543d9c7 wire-pixel-emoji-icons-batch1`.
- [x] 1.2 `openspec validate wire-pixel-emoji-icons-batch2 --strict` — valid.

## 2. Per-page swap

- [x] 2.1 `LeaderboardPage.tsx` — import + 1 swap（h1 🏆）.
- [x] 2.2 `BookmarksPage.tsx` — import + 6 swap（grep 多抓一個 L64 tab `⭐ 手動收藏`：h1 📚 / tab ⭐ / tab ❌ / helper prefix 📌 / `⭐/☆ 已收藏/加入收藏` toggle / 送分 ⚖）.
- [x] 2.3 `TrainingPage.tsx` — import + 10 swap：ticket counter 💰 / pity hint conditional `🎯 下次必中` / history success conditional 🎯 / history cost chip 💰 / 缺圖 📷 / 送分 ⚖ / 退休 modal 👋 / 進修成功 modal 🎉 + pity 🎯 / 進修失敗 modal 😞.

## 3. Verify

- [x] 3.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` — clean.
- [x] 3.2 Chrome MCP smoke — 3 pages via HashRouter (`#/bookmarks`, `#/leaderboard`, `#/training`)：
  - bookmarks page DOM: h1 1f4da.png ✓, tabs `[2b50.png, 274c.png]` ✓
  - leaderboard page DOM: h1 1f3c6.png ✓
  - training page DOM: ticket-counter 1f4b0.png ✓
  - console clean per `read_console_messages onlyErrors: true`.
- [x] 3.3 `openspec validate wire-pixel-emoji-icons-batch2 --strict` (after tasks update) — pending.
- [x] 3.4 `/opsx:verify wire-pixel-emoji-icons-batch2` 3-dim check — pending.

## 4. Archive prep

- [ ] 4.1 Sync delta — append "Batch 2 integration coverage" ADDED requirement to `openspec/specs/ui-emoji-icons/spec.md`.
- [ ] 4.2 `mv .../wire-pixel-emoji-icons-batch2 .../archive/2026-05-22-wire-pixel-emoji-icons-batch2`.
- [ ] 4.3 Commit `spec(archive): merge wire-pixel-emoji-icons-batch2 — 3 pages swap` (file-by-file staging).
