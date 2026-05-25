## 1. Worker — D1 migration + shared helpers extraction

- [x] 1.1 Create `cloudflare/sync-worker/migrations/0003_neurons_leaderboard.sql` — `CREATE TABLE leaderboard_neurons` with all columns + CHECK constraints + indexes (`nickname_lower`, `is_public`)
- [x] 1.2 (Optional, if drift risk warrants) Extract shared helpers `verifySupabaseJWT` / `enforceLWW` / `sanityCheck` from `leaderboard.ts` into `cloudflare/sync-worker/src/lib/auth-utils.ts` + `src/lib/lww.ts`; refactor `leaderboard.ts` to consume them. Skip if it bloats the diff; document the duplication trade-off in commit message
- [x] 1.3 Manually apply migration to local D1 (`wrangler d1 migrations apply study-rpg-leaderboard --local`); verify schema with `wrangler d1 execute study-rpg-leaderboard --local --command "SELECT name FROM sqlite_master WHERE type='table'"`

## 2. Worker — neurons-leaderboard module

- [x] 2.1 Create `cloudflare/sync-worker/src/neurons-leaderboard.ts`
- [x] 2.2 Implement `POST /leaderboard/neurons/upsert` — JWT verify → sanity bounds (all 5 numeric fields + badges_csv regex + nickname format) → LWW upsert → respond 200 with `{ accepted: true | false, dropped: <reason>? }`
- [x] 2.3 Implement `GET /leaderboard/neurons/:filter` — public read of KV `leaderboard:neurons:top100:<filter>` → respond 200 with `{ rows: [...], last_updated_at: <ts> }`; 404 for unknown filter values
- [x] 2.4 Implement `GET /leaderboard/neurons/nickname-check?n=<candidate>` — JWT verify → NFKC + lowercase → query D1 `nickname_lower` index → respond 200 with `{ available: boolean }`
- [x] 2.5 Implement `POST /leaderboard/neurons/opt-out` — JWT verify → `UPDATE leaderboard_neurons SET is_public = 0, updated_at = NOW WHERE user_id = jwt.sub` → respond 200
- [x] 2.6 Implement `DELETE /leaderboard/neurons/me` — JWT verify → `DELETE FROM leaderboard_neurons WHERE user_id = jwt.sub` → respond 200
- [x] 2.7 Implement `runNeuronsLeaderboardCron(env, ctx)` — 5 D1 queries (composite / variants / ap / synapse / study sort orders), write 5 KV snapshot keys, log result
- [x] 2.8 Wire route handlers in `src/index.ts` `fetch` handler — add `if (url.pathname.startsWith('/leaderboard/neurons/'))` branch dispatching to the new module
- [x] 2.9 Extend `scheduled` dispatch in `src/index.ts` — after `runLeaderboardCron(env, ctx)`, call `runNeuronsLeaderboardCron(env, ctx)` in a try/catch that logs failures without breaking the 二階 path
- [x] 2.10 `pnpm --filter @study-rpg/sync-worker typecheck` (or workspace equivalent) succeeds; `wrangler deploy --dry-run` succeeds

## 3. Client — Dexie v4 + leaderboardProfile table

- [x] 3.1 Bump `apps/neurons-tw/src/lib/db.ts` schema version 3 → 4
- [x] 3.2 Add `leaderboardProfile` table with PK `user_id` + columns `nickname / nickname_lower / opted_in / is_public / dismissed_at / last_pushed_at`
- [x] 3.3 Add `LeaderboardProfileRow` TypeScript interface
- [x] 3.4 Verify v3 → v4 upgrade callback is purely additive (no row migration, no existing table touched)
- [x] 3.5 Update DEV `__db` exposure (in `main.tsx`) to reflect new version log

## 4. Client — Leaderboard service adapter

