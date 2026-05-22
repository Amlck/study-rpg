## 1. Code fix ✓ done 2026-05-22

- [x] 1.1 Located `scheduled()` handler at [src/index.ts:101](cloudflare/sync-worker/src/index.ts:101)
- [x] 1.2 Added two module-scope `const` declarations at [src/index.ts:32-33](cloudflare/sync-worker/src/index.ts:32) with comment block explaining the byte-for-byte invariant with wrangler.jsonc
- [x] 1.3 Replaced `case "0 0 * * *":` with `case CRON_BACKUP_DAILY:`
- [x] 1.4 Replaced `case "0 * * * *":` with `case CRON_LEADERBOARD_30MIN:` — actual bugfix line
- [x] 1.5 Changed `console.warn` → `console.error` with extended payload `{ cron, knownCrons }`
- [x] 1.6 Diff verified via Read — switch references both constants; default branch emits structured error

## 2. Local typecheck

- [ ] 2.1 `cd cloudflare/sync-worker && pnpm typecheck` (or whatever the worker's typecheck command is — check package.json scripts first; may be `tsc --noEmit` directly)
- [ ] 2.2 Confirm zero TS errors; the `as const` narrowing should let `case CRON_BACKUP_DAILY` work directly against `event.cron: string`

## 3. Deploy to production

- [ ] 3.1 (Owner action) `cd cloudflare/sync-worker && pnpm wrangler deploy` (or `npx wrangler deploy`); confirm output shows new version with both `0 0 * * *` and `0,30 * * * *` crons listed
- [ ] 3.2 (Owner action) `pnpm wrangler deployments list` (or via Cloudflare dashboard); confirm latest version ID is newer than `3be17865-1d80-4110-aa03-913c3fc28e81` (the current active version per CLAUDE.md) and timestamp is post-archive

## 4. Post-deploy verify

- [ ] 4.1 Wait until the next `:00` or `:30` boundary (whichever is sooner; max wait 30 min)
- [ ] 4.2 (Owner action) `pnpm wrangler tail` (or Workers Logs dashboard); confirm a log line indicating `runLeaderboardCron` ran at that boundary; confirm NO `[scheduled] unknown cron trigger` error log
- [ ] 4.3 `curl https://study-rpg-sync-worker.tony85314.workers.dev/leaderboard/composite | jq '.last_updated_at'` and convert to local time; confirm timestamp is within the last 30 min (proves cron actually wrote KV)
- [ ] 4.4 Refresh the leaderboard UI in browser; confirm「上次更新：MM/DD HH:MM」 now reflects the recent half-hour boundary

## 5. Archive

- [ ] 5.1 `openspec validate fix-leaderboard-cron-dispatch-case-mismatch` passes
- [ ] 5.2 `/opsx:archive fix-leaderboard-cron-dispatch-case-mismatch` — sync delta to main spec (adds new requirement to `openspec/specs/hospital-leaderboard/spec.md`)
- [ ] 5.3 Commit via auto-git skill — template `fix(cron): dispatch case mismatch silently dropping every-30-min leaderboard cron`
