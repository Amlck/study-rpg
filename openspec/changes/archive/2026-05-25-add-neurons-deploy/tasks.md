## 1. Auth module scaffold

- [x] 1.1 Create `apps/neurons-tw/src/lib/auth/client.ts` — Supabase client singleton reading `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` from env
- [x] 1.2 Create `apps/neurons-tw/src/lib/auth/AuthContext.tsx` — React context exposing `{ user, session, signInWithGoogle, signOut }`; subscribes to `supabase.auth.onAuthStateChange`
- [x] 1.3 Create `apps/neurons-tw/src/components/AuthGate.tsx` — minimum-viable sign-in UI (plain CSS, GBA-style polish deferred per design Open Question)
- [x] 1.4 Wire `<AuthProvider>` at top of `apps/neurons-tw/src/App.tsx`; expose `useAuth()` hook
- [x] 1.5 Add `.env.example` entries for `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_CLOUD_SYNC_ENABLED` in `apps/neurons-tw/`

## 2. R2 sync engine wiring

- [x] 2.0 Extend `cloudflare/sync-worker/src/presign.ts` — add `'neurons'` to `Bundle` type union + `BUNDLES` array + new `case "neurons":` in `bundleKey()` returning `users/${sub}/neurons-snapshot.json.gz`. (Note: `delete.ts` and `backup.ts` walk `users/<sub>/*` prefix, no change needed.) Owner manual: redeploy Worker via `wrangler deploy` or GH Actions `deploy-worker.yml` after merge.
- [x] 2.1 Create `apps/neurons-tw/src/lib/sync/r2/client.ts` — `requestPresign(op)` fetch wrapper + ETag cache helpers, base URL from `VITE_SYNC_WORKER_URL`
- [x] 2.2 Create `apps/neurons-tw/src/lib/sync/r2/bundles.ts` — schema_version 1 + `buildBundleSnapshot(db)` + `applyBundleSnapshot(db, snapshot)` + gzip/gunzip + validate
- [x] 2.3 Create `apps/neurons-tw/src/lib/sync/tables.ts` — 7 `TableAdapter`s (synapses / familyAccrual / familyMastery / neuronVariants / achievements / leaderboardProfile / meta filtered)
- [x] 2.4 Create `apps/neurons-tw/src/lib/sync/r2/engine-r2.ts` — `pushBundle` / `pullBundle` with ETag conditional pull (HEAD-then-GET) + 412 retry loop + exponential backoff
- [x] 2.5 Create `apps/neurons-tw/src/lib/sync/engine.ts` — `SyncEngine` class with debounced push + status state machine + onPushComplete/onPullComplete events
- [x] 2.6 Create `apps/neurons-tw/src/lib/sync/useSync.ts` + `SyncMount.tsx` — React hook that mounts engine when authed, Dexie hook subscription for push trigger, visibilitychange pull, beforeunload flush
- [x] 2.7 DEV mode binds `globalThis.__sync = engine` + `globalThis.__db = db` inside useSync effect

## 3. onPullComplete triple-backfill hook

- [x] 3.1 Create `apps/neurons-tw/src/lib/sync/backfill/counters.ts` — `backfillMaxMergeCounters(db, incoming)` for `maxQuizCorrectStreak` + `totalStudyMinutes`
- [x] 3.2 Wire `backfillAchievementsFromCurrentStats()` from `apps/neurons-tw/src/lib/services/achievement.ts` into the hook
- [x] 3.3 Wire `deriveBadgesCsvFromDexie()` from `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts` into the hook (D1 push pipeline already derives badges_csv on send; backfill keeps leaderboardProfile row touched so next push fires)
- [x] 3.4 In `lib/sync/backfill/index.ts` `runOnPullComplete()` runs counters → achievements → leaderboard derived in strict order with per-step try/catch + `[sync.backfill]` channel log; threads `BundleSnapshot` via `PullBundleResult.snapshot`
- [ ] 3.5 Idempotency smoke: invoke hook twice via DEV console `__sync.pullNow({ force: true })` and confirm no row dup / no toast (manual step at deploy time per task §10.7)

## 4. CF Pages build pipeline

