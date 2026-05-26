## ADDED Requirements

### Requirement: Retired doctor SHALL stay retired across page refresh, sign-in cycles, and devices

Once `services/retire.ts` commits the retirement transaction (`db.doctors.delete` + `retirementLog.add` + revenue refund), the doctor SHALL NOT reappear in `db.doctors` after any subsequent sync-engine activity, including but not limited to: page refresh (`engine.start()` cold-start), sign-out + sign-in, fresh sign-in on a different browser/device, R2 bundle pull, Supabase per-table pull, or `pullAllNow({force:true})` invocation.

Conversely, the retired doctor SHALL NOT contribute to `lib/tick.ts` revenue, reputation, throughput, or any other gameplay accumulator on any device after the retirement push cycle completes.

This requirement closes the player-reported regression where retiring a doctor via the AAD button refunded `powerMultiplier × 1000` revenue, deleted the local row, but a subsequent page refresh re-applied the stale cloud `hospital_doctors` row and resumed tick-driven revenue accrual — a double-dip where the player kept both the refund and the ongoing income from the supposedly-retired doctor.

This requirement also closes the v1 (`fix-doctor-retire-cloud-resurrection`, commit `dac4eae`) regression where the Dexie retirementLog pk change from `++id` to `&doctorId` triggered `UpgradeError Not yet support for changing primary key`, leaving every v18 user stuck on "啟動中…" — v2 keeps Dexie pk as `++id` and adds a plain (non-unique) `doctorId` secondary index, avoiding both the pk-change limit and the related `AbortError` failure mode that arises when Dexie 4.x activates a new unique index before the upgrade callback runs.

The cross-device propagation mechanism (retirementLog as authoritative tombstone, secondary-index carve-out in `HOSPITAL_DOCTORS.applyToLocal`, and post-pull `reconcileRetiredDoctors()` reconcile) is specified in the `cloud-sync` capability requirement "Row deletion in collection tables SHALL propagate via tombstone-table mechanism". This requirement governs the player-visible outcome; that requirement governs the engine machinery.

The existing "Voluntary doctor retirement SHALL allow payroll relief with 24-hour diversification grace" requirement remains unchanged for local semantics (refund amount, grace window, P1-anchor exception, internal naming invariance, modal UX). This requirement is additive and concerns the post-retirement persistence of the deletion.

#### Scenario: Refresh immediately after retire keeps doctor retired

- **GIVEN** a P3 doctor X with `powerMultiplier = 2.0` assigned to room `outpatient-2`, current `revenue = 10,000`
- **WHEN** the player retires doctor X via the AAD confirmation modal
- **AND** waits 3+ seconds for the debounced push cycle to complete
- **AND** refreshes the browser tab (Cmd+R / F5)
- **THEN** post-refresh `db.doctors.get('doc-x')` SHALL return `undefined`
- **AND** `revenue` SHALL equal `12,000` (10,000 + 2,000 refund), NOT 14,000 or higher (no double refund, no tick-driven resumption)
- **AND** the next tick cycle SHALL NOT generate revenue attributable to doctor X
- **AND** `db.retirementLog.where('doctorId').equals('doc-x').count()` SHALL equal exactly 1

#### Scenario: First open of v4 client by existing v18 user transitions to UI cleanly

- **GIVEN** an existing v18 user with active local Dexie state (any retirementLog rows, doctors, gameCounters)
- **WHEN** the v4 client (containing Dexie v19 additive schema upgrade) is loaded for the first time
- **THEN** the Dexie v18 → v19 upgrade SHALL complete without throwing `DatabaseClosedError` or `UpgradeError`
- **AND** the app UI SHALL transition from "啟動中…" to the hospital page in under 2 seconds
- **AND** the player SHALL retain all pre-existing live doctors, gameCounters, room assignments, study session state
- **AND** no `services/retire.ts` behavior change SHALL be observable in the immediate post-upgrade state (existing retirementLog rows backfill `_updatedAt = retiredAt` and become cloud-syncable on next push)

#### Scenario: Sign-out / sign-in roundtrip keeps doctor retired

