## Context

`study-rpg` currently deploys to GitHub Pages at `https://fireman333.github.io/study-rpg/` (一階 medexam-tw root) and `/study-rpg/hospital/` (二階 medexam2-hospital-tw). Both apps share a single deploy artifact built by `.github/workflows/deploy.yml`: 一階 dist at root, 二階 dist merged into `dist/hospital/`.

Supabase Auth (Google OAuth) + a Cloudflare Worker `study-rpg-sync-worker.tony85314.workers.dev` provide cloud sync (R2 bundle blobs, leaderboard D1+KV, bug reports table). The Worker has CORS allowed origin pinned to `https://fireman333.github.io`; OAuth redirect URIs in Google Cloud Console + Supabase Auth point to the GH Pages URL. IndexedDB is the source of truth on each client; cloud is additive.

Owner has purchased `med-study-rpg.com` on Cloudflare. Both apps should move under this domain — 一階 at `/1st/`, 二階 at `/2nd/`. The grill output (`grilled-med-study-rpg-domain-migration-2026-05-22.md`) settled the high-level approach: Cloudflare Pages hosting, parallel bake 2–4 weeks, 301 redirect from old URLs after bake, Worker `api.med-study-rpg.com` custom domain, OAuth dual-URI during bake.

R2 cloud-sync migration is mid-Phase-2 (dual-write, reads still Supabase). Leaderboard correct-count-filter change is in-flight unarchived. Both continue on new domain after this migration; not coupled to this change.

## Goals / Non-Goals

**Goals:**
- Ship `med-study-rpg.com/1st/` + `med-study-rpg.com/2nd/` as live, fully-functional deployments of the existing 一階 + 二階 apps
- Keep GH Pages URLs working in parallel for ≥2 weeks (bake period) so authed users can migrate at their own pace and anonymous users can use Export/Import
- Worker traffic (R2 sync + leaderboard) routes via `api.med-study-rpg.com` from the new domain; old `workers.dev` URL remains valid for GH Pages clients
- Zero regression in SPA routing — direct URL navigation + F5 reload on every nested route works on new domain (verified via Chrome MCP 三件套 in prod)
- OAuth sign-in works on new domain; Supabase session persists across reload
- Migration banner on GH Pages guides anonymous users to Export/Import; authed users get a one-click sign-in path

**Non-Goals:**
- Decommissioning GH Pages — defer to bake-end follow-up change
- R2 Phase 3 cutover (`VITE_CLOUD_SYNC_READ_BACKEND=r2`) — defer to existing in-flight change
- Marketing-grade landing page at `med-study-rpg.com/` — this change ships a minimal HTML stub only
- Branded email at the new domain, custom favicon redesign, OG image — separate later changes
- Worker code changes — only Custom Domain binding + CORS update, no logic touched
- IndexedDB migration tooling beyond reusing existing Export/Import — no new schema, no auto-sync-on-old-domain, no postMessage bridge

## Decisions

### D1: Hosting platform — Cloudflare Pages (Pages, not Workers Static Assets)

**Choice**: Cloudflare Pages, single site, GitHub integration (no new `.github/workflows/deploy-cf-pages.yml`).

**Why**:
- Native CF integration with the existing CF account (same dashboard as `study-rpg-sync-worker`, D1, KV, R2 buckets) — single pane of glass for owner
- Free tier covers project scale (~1k DAU target, well under 500 builds/month)
- `_redirects` file syntax handles SPA fallback + path rewrites in pure config (no Worker code needed)
- GitHub integration auto-deploys on every push to `main` — same trigger contract as current GH Pages workflow, zero extra CI surface to maintain
- Alternative `wrangler pages deploy` CLI in a custom workflow file works but adds CI complexity for marginal gain (deterministic build env, custom build commands). Defer until needed.

**Alternative considered**: Cloudflare Workers Static Assets binding. Rejected — overkill for a static-only deploy and Pages is the explicit platform for this use case.

