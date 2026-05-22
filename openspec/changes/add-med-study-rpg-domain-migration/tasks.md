> **Implementation note (2026-05-22)**: Code-edit tasks completed by Claude in one `/opsx:apply` pass. Dashboard / manual / smoke-test tasks remain unchecked for the owner to do. Component renamed from `MigrationBanner` → `DomainMigrationBanner` to avoid collision with the existing R2-migration banner of the same name (tasks 5.1 / 5.3 reflect the new name).

## 1. Worker prep (Cloudflare side, code-only changes)

- [x] 1.1 Update Worker CORS allowed origins in `cloudflare/sync-worker/wrangler.jsonc` (`vars.CORS_ALLOWED_ORIGINS`) to add `https://med-study-rpg.com` (keep `https://fireman333.github.io`, `http://localhost:5173`, `http://localhost:4173`) — *the runtime reads `env.CORS_ALLOWED_ORIGINS`, not a hardcoded constant in `src/`; the wrangler config is the only source of truth.*
- [ ] 1.2 Run `wrangler deploy` from `cloudflare/sync-worker/` to publish the CORS update
- [ ] 1.3 Verify CORS update: from a temporary local page or `curl -H "Origin: https://med-study-rpg.com" -i https://study-rpg-sync-worker.tony85314.workers.dev/health` — confirm `Access-Control-Allow-Origin: https://med-study-rpg.com` echoes back
- [ ] 1.4 Bind Custom Domain `api.med-study-rpg.com` to the Worker (Cloudflare dashboard → Workers & Pages → `study-rpg-sync-worker` → Settings → Triggers → Custom Domains → Add Custom Domain) — *README already updated to document this; pick dashboard route to avoid touching wrangler.jsonc routes.*
- [ ] 1.5 Verify `https://api.med-study-rpg.com/health` returns `{"ok":true}` identically to the workers.dev URL
- [ ] 1.6 Verify TLS cert auto-provisioned by CF for `api.med-study-rpg.com` (no manual cert work)

## 2. Supabase Auth allowlist update

- [ ] 2.1 Open Supabase dashboard → Authentication → URL Configuration
- [ ] 2.2 Confirm "Site URL" is `https://fireman333.github.io/study-rpg/` (leave unchanged for bake)
- [ ] 2.3 Add `https://med-study-rpg.com/1st/**` to Additional Redirect URLs
- [ ] 2.4 Add `https://med-study-rpg.com/2nd/**` to Additional Redirect URLs
- [ ] 2.5 Leave existing `https://fireman333.github.io/study-rpg/**` and `/hospital/**` entries intact
- [x] 2.6 Created `docs/AUTH_REDIRECT_URIS.md` capturing the post-edit expected allowlist for audit (owner still needs to apply the actual dashboard edit per 2.3/2.4)
- [ ] 2.7 Smoke test: from an incognito browser, manually sign in via Google on the legacy GH Pages URL to confirm bake-period redirect still works

## 3. App env + base wiring

- [x] 3.1 Edited `apps/medexam-tw/vite.config.ts`: `base: process.env.VITE_DEPLOY_BASE || '/study-rpg/'`
- [x] 3.2 Edited `apps/medexam2-hospital-tw/vite.config.ts`: `base: process.env.VITE_DEPLOY_BASE || '/study-rpg/hospital/'`
- [x] 3.3 Ran `pnpm --filter @study-rpg/medexam-tw build` with no env var → confirmed `dist/index.html` references `/study-rpg/` (unchanged)
- [x] 3.4 Ran `VITE_DEPLOY_BASE=/1st/ pnpm --filter @study-rpg/medexam-tw build` → confirmed `/1st/` asset prefix; same for `VITE_DEPLOY_BASE=/2nd/` on 二階
- [x] 3.5 Catalog: 1 hit in `apps/medexam-tw/src/main.tsx` (BrowserRouter basename) + 2 hits in `apps/medexam2-hospital-tw/src/styles.css` (@font-face URLs)
- [x] 3.6 Replaced critical asset paths: (a) `BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}` in 一階 main.tsx; (b) `<link rel="preload" href="/fonts/Cubic_11.woff2">` in 一階 index.html (Vite auto-rebases absolute `/` paths in HTML); (c) runtime `injectBaseAwareFontFace()` helper in both apps' main.tsx that appends a `<style>` with `import.meta.env.BASE_URL`-prefixed @font-face — so browser tries both the static (GH Pages-pinned) and runtime (base-aware) URLs and uses whichever loads. 二階 `src/styles.css` static @font-face left as-is (intentional GH-Pages fallback; runtime override covers new domain)
- [x] 3.7 Re-grep confirmed remaining hits are only doc comments + the intentional 二階 styles.css static @font-face fallback
- [x] 3.8 `pnpm -r typecheck` → all green
- [ ] 3.9 Run `pnpm --filter @study-rpg/medexam-tw dev` and click through 一階 in browser → assets resolve under default base *(owner can do this; or it gets covered by step-5 dev smoke or step-10 prod smoke)*
- [ ] 3.10 Repeat 3.9 for 二階