- **GIVEN** the player retired doctor X and the push cycle completed
- **WHEN** the player signs out (`Settings → 登出`) and signs back in as the same Google account
- **AND** the migration / conflict gate resolves to `silent-pull` or `resolved`
- **AND** the engine fires its cold-start `pullAllNow({force:true})`
- **THEN** post-sign-in `db.doctors.get('doc-x')` SHALL return `undefined`
- **AND** subsequent tick cycles SHALL NOT include doctor X in any accumulator

#### Scenario: Fresh device picks up retire that happened on first device

- **GIVEN** device A is signed in and has just retired doctor X; the push cycle has completed
- **WHEN** the same player signs in on device B (incognito window, second computer, mobile browser) for the first time
- **AND** the engine completes its initial `pullAllNow({force:true})`
- **THEN** device B's `db.doctors` SHALL NOT contain doctor X
- **AND** device B's `db.retirementLog.where('doctorId').equals('doc-x').first()` SHALL return the doctor-X tombstone row
- **AND** device B's tick loop SHALL behave identically to device A — no revenue from doctor X

#### Scenario: Pre-fix ghost doctor gets cleaned up after deploy

- **GIVEN** a player who was on a pre-fix build, retired doctor X, refreshed, and saw doctor X resurrect (the original bug)
- **AND** their cloud `hospital_doctors` table still contains the stale doctor-X row
- **AND** their local Dexie now has both a `doctors[doc-x]` row (resurrected) AND a `retirementLog[doc-x]` row (from the original retire)
- **WHEN** the player loads the post-fix client build for the first time
- **AND** the engine completes its cold-start `pullAllNow({force:true})`
- **AND** `onPullComplete` fires `reconcileRetiredDoctors()` before `checkAssignmentInvariants()`
- **THEN** `db.doctors.get('doc-x')` SHALL return `undefined` after reconcile
- **AND** the next push cycle SHALL upload the retirementLog row (if not already cloud-present) so other devices observe the same outcome

#### Scenario: Retire during offline period — tombstone pushed on reconnect

- **GIVEN** the device is offline (network unavailable) and the player retires doctor X
- **AND** the local Dexie transaction commits (doctor deleted, retirementLog row added, refund applied)
- **AND** the dirty marker for the retirementLog row is queued
- **WHEN** the network reconnects and the next push cycle fires
- **THEN** the retirementLog row SHALL upload successfully to cloud
- **AND** subsequent pulls on this or any other device SHALL respect the tombstone
- **AND** the offline-period local state already correctly reflected the retirement (no UI regression while offline)

#### Scenario: Account reset wipes both local retirementLog AND cloud retirement_log

- **GIVEN** user U has retired doctor X, the tombstone has propagated to cloud, and U decides to「重置此帳號進度」(in-place account reset via the existing account-lifecycle flow)
- **WHEN** the reset flow invokes the engine's wipe path AND the Supabase `delete_my_data()` RPC
- **THEN** local `db.retirementLog` SHALL be cleared as part of `clearLocalSyncTables` (extended for this change)
- **AND** local cached R2 schemaVersion for bundle m2 SHALL be cleared (`clearSchemaVersion('m2')`)
- **AND** cloud `retirement_log` rows owned by U SHALL be deleted by `delete_my_data()` (already extended via migration `0015_delete_my_data_retirement_log.sql`)
- **AND** any subsequent recruit + retire cycle SHALL behave identically to a fresh account — no stale tombstone left over from prior life

#### Scenario: Account switch does not propagate prior user's tombstones to new user

- **GIVEN** user A signs out of device D after retiring doctor X (local retirementLog has the X row)
- **WHEN** user B signs in on the same device D
- **AND** the account-switch flow runs `clearLocalSyncTables`
- **THEN** the local retirementLog SHALL be cleared BEFORE user B's data pull begins
- **AND** local cached R2 schemaVersion for bundle m2 SHALL be cleared so user B's first push is unconstrained
- **AND** user B's `reconcileRetiredDoctors()` on first pull SHALL NOT attempt to delete any doctor row based on user A's retirement history
- **AND** if user B independently has a doctor with the same `id` value as A's retired doctor X (negligible probability with `crypto.randomUUID()`, but spec coverage required), that doctor SHALL NOT be erroneously deleted because A's tombstone is no longer in the local DB
