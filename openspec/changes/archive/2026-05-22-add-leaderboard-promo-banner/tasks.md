## 1. New `<LeaderboardPromoBanner>` component ✓ done 2026-05-22

- [x] 1.1 Created `apps/medexam2-hospital-tw/src/components/LeaderboardPromoBanner.tsx` (~73 lines)
- [x] 1.2 JSX renders ✨ icon + headline「新功能：全二階排名榜上線」 + sub-line「對戰其他玩家、看你的醫院經營成績排名」 + gold CTA「立刻看排名 →」 + ✕ dismiss button
- [x] 1.3 `STORAGE_KEY = 'leaderboard-promo-banner-dismissed-v1'` at module scope; `readDismissed()` / `writeDismissed()` wrap localStorage in try/catch with graceful degrade (false on read error, console.warn on write error, never crash)
- [x] 1.4 `useState(false)` + `useEffect` to read on mount; dismiss handler calls `writeDismissed()` + `setDismissed(true)`
- [x] 1.5 Returns `null` when dismissed, otherwise banner JSX (verified via DOM check after dismiss)

## 2. Wire banner into HomePage ✓ done 2026-05-22

- [x] 2.1 Added `import { LeaderboardPromoBanner } from '../components/LeaderboardPromoBanner'` next to other component imports
- [x] 2.2 Mounted `<LeaderboardPromoBanner />` between `</header>` and `<div className="ticket-counter-row">` — visually it sits below the nav header and above the ticket counter row + hospital scene (cleaner than putting above ticket counter alone, since header is its own section)
- [x] 2.3 No other HomePage changes — banner self-contained, zero props

## 3. CSS ✓ done 2026-05-22

- [x] 3.1 Appended `/* ── Leaderboard promo banner ── */` section to bottom of `apps/medexam2-hospital-tw/src/styles.css`
- [x] 3.2 `.leaderboard-promo-banner` — flex layout + 2px `--frame-dark` border + 4px offset shadow + `--bg-paper` background + Cubic 11 font + 8px/12px margin/padding
- [x] 3.3 `.leaderboard-promo-banner__icon` — `flex: 0 0 auto` with inline-flex centering
- [x] 3.4 `.leaderboard-promo-banner__text` — flex column, headline 14px bold `--frame-dark`, sub-line 12px `--frame-light`
- [x] 3.5 `.leaderboard-promo-banner__cta` — gold button with 2px border + 2px shadow + hover translate+shadow effect
- [x] 3.6 `.leaderboard-promo-banner__dismiss` — 28×28 box with hover `--accent-rose` background + paper text
- [x] 3.7 Mobile `@media (max-width: 600px)` — wraps text + CTA + dismiss using flex-wrap + order for clean stack

## 4. Typecheck + build ✓ done 2026-05-22

- [x] 4.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` — zero TS errors
- [x] 4.2 `pnpm --filter @study-rpg/medexam2-hospital-tw build` — succeeds; CSS bundle 92.40 KB (gzip 15.82 KB), +2 KB delta from added banner CSS

## 5. Chrome MCP visual verify (LOCAL dev) ✓ done 2026-05-22

- [x] 5.1 Dev server up at `http://localhost:5174/study-rpg/hospital/`
- [x] 5.2 Navigate to `/` — banner renders at top with ✨ + headline + sub-line + gold CTA + ✕
- [x] 5.3 Clicked CTA — navigated to `/#/leaderboard` (HashRouter), redesigned leaderboard page loaded (Worker fetch failed in dev due to CORS, expected — prod already verified)
- [x] 5.4 Navigate back to homepage — banner still visible (no dismiss triggered)
- [x] 5.5 Clicked ✕ — banner disappeared immediately, ticket counter shifted up; F5 reload — banner stayed hidden
- [x] 5.6 `localStorage.removeItem('leaderboard-promo-banner-dismissed-v1')` + F5 — banner reappeared cleanly
- [⏭️] 5.7 Mobile breakpoint — deferred (Chrome MCP `resize_window` on this Chrome instance doesn't shrink actual viewport; CSS media query `@media (max-width: 600px)` is standard + low-risk; real-device verify deferred to post-deploy)
- [x] 5.8 `read_console_messages onlyErrors=true` — clean, no errors/warnings

## 6. Archive + commit + deploy

- [ ] 6.1 `openspec validate add-leaderboard-promo-banner` passes
- [ ] 6.2 `/opsx:archive add-leaderboard-promo-banner` — merge delta to main spec
- [ ] 6.3 Commit via auto-git skill — template `spec(archive): merge add-leaderboard-promo-banner — homepage promo banner for leaderboard discovery`
- [ ] 6.4 (Owner action) Merge track-m2 → main + git push → GitHub Pages Actions deploys to prod
- [ ] 6.5 (Owner action) Verify on prod with fresh browser (or incognito) — banner visible; dismiss → reload → still hidden
