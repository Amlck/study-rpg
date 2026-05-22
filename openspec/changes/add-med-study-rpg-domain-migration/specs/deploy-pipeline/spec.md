## ADDED Requirements

### Requirement: Cloudflare Pages deploy target alongside GitHub Pages

The repository SHALL produce a Cloudflare Pages deployment of both apps in addition to the existing GitHub Pages deploy. Cloudflare Pages SHALL serve from the custom domain `med-study-rpg.com` with the following layout:

- `https://med-study-rpg.com/` — minimal HTML landing page linking to both apps
- `https://med-study-rpg.com/1st/` — 一階 (`apps/medexam-tw`) entry
- `https://med-study-rpg.com/2nd/` — 二階 (`apps/medexam2-hospital-tw`) entry

The Cloudflare Pages site SHALL be configured via the Cloudflare dashboard GitHub integration (no new file under `.github/workflows/` is required for the initial setup). The Pages build command SHALL:

1. Install dependencies with `pnpm install --frozen-lockfile`
2. Build 一階 with `VITE_DEPLOY_BASE=/1st/` and 二階 with `VITE_DEPLOY_BASE=/2nd/`
3. Assemble the merged `dist-cf/` output via `node scripts/build-cf-pages-dist.mjs`

The Pages output directory SHALL be `dist-cf/` at the repo root.

During the bake period, GitHub Pages deploy SHALL continue to function unchanged — both deploys serve identical app code under different base paths and origins.

#### Scenario: Push to main triggers both deploys

- **WHEN** any commit lands on `main`
- **THEN** GitHub Pages workflow (`deploy.yml`) SHALL build and publish to `fireman333.github.io/study-rpg/` and `/study-rpg/hospital/` (unchanged)
- **AND** Cloudflare Pages GitHub integration SHALL build and publish to `med-study-rpg.com/1st/` and `/2nd/`
- **AND** both deploys SHALL produce successful builds independently — a failure on one SHALL NOT block the other

#### Scenario: Cloudflare Pages build assembles dist-cf from two app dists

- **WHEN** the Cloudflare Pages build runs
- **THEN** both apps SHALL build with their respective `VITE_DEPLOY_BASE` values
- **AND** `scripts/build-cf-pages-dist.mjs` SHALL copy `apps/medexam-tw/dist/*` into `dist-cf/1st/`
- **AND** `scripts/build-cf-pages-dist.mjs` SHALL copy `apps/medexam2-hospital-tw/dist/*` into `dist-cf/2nd/`
- **AND** the assembly script SHALL write `dist-cf/_redirects` and `dist-cf/index.html` (landing page)

#### Scenario: New domain serves 一階 at /1st/ and 二階 at /2nd/

- **GIVEN** the Cloudflare Pages build has succeeded for the latest `main`
- **WHEN** a user opens `https://med-study-rpg.com/1st/` in a browser
- **THEN** the 一階 app SHALL load and function identically to its GitHub Pages deploy
- **AND** the same applies for `/2nd/` and the 二階 app

### Requirement: SPA fallback via `_redirects` for Cloudflare Pages

The merged `dist-cf/` output SHALL contain a `_redirects` file at its root with rules that route any sub-path of `/1st/` and `/2nd/` to the corresponding `index.html` with HTTP 200, enabling react-router BrowserRouter to handle client-side navigation.

The minimum required rules:

```
/1st/*    /1st/index.html   200
/2nd/*    /2nd/index.html   200
```

The root `/` SHALL serve the landing HTML directly (no rewrite needed; CF Pages serves `dist-cf/index.html` as the default root document).

#### Scenario: Direct URL to nested route resolves on new domain

- **WHEN** a user opens `https://med-study-rpg.com/1st/skills` directly in a new tab
- **THEN** Cloudflare Pages SHALL serve `dist-cf/1st/index.html` with HTTP 200
- **AND** react-router SHALL render the `Skills` route
- **AND** the browser console SHALL NOT show any 404 errors for the page itself

#### Scenario: F5 reload on nested route does not 404

