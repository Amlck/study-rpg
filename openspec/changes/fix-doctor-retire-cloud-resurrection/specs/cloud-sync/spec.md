## ADDED Requirements

### Requirement: Row deletion in collection tables SHALL propagate via tombstone-table mechanism

The sync engine SHALL treat designated "tombstone tables" as authoritative records of deletion for their paired primary tables. When a local row in a primary table is deleted as part of a logical operation that also appends a row to the tombstone table (e.g., `retirementLog` for `doctors`), the tombstone row SHALL be the single carrier of the delete intent across devices — replacing the missing per-row tombstone column that the Supabase/R2 sync schema lacks.

This requirement covers the gap left by the previous engine behavior, where the Dexie `deleting` hook merely cleared dirty markers (see `engine.ts`: "Deletes aren't synced yet (Postgres would need a tombstone column)"). Combined with the `Cold-start force-pull bypasses incremental cursor` requirement, that gap caused force-pulled cloud rows to resurrect locally-deleted records.

**Designated tombstone pairings (M_2nd app)**:

- `retirement_log` (pk = `doctor_id`) → `hospital_doctors` (pk = `id`)

Future tombstone pairings (e.g., for `targeted_tickets` consumption events) SHALL be added to this requirement when introduced; do not invent a generic per-row tombstone column without an explicit follow-up change.

**Push path**: The tombstone table SHALL be registered as a standard collection `TableAdapter` (with `snapshotDirty` / `snapshotAll` / `applyToLocal`) in `HOSPITAL_ADAPTERS` (Supabase write path) and `M2_ADAPTERS` (R2 m2 bundle). Dexie hooks SHALL mark each new tombstone row dirty so the debounced push includes it in the same `pushNow()` cycle that pushes the primary table's surviving rows. The retire transaction in `services/retire.ts` already appends to `retirementLog` in the same Dexie `db.transaction('rw', ...)` block as the primary delete; no service-layer change is required.

**Apply path carve-out**: When `HOSPITAL_DOCTORS.applyToLocal(db, cloudRow)` is invoked, it SHALL FIRST query `db.retirementLog` for a row keyed by the incoming `cloudRow.id`. If such a row exists, the adapter SHALL:

1. Skip writing the cloud row to local Dexie (`return false`)
2. Delete any locally-present `doctors` row with that `id` (covers the prior-resurrection cleanup case)
3. NOT throw, NOT log warning above `console.info` level

This carve-out applies whether `opts.force` is true or false — `force=true` (used by `pullAllNow`) SHALL still respect tombstones, because cold-start force-pull is the very pathway that previously caused resurrection.

**Apply ordering**: The R2 bundle apply iterates adapters in `M2_ADAPTERS` array order. The `retirementLog` adapter SHALL appear in the array BEFORE `HOSPITAL_DOCTORS`, so that when a v4+ bundle carrying both keys is applied, retirementLog rows land in Dexie before the doctor adapter's carve-out check runs. For Supabase per-table pull (where each table is fetched in a separate SELECT and applied independently), apply order across tables is not guaranteed within a single `pullNow()`, so the carve-out's `db.retirementLog.get(id)` check SHALL be the canonical guard (not array order).

**Post-pull reconcile**: A `reconcileRetiredDoctors()` helper SHALL run inside the existing `onPullComplete` chain (`useSync.ts`), positioned BEFORE `checkAssignmentInvariants()`. It SHALL iterate every row in `db.retirementLog` and `db.doctors.delete(doctorId)` for any matching local doctor row. This covers two race-condition cases the carve-out alone cannot guarantee: (a) Supabase per-table fetch returns doctors before retirementLog within the same `pullNow()` cycle, applying the doctor row to local Dexie before the tombstone arrives; (b) the user installs a v4 client on a device that previously ran v3 and accumulated ghost doctors.