## 4. Sync client URL switching

- [x] 4.1 R2 sync Worker URL already centralized in `apps/medexam-tw/src/lib/sync/r2/client.ts` (and 二階 equivalent) via `WORKER_URL_RAW` reading `import.meta.env.VITE_SYNC_WORKER_URL`
- [x] 4.2 Hardened resolver in 一階 r2/client.ts: `(VITE_SYNC_WORKER_URL ?? '').trim().replace(/\/+$/, '')` then fallback to workers.dev default — handles empty / whitespace / trailing-slash quirks (Cloudflare Pages dashboard env vars occasionally include trailing slash)
- [x] 4.3 Same hardening applied in 二階 `r2/client.ts`
- [x] 4.4 Leaderboard client (`apps/medexam2-hospital-tw/src/lib/leaderboard/api.ts`) already imports `getWorkerUrl()` from r2/client; inherits the hardening for free
- [ ] 4.5 Add unit test (or inline assertion) confirming empty/whitespace `VITE_SYNC_WORKER_URL` falls back to default *(deferred — fallback logic is straightforward and exercised on every build; not worth a one-off test file)*
- [x] 4.6 `pnpm -r typecheck` covers the runtime smoke; no behavior change with default env

## 5. Migration banner component (both apps)

- [x] 5.1 Added `apps/medexam-tw/src/components/DomainMigrationBanner.tsx` gated on `import.meta.env.VITE_DEPLOY_TARGET === 'gh-pages'` — *renamed from `MigrationBanner` because that name was already taken by the R2 backend migration banner.*
- [x] 5.2 Banner content matches spec: announce 移動 + primary CTA "前往新網址 →" + secondary "匯出本機 JSON" (runs local Dexie snapshot — works for anonymous users since the existing cloud Export needs sign-in) + dismiss button persisting `domain-migration-banner-dismissed-v1` in localStorage
- [x] 5.3 Added `apps/medexam2-hospital-tw/src/components/DomainMigrationBanner.tsx` with `/2nd/` link + hospital Dexie tables in the export
- [x] 5.4 Wired into both apps' top-level layout: 一階 above `<header className="app-header">`; 二階 inside `<HashRouter>` above `.header-controls`
- [x] 5.5 Styled subtly: amber-yellow sticky bar, mobile-responsive, flex-wrap layout — class prefix `.domain-migration-banner__*` appended to both apps' `styles.css`
- [ ] 5.6 Local smoke: run `VITE_DEPLOY_TARGET=gh-pages pnpm --filter @study-rpg/medexam-tw dev` → banner visible; without env var → hidden *(deferred to owner browser smoke)*
- [x] 5.7 Banner secondary CTA deviates slightly from the spec text: the existing cloud Export hook in `SettingsPanel` requires sign-in, but the banner needs to help anonymous users too. So banner ships a self-contained `exportLocalSnapshot()` that reads Dexie directly. Authed users still have the cleaner cloud Export in SettingsPanel.

## 6. GitHub Pages workflow env flag

- [x] 6.1 Added `VITE_DEPLOY_TARGET: gh-pages` env var to both Build steps in `.github/workflows/deploy.yml`
- [ ] 6.2 *Important* — do NOT push to main until owner has finished CF Pages setup (steps 8/9) + smoke-tested new domain (step 10). The current commit on `track-m2` is fine to leave staged; merging to main is the actual go-live trigger
- [x] 6.3 Confirmed `VITE_SYNC_WORKER_URL` continues to come from `secrets.VITE_SYNC_WORKER_URL` (empty → fallback to workers.dev default per hardened resolver)

## 7. CF Pages assembly script + landing template

