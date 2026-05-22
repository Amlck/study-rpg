## MODIFIED Requirements

### Requirement: Cloudflare Pages deploy target alongside GitHub Pages

The repository SHALL produce a Cloudflare Pages deployment of both apps in addition to the existing GitHub Pages deploy. Cloudflare Pages SHALL serve from the custom domain `med-study-rpg.com` with the following layout:

- `https://med-study-rpg.com/` — minimal HTML landing page linking to both apps
- `https://med-study-rpg.com/1st/` — 一階 (`apps/medexam-tw`) entry
- `https://med-study-rpg.com/2nd/` — 二階 (`apps/medexam2-hospital-tw`) entry

The Cloudflare Pages site SHALL be deployed via a GitHub Actions workflow at `.github/workflows/deploy-cf-pages.yml`. The CF Pages project itself remains in **Direct Upload** mode (`Git Provider: No` in `wrangler pages project list`); the dashboard GitHub integration is intentionally NOT used, so that the workflow is the single deploy trigger.

The workflow SHALL run on:

1. Every `push` to the `main` branch
2. Manual `workflow_dispatch` from the GitHub UI

The workflow build sequence SHALL:

1. Install dependencies with `pnpm install --frozen-lockfile`
2. Build 一階 with `VITE_DEPLOY_BASE=/1st/`
3. Build 二階 with `VITE_DEPLOY_BASE=/2nd/` and `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com`
4. Assemble the merged `dist-cf/` output via `node scripts/build-cf-pages-dist.mjs`
5. Deploy via `cloudflare/wrangler-action@v3` running `pages deploy ../../dist-cf --project-name med-study-rpg --branch main` from `workingDirectory: cloudflare/sync-worker`

The `workingDirectory: cloudflare/sync-worker` requirement is load-bearing: it allows the action's `pnpm exec wrangler` discovery to find the wrangler devDependency already pinned in `cloudflare/sync-worker/package.json`, avoiding the `ERR_PNPM_ADDING_TO_ROOT` failure that fires when the action falls back to `pnpm add wrangler` against the monorepo root.

