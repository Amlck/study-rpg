## Why

Owner purchased `med-study-rpg.com` on Cloudflare and wants to rebrand the project off the personal `fireman333.github.io` GH Pages URL. The 一階 app should live at `https://med-study-rpg.com/1st/` and the 二階 app at `https://med-study-rpg.com/2nd/`. Migrating to a project-owned domain also unblocks future moves (custom landing page, marketing assets, future content packs under sibling paths) that the `<owner>.github.io/<repo>/` constraint can't accommodate. Doing this **before** R2 Phase 3 cutover keeps the eventual sync cutover under a stable URL — if both moves happened together, regressions would be hard to isolate.

## What Changes

- **Add Cloudflare Pages deploy** as a parallel deploy target. Both apps build into a single CF Pages site (`apps/medexam-tw/dist/` → `/1st/`, `apps/medexam2-hospital-tw/dist/` → `/2nd/`). Site root SHALL serve a minimal HTML landing page linking to both apps.
- **Change Vite `base` config** for both apps: `apps/medexam-tw/vite.config.ts` from `/study-rpg/` → `/1st/`; `apps/medexam2-hospital-tw/vite.config.ts` from `/study-rpg/hospital/` → `/2nd/`. Hard-coded asset paths (sprite directories, content JSON, public/ references) in source SHALL be re-grep'd and updated where they assume `/study-rpg/` prefix.
- **Keep GH Pages deploy active during parallel bake** (2–4 weeks). Both deploys run concurrently from the same `main` push. After bake validates new domain, GH Pages workflow flips to redirect-only mode (client-side 301: `/study-rpg/` → `med-study-rpg.com/1st/`, `/study-rpg/hospital/` → `med-study-rpg.com/2nd/`, hash + query preserved).
- **Add `_redirects` for CF Pages SPA fallback**: each sub-path's `index.html` rewrite (`/1st/* → /1st/index.html 200`, `/2nd/* → /2nd/index.html 200`) so direct-URL + F5 work on react-router routes.
- **Cloudflare Worker custom domain**: bind `api.med-study-rpg.com` to existing `study-rpg-sync-worker`. Wrangler `routes` entry + DNS CNAME (CF-managed since domain on CF). Worker code unchanged, only Custom Domain binding added.
- **Worker CORS allowed origins**: add `https://med-study-rpg.com` alongside existing `https://fireman333.github.io`. Both stay valid during bake; after bake ends, GH Pages origin can be removed.
- **OAuth redirect URI dual-URI support**: Google Cloud Console + Supabase Auth Redirect URLs add `https://med-study-rpg.com/1st/`, `https://med-study-rpg.com/2nd/` (and any callback variants). Existing GH Pages URIs stay during bake.
- **`VITE_SYNC_WORKER_URL` env split**: CF Pages build sets it to `https://api.med-study-rpg.com`; GH Pages build keeps `https://study-rpg-sync-worker.tony85314.workers.dev` until GH Pages is decommissioned (bake-end follow-up). Both Worker URLs resolve to the same Worker via Custom Domain binding.
- **Migration banner on old GH Pages**: bake-period banner on both 一階 + 二階 GH Pages deploys announcing the new URL with two CTAs: "前往新網址" (link to `med-study-rpg.com/<1st|2nd>/`) + "匯出資料 (JSON)" (existing export hook, reused). Anonymous local-only users see this so they can manually migrate via Export → Import on the new domain. Authed users just sign in on the new domain and pull from R2/Supabase.
- **Project metadata update**: `openspec/project.md` Roadmap row marking domain migration shipped; `CLAUDE.md` deploy URL references updated; README/CREDITS updated if they hard-code `fireman333.github.io`.

This is a **non-breaking infrastructure change** during bake — both old and new URLs work in parallel and the engine API surface is unchanged. The follow-up bake-end change (separate proposal, file 14–30 days later) will switch GH Pages to redirect-only and remove the migration banner.

## Capabilities

### New Capabilities
None — this change modifies existing infrastructure capabilities. The custom-domain + path-based routing is an evolution of `deploy-pipeline`, not a new behavior contract.

