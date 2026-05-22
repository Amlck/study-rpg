## Context

The original `add-med-study-rpg-domain-migration` change (archived 2026-05-22) specced CF Pages deploy as "configured via the Cloudflare dashboard GitHub integration". That setup was never completed — the CF Pages project lives in Direct Upload mode (`wrangler pages project list` shows `Git Provider: No`). Past CF deploys were owner-triggered locally via `wrangler pages deploy dist-cf`, leaving a manual gap that broke silently each time the owner pushed without remembering to run wrangler.

The gap surfaced end-to-end on 2026-05-22 17:06 when the Import UI shipped (`6fa3a22`): GH Pages auto-deployed in 1m7s, but CF stayed at the previous deploy (`32c0b90`, 36 min stale). Owner spotted it via `wrangler pages deployment list`. Manual deploy unblocked prod, but the next push would have hit the same gap. A GitHub Actions workflow was added in `5abc877` (initial) + `22c39c3` (workingDirectory fix), shipped as a direct commit during bake. First successful run was `5d8de8c` → CF deployment `145206ee` at 17:33.

This design retroactively documents why the workflow looks the way it does so the next maintainer doesn't repeat the trial-and-error.

## Goals / Non-Goals

**Goals:**

- CF Pages auto-deploys on every push to `main` without owner intervention
- Parity with the existing Worker workflow's auth + secret model (single shared `CF_API_TOKEN` + `CF_ACCOUNT_ID`)
- Local fallback path (`pnpm run deploy:cf`) when GH Actions is queued or owner needs to test before pushing
- Spec captures the working token-scope set so future token rotations don't re-discover it

**Non-Goals:**

- Replacing the GH Pages deploy. Both deploy targets continue in parallel during bake (per archived domain-migration spec). GH Pages retirement is a separate bake-end change.
- Switching CF Pages to "dashboard GitHub integration" mode. Direct Upload + GH Actions is the chosen path; reconnecting dashboard integration would create two competing deploy triggers.
- Changing the `dist-cf` assembly pipeline (`scripts/build-cf-pages-dist.mjs`). That contract is owned by the existing `add-med-study-rpg-domain-migration` spec and is unaffected.
- Bumping `cloudflare/wrangler-action@v3` → v4. Current v3 works; Node 20 deprecation warning is a future-cleanup item.

## Decisions

### D1: GH Actions workflow (NOT dashboard GitHub integration)

**Choice**: `.github/workflows/deploy-cf-pages.yml` mirroring the existing `deploy-worker.yml` pattern.

**Why**:

- Symmetry with Worker deploy: same secrets, same action (`cloudflare/wrangler-action@v3`), same trigger model. One mental model, not two.
- The dashboard integration option was specced but never actually configured — keeping CF Pages in Direct Upload mode preserves the working state plus what owner has been doing manually all along.
- Workflow lives in the repo + reviewed via PR, vs dashboard config which is opaque + per-account.
- Reuses the existing `CF_API_TOKEN` + `CF_ACCOUNT_ID` repo secrets — no new secret surface.

**Alternative considered**: Wire up CF dashboard GitHub integration as originally specced. Rejected because: (a) requires owner to set up via dashboard each time (anti-IaC), (b) creates a second deploy trigger that could race with GH Actions, (c) the spec sentence about it has been wrong since day one — easier to fix the spec than fix the world.

### D2: `workingDirectory: cloudflare/sync-worker` to dodge `ERR_PNPM_ADDING_TO_ROOT`

**Choice**: Pin the wrangler-action's `workingDirectory` to `cloudflare/sync-worker` and reference `dist-cf` via the relative path `../../dist-cf`.

**Why**:

- First workflow attempt (run `26301867880`) failed at the wrangler install step. `cloudflare/wrangler-action@v3` tries `pnpm exec wrangler --version`, fails because monorepo root has no wrangler, then falls back to `pnpm add wrangler@3.90.0` — which pnpm refuses at workspace roots (`ERR_PNPM_ADDING_TO_ROOT`).
- `cloudflare/sync-worker/` already has `wrangler` as a `devDependency` (pinned for the Worker workflow). Hopping into that subdir makes `pnpm exec wrangler` succeed without any install step.
- `wrangler pages deploy <path>` resolves `<path>` relative to cwd, so `../../dist-cf` from `cloudflare/sync-worker/` lands correctly at the repo root's `dist-cf/`.