- **WHEN** a user navigates in-app to `https://med-study-rpg.com/2nd/dorm` and presses F5
- **THEN** the same `index.html` SHALL be served and the `Dorm` route SHALL re-render
- **AND** the user SHALL NOT see Cloudflare Pages' default 404 page

#### Scenario: Unknown top-level path returns Cloudflare 404

- **WHEN** a user opens `https://med-study-rpg.com/admin` (no match in `_redirects`)
- **THEN** Cloudflare Pages SHALL return its default 404 response
- **AND** the SPA fallback SHALL NOT inadvertently catch the request

### Requirement: Vite `base` switches per deploy target via `VITE_DEPLOY_BASE`

Each app's `vite.config.ts` SHALL read `process.env.VITE_DEPLOY_BASE` and fall back to its GitHub Pages default if the env var is unset:

- `apps/medexam-tw/vite.config.ts`: `base: process.env.VITE_DEPLOY_BASE || '/study-rpg/'`
- `apps/medexam2-hospital-tw/vite.config.ts`: `base: process.env.VITE_DEPLOY_BASE || '/study-rpg/hospital/'`

This SHALL allow the same source tree to produce GitHub Pages and Cloudflare Pages builds without git-branch divergence.

#### Scenario: GitHub Pages build keeps existing base

- **WHEN** GitHub Pages workflow (`deploy.yml`) builds without setting `VITE_DEPLOY_BASE`
- **THEN** 一階 SHALL build with `base: '/study-rpg/'`
- **AND** 二階 SHALL build with `base: '/study-rpg/hospital/'`
- **AND** the resulting dist SHALL deploy unchanged to GitHub Pages

#### Scenario: Cloudflare Pages build switches to /1st/ and /2nd/

- **WHEN** the Cloudflare Pages build command sets `VITE_DEPLOY_BASE=/1st/` for the 一階 build and `VITE_DEPLOY_BASE=/2nd/` for the 二階 build
- **THEN** 一階 dist SHALL reference assets under `/1st/`
- **AND** 二階 dist SHALL reference assets under `/2nd/`
- **AND** the resulting dist SHALL serve correctly when assembled into `dist-cf/`

#### Scenario: Hard-coded /study-rpg/ asset references replaced

- **WHEN** the source tree contains any `<img src="/study-rpg/...">` or hard-coded `/study-rpg/` asset path
- **THEN** that reference SHALL be replaced with a Vite-base-aware pattern (`import.meta.env.BASE_URL + 'sprites/x.png'` or a `?url` import)
- **AND** running `grep -r '"/study-rpg/' apps/*/src/` SHALL return zero asset-path occurrences (doc comments may remain)

### Requirement: `VITE_SYNC_WORKER_URL` switches per deploy target

The Cloudflare Pages build SHALL set `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com` so clients on the new domain reach the Worker via its Custom Domain binding.

The GitHub Pages workflow SHALL continue to set (or default to) `VITE_SYNC_WORKER_URL=https://study-rpg-sync-worker.tony85314.workers.dev` during the bake period. Both URLs resolve to the same Worker; this is purely a client-side origin/branding choice.

#### Scenario: Clients on new domain talk to api.med-study-rpg.com

- **GIVEN** a user is on `https://med-study-rpg.com/1st/` and authenticated
- **WHEN** the sync engine pushes a bundle to R2
- **THEN** the network request URL SHALL begin with `https://api.med-study-rpg.com/`
- **AND** the Worker SHALL respond with HTTP 200 (or appropriate sync status)

#### Scenario: Clients on GitHub Pages keep talking to workers.dev

- **GIVEN** a user is on `https://fireman333.github.io/study-rpg/` and authenticated
- **WHEN** the sync engine pushes a bundle to R2
- **THEN** the network request URL SHALL begin with `https://study-rpg-sync-worker.tony85314.workers.dev/`
- **AND** the Worker SHALL respond identically (same backend)

### Requirement: Migration banner on GitHub Pages during bake