The Pages output directory SHALL be `dist-cf/` at the repo root (referenced from the workflow's working directory via the relative path `../../dist-cf`).

During the bake period, GitHub Pages deploy SHALL continue to function unchanged — both deploys serve identical app code under different base paths and origins.

#### Scenario: Push to main triggers both deploys

- **WHEN** any commit lands on `main`
- **THEN** GitHub Pages workflow (`deploy.yml`) SHALL build and publish to `fireman333.github.io/study-rpg/` and `/study-rpg/hospital/` (unchanged)
- **AND** the Cloudflare Pages workflow (`deploy-cf-pages.yml`) SHALL build and publish to `med-study-rpg.com/1st/` and `/2nd/`
- **AND** both deploys SHALL produce successful builds independently — a failure on one SHALL NOT block the other

#### Scenario: Manual dispatch of CF Pages deploy is available

- **WHEN** the user opens the `Actions` tab on GitHub and selects the `Deploy Cloudflare Pages` workflow
- **THEN** a `Run workflow` button SHALL be available (because `workflow_dispatch` is configured)
- **AND** clicking it SHALL trigger a deploy without needing a new commit

#### Scenario: Cloudflare Pages build assembles dist-cf from two app dists

- **WHEN** the Cloudflare Pages workflow runs
- **THEN** both apps SHALL build with their respective `VITE_DEPLOY_BASE` values
- **AND** 二階 SHALL build with `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com` so client sync requests target the Worker's Custom Domain
- **AND** `scripts/build-cf-pages-dist.mjs` SHALL copy `apps/medexam-tw/dist/*` into `dist-cf/1st/`
- **AND** `scripts/build-cf-pages-dist.mjs` SHALL copy `apps/medexam2-hospital-tw/dist/*` into `dist-cf/2nd/`
- **AND** the assembly script SHALL write `dist-cf/_redirects` and `dist-cf/index.html` (landing page)

#### Scenario: Wrangler step runs from cloudflare/sync-worker subdirectory

- **WHEN** the deploy step in `deploy-cf-pages.yml` invokes `cloudflare/wrangler-action@v3`
- **THEN** the action SHALL use `workingDirectory: cloudflare/sync-worker`
- **AND** the deploy command SHALL reference `dist-cf` via the relative path `../../dist-cf` from that working directory
- **AND** the action SHALL succeed without falling back to `pnpm add wrangler@<version>` at the monorepo root (which would fail with `ERR_PNPM_ADDING_TO_ROOT`)

#### Scenario: New domain serves 一階 at /1st/ and 二階 at /2nd/

- **GIVEN** the Cloudflare Pages workflow has succeeded for the latest `main`
- **WHEN** a user opens `https://med-study-rpg.com/1st/` in a browser
- **THEN** the 一階 app SHALL load and function identically to its GitHub Pages deploy
- **AND** the same applies for `/2nd/` and the 二階 app

#### Scenario: Dashboard GitHub integration is NOT used

- **WHEN** `wrangler pages project list` is run against the production account
- **THEN** the `med-study-rpg` project row SHALL show `Git Provider: No`
- **AND** the CF dashboard SHALL NOT have a GitHub source connected to this project
- **AND** the only mechanism that produces production deployments SHALL be either the GH Actions workflow OR an owner-triggered local `pnpm run deploy:cf` invocation

## ADDED Requirements

### Requirement: Cloudflare Pages workflow uses minimum-required permissions and scoped CF API token

The `deploy-cf-pages.yml` workflow SHALL declare the same `permissions:` and `concurrency:` blocks as `deploy-worker.yml`:

- `permissions: { contents: read }` (for checkout only)
- `concurrency: { group: deploy-cf-pages, cancel-in-progress: false }` (serializes deploys, doesn't kill mid-upload)

The `CF_API_TOKEN` repo secret SHALL carry exactly the following Cloudflare API token permissions, shared with `deploy-worker.yml`:

| Resource type | Resource | Permission | Used by |
|---|---|---|---|
| Account | Cloudflare Pages | Edit | `deploy-cf-pages.yml` (pages deploy) |
| Account | Workers Scripts | Edit | `deploy-worker.yml` |
| Account | Workers R2 Storage | Edit | `deploy-worker.yml` (R2 bucket bindings) |
| User | User Details | Read | wrangler auth check (suppresses warnings) |
| User | Memberships | Read | wrangler auth check (suppresses warnings) |

The `CF_ACCOUNT_ID` repo secret SHALL be the same Cloudflare account ID used by `deploy-worker.yml` (a single Cloudflare account owns the Worker + the Pages project).

If `CF_API_TOKEN` is regenerated, the maintainer SHALL re-create the token with the full permission set above. A token missing `Cloudflare Pages:Edit` SHALL fail the workflow with `Authentication error [code: 10000]` at the wrangler deploy step.

#### Scenario: Token missing Pages:Edit fails the deploy step

- **GIVEN** `CF_API_TOKEN` is set to a token without `Cloudflare Pages:Edit` permission
- **WHEN** the `Deploy via Wrangler` step runs
- **THEN** the wrangler API call to `/accounts/<id>/pages/projects/med-study-rpg` SHALL respond with HTTP error code 10000 (Authentication error)
- **AND** the workflow run SHALL fail with `Action failed`
- **AND** earlier steps in the same job (build 一階, build 二階, assemble dist-cf) SHALL be unaffected — they do not call the CF API

#### Scenario: Successful run after token rotation with correct scope

- **GIVEN** the maintainer has regenerated `CF_API_TOKEN` with the full permission set above
- **WHEN** the workflow is re-run (via `Re-run all jobs` or a fresh push)
- **THEN** all build steps SHALL pass
- **AND** the wrangler deploy step SHALL succeed
- **AND** the new deployment SHALL appear in `wrangler pages deployment list --project-name med-study-rpg` with the latest commit SHA in the `Source` column

### Requirement: Local Cloudflare Pages deploy fallback via npm scripts

The repository root `package.json` SHALL expose two npm scripts that allow the maintainer to deploy CF Pages from their local machine without going through GH Actions:

- `pnpm run build:cf` — builds 一階 with `VITE_DEPLOY_BASE=/1st/`, builds 二階 with `VITE_DEPLOY_BASE=/2nd/` + `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com`, then runs `node scripts/build-cf-pages-dist.mjs` to assemble `dist-cf/`
- `pnpm run deploy:cf` — runs `build:cf` then `wrangler pages deploy dist-cf --project-name med-study-rpg --branch main --commit-dirty=true`

These scripts are the documented manual fallback for the following situations:

1. GH Actions queue is backed up and a deploy is time-sensitive
2. The maintainer wants to verify a build artifact locally before pushing
3. The workflow itself is broken (e.g., during workflow refactor)

The scripts SHALL use the maintainer's locally installed `wrangler` (typically via Homebrew). Drift between local wrangler version and the CI version (`cloudflare/sync-worker/package.json` devDep) is accepted because the deploy is a static-asset upload, not a runtime contract.

#### Scenario: `pnpm run deploy:cf` produces a new CF Pages deployment

- **GIVEN** the maintainer has authenticated `wrangler` locally (`wrangler whoami` returns the production account)
- **WHEN** they run `pnpm run deploy:cf` from the repo root
- **THEN** both apps SHALL build with the same env vars as the CI workflow
- **AND** `dist-cf/` SHALL be assembled at the repo root
- **AND** `wrangler pages deploy` SHALL upload the assembled output to the production CF Pages project
- **AND** the new deployment SHALL appear in `wrangler pages deployment list` and `med-study-rpg.com/1st/` SHALL serve the freshly-built bundles

#### Scenario: `pnpm run build:cf` runs without authentication

- **WHEN** the maintainer runs `pnpm run build:cf` (without `deploy:`) on a machine where wrangler is not authenticated
- **THEN** both app builds SHALL succeed
- **AND** `dist-cf/` SHALL be assembled at the repo root
- **AND** no CF API call SHALL be made