- [x] 4.1 Create `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts`
- [x] 4.2 Implement `buildLeaderboardPayload(userId, nickname)` — read Dexie state, compute `variant_count` (`db.neuronVariants.count()`), `family_complete` (group by familyId where group.length === 5), `total_AP` (sum of `familyAccrual.ap`), `synapse_strong` (`db.synapses.where('state').equals('strong').count()`), `total_study_min` (existing accumulator if present, else 0)
- [x] 4.3 Implement `pushNeuronsLeaderboardRow(client, payload)` — POST to `/leaderboard/neurons/upsert` with JWT
- [x] 4.4 Implement `checkNicknameAvailable(client, candidate)` — debounced 400ms GET to `/leaderboard/neurons/nickname-check`
- [x] 4.5 Implement `optOutLeaderboard(client)` — POST to `/leaderboard/neurons/opt-out` + update local `leaderboardProfile.is_public = 0`
- [x] 4.6 Implement `deleteLeaderboardRow(client)` — DELETE to `/leaderboard/neurons/me` + clear local `leaderboardProfile` row (for use in `safeResetAccountData`)
- [x] 4.7 Implement `fetchLeaderboardSnapshot(client, filter)` — GET to `/leaderboard/neurons/:filter`, return parsed rows + `last_updated_at`

## 5. Client — Opt-in modal

- [x] 5.1 Create `apps/neurons-tw/src/components/LeaderboardOptInModal.tsx`
- [x] 5.2 Layout: 5 public fields list + consent checkbox (unchecked) + nickname input with inline validation + privacy section link + submit button (disabled until consent + valid nickname)
- [x] 5.3 Nickname validation: 2-12 codepoints (`[...str].length`); debounced 400ms uniqueness check; inline errors `「暱稱長度需 2–12 字元」`/「已被使用」
- [x] 5.4 Blank nickname falls back to Google display name (subject to same length + uniqueness)
- [x] 5.5 「不再顯示」button writes `leaderboardProfile.dismissed_at = Date.now()` so modal stops auto-appearing (player can still opt in via Settings)
- [x] 5.6 On submit: write `leaderboardProfile.opted_in = true, is_public = 1, nickname = X` + call `pushNeuronsLeaderboardRow` + close modal
- [x] 5.7 Modal uses Framer Motion entry from `../lib/motion` with reduced-motion fallback

## 6. Client — Settings controls + manual push

- [x] 6.1 Create `apps/neurons-tw/src/components/LeaderboardSettingsControls.tsx`
- [x] 6.2 Display nickname (read-only, with「編輯」inline edit affordance)
- [x] 6.3 Display「公開到排行榜」toggle (calls `optOutLeaderboard` on toggle off, re-enables on toggle on)
- [x] 6.4 Display「立即更新排行榜」manual push button — calls `pushNeuronsLeaderboardRow`, disables for 3 seconds after click (rate-limit), shows last-push timestamp from `leaderboardProfile.last_pushed_at`
- [x] 6.5 Mount on a settings page or `OverviewPage` if no dedicated settings exists yet (defer dedicated settings to follow-up)

## 7. Client — LeaderboardPage route

- [x] 7.1 Create `apps/neurons-tw/src/routes/LeaderboardPage.tsx`
- [x] 7.2 5-tab strip: 綜合 / 變體收集 / AP / Synapse / 累積唸書時間 (default = 綜合)
- [x] 7.3 Tab click fetches via `fetchLeaderboardSnapshot(filter)` and caches result for this half-hour window (use `last_updated_at` from response as cache key)
- [x] 7.4 Render pixel-art tabular grid: rank / nickname / variant_count (X/55) / family_complete (X/11) / total_AP / synapse_strong / total_study_min (formatted Xh Ym)
- [x] 7.5 Rank 1/2/3 gold/silver/bronze accent styling
- [x] 7.6 My-row highlight if current user_id appears in top 100
- [x] 7.7 My-rank chip (sticky top OR sticky-bottom repeat row); shows「未加入排行」when opted-out / never opted-in
- [x] 7.8 Mobile viewport (< 768px): hide non-essential columns, keep rank + nickname + active filter's primary stat + 1 secondary stat
- [x] 7.9 Empty state: filter-specific copy (e.g., Synapse tab shows「期待第一個 strong synapse 上榜！」)
- [x] 7.10 Footer: 2 disclosure lines (integrity + scope)
- [x] 7.11 First-visit triggers `<LeaderboardOptInModal>` if `leaderboardProfile.opted_in === false` AND `dismissed_at === null`