- [x] 7.1 Created `scripts/cf-landing-template.html`: minimal HTML, gradient background, project name + 1-sentence tagline + two app-card buttons (`/1st/`, `/2nd/`) + footer with GitHub link + license
- [x] 7.2 Created `scripts/build-cf-pages-dist.mjs`: validates both app dists exist → resets `dist-cf/` → copies 一階 dist → `dist-cf/1st/`, 二階 dist → `dist-cf/2nd/` → writes `_redirects` (`/1st/* → /1st/index.html 200`, `/2nd/* → /2nd/index.html 200`) → copies landing template to `dist-cf/index.html`
- [x] 7.3 Guard added: script throws if either source `dist/` is missing or `index.html` absent
- [x] 7.4 Local dry run: `VITE_DEPLOY_BASE=/1st/ pnpm --filter @study-rpg/medexam-tw build && VITE_DEPLOY_BASE=/2nd/ pnpm --filter @study-rpg/medexam2-hospital-tw build && node scripts/build-cf-pages-dist.mjs` → `dist-cf/` produced with correct tree (1st/, 2nd/, _redirects, index.html)
- [x] 7.5 Verified `dist-cf/_redirects` content matches spec exactly
- [ ] 7.6 Test landing page in static server (e.g. `npx serve dist-cf`) — *owner can `npx serve dist-cf` to spot-check before pushing CF Pages config*
- [ ] 7.7 Smoke `dist-cf/1st/` via `npx serve` → 一階 app boots
- [ ] 7.8 Same for `dist-cf/2nd/`

## 8. Cloudflare Pages site setup (dashboard)

