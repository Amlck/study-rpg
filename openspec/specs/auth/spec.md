# auth Specification

## Purpose

Defines optional user authentication for study-rpg via Supabase Google OAuth. Auth is the entry point for cross-device cloud sync (see `cloud-sync` capability) but the app remains fully playable without it — IndexedDB stays the source of truth and no gameplay flow blocks on sign-in. The auth surface SHALL be discoverable from the app shell, hydrate session state on every mount, and cleanly sign out without touching local gameplay data.
## Requirements
### Requirement: Google OAuth sign-in flow

The app SHALL provide a "Sign in with Google" action that initiates Supabase OAuth, redirects to Google for consent, and returns to the app with an authenticated Supabase session persisted in browser storage.

#### Scenario: Successful sign-in
- **WHEN** the user clicks "Sign in with Google" and completes Google consent
- **THEN** the app SHALL receive a Supabase session, store it via the Supabase client default storage, and update the UI to reflect the authed state (display user email or avatar, replace sign-in button with sign-out)

#### Scenario: User cancels Google consent
- **WHEN** the user closes the Google consent window before granting permission
- **THEN** the app SHALL remain in the unauthenticated state with no error toast and no broken UI

### Requirement: Session hydration on app load

On every app mount, the app SHALL ask Supabase for the current session before any user interaction, and reflect the result in UI within 500ms of first paint.

#### Scenario: Returning authed user
- **WHEN** the app loads and Supabase reports an active session
- **THEN** the UI SHALL show authed state on first paint (no flash of unauthed UI)
- **AND** sync engine MAY begin background pull

#### Scenario: Returning unauthed user
- **WHEN** the app loads and Supabase reports no session
- **THEN** the UI SHALL show unauthed state with sign-in entry visible
- **AND** sync engine SHALL remain dormant

### Requirement: Sign-out clears session but preserves local data

The app SHALL provide a "Sign out" action that revokes the Supabase session and clears auth-only client state, while leaving IndexedDB gameplay state intact. The action SHALL FIRST await any pending sync engine `pushAllNow()` so that recent dirty writes are persisted to cloud BEFORE the engine is torn down (see `cloud-sync` capability "Sign-out flushes pending writes before signing out" requirement).

#### Scenario: Sign-out preserves local save

- **WHEN** the user signs out
- **THEN** the Supabase client SHALL clear its session
- **AND** the IndexedDB `Player` and `ItemInstance[]` records SHALL remain unchanged
- **AND** the user SHALL be able to continue playing offline immediately

#### Scenario: Sign-out awaits in-flight push

- **GIVEN** the user has dirty writes within the engine's debounce window (push timer not yet fired)
- **WHEN** the user invokes sign-out via the UI
- **THEN** the sign-out flow SHALL first invoke `engine.pushAllNow()` to flush dirty writes
- **AND** SHALL await its resolution
- **AND** ONLY then call `supabase.auth.signOut()`
- **AND** total sign-out latency MAY exceed the previous baseline by ~200-500ms

#### Scenario: Push failure during sign-out does not block sign-out

- **GIVEN** the user has pending dirty writes AND the network is offline (or push fails for any reason)
- **WHEN** the user invokes sign-out
- **THEN** the push error SHALL be recorded but SHALL NOT block sign-out
- **AND** the user SHALL still be signed out (best-effort flush, mandatory signOut)
- **AND** dirty writes remain in local IndexedDB; next sign-in's cold-start force-pull reconciles with cloud state

### Requirement: Authentication is opt-in

The app SHALL be fully playable without any sign-in. Cloud sync SHALL be enabled only after successful sign-in, and SHALL NOT block any gameplay flow when offline or unauthed.

#### Scenario: Fresh browser, never signed in
- **WHEN** a user opens the app for the first time without signing in
- **THEN** all gameplay (reading, quiz, loot, equip, SRS review) SHALL work using IndexedDB only
- **AND** no Supabase network call SHALL be attempted

#### Scenario: Signed-in user goes offline
- **WHEN** a signed-in user loses network connectivity
- **THEN** gameplay SHALL continue uninterrupted using IndexedDB
- **AND** unsynced writes SHALL be queued for later (per cloud-sync offline queue requirement)

### Requirement: Sign-in surface is discoverable but unobtrusive

The app shell SHALL expose the sign-in entry point in a consistent location (e.g., header or settings panel) that is visible without obstructing primary gameplay.

#### Scenario: Sign-in button on app shell
- **WHEN** an unauthed user is on any primary route (home, reading, quiz, dorm)
- **THEN** a "Sign in" entry SHALL be reachable within at most one click from the current view
- **AND** the entry SHALL NOT overlap or obstruct the active gameplay area

### Requirement: Account-switch detection on sign-in

The app SHALL track the most-recently-signed-in user identifier in local IndexedDB (`db.meta.last_signed_in_user_id`). On every successful sign-in transition (`onAuthStateChange` → `'SIGNED_IN'`), the app SHALL compare the current `auth.user.id` against the stored value. When the two differ AND local IndexedDB contains non-default gameplay state, the app SHALL pause automatic sync gate computation and render an `AccountSwitchPrompt` modal BEFORE any existing migration-upload or conflict-chooser modal evaluates.

The stored value SHALL be updated only on successful sign-in (NOT on sign-out), so that signing out and back in as the same user does not falsely trigger the prompt.

