## Why

`add-hospital-leaderboard` shipped 2026-05-21 + `redesign-leaderboard-as-pixel-table` shipped 2026-05-22 (live on prod with pixel tabular grid, medal sprites, mobile collapse), but the leaderboard remains **discovery-limited**: players only encounter it if they happen to click the「排名」nav link from the top header. There's no in-app prompt that says「new feature, go check it out」. Today's leaderboard prod data confirms this — only 3 players opted in across the entire 二階 player base. The redesigned UI is wasted if players don't know to look.

Owner-stated 2026-05-22 intent:「為所有玩家在 homepage 加上一個要手動關掉的 banner，加強宣傳排名系統」.

## What Changes

- Add a new `<LeaderboardPromoBanner>` component rendered at the top of the `<HomePage>` (above the hospital scene + recruitment banner stack), pixel-style frame with copy + CTA「立刻看排名」+ dismiss button「✕」 on the right edge.
- Persist the dismiss flag in `localStorage` under key `leaderboard-promo-banner-dismissed-v1`. Single boolean (no snooze / escalation / re-show logic — owner said「手動關掉」, dismissed = forever).
- Banner SHALL be visible to ALL players (authed + anonymous) until they dismiss — no auth gate. Anonymous users who click the CTA land on the leaderboard page, where the existing「未登入 — 登入後可查看自己的排名」 chip directs them to sign in if they want to participate.
- Banner CTA links to `/#/leaderboard` (HashRouter, same as the existing「排名」nav link).
- Add a small「✨」 emoji icon (already in pixel-emoji manifest as `2728.png`) at the start of the banner to draw eye attention.

## Capabilities

### New Capabilities
<!-- none — pure UI addition on top of existing hospital-leaderboard capability -->

### Modified Capabilities

- `hospital-leaderboard`: New requirement「Homepage promo banner promotes leaderboard discovery」 — defines the banner's visibility lifecycle (visible until dismissed via localStorage), styling intent (pixel `.frame` consistent with rest of 二階 shell), and dismiss persistence (localStorage key `leaderboard-promo-banner-dismissed-v1`, single boolean, no escalation).

## Impact

**Affected code**:
- `apps/medexam2-hospital-tw/src/components/LeaderboardPromoBanner.tsx` — NEW (~50 lines)
- `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` — insert `<LeaderboardPromoBanner />` at top of returned JSX, conditional render (3-line addition)
- `apps/medexam2-hospital-tw/src/styles.css` — add `~30 lines of CSS for `.leaderboard-promo-banner` class chain (frame border + offset shadow + flex layout + dismiss button hover state)

**Unaffected**:
- D1 / KV / Worker — no backend touched (banner is pure client-side UI)
- `LeaderboardPage` itself — banner just links into existing page, no leaderboard-page changes
- Opt-in flow (`LeaderboardOptInModal`), Dexie `leaderboardProfile` schema, sync push hook — unchanged
- Other HomePage components (HospitalScene, RecruitmentBanner, QuizModal, ticket counters, etc.) — unchanged

**Dependencies**: none added. Uses existing `<Link>` from `react-router-dom` + `<EmojiIcon>` for ✨ icon.

**Risk**: P5 拉完了 (zero — pure UI addition, opt-in via dismiss button means worst case = annoying but easily dismissed). One edge case to handle: `localStorage` quota / disabled scenarios (private mode, Safari ITP, quota exceeded) — gracefully degrades by treating "can't read localStorage" as「never dismissed」so banner shows every load (no crash, just one extra dismiss action per browser session).

**Out of scope**:
- Snooze / escalation / re-show logic (owner said「手動關掉」, single boolean dismiss)
- A/B testing or opt-in funnel tracking (no analytics added)
- Banner variants per active filter or per player tier (one universal banner for all)
- Animation on mount (could be polish; not first-pass)
- Pixel-styled `<dialog>` modal alternative (banner is intentionally lower-friction than modal)
- Same banner on 一階 (`apps/medexam-tw`) — 一階 has no leaderboard, so no promo