Both apps SHALL render a migration banner only on GitHub Pages deploys, gated by `import.meta.env.VITE_DEPLOY_TARGET === 'gh-pages'`. The banner SHALL display:

- A one-line announcement that the site is moving to `med-study-rpg.com`
- A primary CTA linking to the corresponding new-domain URL (`https://med-study-rpg.com/1st/` for 一階, `/2nd/` for 二階)
- A secondary CTA to export the user's data as JSON (reusing the existing Export hook from the `cloud-sync` capability's Export Account Data requirement)
- A dismiss button persisting `migration-banner-dismissed-v1=true` in localStorage

The GitHub Pages workflow (`.github/workflows/deploy.yml`) SHALL set `VITE_DEPLOY_TARGET=gh-pages` as a build-time env var. The Cloudflare Pages build SHALL NOT set this env var, so the banner SHALL be hidden on `med-study-rpg.com`.

#### Scenario: Banner appears on GitHub Pages 一階

- **GIVEN** the GitHub Pages workflow built with `VITE_DEPLOY_TARGET=gh-pages`
- **WHEN** a user opens `https://fireman333.github.io/study-rpg/`
- **THEN** the migration banner SHALL render at the top of the layout
- **AND** the primary CTA SHALL link to `https://med-study-rpg.com/1st/`
- **AND** the secondary CTA SHALL trigger the existing JSON export flow

#### Scenario: Banner hidden on Cloudflare Pages

- **GIVEN** the Cloudflare Pages build did not set `VITE_DEPLOY_TARGET`
- **WHEN** a user opens `https://med-study-rpg.com/1st/`
- **THEN** no migration banner SHALL render
- **AND** the app SHALL render its normal layout

#### Scenario: Dismissed banner stays dismissed across reloads

- **GIVEN** a user on GitHub Pages has clicked dismiss
- **WHEN** the same user reloads the GitHub Pages URL within the same browser profile
- **THEN** the banner SHALL NOT re-render
- **AND** the localStorage flag `migration-banner-dismissed-v1=true` SHALL be present

### Requirement: Root landing page at `med-study-rpg.com/`

The Cloudflare Pages site SHALL serve a minimal HTML landing page at the root (`dist-cf/index.html`). The page SHALL contain:

- The project name (`med-study-rpg` or equivalent display name)
- A one-sentence description of the project
- Two prominent links/buttons: "一階國考" → `/1st/` and "二階國考經營" → `/2nd/`
- A footer link to the project's source repository

The landing page SHALL be plain HTML/CSS only — no React, no JavaScript framework, no build-time bundling beyond a file copy.

The landing template SHALL live at `scripts/cf-landing-template.html` in the repository so its copy can be edited without rebuilding the apps.

#### Scenario: Root URL serves the landing page

- **WHEN** a user opens `https://med-study-rpg.com/` directly
- **THEN** the Cloudflare Pages site SHALL respond with the static landing HTML
- **AND** the browser SHALL NOT issue any failed asset requests (no missing CSS/images)

#### Scenario: Landing page links go to /1st/ and /2nd/

- **WHEN** a user clicks "一階國考" on the landing page
- **THEN** the browser SHALL navigate to `https://med-study-rpg.com/1st/`
- **AND** the 一階 app SHALL load normally

#### Scenario: Landing edit does not require app rebuild

- **WHEN** an owner edits `scripts/cf-landing-template.html` to update copy
- **THEN** the next Cloudflare Pages build SHALL pick up the new copy via `scripts/build-cf-pages-dist.mjs`
- **AND** no change to either `apps/medexam-tw/` or `apps/medexam2-hospital-tw/` SHALL be required

## MODIFIED Requirements

### Requirement: Subpath co-location for multi-app deployment

The repository SHALL host all production-deployed app shells under a **single deploy site per deploy target**. The repository runs two parallel deploys during the migration bake period:

- **GitHub Pages** (`fireman333.github.io/study-rpg/...`): legacy URL, 一階 at root + 二階 at `/hospital/` subpath; preserved unchanged during bake
- **Cloudflare Pages** (`med-study-rpg.com/...`): new URL, 一階 at `/1st/` + 二階 at `/2nd/`; site-root serves a landing page