#### Scenario: Same account returning — no prompt

- **GIVEN** a user previously signed in as Account A AND `last_signed_in_user_id = A.id`
- **AND** they signed out (local state preserved per existing spec)
- **WHEN** they sign in again as Account A
- **THEN** the app SHALL NOT show `AccountSwitchPrompt`
- **AND** the existing migration / conflict gate flow SHALL run normally

#### Scenario: Different account on shared device — prompt fires

- **GIVEN** a user previously signed in as Account A AND `last_signed_in_user_id = A.id`
- **AND** local IndexedDB has non-default gameplay state from Account A's session
- **WHEN** a different user signs in as Account B (B.id ≠ A.id)
- **THEN** the app SHALL render `AccountSwitchPrompt` modal BEFORE any other sync-related modal
- **AND** the automatic gate computation SHALL NOT run until the modal is resolved
- **AND** no Supabase rows SHALL be modified during the prompt-pending state

#### Scenario: First sign-in ever — no prompt

- **GIVEN** `last_signed_in_user_id` IS NULL (user has never signed in before)
- **WHEN** the user signs in for the first time
- **THEN** the app SHALL NOT show `AccountSwitchPrompt`
- **AND** the existing first-sign-in migration flow SHALL evaluate normally

#### Scenario: Prompt offers three explicit options

- **WHEN** `AccountSwitchPrompt` is rendered
- **THEN** the modal SHALL offer at least three options:
  - 「清空本地、改用此帳號的雲端進度」 (clear local sync tables + clear migration-choice meta keys, then proceed with fresh-start gate)
  - 「保留本地進度、合併到此帳號雲端」 (proceed to existing conflict-chooser gate; LWW resolution applies)
  - 「先登出，我用回原本帳號」 (immediate sign-out, no local data touched)
- **AND** the modal SHALL display both side's last-modified timestamps (max `updated_at` from local rows + cloud row count) so the user can make an informed choice

#### Scenario: Clear-local choice resets state

- **WHEN** the user picks 「清空本地」
- **THEN** all synced IndexedDB tables SHALL be cleared (matching the table set defined in `cloud-sync` capability)
- **AND** all `db.meta` keys matching pattern `migration-choice:*` SHALL be removed
- **AND** `last_signed_in_user_id` SHALL be updated to current `user.id`
- **AND** the sync engine SHALL resume with `gateState = 'fresh-start'` (or `'silent-pull'` if Account B's cloud has rows)
- **AND** non-sync local data (cosmetic UI preferences, etc.) SHALL be preserved

#### Scenario: Cancel-sign-out preserves all data

- **WHEN** the user picks 「先登出」
- **THEN** the app SHALL call `supabase.auth.signOut()` immediately
- **AND** no local IndexedDB data SHALL be modified
- **AND** `last_signed_in_user_id` SHALL remain at its previous value (Account A's id)
- **AND** the user SHALL return to the unauthenticated UI state without further prompts

#### Scenario: Detector bypass via env flag

- **GIVEN** the env var `VITE_ACCOUNT_SWITCH_DETECTOR === 'false'`
- **WHEN** a user signs in with a different account
- **THEN** the detector SHALL NOT fire
- **AND** the existing pre-fix sign-in flow SHALL apply (rollback safety)

#### Scenario: Offline sign-in defers verification

- **GIVEN** the device is offline AND a user signs in with cached auth
- **WHEN** account-switch detection runs and cannot verify cloud row count
- **THEN** the modal SHALL show a degraded state explaining online verification is pending
- **AND** the user SHALL still be able to pick 「先登出」 immediately
- **AND** the "清空本地" / "保留本地" choices SHALL be disabled until connectivity returns

### Requirement: 「切換帳號」 settings entry

The app shell SHALL expose a 「切換帳號」 action in the authenticated user's settings surface (一階 `SettingsPanel`, 二階 `HelpMenu` 帳號 section). This action SHALL combine three operations atomically: clear local sync tables, sign out, then re-open the sign-in UI.

The existing 「登出」 action SHALL remain unchanged (per existing "Sign-out preserves local data" requirement) but SHALL gain a tooltip describing the preservation behavior and the account-switch risk.

#### Scenario: 「切換帳號」 clears and re-prompts in one tap

- **WHEN** an authed user clicks 「切換帳號」 in settings AND confirms the warning dialog
- **THEN** all synced IndexedDB tables SHALL be cleared
- **AND** all `db.meta` keys matching pattern `migration-choice:*` SHALL be removed
- **AND** the Supabase session SHALL be revoked
- **AND** the settings panel SHALL close
- **AND** the sign-in modal SHALL open within 500ms

#### Scenario: 「登出」 tooltip explains preservation

- **WHEN** the user hovers (or long-presses on touch) the 「登出」 button
- **THEN** a tooltip SHALL display 「本地進度會保留；下次若用不同帳號登入會詢問如何處理」 (or equivalent locale-correct wording)

#### Scenario: 「切換帳號」 confirmation prevents accidental data loss

- **WHEN** the user clicks 「切換帳號」
- **THEN** a confirmation dialog SHALL appear stating 「將清空本地進度並重新登入。確定？」
- **AND** clicking 「取消」 SHALL leave both auth state and local data untouched
- **AND** clicking 「確定」 SHALL proceed with the clear + sign-out + re-open flow

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

