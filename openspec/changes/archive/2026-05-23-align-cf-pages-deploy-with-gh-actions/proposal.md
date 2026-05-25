## Why

The deploy-pipeline spec currently states that Cloudflare Pages SHALL be configured via the Cloudflare dashboard GitHub integration. In practice this never worked — the CF Pages project was set up in Direct Upload mode (`Git Provider: No`), and every CF deploy after 2026-05-22 17:06 (commit `cfaaa32`) silently stalled until the owner ran `wrangler pages deploy` manually. The 2026-05-22 Import UI ship (`6fa3a22`) hit this gap end-to-end, so a GitHub Actions workflow `.github/workflows/deploy-cf-pages.yml` was shipped as an unblocking direct commit to match the existing `deploy-worker.yml` pattern. The spec now contradicts the implementation; this change aligns them.

## What Changes

- **MODIFIED** `deploy-pipeline` spec requirement "Cloudflare Pages deploy target alongside GitHub Pages": replace the dashboard-integration sentence with a GitHub-Actions-workflow contract pointing at `.github/workflows/deploy-cf-pages.yml`. Build command + output dir + auth model remain identical.
- **ADDED** `deploy-pipeline` spec requirement "Cloudflare Pages deploy workflow uses minimum-required permissions + scoped CF API token": codifies the working `CF_API_TOKEN` scope set (Cloudflare Pages:Edit + Workers Scripts:Edit + Workers R2 Storage:Edit + User Details:Read + Memberships:Read) plus the `workingDirectory: cloudflare/sync-worker` mitigation for `ERR_PNPM_ADDING_TO_ROOT`.
- **ADDED** `deploy-pipeline` spec requirement "Local CF Pages deploy fallback via npm scripts": codifies `pnpm run build:cf` + `pnpm run deploy:cf` as the documented manual fallback when GH Actions is unavailable.

No code changes — implementation already shipped in `5d8de8c` (workflow + `workingDirectory` fix) and `5abc877` (npm scripts). This change retroactively spec-aligns those commits.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `deploy-pipeline`: replace "via dashboard GitHub integration" with "via GH Actions workflow"; add token-scope + npm-script requirements.

## Impact

- **Spec**: `openspec/specs/deploy-pipeline/spec.md` — one requirement MODIFIED, two requirements ADDED.
- **Code**: none new. Already-shipped files referenced by the new spec:
  - `.github/workflows/deploy-cf-pages.yml`
  - `package.json` (root) — `build:cf` + `deploy:cf` scripts
  - `scripts/build-cf-pages-dist.mjs` (unchanged, already documented in current spec)
- **Operational**: `CF_API_TOKEN` GitHub Secret must carry Pages:Edit scope (already done as part of this session — first successful run `5d8de8c` → CF deployment `145206ee` at 2026-05-22 17:33).
- **Bake-period implication**: GH Pages workflow (`deploy.yml`) remains unchanged. CF Pages now auto-deploys parallel to GH Pages on every main push.
