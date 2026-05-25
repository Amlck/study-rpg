## Decisions

### D1 — Version identifier: commit SHA

Reuses existing `VITE_COMMIT_SHA` env var already wired for bug-reporting
(GH Actions sets `github.sha`; Cloudflare Pages env override). No new build
step required. Finest granularity (every commit triggers banner), no manual
discipline cost.

Alternatives considered:
- **`package.json` version** — requires manual owner bump; high forget-discipline cost; misses bumps for `fix:` / hotfix work
- **Build timestamp** — too coarse; CF Pages rebuilds without source change (e.g. env var tweak) would trigger spurious banners

### D2 — `/version.json` static file over JS-embedded manifest

`/version.json` is fetched independently of the main bundle with `cache:
'no-store'`. Embedding a manifest inside the JS bundle would itself be
subject to the stale-cache problem we're trying to solve.

Deploy hosts already serve static files from `dist/`; adding one ~80 byte JSON
file is negligible.

### D3 — Polling: visibilitychange + 30 min foreground interval

`visibilitychange` covers the dominant case (player switches tabs / unlocks
phone). The 30-min foreground interval covers always-foreground tabs (single-
display gamers / minimized OS windows that don't fire visibilitychange).

30 min is the trade-off between freshness vs. network chatter — one ~80 byte
request every 30 min × N concurrent tabs is negligible at our ~10-player
scale and stays negligible at 10k-player scale.

The interval resets on every visibilitychange event so we don't get
double-fires when a tab becomes visible just before the timer fires.

### D4 — Banner UX: sticky black top bar, non-blocking

Spec: `position: sticky` top of viewport, `bg: #1a1a1a` (matches 二階 dark
theme; harmonizes with 一階 too), `color: #fff`, ~32px height with two
buttons (primary 「重整」 default-styled, ghost variant 「稍後提醒」).

Player can keep playing; banner doesn't capture clicks/keys outside its own
button area. Mobile: same component, may wrap to two lines if needed.

Alternatives considered:
- **Modal** — blocks idle income visualization, hostile UX for content engagement
- **Toast** — auto-dismiss makes it easy to miss; players in long idle session may never see it
- **Auto-reload** — fails consent principle; player may have in-progress quiz / recruit roll

### D5 — Dismiss state lives in localStorage, keyed by remote SHA

Key: `study-rpg.version-banner.dismissed-for-sha`. Value: the **remote** SHA
the player was dismissing for.

Semantics: show banner iff `localSha !== remoteSha && dismissedForSha !==
remoteSha`. This naturally:
- Hides banner immediately after reload (localSha catches up to remoteSha)
- Re-surfaces banner on next deploy (remoteSha changes; dismissedForSha
  still points at old SHA)
- Survives tab close/reopen within the same browser

No backend state — all client-side, zero new sync overhead.

### D6 — Shared logic in `packages/core`, duplicated banner per app

`packages/core/src/lib/version-check.ts` exports a pure function:

```ts
export async function checkServerVersion(localSha: string): Promise<
  | { kind: 'match' | 'drift'; remote: string }
  | { kind: 'error'; reason: string }
>
```

The hook (`use-version-check.ts`) and banner component live in each app
separately. Each app already has its own UI shell / header chrome; trying to
extract a shared banner component into a third package would add a new build
target with ~30 LOC payoff. The hook is duplicated but tiny (~50 LOC each
side, same logic, easy to keep in sync).

### D7 — DEV-mode debugging visibility

In `import.meta.env.DEV` builds, the banner appends `（<sha7>）` to the copy
where `<sha7>` is the first 7 chars of the **remote** SHA. PROD builds show
only「新版本已上線」 — keeps end-user copy clean while making debug obvious
in localhost dev sessions.

## Open Questions

- **Q1** — Should banner copy include the new SHA in PROD too for debug?
  Answer: No, generic copy in PROD. Owner can `curl /version.json` if they
  need the SHA. End-user copy stays clean.
- **Q2** — Should we ever auto-reload after N hours of dismiss but still
  stale? Answer: No — respect consent. If a critical security release ever
  needs forced update, owner can add a `forced_min_commit_sha` field to
  `/version.json` then; out of scope for this change.
- **Q3** — Should the version-check skip when `import.meta.env.DEV` AND
  `VITE_COMMIT_SHA === 'dev'`? Answer: Yes — local dev never shows banner
  (the hook short-circuits when localSha === 'dev'). Otherwise local dev
  would constantly compare 'dev' against the remote commit SHA from a
  previously-deployed `/version.json` if one happens to be served (e.g. via
  preview env).

## Risks

- **R1**: CF Pages rebuilds with same source code generate same commit SHA →
  no spurious banner. ✓
- **R2**: GH Pages serves stale `/version.json` due to CDN cache → set
  `Cache-Control: no-cache` header at host config; if host ignores
  Cache-Control, append `?t=<Date.now()>` cache-buster on fetch (lightweight
  defensive measure).
- **R3**: localStorage quota exceeded (rare; banner state is ~50 bytes) →
  the dismiss feature silently fails; banner re-appears on every
  visibilitychange. Annoying but not broken.