**Alternative considered**: GH Pages + Cloudflare DNS proxy. Rejected — GH Pages can only serve one site root per repo; getting `/1st/` and `/2nd/` would require Worker rewrite logic on top of GH Pages, defeating the simplicity goal.

### D2: CF Pages build — single site, merge two app dists

**Choice**: A single CF Pages site for the whole repo. Build both apps in the Pages build step (`pnpm install && pnpm -r build`) and emit a merged `dist-cf/` directory:

```
dist-cf/
  index.html               ← root landing page (minimal HTML)
  _redirects               ← SPA fallback rules
  1st/                     ← 一階 medexam-tw dist (Vite base=/1st/)
    index.html
    assets/...
    content/...
  2nd/                     ← 二階 medexam2-hospital-tw dist (Vite base=/2nd/)
    index.html
    assets/...
    content/...
```

The build command in CF Pages dashboard:

```bash
pnpm install --frozen-lockfile && \
  pnpm --filter @study-rpg/medexam-tw build && \
  pnpm --filter @study-rpg/medexam2-hospital-tw build && \
  node scripts/build-cf-pages-dist.mjs
```

`scripts/build-cf-pages-dist.mjs` (new) assembles `dist-cf/` from the two app dists + writes `_redirects` + writes the landing `index.html`. CF Pages `Build output directory` = `dist-cf`.

**Alternative considered**: Two CF Pages sites (one per app) with separate subdomains (`1st.med-study-rpg.com`, `2nd.med-study-rpg.com`). Rejected — owner explicitly chose path-based routing (`/1st`, `/2nd`); also doubles the CORS/OAuth URI maintenance burden.

**Alternative considered**: Build inside GH Actions, push to CF Pages via Direct Upload API. Rejected — adds GH Actions complexity without benefit; Pages GitHub integration is purpose-built for this flow.

### D3: Vite `base` path

**Choice**: Each app keeps its own `vite.config.ts` `base` setting, switched via env at build time:

```ts
// apps/medexam-tw/vite.config.ts
base: process.env.VITE_DEPLOY_BASE || '/study-rpg/',  // CF Pages sets '/1st/', GH Pages keeps '/study-rpg/'
```

```ts
// apps/medexam2-hospital-tw/vite.config.ts
base: process.env.VITE_DEPLOY_BASE || '/study-rpg/hospital/',  // CF Pages sets '/2nd/', GH Pages keeps '/study-rpg/hospital/'
```

CF Pages dashboard sets `VITE_DEPLOY_BASE` per-app inline in the build command:

```bash
VITE_DEPLOY_BASE=/1st/ pnpm --filter @study-rpg/medexam-tw build && \
VITE_DEPLOY_BASE=/2nd/ pnpm --filter @study-rpg/medexam2-hospital-tw build && \
node scripts/build-cf-pages-dist.mjs
```

GH Pages workflow (`deploy.yml`) does NOT set `VITE_DEPLOY_BASE` and relies on the default (`/study-rpg/`, `/study-rpg/hospital/`).

**Why**: env-driven base lets the same source tree produce different builds per deploy target without git-branch divergence. Defaults preserve GH Pages behavior unchanged during bake.

**Alternative considered**: Hard-code new bases (`/1st/`, `/2nd/`) and break GH Pages immediately. Rejected — violates parallel-bake goal; users on GH Pages would see broken asset paths during transition.

### D4: Hard-coded URL / asset path cleanup

**Choice**: Grep both app source trees for `/study-rpg/` prefix references and replace with Vite-base-aware patterns. Two categories:

1. **Asset references**: `<img src="/study-rpg/sprites/x.png">` — replaced with `import.meta.env.BASE_URL + 'sprites/x.png'` or Vite's `?url` import (preferred for build-time resolution)
2. **Documentation/comment strings**: `// see /study-rpg/foo` — left as-is or updated as encountered (low-priority cleanup)