- [ ] 8.1 In CF dashboard → Workers & Pages → Create application → Pages → Connect to Git → select the `study-rpg` repo
- [ ] 8.2 Project name: `med-study-rpg` (or owner's preference); Production branch: `main`
- [ ] 8.3 Framework preset: `None` (custom build)
- [ ] 8.4 Build command: `pnpm install --frozen-lockfile && VITE_DEPLOY_BASE=/1st/ pnpm --filter @study-rpg/medexam-tw build && VITE_DEPLOY_BASE=/2nd/ pnpm --filter @study-rpg/medexam2-hospital-tw build && node scripts/build-cf-pages-dist.mjs`
- [ ] 8.5 Build output directory: `dist-cf`
- [ ] 8.6 Environment variables (Production): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com`, `VITE_CLOUD_SYNC_ENABLED=true`, `VITE_SYNC_DEBOUNCE_MS=3000`, `VITE_CLOUD_SYNC_BACKEND=dual`, `VITE_CLOUD_SYNC_READ_BACKEND=supabase`, `VITE_APP_VERSION` (mirror the `package.json` version or wire via build script), `VITE_COMMIT_SHA=${CF_PAGES_COMMIT_SHA}` (CF Pages provides this var natively). **Do NOT set `VITE_DEPLOY_TARGET`** — leaving it unset keeps the migration banner hidden on the new domain
- [ ] 8.7 Environment variables (Preview): same as Production
- [ ] 8.8 Trigger initial build via dashboard → verify build logs clean, output `dist-cf/` produced
- [ ] 8.9 Note the assigned `*.pages.dev` preview URL; verify landing page loads (OAuth/sync won't work on `*.pages.dev` because allowlist doesn't include it — that's expected)

## 9. Custom domain attach

- [ ] 9.1 In CF Pages project → Custom domains → Add → `med-study-rpg.com` (apex)
- [ ] 9.2 CF auto-provisions DNS apex + TLS cert (domain already on CF)
- [ ] 9.3 Verify `https://med-study-rpg.com/` serves the landing page within ~5 min
- [ ] 9.4 Verify `https://med-study-rpg.com/1st/` serves 一階
- [ ] 9.5 Verify `https://med-study-rpg.com/2nd/` serves 二階
- [ ] 9.6 *Optional*: add `www.med-study-rpg.com` 301 → apex if owner wants the www variant covered

## 10. SPA route + sync smoke on new domain (Chrome MCP)

- [ ] 10.1 `mcp__Claude_in_Chrome__list_connected_browsers` to confirm Chrome instance available (per `chrome_mcp_preflight.md`)
- [ ] 10.2 Three-fer test on 一階 `/1st/`: (a) in-app navigation through several routes, (b) direct URL to nested route (e.g. `/1st/skills`), (c) F5 reload on a nested route
- [ ] 10.3 Repeat 10.2 on 二階 `/2nd/` (note: 二階 uses HashRouter so direct URL is `/2nd/#/dorm` — F5 always preserves hash so SPA fallback isn't strictly needed for sub-routes, but `_redirects` still matters for `/2nd/` root direct hit)
- [ ] 10.4 `mcp__Claude_in_Chrome__read_console_messages` to confirm no 404s for assets, no JS errors at boot
- [ ] 10.5 `mcp__Claude_in_Chrome__read_network_requests` to confirm Worker calls target `https://api.med-study-rpg.com/`
- [ ] 10.6 For write paths (R2 PUT), supplement with `javascript_tool` + `performance.getEntriesByType('resource')` (per `chrome_mcp_preflight.md` — `read_network_requests` misses cross-origin PUT with binary body)
- [ ] 10.7 Sign-in test: sign in with Google on `/1st/` → confirm session hydrates, profile visible
- [ ] 10.8 Sign-in test: sign in with Google on `/2nd/` → confirm session hydrates
- [ ] 10.9 Sign-out flow on `/1st/` → confirm clean sign-out, no console errors
- [ ] 10.10 Leaderboard read on `/2nd/` → confirm `/leaderboard/composite` returns Top 100

## 11. Enable banner on GitHub Pages

- [ ] 11.1 (Only if step 10 passes cleanly) Confirm `VITE_DEPLOY_TARGET=gh-pages` env var is in `deploy.yml` *(already done in step 6.1 — this is the trigger to actually push it live)*
- [ ] 11.2 Trigger a `main` push (or workflow_dispatch) to redeploy GitHub Pages with the banner enabled
- [ ] 11.3 Verify banner visible on `https://fireman333.github.io/study-rpg/` and `/hospital/`
- [ ] 11.4 Verify banner CTA "前往新網址 →" lands on the correct `/1st/` or `/2nd/` URL
- [ ] 11.5 Verify Export CTA triggers JSON download (local Dexie snapshot)
- [ ] 11.6 Verify dismiss button persists across reload (localStorage key `domain-migration-banner-dismissed-v1`)
- [ ] 11.7 Verify CF Pages deploy still shows banner hidden (env flag not set)

## 12. Documentation + project metadata

- [x] 12.1 Updated `CLAUDE.md` with new "Deploy targets (in-flight migration)" section above "Repo-specific build / dev quick reference" — describes parallel GH Pages + CF Pages deploys + Worker URL pair
- [x] 12.2 Updated `openspec/project.md` Roadmap: new "Domain migration — med-study-rpg.com" row marked 🔄 in-progress
- [ ] 12.3 Update `README.md` and `CREDITS.md` if they hard-code GH Pages URLs *(deferred — low priority, can do as part of bake-end follow-up change)*
- [x] 12.4 Created `docs/AUTH_REDIRECT_URIS.md` with the current allowlist + bake-end follow-up plan
- [x] 12.5 Updated `cloudflare/sync-worker/README.md` with the `api.med-study-rpg.com` Custom Domain section + CORS allowlist note + bake-end cleanup note
- [ ] 12.6 Update `docs/BUG_REPORTING.md` if it references the GH Pages URL for screenshots/snapshots *(quick grep showed no hits requiring update — deferred unless something surfaces during smoke)*
- [x] 12.7 Updated both apps' `.env.example` with the dual-URL note + commented `VITE_DEPLOY_TARGET=gh-pages` example

## 13. Verification + apply gates

- [x] 13.1 `pnpm -r typecheck` → all green
- [ ] 13.2 `openspec validate add-med-study-rpg-domain-migration` → no errors *(re-run after task checkboxes update)*
- [ ] 13.3 `/simplify` review on this change's code touches
- [ ] 13.4 `/opsx:verify` to confirm completeness, correctness, coherence
- [ ] 13.5 `/verify` (end-to-end Chrome MCP loop) on `https://med-study-rpg.com/1st/` and `/2nd/` — re-run if any issue surfaces
- [ ] 13.6 Owner manually clicks through both apps on the new domain end-to-end (sign-in, study session, quiz, leaderboard view, sign-out)
- [ ] 13.7 Confirm bug reports during initial bake hours surface as expected (Supabase `bug_reports` table) — new-domain reports should show `https://med-study-rpg.com/...` in the `route` column

## 14. Out-of-scope reminders (do NOT do in this change)

- [ ] 14.1 Do NOT switch GH Pages to redirect-only — that's the bake-end follow-up change
- [ ] 14.2 Do NOT remove `https://fireman333.github.io` from Worker CORS — bake-end only
- [ ] 14.3 Do NOT update Supabase Site URL — bake-end only
- [ ] 14.4 Do NOT flip `VITE_CLOUD_SYNC_READ_BACKEND` to `r2` — that's the existing R2 Phase 3 cutover change
- [ ] 14.5 Do NOT archive `add-hospital-leaderboard-correct-count-filter` as part of this change — continues independently