- [x] 4.1 Edit `scripts/build-cf-pages-dist.mjs` `ROUTES` array — add `{ src: 'apps/neurons-tw/dist', dest: 'neurons' }`
- [x] 4.2 Verified — `writeRedirects()` loops over ROUTES and auto-generates `/neurons/*` SPA rules + asset passthrough; no manual edit needed
- [x] 4.3 Edit `scripts/cf-landing-template.html` — new card entry「神經元主題版」pointing at `/neurons/`
- [x] 4.4 `copyTree()` 404.html strip applies to every ROUTES entry; neurons-tw vite build emits 404.html same as the others — automatically stripped
- [ ] 4.5 Local smoke: `pnpm --filter @study-rpg/neurons-tw build` with `VITE_DEPLOY_BASE=/neurons/` then `node scripts/build-cf-pages-dist.mjs` and check `dist-cf/neurons/index.html` exists + `dist-cf/_redirects` includes `/neurons/` rules — run at end of apply

## 5. CI / deploy pipeline alignment

> Apply-phase discovery: `.github/workflows/deploy.yml` ONLY drives GitHub Pages (it doesn't touch `dist-cf/` or CF Pages). CF Pages build is driven by the dashboard's GitHub-integration build command. Spec Req 1 forbids publishing neurons-tw to GH Pages, so deploy.yml stays unchanged. The build command edit lands in §9.1 owner-manual.

- [x] 5.1 Verified — `.github/workflows/deploy.yml` only builds 1st + 2nd for GH Pages and doesn't invoke `scripts/build-cf-pages-dist.mjs`. No edit needed; neurons-tw stays out of GH Pages artifact by design (spec Req 1 last scenario).
- [x] 5.2 Env vars for neurons-tw CF Pages build (VITE_SUPABASE_URL / ANON_KEY / CLOUD_SYNC_ENABLED / SYNC_WORKER_URL / COMMIT_SHA) inherit from CF Pages dashboard environment settings — same project as 1st / 2nd, no new secret rotation needed.
- [x] 5.3 `build-cf-pages-dist.mjs` ROUTES now includes neurons (§4.1); script will be invoked AFTER all three builds when CF Pages dashboard build command runs `... && node scripts/build-cf-pages-dist.mjs`.
- [x] 5.4 Confirmed — `actions/upload-pages-artifact` step in deploy.yml uploads only `apps/medexam-tw/dist` (which includes `/hospital/` subpath for 二階); neurons-tw build output never enters this path → not published to GH Pages.

## 6. medexam-tw companion-app entry

- [x] 6.1 Edit `apps/medexam-tw/src/components/SettingsPanel.tsx` — new `<section className="settings-section">` before the bug-report section
- [x] 6.2 Wording: section title `神經元主題版（neurons-themed companion app）` + subtitle "一階題庫的同主題 reskin — Hebbian... 資料獨立、不影響此存檔; 可以併行玩或當作換口味"
- [x] 6.3 Anchor element `<a href="https://med-study-rpg.com/neurons/" target="_blank" rel="noopener noreferrer">` styled as `settings-btn--secondary`
- [x] 6.4 Entry only renders inside the SettingsPanel modal (existing `role="dialog"` container) — no auto-open hook anywhere in App.tsx / Layout.tsx; spec Req 5 second scenario satisfied by construction
- [ ] 6.5 Dev smoke (manual at deploy time — task §10.8 in this same change covers Chrome MCP click verification)

## 7. Documentation

- [x] 7.1 Edit `docs/AUTH_REDIRECT_URIS.md` — added `https://med-study-rpg.com/neurons/**` + `http://localhost:5175/**` to Additional Redirect URLs; cited `neurons-deploy` spec Req 3
- [x] 7.2 Edit `CLAUDE.md` Deploy targets section — extended table with neurons column; GH Pages explicitly excludes neurons; CF Pages build command updated to include `VITE_DEPLOY_BASE=/neurons/ pnpm --filter @study-rpg/neurons-tw build`
- [x] 7.3 Inline docstring + ROUTES comment in `scripts/build-cf-pages-dist.mjs` reference `openspec/specs/neurons-deploy/spec.md` (added in §4.1)

## 8. Root package scripts

- [x] 8.1 `dev:neurons` already present in root `package.json` (added by earlier scaffold change)
- [x] 8.2 `build:neurons` already present in root `package.json` (added by earlier scaffold change)
- [x] 8.3 Extended `build:cf` script to include `VITE_DEPLOY_BASE=/neurons/ VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com pnpm --filter @study-rpg/neurons-tw build` ahead of `build-cf-pages-dist.mjs`

## 9. Owner-manual infrastructure setup

> These tasks require dashboard access and are owner-only. Tasks code below cannot apply them — they ship as runbook for owner to execute before / immediately after Phase A code lands. Mark each task done after manual confirmation.

- [ ] 9.1 Cloudflare Pages dashboard: open existing `med-study-rpg-com` Pages project → Settings → Builds & deployments → edit build command from
```
pnpm install && VITE_DEPLOY_BASE=/1st/ pnpm --filter @study-rpg/medexam-tw build && VITE_DEPLOY_BASE=/2nd/ pnpm --filter @study-rpg/medexam2-hospital-tw build && node scripts/build-cf-pages-dist.mjs
```
to:
```
pnpm install && VITE_DEPLOY_BASE=/1st/ pnpm --filter @study-rpg/medexam-tw build && VITE_DEPLOY_BASE=/2nd/ pnpm --filter @study-rpg/medexam2-hospital-tw build && VITE_DEPLOY_BASE=/neurons/ pnpm --filter @study-rpg/neurons-tw build && node scripts/build-cf-pages-dist.mjs
```
- [ ] 9.2 Cloudflare Pages dashboard: verify Custom Domain `med-study-rpg.com` SPA / static rules cover `/neurons/` (should automatically inherit from `_redirects` in artifact — no separate config needed)
- [ ] 9.3 Supabase dashboard → Authentication → URL Configuration: add `https://med-study-rpg.com/neurons/` to Site URL allowlist
- [ ] 9.4 Supabase dashboard → Authentication → URL Configuration: add `https://med-study-rpg.com/neurons/` to Additional Redirect URLs
- [ ] 9.5 (Owner verify) `curl -I https://med-study-rpg.com/neurons/` returns 200 after first successful deploy
- [ ] 9.6 (Owner verify) Google OAuth Console: confirm existing callback URL `https://jakdyjxojokyqxeiuukx.supabase.co/auth/v1/callback` is unchanged (no edit needed — shared across apps)

## 10. Live deploy + Chrome MCP smoke

- [ ] 10.1 Push commit → wait for GH Actions + CF Pages auto-build → confirm green
- [ ] 10.2 Chrome MCP: navigate to `https://med-study-rpg.com/neurons/` — verify 200 + shell loads + no console errors
- [ ] 10.3 Chrome MCP: direct URL `https://med-study-rpg.com/neurons/#/connectome` from a fresh tab — verify no 404, connectome page renders
- [ ] 10.4 Chrome MCP: F5 on a hash route (e.g., `/#/achievements`) — verify state preserved
- [ ] 10.5 Chrome MCP: sign-in flow — click Google sign-in → OAuth → return to `/neurons/` → confirm `useAuth().user !== null`
- [ ] 10.6 Chrome MCP: answer 5 quiz questions → verify push fires (network: PUT to `/upload` or presign+PUT) → verify `globalThis.__sync.getStatus()` shows idle after debounce
- [ ] 10.7 Chrome MCP from second device / Incognito with same OAuth account: sign in → verify pull fires → confirm `onPullComplete` fires → confirm achievement count + counter values match device A → confirm no duplicate toast / modal
- [ ] 10.8 Chrome MCP: open medexam-tw `https://med-study-rpg.com/1st/` SettingsPanel → confirm companion entry visible → click → confirm new tab opens to neurons-tw
- [ ] 10.9 (Negative test) Chrome MCP: confirm `https://fireman333.github.io/study-rpg/neurons/` returns 404 (GH Pages does NOT publish neurons-tw)

## 11. Spec verification

- [x] 11.1 `/opsx:verify add-neurons-deploy` — all 6 requirements have implementation evidence, no CRITICAL issues (apply-time verify run)
- [x] 11.2 `pnpm -r typecheck` — all 11 workspaces clean (apply-time run, no regression)
- [x] 11.3 `openspec validate add-neurons-deploy` → green
- [ ] 11.4 Update `openspec/project.md` Roadmap row for M_3rd to ✓ shipped (11/11) — done at archive time

## 12. Maintenance-mode posture follow-up

- [ ] 12.1 (Doc-only) After archive, add a note to medexam-tw section in `CLAUDE.md` confirming `apps/medexam-tw` is in maintenance mode per `neurons-mode` Req 6
- [ ] 12.2 No code-level enforcement (e.g. lint rule rejecting new features in `apps/medexam-tw/`) — punt to future change if dogfood signals this is needed
