## ADDED Requirements

### Requirement: Homepage promo banner promotes leaderboard discovery

The hospital app HomePage SHALL render a dismissible promo banner at the top of the page that surfaces the leaderboard feature to all visitors (authed + anonymous). The banner SHALL include a headline, sub-line description, a call-to-action link to `/#/leaderboard`, and a single dismiss button (✕). Dismiss state SHALL be persisted in localStorage under a versioned key (e.g., `leaderboard-promo-banner-dismissed-v1`) so future major leaderboard changes can force the banner to re-appear by bumping the version suffix. The banner styling SHALL use the existing pixel `.frame` design tokens (2px `--frame-dark` border + 4px offset shadow + `--bg-paper` background + Cubic 11 font) so it visually integrates with the rest of the 二階 hospital shell.

#### Scenario: Banner visible on first homepage visit

- **WHEN** any player (authed or anonymous) opens the HomePage and the localStorage key `leaderboard-promo-banner-dismissed-v1` is absent or not equal to `"true"`
- **THEN** the banner SHALL render at the top of the page, above all other homepage cards / banners / hospital scene

#### Scenario: Banner hidden after dismiss

- **WHEN** the player clicks the dismiss button (✕) once
- **THEN** the banner SHALL hide immediately and localStorage SHALL be updated to `"leaderboard-promo-banner-dismissed-v1" = "true"`; subsequent HomePage visits SHALL NOT render the banner unless localStorage is cleared or the version suffix bumps

#### Scenario: CTA links to leaderboard

- **WHEN** the player clicks the call-to-action link
- **THEN** the app SHALL navigate to `/#/leaderboard` via the existing HashRouter (same route as the top-nav「排名」 link); banner SHALL remain rendered on the previous page (the navigation is by hash, leaderboard page is a separate route render)

#### Scenario: Anonymous user clicks CTA

- **WHEN** an anonymous (not signed in) player clicks the CTA and lands on the leaderboard page
- **THEN** the existing「未登入 — 登入後可查看自己的排名」 chip SHALL render in place of the my-rank chip (existing behavior, unchanged); the player MAY sign in via the existing Sign-in button to participate

#### Scenario: localStorage unavailable degrades gracefully

- **WHEN** localStorage read / write throws (e.g., private mode, quota exceeded, disabled by browser policy)
- **THEN** the banner SHALL treat the error as「not dismissed」 and render the banner; the dismiss ✕ button SHALL still hide the banner for the current page lifetime via React state, but the dismiss SHALL NOT persist across page loads