Acceptance: a final `grep -r '"/study-rpg/' apps/*/src/` returns only doc strings, no asset paths.

**Risk**: missed reference renders blank image on new domain. **Mitigation**: Chrome MCP `read_console_messages` after deploy — 404s for assets surface immediately; fix-forward.

### D5: SPA fallback via `_redirects`

**Choice**: `dist-cf/_redirects` file containing:

```
/1st/*    /1st/index.html   200
/2nd/*    /2nd/index.html   200
```

CF Pages serves `index.html` with HTTP 200 for any sub-path that doesn't match a static asset, allowing react-router to handle client-side routing.

Root `/` serves the static landing page (`dist-cf/index.html`).

**Why**: identical syntax to Netlify, well-documented CF Pages feature, no extra build step. Verified against react-router v6 BrowserRouter behavior.

### D6: Worker `api.med-study-rpg.com` Custom Domain

**Choice**: Bind `api.med-study-rpg.com` to `study-rpg-sync-worker` via wrangler `routes`:

```toml
# cloudflare/sync-worker/wrangler.toml
[[routes]]
pattern = "api.med-study-rpg.com/*"
zone_name = "med-study-rpg.com"
```

Or via CF dashboard → Worker → Custom Domains → Add (auto-creates DNS CNAME). Pick whichever ships faster; both produce identical runtime behavior.

Worker code unchanged. CORS allowed origins list expands:

```ts
const ALLOWED_ORIGINS = [
  'https://fireman333.github.io',         // existing GH Pages (bake)
  'https://med-study-rpg.com',            // new domain
  'http://localhost:5173',                // existing dev
];
```

`VITE_SYNC_WORKER_URL`:
- CF Pages build: `https://api.med-study-rpg.com`
- GH Pages build (deploy.yml): `https://study-rpg-sync-worker.tony85314.workers.dev` (unchanged)
- Both resolve to the same Worker instance; no traffic split, no version skew.

### D7: OAuth redirect URI inventory

**Choice**: Maintain explicit URI list in design doc + project notes. Adds during this change:

**Google Cloud Console** (`Authorized redirect URIs`):
- `https://jakdyjxojokyqxeiuukx.supabase.co/auth/v1/callback` (existing — Supabase handles)
- (Supabase routes Google → app via its own callback; app-side redirect URIs are set in Supabase Auth Settings, not Google Console)

**Supabase Auth → Settings → Authentication → URL Configuration**:
- Site URL: keep `https://fireman333.github.io/study-rpg/` during bake (primary), update to `https://med-study-rpg.com/1st/` at bake-end
- Additional Redirect URLs: **add** during this change:
  - `https://med-study-rpg.com/1st/**`
  - `https://med-study-rpg.com/2nd/**`
- Keep existing during bake:
  - `https://fireman333.github.io/study-rpg/**`
  - `https://fireman333.github.io/study-rpg/hospital/**`

Bake-end follow-up change removes GH Pages entries.

### D8: Migration banner

**Choice**: Show banner only on GH Pages deploys, gated by env flag `VITE_DEPLOY_TARGET=gh-pages`. CF Pages build does not set this flag → banner hidden.

```tsx
// apps/<app>/src/components/MigrationBanner.tsx (new file, both apps)
if (import.meta.env.VITE_DEPLOY_TARGET !== 'gh-pages') return null;

return (
  <div className="migration-banner">
    <span>本站即將搬遷到新網址</span>
    <a href="https://med-study-rpg.com/1st/">前往 med-study-rpg.com/1st</a>
    <button onClick={triggerExportJson}>匯出資料 (JSON)</button>
    <button onClick={dismiss}>稍後</button>
  </div>
);
```

GH Pages workflow (`deploy.yml`) sets `VITE_DEPLOY_TARGET=gh-pages` env var; CF Pages build does not.

Banner persists dismissal in localStorage (`migration-banner-dismissed-v1`). Dismissal resets if banner version bumps (e.g., bake-end "now redirecting" message uses `migration-banner-dismissed-v2`).

