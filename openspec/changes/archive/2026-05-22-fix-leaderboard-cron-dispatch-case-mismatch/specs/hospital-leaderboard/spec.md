## ADDED Requirements

### Requirement: Cron dispatch handler matches wrangler trigger expression

The Worker's `scheduled(event, env, ctx)` dispatch logic (in `cloudflare/sync-worker/src/index.ts`) SHALL compare `event.cron` against the **exact cron expression strings declared in `cloudflare/sync-worker/wrangler.jsonc` `triggers.crons` array**. The implementation SHALL declare those expressions as named module-scope constants (`CRON_BACKUP_DAILY`, `CRON_LEADERBOARD_30MIN`, etc.) so the dispatch switch references the canonical constant rather than re-typing the string literal at each case. Any unknown `event.cron` value SHALL be logged via `console.error` (not `console.warn`) with a structured payload `{ cron, knownCrons }` so dispatch mismatches surface in Workers Logs immediately.

#### Scenario: Dispatch switch matches wrangler config exactly

- **WHEN** Cloudflare invokes the scheduled handler with `event.cron` equal to any string declared in `wrangler.jsonc` `triggers.crons`
- **THEN** the switch SHALL match that string via a named constant case and dispatch to the corresponding cron-handler function (e.g., `runBackupCron` / `runLeaderboardCron`); the `default` branch SHALL NOT fire for any cron string that is actually in wrangler config

#### Scenario: Unknown cron trigger surfaces as error log

- **WHEN** Cloudflare invokes the scheduled handler with an `event.cron` value not matching any declared constant
- **THEN** the handler SHALL emit `console.error("[scheduled] unknown cron trigger ...", { cron, knownCrons })` so the mismatch is visible in Workers Logs error-level filters; the handler SHALL NOT silently succeed