For each deploy target, additional apps beyond the primary SHALL be served at subpaths of the deploy site (no sister repositories, no subdomain-per-app split).

This architectural decision SHALL be reflected in:

1. The deploying app's `vite.config.ts` `base` defaults to its GitHub Pages path; the same app uses `VITE_DEPLOY_BASE` to switch to the Cloudflare Pages path at build time (e.g. `/1st/` for 一階, `/2nd/` for 二階)
2. The deploy workflow / build script merging each app's `dist/` into the deploy artifact's appropriate subdirectory (`dist/<mode>/` for GitHub Pages, `dist-cf/<mode>/` for Cloudflare Pages)
3. No sister repository being created for the additional app

#### Scenario: Adding a third app follows the subpath convention

- **GIVEN** a future change introduces a third app, e.g. `apps/surgery-sim-tw/`
- **WHEN** the change designs its deploy path
- **THEN** the chosen GitHub Pages URL SHALL be `https://<owner>.github.io/study-rpg/<mode>/` (where `<mode>` is e.g. `surgery`)
- **AND** the chosen Cloudflare Pages URL SHALL be `https://med-study-rpg.com/<mode-cf>/` (where `<mode-cf>` is e.g. `3rd` or `surgery`)
- **AND** the app's `vite.config.ts` `base` default SHALL be `'/study-rpg/<mode>/'`
- **AND** the Cloudflare Pages build SHALL set `VITE_DEPLOY_BASE=/<mode-cf>/` for the new app
- **AND** the deploy workflow SHALL gain a build step + a dist merge step for both targets

#### Scenario: Sister repo is not used for additional apps

- **WHEN** a contributor proposes hosting a new game mode at a sister repo's GitHub Pages site, or at a sibling subdomain on `med-study-rpg.com`
- **THEN** the proposal SHALL be rejected per this requirement
- **AND** the proposal SHALL be redirected to subpath co-location under the existing deploy targets

#### Scenario: GitHub Pages deploy.yml `cp` source path stays aligned with sub-app vite base default

- **GIVEN** a sub-app's `vite.config.ts` declares default `base: '/study-rpg/<mode>/'`
- **WHEN** the GitHub Pages deploy workflow merges its dist
- **THEN** the `cp -r` destination SHALL be `apps/medexam-tw/dist/<mode>/` (matching the `<mode>` segment in vite base default)
- **AND** mismatched paths SHALL be flagged as a deploy contract violation

#### Scenario: Cloudflare Pages assembly stays aligned with `VITE_DEPLOY_BASE`

- **GIVEN** the Cloudflare Pages build sets `VITE_DEPLOY_BASE=/<mode-cf>/` for a sub-app
- **WHEN** `scripts/build-cf-pages-dist.mjs` assembles the merged output
- **THEN** the script SHALL copy that app's dist into `dist-cf/<mode-cf>/`
- **AND** the `_redirects` file SHALL include a `/<mode-cf>/*` rewrite rule
- **AND** mismatched paths SHALL be flagged as a deploy contract violation

#### Scenario: 一階 URL stability on GitHub Pages

- **WHEN** any new app is added under subpath co-location
- **THEN** the 一階 `https://<owner>.github.io/study-rpg/` URL SHALL remain unchanged
- **AND** the 一階 app's `vite.config.ts` `base` default `'/study-rpg/'` SHALL remain unchanged
- **AND** existing bookmarks / external links to 一階 routes on GitHub Pages SHALL continue to resolve

#### Scenario: 一階 URL on Cloudflare Pages is stable at /1st/

- **WHEN** any new app is added under subpath co-location on Cloudflare Pages
- **THEN** the 一階 `https://med-study-rpg.com/1st/` URL SHALL remain unchanged
- **AND** the `VITE_DEPLOY_BASE=/1st/` build invocation for 一階 SHALL remain unchanged
