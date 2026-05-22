## ADDED Requirements

### Requirement: Worker Custom Domain `api.med-study-rpg.com` serves as canonical API base

The Cloudflare Worker `study-rpg-sync-worker` SHALL be bound to a Custom Domain `api.med-study-rpg.com` such that requests to `https://api.med-study-rpg.com/<path>` reach the same Worker instance as the existing `https://study-rpg-sync-worker.tony85314.workers.dev/<path>` URL. Both URLs SHALL resolve to identical Worker logic — no version split, no traffic split.

Binding SHALL be configured via either:

1. Cloudflare dashboard → Workers → `study-rpg-sync-worker` → Settings → Triggers → Custom Domains → Add Custom Domain (auto-creates DNS records since `med-study-rpg.com` is on Cloudflare), OR
2. `cloudflare/sync-worker/wrangler.toml` with a `[[routes]]` entry: `{ pattern = "api.med-study-rpg.com/*", zone_name = "med-study-rpg.com" }`

Either method satisfies the requirement; the chosen method SHALL be documented in `cloudflare/sync-worker/README.md`.

The client-side env var `VITE_SYNC_WORKER_URL` SHALL be set to `https://api.med-study-rpg.com` for the Cloudflare Pages build, while the GitHub Pages workflow continues to default to `https://study-rpg-sync-worker.tony85314.workers.dev`.

#### Scenario: api subdomain reaches the Worker

- **GIVEN** the Custom Domain binding is active
- **WHEN** any HTTP request is sent to `https://api.med-study-rpg.com/<any-path>`
- **THEN** the request SHALL be handled by `study-rpg-sync-worker`
- **AND** the response SHALL be byte-identical to what the same request to `https://study-rpg-sync-worker.tony85314.workers.dev/<same-path>` produces

#### Scenario: New domain client pushes to R2 via api subdomain

- **GIVEN** a user on `https://med-study-rpg.com/1st/` has dirty local state and is signed in
- **WHEN** the sync engine debounce fires and pushes an R2 bundle snapshot
- **THEN** the network request SHALL be a POST/PUT to `https://api.med-study-rpg.com/<r2-endpoint>`
- **AND** the Worker SHALL mint a presigned URL and the client SHALL complete the binary upload
- **AND** `Performance.getEntriesByType('resource')` SHALL show a successful round-trip (per the `chrome_mcp_preflight.md` PUT-via-Performance-API verification rule)

### Requirement: Worker CORS allowed origins include both legacy and new domains during bake

The Worker's CORS allowed origins list SHALL include:

- `https://fireman333.github.io` (legacy GitHub Pages — required during bake)
- `https://med-study-rpg.com` (new Cloudflare Pages — required for new domain clients)
- `http://localhost:5173` (existing development — unchanged)

Any other origin SHALL be rejected with the standard CORS deny response.

The Worker SHALL apply CORS to all R2 sync endpoints (presign, healthz, etc.) and to all leaderboard endpoints (cross-referenced from the `hospital-leaderboard` capability — same Worker, same CORS code path).

The bake-end follow-up change SHALL remove `https://fireman333.github.io` from the allowed origins once the GitHub Pages site is decommissioned (or switched to redirect-only mode).

#### Scenario: New domain preflight succeeds

- **GIVEN** the Worker's `ALLOWED_ORIGINS` includes `https://med-study-rpg.com`
- **WHEN** a browser on `https://med-study-rpg.com/1st/` issues a CORS preflight OPTIONS to `https://api.med-study-rpg.com/<endpoint>`
- **THEN** the Worker SHALL respond with `Access-Control-Allow-Origin: https://med-study-rpg.com`
- **AND** the browser SHALL proceed with the actual request

#### Scenario: Legacy GitHub Pages preflight still succeeds during bake

- **GIVEN** the Worker's `ALLOWED_ORIGINS` still includes `https://fireman333.github.io`
- **WHEN** a browser on `https://fireman333.github.io/study-rpg/` issues a CORS preflight to `https://study-rpg-sync-worker.tony85314.workers.dev/<endpoint>`
- **THEN** the Worker SHALL respond with `Access-Control-Allow-Origin: https://fireman333.github.io`
- **AND** existing sync flows SHALL function unchanged

#### Scenario: Unrecognized origin is rejected

- **WHEN** any browser on an origin not in the allowed list (e.g., `https://med-study-rpg.com.evil.tld/`) issues a CORS preflight
- **THEN** the Worker SHALL NOT include that origin in the `Access-Control-Allow-Origin` response header
- **AND** the browser SHALL block the subsequent fetch

### Requirement: Client picks Worker URL from `VITE_SYNC_WORKER_URL` env, defaulting to workers.dev

Each app's R2 sync client (and leaderboard client) SHALL read `import.meta.env.VITE_SYNC_WORKER_URL` at runtime. If the env var is unset or empty, the client SHALL default to `https://study-rpg-sync-worker.tony85314.workers.dev` (preserving GitHub Pages behavior).

The env var SHALL be validated to be a `https://` URL with no trailing slash and a non-empty host before use. Empty strings, `undefined`, or whitespace-only values SHALL fall back to the default.

The GitHub Pages workflow `.github/workflows/deploy.yml` MAY explicitly set `VITE_SYNC_WORKER_URL` to the workers.dev URL (preferred for explicitness) or leave it unset and rely on the default.

The Cloudflare Pages build SHALL set `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com` in its build environment.

#### Scenario: CF Pages build env switches Worker URL

- **GIVEN** the Cloudflare Pages dashboard sets `VITE_SYNC_WORKER_URL=https://api.med-study-rpg.com` for both Production and Preview environments
- **WHEN** the build runs `vite build` for either app
- **THEN** the resulting bundle SHALL reference `https://api.med-study-rpg.com` as the sync API base
- **AND** runtime sync operations on `med-study-rpg.com` SHALL hit `api.med-study-rpg.com`

#### Scenario: Missing env var falls back to workers.dev

- **GIVEN** the GitHub Pages workflow does not set `VITE_SYNC_WORKER_URL`
- **WHEN** the build runs
- **THEN** the resulting bundle SHALL reference `https://study-rpg-sync-worker.tony85314.workers.dev`
- **AND** legacy clients SHALL continue using the workers.dev URL

#### Scenario: Empty-string env var falls back to default

- **GIVEN** the CI environment sets `VITE_SYNC_WORKER_URL=` (empty string)
- **WHEN** the client reads the env var
- **THEN** the client SHALL apply the default (`https://study-rpg-sync-worker.tony85314.workers.dev`)
- **AND** no runtime error SHALL surface from an empty URL