**Cold-start interaction**: The `Cold-start force-pull bypasses incremental cursor` requirement remains in full effect — `engine.start()` SHALL still invoke `pullAllNow({force:true})`. The tombstone mechanism is the layer that prevents force-pull from being destructive. Force-pull MUST fetch the retirementLog table FROM CLOUD before the apply phase considers any doctor row safe to resurrect; this is satisfied automatically because `pullAllNow` fetches all registered adapter tables.

#### Scenario: Retire on device A, refresh on device A, doctor stays retired

- **GIVEN** device A signed in as user U with 5 live doctors including doctor X (`id = 'doc-x'`)
- **AND** the sync engine has completed at least one successful pull/push cycle
- **WHEN** the player retires doctor X (refund applied to revenue, retirementLog row appended with `doctorId = 'doc-x'`)
- **AND** the debounced push completes (3s after retire), uploading the `retirementLog` row to cloud
- **AND** the player refreshes the browser tab (engine cold-start fires `pullAllNow({force:true})`)
- **THEN** the post-pull `db.doctors.get('doc-x')` SHALL return `undefined`
- **AND** the tick loop SHALL NOT include doctor X in any throughput / reputation / revenue calculation
- **AND** `db.retirementLog.where({doctorId: 'doc-x'}).count()` SHALL equal 1

#### Scenario: Retire on device A, sign in on device B, doctor stays retired

- **GIVEN** device A and device B both signed in as user U
- **AND** both devices have doctor X (`id = 'doc-x'`) in their local Dexie
- **WHEN** device A retires doctor X and the push cycle completes
- **AND** device B refreshes / signs in fresh, triggering `pullAllNow({force:true})`
- **THEN** device B's `db.doctors.get('doc-x')` SHALL return `undefined` after the pull
- **AND** device B's `db.retirementLog` SHALL contain the doctor-X row
- **AND** device B's tick loop SHALL NOT generate revenue from doctor X on the next tick

#### Scenario: Force-pull cloud row for an already-retired doctor SHALL NOT resurrect

- **GIVEN** the cloud `hospital_doctors` table still contains a stale row for doctor X (because the pre-fix engine never deleted it on retire)
- **AND** the cloud `retirement_log` table also contains a row for doctor X (pushed by the new tombstone adapter)
- **WHEN** any device fetches both tables during `pullAllNow({force:true})`
- **THEN** `HOSPITAL_DOCTORS.applyToLocal` for the stale doctor-X cloud row SHALL detect the local retirementLog row via the carve-out check
- **AND** SHALL skip writing the doctor row to local Dexie
- **AND** SHALL delete any locally-resurrected doctor-X row left over from prior cold-starts

#### Scenario: Pull-order race — doctor row arrives before retirementLog row in same pull cycle

- **GIVEN** a Supabase per-table pull fetches `hospital_doctors` BEFORE `retirement_log` within the same `pullNow()` invocation
- **AND** the carve-out for doctor X cannot fire because the local retirementLog row is not yet present
- **WHEN** the doctor-X row is force-written to local Dexie
- **AND** the subsequent `retirement_log` SELECT applies the tombstone row to local Dexie
- **AND** the `onPullComplete` callback fires
- **THEN** `reconcileRetiredDoctors()` SHALL iterate the now-populated retirementLog and `db.doctors.delete('doc-x')`
- **AND** post-reconcile `db.doctors.get('doc-x')` SHALL return `undefined`
- **AND** the reconcile SHALL run BEFORE `checkAssignmentInvariants()` so any room assignment cleanup observes the corrected doctor roster

#### Scenario: Tombstone push failure SHALL NOT silently corrupt local state

- **GIVEN** the player retires doctor X (local Dexie tx commits: doctor deleted, retirementLog row appended, revenue +refund)
- **WHEN** the debounced push of the `retirement_log` row fails (network drop, RLS denial, transient 500)
- **THEN** the local retirementLog row SHALL remain in `db.retirementLog` (Dexie is source of truth)
- **AND** the dirty marker for that retirementLog row SHALL be retained for retry on the next push cycle
- **AND** local apply carve-out SHALL continue to function (uses local retirementLog, not cloud)
- **AND** ANY subsequent successful push cycle SHALL re-attempt the retirementLog upload

