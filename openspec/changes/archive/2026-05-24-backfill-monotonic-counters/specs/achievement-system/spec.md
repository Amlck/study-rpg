## ADDED Requirements

### Requirement: Monotonic counter backfill for pre-existing players via derivation from existing tables

When the sync engine's `onPullComplete` callback fires, the client SHALL run a monotonic-counter backfill pass via `backfillMonotonicCounters()` BEFORE the existing achievement-row backfill pass. The counter backfill SHALL derive values for the 3 recoverable fields (`totalDoctorsRecruited`, `totalP1DoctorsRecruited`, `tierUpgradeCount`) from existing Dexie tables and patch the `monotonicCounters` singleton row using MAX-merge semantics — only writing when the derived value is strictly greater than the existing value (or the existing value is `undefined`). The 3 unrecoverable fields (`totalStudyMinutes`, `maxDailyStreak`, `maxQuizCorrectStreak`) SHALL NOT be touched by this backfill; they remain at their existing value or `undefined` and re-accumulate naturally via the existing trigger-hook code paths on subsequent gameplay events.

**Rationale**: The Dexie v15 schema migration that shipped with `add-achievement-system` (2026-05-24) added 5 new MAX-merge fields to `MonotonicCountersRow` but did not write default values to the existing singleton row for players whose row pre-dated the migration. Reading `mono.totalDoctorsRecruited` returns `undefined → ?? 0` in `buildAchievementStats()`, so achievement predicates like `recruit-first-doctor` (`stats.totalDoctorsRecruited >= 1`) evaluate to false for pre-existing players even when they have 12 actual doctors in the `doctors` table. The `backfill-achievements-on-sign-in` change correctly evaluates predicates against current state, but with bad inputs from the un-backfilled counter row. This counter backfill closes the gap for the 3 derivable counters; the 3 unrecoverable counters stay at 0 (accepted trade-off — see design D6).

#### Scenario: First pull derives totalDoctorsRecruited from doctors + retirementLog

- **GIVEN** a player whose Dexie state shows `doctors.count() === 12`, `retirementLog.count() === 3`
- **AND** `monotonicCounters.singleton.totalDoctorsRecruited === undefined` (or `0`)
- **WHEN** the sync engine completes a successful pull cycle and fires `onPullComplete`
- **THEN** the counter backfill SHALL compute `derivedTotalDoctorsRecruited = 12 + 3 = 15`
- **AND** the service SHALL patch the `monotonicCounters` singleton row to set `totalDoctorsRecruited = 15`
- **AND** the subsequent achievement-backfill pass on the same callback chain SHALL see `stats.totalDoctorsRecruited === 15` and unlock all `recruit-*` predicates whose threshold ≤ 15

#### Scenario: First pull derives totalP1DoctorsRecruited with rarity filter

- **GIVEN** a player whose Dexie state shows 2 P1 doctors currently in `doctors` table and 1 P1 doctor in `retirementLog`
- **AND** `monotonicCounters.singleton.totalP1DoctorsRecruited === undefined`
- **WHEN** counter backfill runs
- **THEN** the service SHALL compute `derivedTotalP1DoctorsRecruited = 2 + 1 = 3`
- **AND** patch the singleton row to set `totalP1DoctorsRecruited = 3`

#### Scenario: tierUpgradeCount derived from current tier via static map

- **GIVEN** a player whose `gameCounters.singleton.tier === '醫學中心'`
- **AND** `monotonicCounters.singleton.tierUpgradeCount === undefined`
- **WHEN** counter backfill runs
- **THEN** the service SHALL look up `TIER_TO_UPGRADE_COUNT['醫學中心'] === 2` in the static derivation map (where `{診所: 0, 區域醫院: 1, 醫學中心: 2, 國家級教學醫院: 3}`)
- **AND** patch the singleton row to set `tierUpgradeCount = 2`

#### Scenario: MAX-merge — derived value never regresses an existing higher value

- **GIVEN** a player whose `monotonicCounters.singleton.totalDoctorsRecruited === 50` (set by a previous trigger-hook firing)
- **AND** current `doctors.count() + retirementLog.count() === 48` (slight discrepancy because the trigger fired before some doctors were dismissed via a code path that didn't write to retirementLog)
- **WHEN** counter backfill runs
- **THEN** the service SHALL compute `48 < 50` is false
- **AND** the service SHALL NOT patch `totalDoctorsRecruited`
- **AND** the existing value of `50` SHALL be preserved

#### Scenario: Idempotent — subsequent pulls short-circuit when no field needs updating

- **GIVEN** a previous pull cycle already patched the counter row with derived values
- **AND** no new doctor recruitment / tier upgrade has fired since that pull
- **WHEN** a subsequent `onPullComplete` callback fires and counter backfill runs again
- **THEN** the service SHALL detect that no field requires patching (`changed === 0`)
- **AND** the service SHALL NOT call `monotonicCounters.put`
- **AND** the function SHALL return `0`

#### Scenario: Unrecoverable counters stay at their existing value

- **GIVEN** a player whose `monotonicCounters.singleton.totalStudyMinutes === undefined` (pre-existing row)
- **WHEN** counter backfill runs
- **THEN** the service SHALL NOT attempt to derive a value for `totalStudyMinutes`
- **AND** the field SHALL remain `undefined` after the backfill completes
- **AND** the next gameplay reading session SHALL accumulate via the existing trigger hook in `lib/tick.ts` and set the field to its first positive value
- **AND** subsequent backfill calls SHALL continue to NOT touch this field

#### Scenario: Counter backfill chains BEFORE achievement backfill within onPullComplete

- **GIVEN** the `onPullComplete` callback in `useSync.ts` is configured to chain `checkAssignmentInvariants → backfillMonotonicCounters → backfillAchievementsFromCurrentStats`
- **WHEN** a successful pull cycle completes
- **THEN** the engine SHALL await `checkAssignmentInvariants()` first
- **AND** await `backfillMonotonicCounters()` second
- **AND** await `backfillAchievementsFromCurrentStats()` third (LAST)
- **AND** the ordering SHALL ensure achievement-backfill's `buildAchievementStats()` call reads the freshly-patched counter values

#### Scenario: Counter backfill failure does not break the pull cycle

- **GIVEN** the existing try/catch around the achievement-backfill chain in `useSync.ts` is extended to also cover counter backfill
- **WHEN** `backfillMonotonicCounters()` throws (e.g., transient Dexie write failure)
- **THEN** the error SHALL be caught and logged via `console.warn` with the `[achievement-backfill]` channel prefix (sharing the channel with achievement-row backfill — both are part of the same retroactive-population workflow)
- **AND** the subsequent achievement-backfill call SHALL be skipped for this cycle (cannot proceed with stale counter inputs anyway)
- **AND** the pull cycle SHALL transition to `idle` normally
- **AND** the next pull cycle SHALL retry both backfills
