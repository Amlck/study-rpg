## ADDED Requirements

### Requirement: OAuth redirect URI allowlist supports both old and new domains during bake

The Supabase Auth configuration SHALL accept OAuth callback redirects originating from both the legacy GitHub Pages origin and the new `med-study-rpg.com` origin during the migration bake period. Specifically, the Supabase Auth dashboard's "Additional Redirect URLs" allowlist SHALL include all of:

- `https://fireman333.github.io/study-rpg/**` (legacy 一階)
- `https://fireman333.github.io/study-rpg/hospital/**` (legacy 二階)
- `https://med-study-rpg.com/1st/**` (new 一階)
- `https://med-study-rpg.com/2nd/**` (new 二階)

The Supabase Auth "Site URL" field SHALL remain pointed at the legacy GitHub Pages 一階 URL (`https://fireman333.github.io/study-rpg/`) during the bake period. A subsequent change (bake-end follow-up) SHALL update the Site URL to `https://med-study-rpg.com/1st/` and remove the legacy entries from Additional Redirect URLs.

The redirect URI allowlist SHALL be documented in the project's deploy / setup checklist so future maintainers can audit it without spelunking the Supabase dashboard.

#### Scenario: User signs in on new domain 一階

- **GIVEN** the Supabase Additional Redirect URLs allowlist includes `https://med-study-rpg.com/1st/**`
- **WHEN** a user on `https://med-study-rpg.com/1st/` clicks "Sign in with Google" and completes Google consent
- **THEN** Supabase SHALL redirect back to a URL under `https://med-study-rpg.com/1st/`
- **AND** the app SHALL receive a valid session
- **AND** subsequent reloads on the same origin SHALL hydrate the session

#### Scenario: User signs in on new domain 二階

- **GIVEN** the Supabase Additional Redirect URLs allowlist includes `https://med-study-rpg.com/2nd/**`
- **WHEN** a user on `https://med-study-rpg.com/2nd/` clicks "Sign in with Google" and completes Google consent
- **THEN** Supabase SHALL redirect back to a URL under `https://med-study-rpg.com/2nd/`
- **AND** the app SHALL receive a valid session

#### Scenario: User signs in on legacy GitHub Pages still works during bake

- **GIVEN** the Supabase Additional Redirect URLs allowlist still includes `https://fireman333.github.io/study-rpg/**`
- **WHEN** a user on the legacy GitHub Pages URL clicks "Sign in with Google" and completes Google consent
- **THEN** Supabase SHALL redirect back to the legacy origin
- **AND** the legacy app SHALL receive a valid session
- **AND** existing migration / conflict-chooser flows SHALL function identically to pre-migration behavior

#### Scenario: Redirect to unlisted origin is rejected

- **WHEN** an attacker attempts to initiate sign-in from a non-allowlisted origin (e.g., a phishing clone at `med-study-rpg.evil.com/1st/`) and expects the callback to redirect there
- **THEN** Supabase SHALL reject the redirect per its allowlist enforcement
- **AND** no session SHALL be issued to the unlisted origin

### Requirement: Sign-in resolution treats new domain as fresh origin

Because IndexedDB is scoped per-origin, a user signing in on `https://med-study-rpg.com/1st/` for the first time SHALL be treated as having no local save data on that origin, regardless of whether the same user has data on the legacy GitHub Pages origin. The existing sign-in resolution flow (migration prompt vs. conflict chooser vs. silent-pull, defined in the `cloud-sync` capability) SHALL apply unchanged:

- If the user has cloud data and no local data on the new origin → silent-pull (existing behavior)
- If the user has local data on the new origin (e.g., played anonymously first) and existing cloud data → conflict chooser (existing behavior)
- If both are empty → fresh-start (existing behavior)

No auth-layer code change is required for this requirement — it is documenting the expected interaction between the per-origin IndexedDB scope and the existing sign-in resolution state machine on the new domain.

#### Scenario: Existing authed user signs in on new domain first time

- **GIVEN** a user with cloud-sync data exists from prior sign-ins on the legacy GitHub Pages origin
- **AND** the user has never opened `https://med-study-rpg.com/1st/` before
- **WHEN** the user signs in via Google OAuth on the new domain
- **THEN** the sync engine SHALL detect "cloud has data, local is empty"
- **AND** the silent-pull gate SHALL fire (per existing `cloud-sync` behavior)
- **AND** the user's gameplay state SHALL hydrate from cloud without prompting

#### Scenario: Anonymous user on new domain signs in after some play

- **GIVEN** a user has opened `https://med-study-rpg.com/1st/` anonymously and accumulated local gameplay data on the new origin
- **AND** the same user has cloud-sync data from prior sign-ins elsewhere
- **WHEN** the user signs in via Google OAuth on the new domain
- **THEN** the sync engine SHALL detect "cloud has data, local has data"
- **AND** the conflict chooser modal SHALL appear per existing `cloud-sync` behavior
- **AND** the user SHALL be able to keep local, replace with cloud, or keep separate
