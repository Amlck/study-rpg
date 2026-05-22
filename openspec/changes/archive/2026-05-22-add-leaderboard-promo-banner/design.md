## Context

Leaderboard shipped over the past 2 days (`add-hospital-leaderboard` + 4 follow-up polish/redesign changes). Prod KV snapshot shows only 3 opted-in players — feature is built but discovery-starved. Owner wants a homepage promo banner so all visitors see the leaderboard exists.

The hospital app already has 1 banner pattern shipped: [MigrationBanner.tsx](apps/medexam2-hospital-tw/src/components/MigrationBanner.tsx) (234 lines) which has a complex snooze + escalation + 3-dismiss-in-7-days logic. That's the right pattern for safety-critical migrations (data could be lost if user never migrates). It is **not** the right pattern for feature promotion — promo banner should respect a single dismiss forever.

## Goals / Non-Goals

**Goals:**
- Surface the leaderboard feature to ALL players (authed + anon) without requiring discovery click.
- Single dismiss button → never show again (per owner「手動關掉」).
- Pixel-style frame consistent with rest of 二階 shell — no new design tokens.
- Zero impact on existing HomePage data flow, leaderboard sync, or opt-in modal.

**Non-Goals:**
- Snooze / escalation / re-show logic (out of scope, MigrationBanner-style is overkill).
- A/B testing or analytics — no `track('banner_clicked')` calls; raw conversion can be inferred from leaderboard opt-in growth.
- Banner on 一階 (`apps/medexam-tw`) — 一階 has no leaderboard.
- Tighter dismiss persistence (e.g., Dexie row tied to user) — localStorage is sufficient for a UI nag; cross-device re-dismissal is acceptable friction.

## Decisions

### 1. localStorage for dismiss state (not Dexie `leaderboardProfile.dismissed_at`)

**Decision**: Single key `leaderboard-promo-banner-dismissed-v1` in localStorage. Value is `"true"` once dismissed; absent or any other value = not dismissed.

**Why**:
- Banner promo is a UI preference, not user-account state. Dismissing on phone should not sync to laptop's leaderboardProfile — different ergonomic expectation.
- localStorage works for anonymous users (no auth required). If we used `leaderboardProfile.dismissed_at` (Dexie), anon users couldn't dismiss persistently.
- Already-existing `leaderboardProfile.dismissed_at` field is for the **opt-in modal**'s「不再顯示」option — a different UI element (the modal that appears on first leaderboard visit). Reusing that field would conflate two different dismiss semantics.
- Versioned key (`-v1` suffix) so future changes to the banner copy / behavior can force re-show by bumping to `-v2` if owner ever wants to re-promote after a major redesign.

**Alternative considered**: Dexie row tied to user_id. Rejected — couples banner UX to auth, complicates anon-user flow, and creates cross-device coupling we don't want.

**Alternative considered**: sessionStorage (forgets on tab close). Rejected — user said「手動關掉」 = dismissed forever, sessionStorage would re-show every browser restart.

### 2. Full-bleed banner above the page content (not chip / inline card)

**Decision**: Render `<LeaderboardPromoBanner />` as the **first child** of HomePage's main element, full-bleed (matches the existing `.app-shell` max-width). Banner is a `<div>` with `.frame`-style border (2px `--frame-dark` + 4px offset `box-shadow`) + horizontal flex layout: ✨ icon | text + CTA | dismiss ✕ button.

**Why**:
- Top-of-page placement maximizes discoverability — first thing player sees when opening hospital app.
- Full-bleed (vs chip) gives the banner enough visual weight that it's not accidentally overlooked but doesn't overwhelm (single row, small padding).
- Pixel `.frame` styling matches `RoomCard` / `MigrationBanner` / `RecruitmentBanner` / all other 二階 visual chrome.
- Inline-row CTA button (rather than full-width row with separate CTA below) keeps the banner one-line on desktop, two-line wrap on mobile if needed.

**Alternative considered**: Sidebar chip floating bottom-right (like Discord notification badges). Rejected — easy to miss, doesn't match the pixel-RPG visual language.

**Alternative considered**: Modal popup on first homepage visit. Rejected — friction too high for feature discovery (and we already have the opt-in modal that fires on leaderboard click; double modals would be aggressive).

### 3. Show to ALL players (authed + anonymous), NOT auth-gated

**Decision**: Banner visibility depends ONLY on the localStorage dismiss flag. No `useAuth()` check.

