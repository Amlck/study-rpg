## ADDED Requirements

### Requirement: Achievement TableAdapter registered in M2_ADAPTERS only

A new `ACHIEVEMENTS: TableAdapter` SHALL be defined in `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` following the existing `TableAdapter` contract (snapshotAll + applyToLocal + diff methods + `postgresTable` field). The adapter SHALL be registered in `M2_ADAPTERS` only and MUST NOT appear in `HOSPITAL_ADAPTERS`. This mirrors the `LEADERBOARD_PROFILE` precedent (commit `cfaaa32`, 2026-05-21).

#### Scenario: Adapter feeds m2 bundle

- **WHEN** the sync engine builds the m2-snapshot.json.gz bundle
- **THEN** `buildBundleSnapshot` SHALL call `ACHIEVEMENTS.snapshotAll(db, userId, updatedAt, BUNDLE_APP_VERSION)` and include the rows under the bundle's `data[<postgresTable>]` key

#### Scenario: Adapter NOT invoked on Supabase push path

- **WHEN** the sync engine runs its legacy Supabase per-row push path (still active during Phase 2 dual-write window OR for backward compat)
- **THEN** the engine SHALL iterate over `HOSPITAL_ADAPTERS` only, NOT touch `ACHIEVEMENTS`; no Supabase RPC call is made for achievements

### Requirement: Achievement state survives R2 bundle pull-merge cycles

When a client receives an R2 m2 bundle containing achievements rows (e.g., after pulling on a second device), `ACHIEVEMENTS.applyToLocal` SHALL be invoked for each row. Conflict resolution SHALL follow the existing per-row LWW pattern based on `updated_at`. Already-unlocked-locally achievements SHALL NOT be re-unlocked (notification not re-emitted) — the apply path MUST only update DB state, not trigger UI unlock toasts.

#### Scenario: Cross-device pull does not double-fire unlock toast

- **WHEN** device A unlocks achievement X (toast shown), pushes to R2; device B pulls the bundle and applies the row
- **THEN** device B's IndexedDB gains the achievement row but NO unlock toast appears on device B for X (toast is local-event-driven, not sync-driven)

#### Scenario: LWW resolves identical-id conflicts

- **WHEN** device A applies a row with `id='first-quiz-answered'`, `unlockedAt: 1700000000`; device B has the same `id` with `unlockedAt: 1700000500`; sync merge happens
- **THEN** the row with the larger `updated_at` wins; the unlockedAt of the local record is preserved if it is newer

### Requirement: Achievements table absent from Supabase schema

The achievement system SHALL NOT introduce any Supabase migration files. No `supabase/migrations/0009_*.sql` or later file SHALL be authored for achievements. The `upsert_lww` RPC whitelist SHALL NOT be extended. The reasoning: R2 has become the canonical write path post Phase-3 cut; new tables introduced after this point are R2-only by convention (established by `leaderboard_profile`).

#### Scenario: No new Supabase migration in change

- **WHEN** reviewing the file tree of this change
- **THEN** `supabase/migrations/` SHALL contain no new files

#### Scenario: Old upsert_lww whitelist preserved

- **WHEN** examining the most-recent `upsert_lww` migration (currently `0006_upsert_lww_bookmarks.sql`)
- **THEN** no newer migration extending the whitelist SHALL exist; the whitelist remains at 9 tables (the cap from before this change)

### Requirement: Migration.ts handles fresh-start and silent-pull paths

The existing `apps/medexam2-hospital-tw/src/lib/sync/migration.ts` state machine SHALL be extended to initialize the empty `achievements` table on the `fresh-start` and `silent-pull` gate states. Mirror the v14 leaderboardProfile initialization pattern.

#### Scenario: Fresh-start gate creates empty achievements table

- **WHEN** a new player completes Google OAuth sign-in for the first time and the migration state machine transitions to `fresh-start`
- **THEN** the engine SHALL ensure an empty `achievements` table exists in IndexedDB (no rows); subsequent unlock writes proceed normally

#### Scenario: Silent-pull initializes from R2 bundle

- **WHEN** an existing player signs in on a new device, the migration state transitions to `silent-pull`, and the m2 bundle is pulled
- **THEN** any achievements rows from the R2 bundle SHALL be applied to local IndexedDB via `ACHIEVEMENTS.applyToLocal`; locally unlocked achievements (if any from a prior session) SHALL be merged via LWW
