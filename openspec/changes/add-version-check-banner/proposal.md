## Why

Hotfix `a9006e4` (2026-05-24, harden-backfill-chain-try-catch) plus one-shot
`scripts/backfill-leaderboard-badges.ts` rescued 7 leaderboard rows whose
`badges_csv` had been silently broken by a cascade in `onPullComplete`. Root
cause amplifier: players keeping their pre-deploy browser tab open never
re-fetched the new JS bundle, so the fix code never executed on their devices
and their pushes kept sending empty payloads.

This pattern — **stale client JS bundle outliving a deploy** — is generic.
Every future deploy that changes runtime behaviour repeats the failure mode
unless the app actively detects version drift and prompts the user to reload.

## What Changes

Both `apps/medexam-tw` (一階) and `apps/medexam2-hospital-tw` (二階) gain a
client-side version-check loop:

1. **Build-time**: `VITE_COMMIT_SHA` (already injected for bug-reporting)
   becomes the compiled-in version constant.
2. **Deploy-time**: a static `/version.json` is published alongside
   `index.html` containing `{ "commit": "<sha>", "builtAt": "<ISO>" }`. Both
   GH Actions + Cloudflare Pages workflows produce this file as part of
   `dist/`.
3. **Runtime**: a small hook fetches `/version.json` (cache: no-store) on
   `visibilitychange` events AND at most once every 30 min from a foreground
   tab. On mismatch it surfaces a sticky black top banner:
   「新版本已上線」 + primary「重整」 button + ghost「稍後提醒」.

Dismissing the banner stores the dismissed-for SHA in localStorage so the
banner does not re-surface until the next deploy bumps the SHA again.
Clicking「重整」calls `location.reload()`. No auto-reload (respects consent),
no toast (too easy to miss), no modal (don't break idle income visualization).

DEV builds show the first 7 chars of the remote SHA in the banner for
debugging; PROD shows generic copy only.

## Capabilities

### ADDED Capability: app-version-check

(See `specs/app-version-check/spec.md` for full requirements.)