**Alternative considered**: route-level banner shown on both deploys, dismissible. Rejected — confuses users on the new domain by showing a "we're moving" message when they've already arrived.

### D9: Landing page at `med-study-rpg.com/`

**Choice**: Minimal hand-written `dist-cf/index.html` (no React, no build step). Contents:

- Project name + one-sentence pitch
- Two large buttons: `/1st/` and `/2nd/` with brief sub-labels
- Footer link to GitHub repo + license info

`scripts/build-cf-pages-dist.mjs` copies a `scripts/cf-landing-template.html` into `dist-cf/index.html`. Editable without rebuilding the apps.

**Why**: ~500 bytes of HTML loads in <100ms, no JS error surface, easy to update copy without touching app build.

### D10: GH Pages 301 redirect (bake-end follow-up)

**Choice**: Out of scope for this change. The bake-end change will replace `deploy.yml` artifact with a static directory of redirect stubs:

```html
<!-- gh-pages-redirect/study-rpg/index.html (bake-end) -->
<!DOCTYPE html>
<meta http-equiv="refresh" content="0; url=https://med-study-rpg.com/1st/">
<script>location.replace('https://med-study-rpg.com/1st/' + window.location.search + window.location.hash);</script>
```

Mentioned here so the design footprint of this change is clear: **GH Pages stays fully functional during bake; no redirects yet.**

## Risks / Trade-offs

[**CF Pages build fails on monorepo pnpm workspace**] → Mitigation: test with `wrangler pages dev` locally before connecting GitHub integration; if dashboard build fails, fall back to GH Actions + `wrangler pages deploy`.

[**`_redirects` syntax differs subtly from Netlify**] → Mitigation: CF Pages docs are explicit; test direct-URL + F5 on `/1st/skills`, `/2nd/dorm` etc. before announcing migration to anyone.

[**OAuth callback during bake hits stale Supabase site URL**] → Mitigation: keep Supabase Site URL pointed at GH Pages (the primary) during bake; new domain uses Additional Redirect URLs (which Supabase honors). Verify by signing in on new domain end-to-end before banner go-live.

[**Anonymous user data loss when origin changes**] → Mitigation: bake-period banner with Export/Import CTA; documented loss for users who ignore banner and never sign in. This is acceptable per project's "IndexedDB is source of truth + cloud is additive" stance — local-only users have always carried this risk.

[**Worker CORS misconfiguration silently blocks new-domain sync**] → Mitigation: include `https://med-study-rpg.com` in Worker `ALLOWED_ORIGINS` list before CF Pages deploys; smoke test with `mcp__Claude_in_Chrome__read_network_requests` + `performance.getEntriesByType('resource')` per `chrome_mcp_preflight.md` to verify R2 PUT round-trips on new origin.

[**Hard-coded `/study-rpg/` references slip through grep**] → Mitigation: Chrome MCP `read_console_messages` after first CF Pages deploy will surface 404s for missing assets; fix-forward each occurrence. Run final asset audit before banner go-live.

[**`VITE_DEPLOY_TARGET` env flag forgotten on GH Pages workflow**] → Mitigation: explicit `env:` block in `deploy.yml`; banner absence on GH Pages is the immediate test signal (no migration prompt = forgot the env var).

[**`api.med-study-rpg.com` DNS propagation delay**] → Mitigation: CF-managed DNS within the same zone is near-instant (typically <60s globally); bake-period clients still talk to `workers.dev` URL so no client-side dependency on the new subdomain until CF Pages deploys with the new env var.

[**Build time grows with two apps + assembly step**] → Mitigation: CF Pages default build cap is 20 min, current dual-app build is ~3–5 min total; assembly script is <1s file copy. Headroom is fine.

[**Pages deploys block on broken main**] → Mitigation: same risk profile as current GH Pages; deploy gate stays at `main`-only per project policy. CF Pages dashboard supports preview deploys for non-main branches if needed later.