**Alternative considered**: Add `wrangler` to root `devDependencies`. Rejected because: (a) inflates monorepo root install cost for a CI-only need, (b) creates a second source of truth for wrangler version vs the sync-worker's dep, (c) the `workingDirectory` mitigation is one line.

**Side effect (accepted)**: When wrangler runs from `cloudflare/sync-worker/`, it auto-detects `wrangler.jsonc` and emits a warning:
> `WARNING: Pages now has wrangler.jsonc support. We detected a configuration file at cloudflare/sync-worker/wrangler.jsonc but it is missing the "pages_build_output_dir" field, required by Pages. Ignoring configuration file for now, and proceeding with project deploy.`

This is cosmetic — the deploy proceeds successfully because `pages deploy` CLI args take precedence. Leaving as-is rather than splitting wrangler config files (the sync-worker config is correct for its own purposes; adding a Pages-shaped field there would be misleading).

### D3: Token scope set codified in spec

**Choice**: The spec enumerates the exact `CF_API_TOKEN` permissions needed:

| Resource | Permission | Used for |
|---|---|---|
| Account → Cloudflare Pages | Edit | This workflow (pages deploy) |
| Account → Workers Scripts | Edit | deploy-worker.yml |
| Account → Workers R2 Storage | Edit | deploy-worker.yml (R2 bucket bindings) |
| User → User Details | Read | wrangler's auth-check (avoids noisy warnings) |
| User → Memberships | Read | wrangler's auth-check (avoids noisy warnings) |

**Why**: First workflow run with a correct `workingDirectory` (run `26301962134`) failed with `Authentication error [code: 10000]` — the existing token had Worker scopes but not Pages:Edit. Re-run after owner extended the scope succeeded (run #2, 49s). Codifying this set in the spec means the next time the token rotates, the maintainer knows what to enable.

**Alternative considered**: Use two separate tokens (one for Worker, one for Pages). Rejected because: (a) doubles secret-management surface, (b) the wrangler-action accepts only one `apiToken` per invocation anyway, (c) both workflows already share `CF_ACCOUNT_ID`.

### D4: Local npm scripts as documented fallback

**Choice**: Ship `pnpm run build:cf` (build both apps + assemble dist-cf) and `pnpm run deploy:cf` (build:cf + wrangler pages deploy).

**Why**:

- Bake-period reality: GH Actions occasionally fails (network, queue, action upgrades). The owner needs a one-liner path to unblock prod without debugging CI.
- Discovery: a year from now, "how do I deploy this thing locally" should be answerable by `pnpm run` autocomplete, not git archaeology.
- The composite command is non-trivial (3 env-vared build commands + assembly + wrangler). Encoding it once in `package.json` beats 3 README screenshots.

**Trade-off**: `deploy:cf` uses the local `wrangler` (Homebrew install) which can drift from the CI version. Acceptable — the deploy is a static-asset upload, not a runtime contract.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `cloudflare/wrangler-action@v3` Node 20 deprecation warning will eventually become an error | Track upstream v4 release; bump when stable. Dependabot will likely PR it. |
| Token rotation: future maintainer regenerates token without Pages:Edit | Spec now enumerates the scope set; workflow comments cross-reference it |
| GH Actions outage = no deploy | Local fallback `pnpm run deploy:cf` documented as supported path, not workaround |
| `workingDirectory: cloudflare/sync-worker` creates a couples-feeling — Pages deploy "knows about" Worker package layout | Comment in workflow yaml + design doc explains the coupling is intentional + minimal (one path) |
| CF API auth failures during a deploy that already uploaded some files | Wrangler `pages deploy` is idempotent; re-run after fixing auth re-uploads from CAS cache |
| Two parallel deploys (GH Pages + CF Pages) double the maintenance surface during bake | Already accepted by parent domain-migration change; this design inherits that trade-off |