#### Scenario: v3 client reading v4 R2 bundle ignores unknown retirementLog key

- **GIVEN** a v3 client (pre-fix build) signed in as user U
- **AND** the cloud R2 m2 bundle has `schema_version: 4` and contains a top-level `retirement_log` data key
- **WHEN** the v3 client pulls and decodes the bundle
- **THEN** `applyBundleSnapshot` SHALL ignore the unknown `retirement_log` key (no adapter registered for it)
- **AND** the v3 client SHALL still resurrect locally-deleted doctors (known regression — v3 has no carve-out)
- **AND** the v3 client SHALL NOT crash or refuse the bundle
- **AND** v4 clients on the same account SHALL keep correct state via their own carve-out + reconcile
- **AND** the v3 client SHALL be unable to push back to the same R2 bundle (per the schema_version monotonic guard requirement below) — protecting cloud bundle integrity even when the v3 client makes a local write attempt

#### Scenario: v4 client reading v3 R2 bundle defaults retirementLog to empty

- **GIVEN** a v4 client signed in as user U
- **AND** the cloud R2 m2 bundle has `schema_version: 3` (last written by a pre-fix v3 client) and lacks a `retirement_log` data key
- **WHEN** the v4 client pulls and decodes the bundle
- **THEN** the missing `retirement_log` adapter snapshot SHALL be treated as an empty array `[]`
- **AND** the carve-out check SHALL still consult `db.retirementLog` (local, not cloud) and find any local rows from prior v4 retires
- **AND** local-only retirements SHALL keep working until the next push cycle upgrades the cloud bundle to v4

### Requirement: R2 bundle push SHALL refuse schema_version downgrade

`pushBundle` SHALL refuse to overwrite a cloud R2 bundle whose `schema_version` is strictly greater than the local snapshot's `schema_version`. The refusal SHALL throw a typed error (`r2_schema_downgrade_refused`) before any network PUT is attempted; no bytes are sent in the downgrade case.

**Rationale**: codex adversarial review 2026-05-26 Attack 1 — current `pushBundle` ([engine-r2.ts:60-146]) uses only ETag concurrency control with no schema_version monotonic guard. A v3 client that pulled a v4 bundle (caching the ETag) and then triggered any local write would overwrite the cloud bundle with its own v3 snapshot, silently stripping forward-compatibility keys (like `retirement_log`). Without this guard, every future `SCHEMA_VERSION` bump (not just the retirementLog one) is vulnerable to mixed-version downgrade corruption — the cloud bundle could regress to an earlier shape and propagate that loss to all other devices on the next pull.

**Mechanism**:

- The R2 ETag cache module (`r2/etag.ts` or sibling) SHALL expose `setSchemaVersion(bundle, sv)` and `getSchemaVersion(bundle)`. These read/write a per-bundle localStorage entry alongside the existing ETag cache.
- `pullBundle` SHALL call `setSchemaVersion(bundle, snapshot.meta.schema_version)` after every successful gunzip + ETag stash. The 304 short-circuit path SHALL leave the cached schema_version intact (the cached value remains valid because the cloud blob has not changed). The `blobMissing` path SHALL NOT modify the cached schema_version (no cloud bundle → no constraint).
- `pushBundle` SHALL call `getSchemaVersion(bundle)` BEFORE the PUT loop. If the cached value is non-null AND strictly greater than the local snapshot's schema_version, the function SHALL throw `Error('r2_schema_downgrade_refused: cloud=X local=Y bundle=Z')` immediately, without contacting R2.
- The refusal SHALL surface to the engine's standard `firstError` channel so the existing `consecutiveErrors` mechanism, sync status chip, and toast on consecutive failures all observe the failure.
- Local Dexie writes SHALL continue to commit normally during the refused period (local-first invariant is unchanged). Only the cloud push is blocked.

