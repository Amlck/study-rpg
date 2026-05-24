## ADDED Requirements

### Requirement: Build-time version constant

Each deployable app SHALL inject `VITE_COMMIT_SHA` at build time as a Vite
env constant. The value MUST be a non-empty string when produced by CI
(GH Actions sets `github.sha`; Cloudflare Pages sets via dashboard env
override). Local dev builds without this env var SHALL fall back to the
literal string `'dev'`.

#### Scenario: CI build injects real SHA

- **WHEN** GitHub Actions runs the deploy workflow on commit `abc1234...` (40 chars)
- **THEN** the compiled bundle's `import.meta.env.VITE_COMMIT_SHA` MUST equal `'abc1234...'`

#### Scenario: Local dev fallback

- **WHEN** running `pnpm --filter @study-rpg/medexam2-hospital-tw dev` without setting `VITE_COMMIT_SHA`
- **THEN** `import.meta.env.VITE_COMMIT_SHA` MUST equal `'dev'`

### Requirement: Static `/version.json` published with each deploy

Each app's `dist/` output SHALL include a `version.json` file at the dist
root with shape `{ "commit": "<sha>", "builtAt": "<ISO 8601>" }`. The commit
value MUST exactly match the bundled `VITE_COMMIT_SHA`. The file SHALL be
served with `Cache-Control: no-cache, max-age=0` so subsequent fetches never
hit a stale CDN copy. If the deploy host (GH Pages) does not honour custom
`Cache-Control`, the client fetch SHALL append a cache-buster query string
`?t=<Date.now()>` as a defensive fallback.

#### Scenario: version.json contents match bundle

- **WHEN** a deploy completes for commit `abc1234`
- **THEN** `GET <site>/version.json` returns HTTP 200 with body `{ "commit": "abc1234", "builtAt": "..." }`

#### Scenario: Client uses cache-buster

- **WHEN** the client fetches `/version.json` twice in quick succession
- **THEN** both fetches MUST request a unique URL (either via no-cache headers OR `?t=<timestamp>` query string) so neither is served from browser cache

### Requirement: Runtime version drift detection

The app SHALL fetch `/version.json` and compare against the compiled-in
`VITE_COMMIT_SHA` on each `visibilitychange` event where
`document.visibilityState === 'visible'`, AND at most once every 30 minutes
from a foreground tab via a `setInterval`. The 30-min timer SHALL reset on
every `visibilitychange` event so that visibility-triggered checks don't
double-fire with an imminent interval check. Fetch failures (network error,
404, malformed JSON) MUST silently no-op — version check is best-effort and
MUST NEVER produce a user-visible error.

#### Scenario: Tab regains focus triggers check

- **WHEN** the user switches to a different tab and back to the app tab
- **THEN** the app fetches `/version.json` and updates internal version-drift state

#### Scenario: Always-foreground tab periodic check

- **WHEN** the tab has been in foreground continuously for 30 min with zero visibilitychange events
- **THEN** the version check fires automatically via the interval timer

#### Scenario: Fetch failure is silent

- **WHEN** `/version.json` returns HTTP 404 or causes a network error
- **THEN** no banner appears, no toast surfaces, and no console error visible to the user appears (DEV-mode `console.debug` is permitted for owner debugging)

#### Scenario: Local dev short-circuit

- **WHEN** the compiled `localSha === 'dev'`
- **THEN** the hook MUST NOT fetch `/version.json` and MUST treat the check as `match` (banner never appears in local dev)

### Requirement: Version banner UX

When `remoteSha !== localSha` AND `localStorage.getItem('study-rpg.version-banner.dismissed-for-sha') !== remoteSha`, the app SHALL render a sticky top banner. The banner SHALL have background `#1a1a1a`, white text, ~32px height (with two-line wrap permitted on mobile viewports), copy 「新版本已上線」 (DEV builds SHALL append 「（<sha7>）」 where `<sha7>` is the first 7 chars of the remote SHA), a primary button 「重整」 that invokes `location.reload()`, and a secondary ghost button 「稍後提醒」 that writes the current `remoteSha` to `localStorage['study-rpg.version-banner.dismissed-for-sha']` and hides the banner for the rest of the session.

The banner MUST NOT block interaction with the rest of the page (it does not capture clicks or keys outside its own button area). The banner MUST sit above all other content at the highest z-index of the application shell.

#### Scenario: Mismatch shows banner

- **WHEN** localSha = `AAA`, `/version.json` returns commit `BBB`, and localStorage `dismissed-for-sha` is empty or any value other than `BBB`
- **THEN** the banner renders at the top of the viewport with both buttons visible

#### Scenario: Dismiss persists until next deploy

- **WHEN** the user clicks 「稍後提醒」 with `remoteSha = BBB`
- **THEN** `localStorage['study-rpg.version-banner.dismissed-for-sha'] = 'BBB'`, banner hides, and subsequent version checks SHALL not re-surface the banner while remote stays at `BBB`

#### Scenario: New deploy after dismiss re-surfaces banner

- **WHEN** the user has dismissed with `dismissedForSha = BBB`, and a new deploy makes `remoteSha = CCC`
- **THEN** the next version check detects `CCC !== BBB` and the banner reappears with the new `CCC` reference

#### Scenario: Reload click reloads page

- **WHEN** the user clicks 「重整」
- **THEN** `location.reload()` fires; the subsequent page load fetches the new bundle with the deployed commit SHA; on next render `localSha === remoteSha` and the banner does not reappear

### Requirement: DEV-mode shows remote SHA suffix

In `import.meta.env.DEV` builds, the banner copy SHALL include the first 7
characters of the remote SHA appended as 「（abc1234）」 for debugging
visibility. In production builds (`import.meta.env.PROD === true`), the SHA
MUST NOT appear in any user-visible UI surface — only the generic
「新版本已上線」 copy.

#### Scenario: DEV reveals SHA

- **WHEN** `import.meta.env.DEV === true` and the banner is shown with `remoteSha = 'abc1234def567...'`
- **THEN** the banner text reads「新版本已上線（abc1234）」

#### Scenario: PROD hides SHA

- **WHEN** `import.meta.env.PROD === true` and the banner is shown
- **THEN** the banner text reads only「新版本已上線」 — no SHA visible