## Migration Plan

Phased, gated by manual user verification at each checkpoint. Each phase = one commit on `main` (or one Cloudflare dashboard action).

1. **Worker prep**: update Worker `ALLOWED_ORIGINS` to include `https://med-study-rpg.com`; deploy via `wrangler deploy`. Bind Custom Domain `api.med-study-rpg.com`. Verify: `curl https://api.med-study-rpg.com/healthz` (or equivalent) returns same response as workers.dev URL.

2. **OAuth prep**: add new domain Additional Redirect URLs in Supabase Auth dashboard. Keep GH Pages URLs as-is. No code change.

3. **App env + base wiring**: update both `vite.config.ts` files to read `VITE_DEPLOY_BASE`; add `VITE_DEPLOY_TARGET=gh-pages` to GH Pages workflow; add `MigrationBanner` component (hidden everywhere yet, since flag not set on CF Pages and banner-hidden default behavior on GH Pages until config flips); grep + fix hard-coded asset paths. Commit + push.

4. **CF Pages site setup**: create Pages project via dashboard, connect repo, set build command + env vars (`VITE_DEPLOY_BASE` per-app inline in command, `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com`), set output dir `dist-cf`. Add custom domain `med-study-rpg.com` (CF auto-handles DNS apex). First build runs.

5. **Smoke test new domain**: Chrome MCP three-fer (in-app nav, direct URL, F5) on `/1st/`, `/2nd/`, sub-routes; verify Worker calls go to `api.med-study-rpg.com` and succeed; verify Google sign-in completes. If broken, fix-forward without enabling banner yet.

6. **Enable banner on GH Pages**: flip `VITE_DEPLOY_TARGET=gh-pages` in `deploy.yml` and push. GH Pages now shows migration banner; CF Pages does not.

7. **Bake observation period (2–4 weeks)**: monitor `bug_reports` table for new-domain issues; both deploys stay live; no other code changes related to migration unless fixing regressions.

8. **(Out of scope here) Bake-end follow-up change**: cut over to GH Pages redirect-only stubs; remove `https://fireman333.github.io` from Worker CORS; remove old Supabase Redirect URLs; update Supabase Site URL to new domain; remove `VITE_DEPLOY_TARGET` flag and `MigrationBanner` from both apps.

**Rollback**: at any phase pre-step-6, revert the commit and CF Pages site stays as a parked deploy (no user impact since banner is off and old domain still primary). After step 6 banner go-live, rollback = remove `VITE_DEPLOY_TARGET` env var from workflow and revert any breaking CF Pages changes; users on GH Pages see no banner; CF Pages site remains usable for those who already bookmarked it.

## Open Questions

- **Should the root landing at `med-study-rpg.com/` show download/install steps, or just two app buttons?** Default = two buttons + 1-sentence project pitch; full landing redesign is a separate non-blocking task.
- **CF Pages preview deploys for PRs**: enable now (since the integration supports it) or defer? Default = leave on; preview URLs are useful for review but no OAuth/sync will work on `*.pages.dev` preview origins (CORS + OAuth allowlist don't include them). Document that preview deploys are static-only smoke checks.
- **Wrangler config (`wrangler.toml`) for Worker `api.med-study-rpg.com`**: bind via TOML or via CF dashboard? Default = dashboard (faster, one less file to maintain in repo); document the binding in `cloudflare/sync-worker/README.md`.
- **Migration banner copy + design**: who writes the final wording — owner or skill-generated? Default = owner copy review during step 3 of migration plan; placeholder copy in initial commit.
- **`apps/medexam-tw/public/_redirects` vs `dist-cf/_redirects`**: Vite copies `public/` to `dist/` so per-app `_redirects` could work, but with two apps merged into one CF Pages site we want a single root-level `_redirects` that covers both `/1st/*` and `/2nd/*`. Default = generate at the `build-cf-pages-dist.mjs` assembly step, not committed per-app.
