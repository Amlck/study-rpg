## Context

Cloudflare Workers' `scheduled(event, env, ctx)` handler receives `event.cron`, which is the **literal cron expression string from wrangler.jsonc `triggers.crons` array** — not a resolved firing time. So if wrangler has `["0 0 * * *", "0,30 * * * *"]`, every scheduled invocation `event.cron` will be one of those two exact strings depending on which schedule fired. To dispatch correctly, code-side handlers MUST compare against the same exact strings.

Today's bug: polish change updated wrangler's leaderboard cron from `"0 * * * *"` to `"0,30 * * * *"` but left the dispatch case at the old string. Silent failure mode — `default` branch only emits `console.warn`, so nothing surfaced until owner noticed stale UI timestamp.

This is structurally the same class of bug as `~/.claude/imports/coding_principles.md` § 6 (Schema Canonical Form): an "enum-like" value (cron expression) duplicated across multiple files without a normalization layer.

## Goals / Non-Goals

**Goals:**
- Cron switch case matches wrangler config so every-30-min leaderboard cron actually fires.
- Introduce a canonical constant for each cron expression so future config changes only require touching wrangler + one constant — not hunting for switch cases scattered in code.
- Upgrade silent failure to loud failure: unknown cron string emits `console.error` + structured log so the next mismatch surfaces in Workers Logs immediately.

**Non-Goals:**
- Refactoring wrangler.jsonc to import cron strings from TypeScript (Cloudflare wrangler config files don't support TS imports — strings will continue to be defined in JSON config and TS code, but the canonical reference shifts to the constant on the code side).
- Changing cron freq or behavior — `runLeaderboardCron()` and `runBackupCron()` bodies untouched.
- Backfilling stale data — natural next cron tick (post-deploy) overwrites the stale KV snapshot.

## Decisions

### 1. Named constants in `src/index.ts` (not new `crons.ts` module)

**Decision**: Add two `const` declarations at module scope in `cloudflare/sync-worker/src/index.ts`:

```ts
// MUST match wrangler.jsonc `triggers.crons` exactly. Cloudflare passes the
// literal expression string as event.cron — string-equality matters.
const CRON_BACKUP_DAILY = "0 0 * * *" as const;
const CRON_LEADERBOARD_30MIN = "0,30 * * * *" as const;
```

Reference them in the switch:

```ts
switch (event.cron) {
  case CRON_BACKUP_DAILY:
    ctx.waitUntil(runBackupCron(env));
    return;
  case CRON_LEADERBOARD_30MIN:
    ctx.waitUntil(runLeaderboardCron(env));
    return;
  default:
    console.error("[scheduled] unknown cron trigger — wrangler.jsonc may be out of sync with src/index.ts", { cron: event.cron });
}
```

**Why**:
- Keeps the file count flat. A whole `crons.ts` module for two constants is overkill for this Worker scale.
- `as const` narrows the type so `event.cron` (typed `string`) can still match via case (literal narrowing works in `switch`).
- The comment above the constants is the **documentation-side check** — anyone changing wrangler.jsonc cron is signposted to also bump the constant. Codified discipline > hoping someone remembers.

**Alternative considered**: Read cron strings from wrangler.jsonc at build time (e.g., via tsup config or static import). Rejected — JSON imports of `.jsonc` files require build setup, and even with that, you still have two separate strings in two files; just shifts the duplication. Not worth the build complexity for a 2-cron Worker.

### 2. `console.error` (not `warn`) on dispatch miss

**Decision**: Change [src/index.ts:103](cloudflare/sync-worker/src/index.ts:103) `console.warn(...)` to `console.error(...)` and include structured payload `{ cron: event.cron, knownCrons: [CRON_BACKUP_DAILY, CRON_LEADERBOARD_30MIN] }`.

**Why**:
- `console.warn` in Cloudflare Workers Logs is easy to scroll past during routine checks. `console.error` shows up in error-only filters + triggers any monitoring alarms set on "error" level.
- Including `knownCrons` payload makes the log self-diagnostic — operator sees "got X, expected one of Y" and fixes it in < 1 min.
- This is the **"No Silent Errors"** rule from `coding_principles.md` § 5 applied to schedule dispatch — a captured error that isn't surfaced is the worst case.

**Alternative considered**: Throw an exception. Rejected — Cloudflare's scheduled() handler doesn't retry on exception, and throwing wouldn't surface any louder than `console.error`. The exception would just kill the invocation silently the same way.

### 3. No spec.md edit to `Hourly KV cache refresh` — add a sibling requirement

**Decision**: The polish-change-modified「Hourly KV cache refresh」 requirement already describes the contract correctly (twice-per-hour at `:00` / `:30`). Adding handler-dispatch wording into that requirement would conflate "what the system promises" with "how the code is structured" — not great spec hygiene.

Instead, add a **NEW sibling requirement「Cron dispatch handler matches wrangler trigger expression」** that captures the implementation-level invariant. This requirement is small + focused + testable via a quick code-side check (does the constant match wrangler.jsonc?).

**Why**:
- Keeps "what" and "how" separate: the user-facing freshness contract is one requirement; the implementation invariant that prevents a regression is a separate requirement.
- Adding "Cron dispatch handler matches wrangler trigger expression" as a sibling means future polish/refactor changes to either side will see the spec and remember to sync both.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Forgetting to `wrangler deploy` after archive — code lands in git but cron still silently fails in prod | tasks.md explicit deploy step + verify-after-deploy task (check Workers Logs for `[scheduled] unknown cron trigger` absence at next tick); owner can confirm in 30 min wall-time |
| New constant + switch case lands but a typo (`"0,30 * * * "` missing one wildcard) | typecheck doesn't catch it (still valid string), but `console.error` on `default` branch will fire at next tick and surface in Logs immediately |
| Cloudflare changes how it passes `event.cron` to handler (e.g., resolves to specific time) | Speculative — current Cloudflare docs are explicit that `event.cron` is the wrangler expression string. If they ever change, the `default` branch would catch it and log; we'd fix in a hotfix |
| Polish change had unchecked tasks 1.4 + 5.1 ("wrangler deploy") so maybe Worker was never re-deployed at all → cron still hourly | Either way, this hotfix's deploy step is the canonical "deploy worker with correct dispatch" action; whether the prior state was "hourly cron still running" or "30-min cron dispatching to default" doesn't affect the fix |

## Open Questions

**Q1**: Should we add a unit test or smoke that asserts the two constants match `wrangler.jsonc` `triggers.crons`? — Out of scope for this hotfix. Worker has no test suite today; adding one for one assertion is overkill. The structured error log + manual post-deploy verify is enough.

**Q2**: Should daily backup cron string `"0 0 * * *"` also get a constant rename for symmetry? — Yes, included in tasks.md to keep the pattern consistent.
