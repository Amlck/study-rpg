## Why

`polish-leaderboard-cron-freq-and-mobile-nav` (archived 2026-05-22) changed the leaderboard cron freq from hourly (`"0 * * * *"`) to every-30-min (`"0,30 * * * *"`) in [cloudflare/sync-worker/wrangler.jsonc:54-55](cloudflare/sync-worker/wrangler.jsonc:54), but **left the dispatch switch case in [cloudflare/sync-worker/src/index.ts:99](cloudflare/sync-worker/src/index.ts:99) unchanged**. Cloudflare passes the full cron expression string (the one declared in wrangler, not the resolved time) as `event.cron` to the scheduled handler. So:

- Wrangler now triggers at `:00` and `:30` and passes `event.cron = "0,30 * * * *"`
- The switch case only matches `"0 * * * *"` (old hourly string)
- Every trigger silently falls to the `default` branch (`console.warn("[scheduled] unknown cron trigger")`)
- `runLeaderboardCron()` has not been called since the polish change deployed

Result: leaderboard KV snapshot is stuck at whatever the last hourly tick wrote (the on-prod symptom is owner seeing「上次更新：05/22 上午10:00」at 11:50, ~2 hours of staleness). All players see the same stale Top 100. This is a partial-rollout failure — wrangler config moved, code didn't.

Same root-cause class as `coding_principles.md` § 6 (Schema Canonical Form): cron expression is an enum-like string duplicated in two places without a single source of truth. Today's fix is the one-line patch; the broader principle fix (a shared constant) is in scope to prevent the next re-occurrence.

## What Changes

- Update [cloudflare/sync-worker/src/index.ts:99](cloudflare/sync-worker/src/index.ts:99) `scheduled()` switch case from `case "0 * * * *":` to `case "0,30 * * * *":` so the every-30-min cron expression matches.
- Extract the two cron expressions (`"0 0 * * *"` daily backup + `"0,30 * * * *"` leaderboard) into named constants in `cloudflare/sync-worker/src/index.ts` (or a small shared `crons.ts`), and reference those constants in the switch. Next time wrangler.jsonc cron schedule changes, code change is one-line in the constant and the switch keeps working.
- Add a runtime safety net: when the `default` branch fires, emit a `console.error` (not just `console.warn`) AND record a structured log line with the unknown cron string so future schedule-mismatches surface in Workers Logs immediately.
- Owner deploys via `wrangler deploy` (post-archive, manual action — Worker deploy is operator-only).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities

- `hospital-leaderboard`: The existing「Hourly KV cache refresh」 requirement (modified by polish change to say「twice per hour at :00 / :30」) keeps its current spec wording — that contract is correct. This change adds a NEW requirement「Cron dispatch handler matches wrangler trigger expression」 capturing the implementation-level invariant that the scheduled handler MUST dispatch on the same cron expression string that wrangler declares (so the next config change doesn't re-introduce this bug).

## Impact

**Affected code**:
- `cloudflare/sync-worker/src/index.ts` — switch case `"0 * * * *"` → `"0,30 * * * *"`; named constants for both crons; upgrade default branch warning → error + structured log

**Unaffected**:
- `cloudflare/sync-worker/wrangler.jsonc` — already correct after polish change
- `cloudflare/sync-worker/src/leaderboard.ts` — `runLeaderboardCron()` body unchanged
- D1 schema, KV snapshot format, client app code (`apps/medexam2-hospital-tw`)
- Daily backup cron (`"0 0 * * *"`) — already matches its switch case

**Dependencies**: none added.

**Risk**: P5 拉完了 (zero — one-line code change + adding constants + log severity bump; surface area minimal).

**Deploy gate**: `wrangler deploy` from `cloudflare/sync-worker/` directory required after archive. Verify post-deploy that next `:00` or `:30` tick:
- Workers Logs shows `[leaderboard cron] computed 4 snapshots` (or equivalent existing emission from `runLeaderboardCron`)
- Leaderboard `last_updated_at` advances to the most recent half-hour boundary
- No `[scheduled] unknown cron trigger` warnings in logs

**Out of scope**:
- Refactoring wrangler.jsonc to import cron strings from a `.ts` file (Cloudflare wrangler config can't import TS source — strings stay duplicated, but the new constant on the code side becomes the canonical source the docs reference)
- Updating polish change's archived tasks (1.4 + 5.1 unchecked deploy items) — those are historical; this hotfix supersedes