**Caveat (out of scope, follow-up)**: this requirement specifies client-side enforcement only. A future change `add-bundle-schema-version-guard` SHALL add Worker-side enforcement (R2 custom metadata `x-amz-meta-schema-version` + Worker rejects PUT when incoming SV < existing SV) as a second-layer defense against rogue or modified clients. For this change, client-side guard is sufficient because all production clients ship the same engine.ts.

#### Scenario: v3 client refuses to overwrite a v4 cloud bundle

- **GIVEN** a v3 client (without `retirement_log` adapter registered) signed in as user U
- **AND** the cloud R2 m2 bundle has `schema_version: 4`
- **AND** the v3 client has just pulled that bundle, caching `etag = "abc"` and `schemaVersion = 4`
- **WHEN** any local Dexie write triggers a debounced `pushBundle` cycle
- **AND** the local snapshot's `meta.schema_version` evaluates to 3
- **THEN** `pushBundle` SHALL throw `r2_schema_downgrade_refused: cloud=4 local=3 bundle=m2` BEFORE attempting any network PUT
- **AND** no `fetch(url, {method:'PUT'})` call SHALL be made
- **AND** the engine SHALL record this in `firstError` and update the sync status chip accordingly
- **AND** the cached `schemaVersion` and `etag` for bundle m2 SHALL remain at the v4 values (no cache invalidation)

#### Scenario: v4 client upgrading a v3 cloud bundle succeeds

- **GIVEN** a v4 client signed in as user U
- **AND** the cloud R2 m2 bundle has `schema_version: 3` (last written by a v3 client pre-fix)
- **AND** the v4 client has just pulled, caching `schemaVersion = 3`
- **WHEN** a local write triggers `pushBundle`
- **AND** the local snapshot's `meta.schema_version` is 4 (current SCHEMA_VERSION constant)
- **THEN** `pushBundle` SHALL pass the guard (`local 4 ≥ cloud 3`) and proceed with PUT
- **AND** on PUT success, `pullBundle`-style update SHALL set `schemaVersion = 4` in cache via `setSchemaVersion`

#### Scenario: First-ever push from a fresh account succeeds

- **GIVEN** a v4 client signed in as user U for the first time on this device (no localStorage cache for bundle m2)
- **AND** `getSchemaVersion('m2')` returns `null`
- **WHEN** the first `pushBundle` fires
- **THEN** the guard SHALL pass (`cachedRemoteSchemaVersion === null` → no constraint)
- **AND** the PUT SHALL proceed with the v4 snapshot
- **AND** on PUT success, the response ETag SHALL be cached AND `setSchemaVersion('m2', 4)` SHALL run

#### Scenario: 304 short-circuit during pull preserves cached schema_version

- **GIVEN** the v4 client has previously pulled and has `etag = "xyz"`, `schemaVersion = 4` cached for bundle m2
- **WHEN** a subsequent `pullBundle({conditional: true})` issues a HEAD probe and receives `ETag: "xyz"` matching the cache
- **AND** the short-circuit `{notModified: true}` branch returns
- **THEN** the cached `schemaVersion` SHALL remain `4` (no modification)
- **AND** the next `pushBundle` SHALL still see the correct constraint

### Requirement: `upsert_lww` whitelist coverage SHALL be probed at engine startup before any pushAllNow can fire

The sync engine SHALL perform a no-op probe of every `upsert_lww` table the engine's adapters intend to push, before transitioning from `pending` → `idle` state. If any probe fails (RPC returns `unknown table` or RLS denies the empty payload), the engine SHALL refuse to leave `pending` state, set status to `'paused'` with a typed reason, and emit a one-line console warning naming the missing table. No `pushNow` / `pushAllNow` cycle SHALL be permitted in this state.

