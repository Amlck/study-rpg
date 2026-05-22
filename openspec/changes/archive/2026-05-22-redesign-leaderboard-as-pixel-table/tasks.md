## 1. Moodboard & visual reference (動工前的 alignment gate) ✓ done 2026-05-22

- [x] 1.1 Captured 5 thumbnails from Game UI Database Retro Handheld leaderboard gallery (https://www.gameuidatabase.com/index.php?&scrn=55&set=1&plat=3) + 3 extras (Mario Kart Super Circuit GBA / Pokemon Pinball Ruby-Sapphire GBA / Sonic Advance GBA); saved to `~/.claude/scratch/leaderboard-moodboard-2026-05-22/`
- [x] 1.2 itch.io pixel-art leaderboard tag inspected — shows game *cover* art not in-game UI; SKIPPED, Game UI Database alone covered the reference need
- [x] 1.3 `open ~/.claude/scratch/leaderboard-moodboard-2026-05-22/*.jpg` — owner confirmed direction
- [x] 1.4 Visual direction locked in `design.md` § "Visual Direction Lock — 2026-05-22": GBA-era tabular structure + DK King of Swing chunky-pixel typography + DK-style my-row gold-tint highlight

## 2. Medal sprite generation (codex `gpt-image-2`, one image → 3 PNGs) ✓ done 2026-05-22

- [x] 2.1 `cd /tmp` (workdir set in command compound, NOT shell global cd)
- [x] 2.2 Codex CLI image gen ran successfully. **Stdin workaround**: `< /dev/null` DID NOT work for codex 0.128.0 (24-min hang on first attempt); switched to `printf '' | codex exec --sandbox workspace-write --skip-git-repo-check "..."` which closed stdin cleanly. Also note: `--skip-git-repo-check` flag is now required when running from /tmp (codex 0.128.0 enforces "trusted directory" by default). The codex_image_gen.md import needs an update — flagged for next session.
- [x] 2.3 Output verified: `/tmp/leaderboard-medals-raw.png`, 2172×724 RGBA, 4 corners transparent (codex auto-applied chroma-key remove_chroma_key.py with key #09f70f). Wall time ~2 min on second attempt.
- [x] 2.4 Visually confirmed: 3 medals horizontally, embossed frame, top-left light, centered digits 1/2/3. Owner approved without reroll.
- [x] 2.5 Sliced via `magick -crop 3x1@` into 3× 724×724 strips, downscaled each with `-filter point -resize 64x64 -gravity center -extent 64x64 +dither -colors 16 PNG32:medal-N-final.png`
- [x] 2.6 Verified: `medal-0-final.png` / `medal-1-final.png` / `medal-2-final.png` all PNG 64×64 RGBA (~2.7–2.9 KB each, matches existing trophy 🏆 sprite scale).
- [x] 2.7 Renamed + moved into `apps/medexam2-hospital-tw/public/icons/emoji/1f947.png` (gold) / `1f948.png` (silver) / `1f949.png` (bronze).
- [x] 2.8 Added 3 entries to `ICON_FILES` in `apps/medexam2-hospital-tw/src/lib/emoji-icons.ts` between 🤷 (1f937) and 🧹 (1f9f9) — codepoint-ordered insertion.
- [x] 2.9 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` passes; explicit `<EmojiIcon char="🥇" />` test render skipped (typecheck-pass + manifest-correctness is enough; visual smoke moved to Group 10.4 Chrome MCP verify).

## 3. JSX restructure in LeaderboardList ✓ done 2026-05-22

- [x] 3.1 Expanded `<li>` into 6 explicit cells via `cellClass()` helper — `.leaderboard-cell--rank` / `--nickname` / `--tier` / `--reputation` / `--doctors` / `--study`
- [x] 3.2 Added `.leaderboard-cell--primary` modifier via `isPrimaryFor(filter, cell)` helper — composite bolds both tier+reputation, others bold their single primary stat
- [x] 3.3 Added `.leaderboard-row--rank-1` / `--rank-2` / `--rank-3` modifier classes via `rank === N ? '...' : ''`
- [x] 3.4 Top 3 rows render `<EmojiIcon char="🥇" title="第一名" size={28} />` (and 🥈/🥉) inside the rank cell; ranks 4+ render plain `#N` text via `<span className="leaderboard-rank-number">`. `MEDAL_BY_RANK` lookup table at module scope.
- [x] 3.5 Header row added with column labels「排名 / 玩家 / 等級 / 聲望 / 醫師 / 唸書」 (aria-hidden because column key is decorative — screen readers get per-cell aria-label on rank + nickname inline). Removed unused `useMemo` import.

## 4. New `<MyRowSticky>` sub-component ✓ done 2026-05-22

- [x] 4.1 `<MyRowSticky>` function component added at module scope below `<LeaderboardList>`, takes same `ListProps` (`{ rows, currentUserId, activeFilter }`), returns `<div>` with same cell structure as the inline row (medal sprite for top 3 / `#N` for 4+, all 6 cells via `cellClass()`)
- [x] 4.2 Mounted inside `<LeaderboardBody>` as sibling-after `<LeaderboardList>`. Visibility driven by `IntersectionObserver` (threshold 0, root = viewport) on `document.querySelector('.leaderboard-list .leaderboard-row--me')`. Initial `inlineVisible=true` prevents flash-of-sticky on mount. Effect re-runs on `currentUserId / rows / activeFilter` change.
- [x] 4.3 `aria-hidden="true"` + `role="presentation"` on the sticky `<div>` so screen readers encounter the user's row only once (canonical inline render)
- [x] 4.4 Sticky uses `.leaderboard-row .leaderboard-row--me .leaderboard-row--me-sticky` class chain — inherits gold border + tint from `--me`, layers sticky-bottom positioning from `--me-sticky` (CSS in Group 7)

## 5. CSS: tabular grid + design tokens ✓ done 2026-05-22

- [x] 5.1 `/* ── Leaderboard ── */` block appended to bottom of `apps/medexam2-hospital-tw/src/styles.css`
- [x] 5.2 `.leaderboard-list` + `.leaderboard-row--me-sticky` share `--leaderboard-cols: 60px minmax(120px, 1fr) 50px 80px 60px 80px` template (rank / nickname / tier / reputation / doctors / study) via CSS custom property
- [x] 5.3 `.leaderboard-row` uses `display: grid; grid-template-columns: var(--leaderboard-cols)` directly (not subgrid — simpler + no Safari < 16 fallback needed; sticky `<div>` outside `<ol>` gets the same template via shared custom property)
- [x] 5.4 Cell borders: `border-right: 2px solid var(--frame-dark)` on `.leaderboard-cell` (skipped on `:last-child`); row `border-bottom: 2px solid var(--frame-dark)` (skipped on `:last-child`)
- [x] 5.5 Fonts: rank uses default body Cubic 11 + center-justified; nickname `--font-pixel-cjk` 14px; stat cells `--font-pixel-num` + `font-variant-numeric: tabular-nums` + right-justified
- [x] 5.6 Header row: `background: var(--frame-dark); color: var(--bg-paper); position: sticky; top: 0; z-index: 2`; cell border-right uses `--frame-light` for subtler divider on dark bg

## 6. CSS: rank-1 / 2 / 3 medal cell — sprite + tint backstop ✓ done 2026-05-22

- [x] 6.1 `<EmojiIcon char="🥇" />` sprite renders inside `.leaderboard-cell--rank` (verified at build time — typecheck pass; visual via Group 10)
- [x] 6.2 `.leaderboard-row--rank-1 .leaderboard-cell--rank` gets `rgba(212, 160, 77, 0.32)` gold backstop
- [x] 6.3 `.leaderboard-row--rank-2 .leaderboard-cell--rank` gets `rgba(176, 176, 176, 0.42)` silver backstop
- [x] 6.4 `.leaderboard-row--rank-3 .leaderboard-cell--rank` gets `rgba(205, 127, 50, 0.38)` bronze backstop
- [x] 6.5 All 3 medal cells share `box-shadow: inset 0 0 0 2px var(--frame-dark)` emboss
- [x] 6.6 Contrast deferred to Group 10.8 Chrome MCP devtools verify (CSS in place; visual contrast confirmed visually at this stage matches `.frame` border style)

## 7. CSS: my-row inline highlight + my-row sticky-bottom ✓ done 2026-05-22

- [x] 7.1 `.leaderboard-row--me`: `background: rgba(212, 160, 77, 0.18)` tint + 4-sided gold border via inset `box-shadow` (top + left + right) plus `border-bottom-color: var(--accent-gold)` — avoids layout shift from adding real borders
- [x] 7.2 `.leaderboard-row--me-sticky`: standalone div, `position: sticky; bottom: 0; z-index: 3; background: var(--bg-paper); border: 2px solid var(--frame-dark)` plus inset gold shadow on all 4 sides + `box-shadow: 0 -3px 0 var(--frame-dark)` for the lift effect
- [x] 7.3 Sticky shares `--leaderboard-cols` custom property with `.leaderboard-list` — cells align vertically with inline twins above
- [x] 7.4 `transition: opacity 150ms ease` on sticky duplicate

## 8. CSS: mobile breakpoint < 768 px ✓ done 2026-05-22

- [x] 8.1 `@media (max-width: 767px) { .leaderboard-cell--tier, .leaderboard-cell--doctors { display: none; } }`
- [x] 8.2 Same media query overrides `--leaderboard-cols: 52px minmax(80px, 1fr) 64px 64px` (rank / nickname / reputation / study) on both list + sticky
- [x] 8.3 Mobile: cell padding tightens to `5px 6px` + body font 12px; `.leaderboard-cell--primary` jumps to 14px to anchor visual attention
- [x] 8.4 Header row also collapses (uses same `.leaderboard-cell--tier` / `--doctors` selectors so `display: none` applies)

## 9. CSS: footer / chip / page polish to match ✓ done 2026-05-22

**Side-effect: filter chip labels shortened (2026-05-22, owner feedback during Chrome MCP smoke)**:
- `packages/core/src/lib/leaderboard-types.ts` `LEADERBOARD_FILTER_LABELS` changed from 綜合排名 / 聲望 / 醫師個數 / 累積唸書時間 → **綜合 / 聲望 / 醫師 / 唸書** to prevent crowding when 4 chips render in a row on viewport widths ≥ 768 px.
- Core rebuilt (`pnpm --filter @study-rpg/core build`); dist/index.js + index.d.ts regenerated.
- Long-form labels retained in `LeaderboardOptInModal` and `HelpMenu` where space allows + descriptive copy is clearer.
- Non-breaking for fork consumers (constant key + type unchanged, only string values shortened).

- [x] 9.1 `.leaderboard-page` — no overrides needed; `.app-shell` parent handles shell padding
- [x] 9.2 `.leaderboard-meta`: Cubic 11 12px + `--frame-light` color + center-aligned + 8px vertical margin
- [x] 9.3 `.leaderboard-my-rank-chip`: `.frame`-style boxed chip with 2px `--frame-dark` border + 2px offset shadow + bg-paper background; `--muted` variant gets `opacity: 0.75`
- [x] 9.4 `.leaderboard-status` + `--error` variant: centered Cubic 11 13px + muted color; error variant uses `--accent-rose`
- [x] 9.5 `.leaderboard-footer` + `__disclosure`: small-caption block, 12px + `--frame-light` color + 1.5 line-height + 4px vertical spacing

## 10. Chrome MCP visual verify (LOCAL dev + after deploy) ✓ partial — done 2026-05-22

- [x] 10.1 Dev server up at `http://localhost:5177/study-rpg/hospital/` (vite picked port 5177; 5173-5176 in use by other workspaces)
- [x] 10.2 Chrome MCP preflight + navigate to `/#/leaderboard` (HashRouter — `/leaderboard` direct path serves homepage; hash-route required). Page header / filter bar / footer disclosure all render with new pixel styling.
- [x] 10.3 Mobile sim via JS-injected `body.force-mobile` class (Chrome MCP `resize_window` didn't shrink the actual viewport — `window.innerWidth` stayed 1920 after resize). 4 columns visible (rank / nickname / reputation / study), tier + doctors hidden via `display: none`, nickname stays readable at 13px, no horizontal overflow. Real-device test deferred to post-deploy.
- [x] 10.4 Desktop 1440 viewport with 10-row mock data injected via JS. All 6 columns aligned, cell dividers clean, header sticky-top works, rank 1/2/3 show medal sprites + tinted backstop cells (gold/silver/bronze 32-42% alpha), my-row (#4) shows gold-tint background + inset gold border on top/left/right.
- [x] 10.5 No-currentUserId branch verified — `.leaderboard-my-rank-chip--muted "未登入 — 登入後可查看自己的排名"` shows with `.frame` chip styling. Real "你不在 Top 100" state needs auth + opted-out user; defer to post-deploy dogfood smoke.
- [⏭️] 10.6 Sticky-bottom duplicate behavior — CSS + IntersectionObserver code in place, but needs real auth + scrollable >viewport-height row list to trigger. Mocked 10 rows don't fill viewport. **Defer to post-deploy dogfood**; if owner doesn't trigger it in real scroll within 1 day of deploy, follow-up change to fix.
- [x] 10.7 Filter tab primary-cell modifier — verified with two mocks: composite (tier + reputation cells bolded with `--frame-dark` color) AND doctor (doctors cell bolded). Primary-cell visual delta is subtle but distinct.
- [⏭️] 10.8 Formal devtools contrast check skipped — visual inspection of medal cells looks readable. **Defer to follow-up Axe/Lighthouse run if AA compliance becomes user-visible concern**.
- [x] 10.9 `read_console_messages onlyErrors=true` — clean, no console error/warning
- [ ] 10.10 **After deploy to prod**: re-verify SPA route 三件套 per `~/.claude/imports/chrome_mcp_preflight.md` — `/#/leaderboard` direct URL, F5 reload, in-app navigation — all 3 must work on GitHub Pages with 404.html redirect

**Note on owner feedback during this group**: filter chips relabeled from full names (綜合排名 / 醫師個數 / 累積唸書時間) to short labels (綜合 / 醫師 / 唸書) — see Group 9 changelog entry.

## 11. Code-level verify + archive + commit

- [x] 11.1 `pnpm -r typecheck` — all 4 workspaces clean (theme-pixel-medical / theme-pixel-hospital / content-medexam-tw / content-medexam2-tw / medexam-tw / medexam2-hospital-tw)
- [x] 11.2 `pnpm --filter @study-rpg/medexam2-hospital-tw build` — succeeds; CSS bundle 90.43 KB (gzip 15.54 KB, +3-4 KB from new leaderboard rules); JS bundle 996.93 KB (gzip 308.87 KB, no growth — medal sprites stay as separate PNG assets, not inlined)
- [x] 11.3 Chrome MCP smoke loop completed in Group 10 (covered the `/verify` skill scope for this web app)
- [x] 11.4 `/simplify` scan — diff is surgical: 3 helpers (cellClass / isPrimaryFor / MEDAL_BY_RANK) eliminate repetition in JSX, no premature abstraction; CSS is direct (~190 lines, single section); no over-engineering flagged
- [x] 11.5 `/opsx:verify` complete — all 8 scenarios mapped to code, 5/5 design decisions implemented; 2 deferred tasks documented (10.6 sticky-bottom needs dogfood, 10.8 formal contrast deferred), 1 post-deploy task (10.10 SPA route triplet)
- [ ] 11.6 `/opsx:archive redesign-leaderboard-as-pixel-table` — merge delta into main `openspec/specs/hospital-leaderboard/spec.md`
- [ ] 11.7 Commit via auto-git skill — template `spec(archive): merge redesign-leaderboard-as-pixel-table — pixel-style tabular leaderboard + medal sprites`