### Modified Capabilities
- `deploy-pipeline`: Add CF Pages deploy target alongside GH Pages (parallel during bake); add `_redirects` SPA fallback contract; add Vite `base` path requirement (`/1st/`, `/2nd/`); add site-root landing page requirement; add `VITE_SYNC_WORKER_URL` per-target env requirement; add migration banner requirement (bake-period only, gated by `VITE_DEPLOY_TARGET=gh-pages`).
- `auth`: Add requirement that Supabase + Google OAuth redirect URI lists include both `med-study-rpg.com` paths and existing GH Pages paths during bake; document the redirect URI inventory as a maintenance list.
- `cloud-sync`: Add requirement for Worker custom domain `api.med-study-rpg.com` as the canonical API base; update CORS allowed origins to include new domain; document `VITE_SYNC_WORKER_URL` env switching for dual-deploy.
- `hospital-leaderboard`: Update Worker CORS allowed origins for leaderboard endpoints to include `https://med-study-rpg.com`; clients on new domain SHALL reach the same D1/KV via `api.med-study-rpg.com`.

## Impact

**Code**:
- `apps/medexam-tw/vite.config.ts` — `base` path
- `apps/medexam2-hospital-tw/vite.config.ts` — `base` path
- `apps/*/src/lib/sync/r2/client.ts` (or wherever Worker URL is read) — pick up new `VITE_SYNC_WORKER_URL`
- `apps/*/src/lib/sync/leaderboard.ts` — same Worker URL handle
- Hard-coded `/study-rpg/` references in `apps/*/src/**/*.{ts,tsx,css}` — grep + update
- `apps/*/public/` static asset paths if they assume root-relative without base
- New file: `apps/medexam-tw/public/_redirects` (or CF Pages site-level `_redirects`)
- New file: `apps/medexam-tw/public/MigrationBanner` component logic gated by env flag (banner UI)
- New deploy: `.github/workflows/deploy-cf-pages.yml` (or CF Pages dashboard GitHub integration — pick one in design)

**Infrastructure**:
- Cloudflare Pages: new project `med-study-rpg` (or similar), connected to repo
- Cloudflare DNS: `med-study-rpg.com` apex + `api.med-study-rpg.com` CNAME (apex managed by CF Pages, api managed by Worker Custom Domain)
- Cloudflare Worker `study-rpg-sync-worker`: Custom Domain binding `api.med-study-rpg.com` + CORS allowed origin update
- Google Cloud Console OAuth client: add new domain redirect URIs
- Supabase Auth Redirect URLs: add new domain entries
- GitHub Actions secrets: optional new `VITE_DEPLOY_TARGET` env var to gate migration banner; no new secrets required for CF Pages if using dashboard integration

**Dependencies**: no new npm dependencies; `wrangler` already installed for sync-worker (CF Pages config via dashboard avoids additional CLI deps for the apps repo).

**Data**: zero schema changes. IndexedDB origin-scope migration handled via Google sign-in cloud-pull path (existing) + manual Export/Import (existing); no migration code paths added beyond the banner UI.

**Existing users**:
- Authed users (90%+ by M5 telemetry): seamless after sign-in on new domain
- Anonymous local-only users: must Export → Import (banner guides) or accept fresh start; this risk is documented in the bake-end banner CTA

**Out of scope (deferred to follow-up changes)**:
- Bake-end cutover (GH Pages → redirect-only, remove migration banner, remove old CORS origin, remove old OAuth URI): separate change `decommission-gh-pages-deploy` ~14–30 days later
- R2 Phase 3 cutover (`VITE_CLOUD_SYNC_READ_BACKEND=r2`): existing in-flight change `add-r2-cloud-sync-migration` continues on new domain after bake stabilizes
- `add-hospital-leaderboard-correct-count-filter` change: continues independently on new domain; not coupled to this migration
- Long-term landing page redesign (marketing copy, screenshots, OG image): this change only ships a minimal HTML stub at the root