**Rationale**: codex adversarial review 2026-05-26 Attack 3 — `pushAllNow` ([engine.ts:412-413]) unconditionally clears `dirty.perTable.values()` at the end of every cycle ("pushAll covers everything pending."), regardless of whether the per-adapter try/catch caught an RPC error. In a partial migration state (Supabase table created via `0013` but `upsert_lww` whitelist not yet extended via `0014`), the RPC raises `unknown table retirement_log`, the error is caught, but the dirty markers for ALL pending tables (not just retirement_log) are cleared at the bottom of the function. Any pending tombstone marker created BEFORE the failed pushAllNow SHALL be permanently lost — the next push cycle has no record it was ever pending. Even when the owner finishes applying `0014` later, the dirty marker is already gone and the tombstone never reaches cloud.

The startup probe is the only robust mitigation: refuse to enter a state where pushAllNow can fire if the whitelist is incomplete. Fixing `pushAllNow` to conditionally clear markers is a larger refactor that touches other code paths (sign-out flush, account-switch upload, migration UI) and is out of scope for this change.

**Mechanism**:

- On `engine.start(uid)` completion (after `installHooks` + `installVisibilityListener`, before the cold-start `pullAllNow({force:true})` fires), the engine SHALL iterate `adapters` and for each `adapter.postgresTable` value invoke `supabase.rpc('upsert_lww', { table_name: adapter.postgresTable, rows: [] })`.
- If ALL probes return success (no error), proceed with normal startup.
- If ANY probe throws an `unknown table` error, the engine SHALL:
  1. Set `status = 'paused'`
  2. Set internal `pausedReason = 'whitelist_missing:<table>'` so `getDiagnosticSnapshot` surfaces the failure
  3. NOT install the debounce timer for pushNow
  4. NOT invoke `pullAllNow` (cold-start force-pull stays off in this degenerate state)
  5. Log `console.warn('[sync] startup probe failed: upsert_lww whitelist missing <table>; sync paused until backend migration completes')`
- The sync status chip SHALL render the paused-with-reason state visibly so the player knows they're not syncing.
- The engine SHALL retry the probe on the next manual `pullNow` / `pushNow` invocation, automatically resuming if the probe now passes.

#### Scenario: 0013 applied but 0014 missing — engine refuses to start sync

- **GIVEN** the Supabase project has `retirement_log` table created (migration 0013 applied)
- **AND** the `upsert_lww` RPC still has the 9-table whitelist (0014 NOT yet applied)
- **AND** a v4 client signs in
- **WHEN** the engine completes `engine.start(uid)` and runs the startup probe
- **AND** `supabase.rpc('upsert_lww', { table_name: 'retirement_log', rows: [] })` returns error `unknown table retirement_log`
- **THEN** the engine SHALL set `status = 'paused'` with `pausedReason = 'whitelist_missing:retirement_log'`
- **AND** the engine SHALL NOT invoke `pullAllNow({force:true})`
- **AND** the engine SHALL NOT install the debounce push timer
- **AND** the sync status chip SHALL render the paused state with the whitelist-missing reason
- **AND** any local Dexie writes during this period SHALL commit locally but accumulate no risk of dirty-marker loss (since pushAllNow cannot fire)

#### Scenario: Probe passes on re-attempt after owner finishes migration

- **GIVEN** the engine is currently in `paused` state with `pausedReason = 'whitelist_missing:retirement_log'`
- **WHEN** the owner applies migration 0014 in Supabase dashboard
- **AND** the player triggers any manual sync action (status chip click → pullNow, or page refresh → engine.start)
- **AND** the startup probe re-runs and now succeeds
- **THEN** the engine SHALL transition from `paused` to `idle`
- **AND** the cold-start `pullAllNow({force:true})` SHALL fire
- **AND** the debounce push timer SHALL be installed
- **AND** any local retirementLog rows accumulated during the paused period SHALL be pushed on the next dirty event (their dirty markers were never cleared because pushAllNow never fired)