## 8. Client — Promo banner + nav + App.tsx routing

- [x] 8.1 Create `apps/neurons-tw/src/components/LeaderboardPromoBanner.tsx`
- [x] 8.2 Banner renders headline + sub-line + CTA link + dismiss ✕ button
- [x] 8.3 LocalStorage key `neurons-leaderboard-promo-banner-dismissed-v1`; graceful degrade if localStorage throws
- [x] 8.4 Mount `<LeaderboardPromoBanner />` at the top of `OverviewPage.tsx`
- [x] 8.5 Add `/leaderboard` route in `App.tsx` `<Routes>` rendering `<LeaderboardPage />`
- [x] 8.6 Add「排名」nav link in App.tsx nav strip

## 9. Build + typecheck

- [x] 9.1 `pnpm -r typecheck` clean
- [x] 9.2 `pnpm -r build` succeeds across all 4 affected packages
- [x] 9.3 Worker `wrangler deploy --dry-run` succeeds without errors

## 10. Verify — Chrome MCP smoke

- [x] 10.1 Preflight `mcp__Claude_in_Chrome__list_connected_browsers`
- [x] 10.2 Boot neurons-tw dev server (`pnpm --filter @study-rpg/neurons-tw dev`)
- [x] 10.3 Navigate to root; verify promo banner renders at top of OverviewPage
- [x] 10.4 Click promo banner CTA → navigate to `/leaderboard` → opt-in modal renders
- [x] 10.5 Test consent gate: submit button disabled without checkbox; enabled after check + valid nickname
- [x] 10.6 Test nickname validation: <2 chars + >12 chars + valid → inline errors / OK
- [x] 10.7 Test nickname uniqueness: enter existing nickname → debounced check returns「已被使用」
- [x] 10.8 Submit opt-in → modal closes → D1 row created via Worker (verify via `wrangler d1 execute ... --command "SELECT * FROM leaderboard_neurons WHERE user_id = ..."`)
- [x] 10.9 LeaderboardPage renders 5 tabs; switching tabs updates ranking
- [x] 10.10 Test opt-out toggle in settings → POST opt-out → next KV refresh excludes player (verify via `GET /leaderboard/neurons/composite` returns row count - 1)
- [x] 10.11 Re-enable opt-in toggle → row reappears next refresh
- [x] 10.12 Test manual push button → triggers upsert, button disables 3s
- [x] 10.13 Test promo banner dismiss → reload → banner stays hidden
- [x] 10.14 Verify 二階 isolation: open 二階 app → 二階 LeaderboardPage queries unaffected, no neurons row pollution
- [x] 10.15 Verify SPA route F5 on `/leaderboard` works (no 404)

## 11. Wrap-up

- [x] 11.1 Run `openspec validate add-neurons-leaderboard` — expect green
- [x] 11.2 Run `/opsx:verify add-neurons-leaderboard` — expect completeness / correctness / coherence all pass
- [x] 11.3 Optional `/cdx review` — focus on Worker security (JWT verification, sanity bounds, cross-user delete attempt) + D1 migration safety + LWW correctness
- [x] 11.4 Owner runs `wrangler d1 migrations apply study-rpg-leaderboard --remote` manually (gated step, mirror 二階 precedent)
- [x] 11.5 Owner deploys Worker via `wrangler deploy` (or `.github/workflows/deploy-worker.yml` auto-trigger if pushed)
- [x] 11.6 Final state: working tree clean except for the 4 spec artifacts + new code; ready for `/opsx:archive`