**Why**:
- Anonymous players seeing the banner → click「立刻看排名」 → land on `/#/leaderboard` → see existing「未登入」 chip + footer disclosure → optional sign-in to participate. This is the **natural discovery funnel**.
- Auth-gating the banner would mean anon users don't even know the leaderboard exists, which defeats the promo purpose.
- The "dismiss" action stores in localStorage and works fine without auth.

**Alternative considered**: Only show to authed-but-not-opted-in users. Rejected — too narrow, misses anon users entirely; also requires React Suspense or loading-state handling for the `useAuth()` race.

### 4. Single-button dismiss (✕ on the right), not「Don't show again」 modal confirmation

**Decision**: One click on the ✕ button = dismissed forever. No confirmation dialog.

**Why**:
- Promo banner is low-stakes (worst case: player wants to see it again later → opens devtools or wipes localStorage). The 2-step「Are you sure?」 dialog feels patronizing for a banner you can just hide.
- Owner explicitly said「手動關掉」 — implies a single action.
- Matches industry norm — Linear / Notion / Slack feature-promo banners are all single-click dismiss.

**Alternative considered**: Replace ✕ with「不再顯示」text button (longer, more deliberate). Could go either way; ✕ is more compact + universally understood. Decision: start with ✕, owner can ask for text label in CSS polish iteration.

### 5. Banner copy + CTA wording

**Decision**:
- Headline:「新功能：全二階排名榜上線」
- Sub-line:「對戰其他玩家、看你的醫院經營成績排名」
- CTA: 「立刻看排名 →」 with arrow indicating "click takes you somewhere"
- ✨ icon at the start for eye-catch

**Why**:
- "新功能" signals novelty (the redesign just shipped, leaderboard data was sparse) — invites curiosity.
- "對戰其他玩家" frames it as social/competitive, not just statistics — owner's target user is medical students who'd respond to competition.
- "立刻看排名 →" is action-oriented; arrow ↪ visual cue this is a link.
- ✨ matches the existing emoji-icon style (other places use ⭐ / 💡 / 🎁) without being too aggressive.

**Owner can override copy** in tasks.md task 1.2 with a single Edit if these don't feel right.

### 6. Position relative to other HomePage banners

**Decision**: Render order from top:
1. `<LeaderboardPromoBanner />` ← NEW, very top
2. `<MigrationBanner>` (existing M4 → R2 migration prompt; only fires for users with Supabase rows but no R2 blobs)
3. `<RecruitmentBanner>` (existing — recruitment ticket / pity counter UI)
4. `<HospitalScene>` (hospital pixel art)
5. ... rest of cards

**Why**:
- Promo > Migration > Recruitment by urgency-of-attention. Migration only shows for old-account users; recruitment is gameplay UI (always present); promo is feature discovery (until dismissed).
- Placing promo above migration banner is acceptable because (a) it's smaller, doesn't crowd; (b) migration is one-shot, promo is one-shot, they should be siblings; (c) migration banner has its own urgency styling that makes it stand out regardless.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| localStorage disabled (private mode / quota exceeded / Safari ITP) → banner always shows | Wrap localStorage read in `try/catch`; on error, treat as「not dismissed」 (show banner). Worst case: player can't persist dismiss, has to ✕ each page load. Not a crash. |
| Banner copy doesn't resonate, players ignore it | Easy to iterate — Edit the strings, push, deploy. No spec change needed. |
| Migration banner + promo banner both render simultaneously → wall of banners | MigrationBanner only fires for the specific M4→R2 user subset (small, transient). Acceptable to stack both for that overlap window. |
| Player dismisses, then later misses the leaderboard, can't re-show | Acceptable trade-off — they always have the 「排名」 nav link in the header. Banner is for first-discovery, not on-going access. |
| Banner causes layout shift on slow mobile (FOUC) | CSS is in `styles.css` which loads synchronously. Banner has fixed height once rendered. CLS minimal — verify in Chrome MCP. |

## Open Questions

- **Q1**: Should the banner also appear on the leaderboard page itself? — No, redundant. Banner is for HomePage only. Player already arrived at leaderboard means promo succeeded.
- **Q2**: Should we add a small「[已關閉]」 indicator near the header if banner was previously dismissed, so user has a way to find what they dismissed? — No, over-engineered. Owner can ask for a "show all dismissed banners" devtool later if needed.
- **Q3**: Versioning the localStorage key (-v1 suffix) — should it auto-bump to -v2 if owner wants to re-promote later? — Yes, that's exactly why I added the version suffix. Bump to -v2 when re-promoting after a major leaderboard redesign.
