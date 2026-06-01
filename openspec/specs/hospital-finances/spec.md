# hospital-finances Specification

## Purpose

財務系統 — 整合醫師薪水（全員制，proportional `powerMultiplier × 4 / min`）+ 設施升級（roomFacility 1.0 → 3.0 over 5 levels）+ 房間擴建（區域醫院以上）。診所 0% salary grace；區域以上 100% rate。

## Requirements
### Requirement: Salary SHALL drain revenue per-minute proportional to doctor powerMultiplier, all owned

The system SHALL deduct salary from `gameCounters.revenue` for **every owned doctor** (regardless of `assignedRoomId`). Bench (unassigned) doctors SHALL also contribute. Salary per doctor per minute = `doctor.powerMultiplier × SALARY_BASE` where `SALARY_BASE = 4`. Derived rates:

| Rarity | powerMultiplier | Salary per minute |
|---|---|---|
| P1 | 5.0 | 20 |
| P2 | 3.5 | 14 |
| P3 | 2.0 | 8 |
| P4 | 1.0 | 4 |
| P5 | 0.5 | 2 |

Salary rate SHALL be multiplied by a tier-staged activation factor:

| Tier | Salary rate multiplier |
|---|---|
| 診所 | 0% (grace period — salary not yet active) |
| 區域醫院 | 100% |
| 醫學中心 | 100% |
| 國家級教學醫院 | 100% |

Effective per-doctor salary per minute = `doctor.powerMultiplier × SALARY_BASE × TIER_SALARY_RATE[currentTier]`. The deduction SHALL occur within the same study session tick that accumulates revenue. When no study session is active, salary SHALL NOT be deducted.

The system SHALL include a defensive 0-floor clamp — if `revenue + deltaRevenueGross - deltaSalary < 0`, `revenue` SHALL be set to 0. However, the design invariant is that the 0-floor clamp MUST NOT trigger under default play (per design D5 math check: every tier's default config yields net positive revenue). The clamp is a safety net for edge cases (e.g., manual save manipulation) not a primary mechanic.

#### Scenario: Tier 1 診所 has zero salary drain

- **GIVEN** 5 doctors owned (3 assigned, 2 bench), tier `'診所'`, 1 minute of active session
- **WHEN** the tick fires
- **THEN** salary drain SHALL equal 0
- **AND** `revenue` SHALL increase by the full throughput amount

#### Scenario: Tier 2 區域醫院 applies proportional salary to all owned doctors

- **GIVEN** 8 P3 doctors owned (5 assigned, 3 bench), tier `'區域醫院'`, throughput 100/min, 1 minute elapsed
- **WHEN** the tick fires
- **THEN** salary drain SHALL equal `8 × 2.0 × 4 × 1.0 = 64/min`
- **AND** `revenue` SHALL change by approximately `100 - 64 = +36` per minute (always net positive at default config)

#### Scenario: Bench doctor contributes salary proportional to powerMultiplier

- **GIVEN** 5 P1 doctors owned (3 assigned, 2 bench), tier `'醫學中心'`, throughput 150/min, 1 minute elapsed
- **WHEN** the tick fires
- **THEN** salary drain SHALL equal `5 × 5.0 × 4 × 1.0 = 100/min` (all 5 owned, including 2 bench)
- **AND** `revenue` SHALL change by approximately `150 - 100 = +50` per minute

#### Scenario: Default-config endgame remains net positive

- **GIVEN** 15 doctors owned (12 P2 + 3 P1), 10 assigned (7 P2 + 3 P1), tier `'國家級教學醫院'`, default facility 1.0
- **WHEN** the tick fires for 1 minute
- **THEN** assigned throughput SHALL equal `7 × 10 × 3.5 × 1.0 + 3 × 10 × 5.0 × 1.0 = 245 + 150 = 395/min`
- **AND** salary drain SHALL equal `12 × 3.5 × 4 + 3 × 5.0 × 4 = 168 + 60 = 228/min`
- **AND** `revenue` SHALL change by approximately `+167` per minute

#### Scenario: 0-floor clamp triggers only in edge case

- **GIVEN** `revenue = 50`, throughput 100/min, salary drain 200/min (only possible if player manually manipulated state)
- **WHEN** the tick fires
- **THEN** `revenue` SHALL equal `0` (clamped from `-50`)
- **AND** no doctor SHALL be auto-fired

#### Scenario: No tick no salary

- **GIVEN** 13 owned doctors and no active study session
- **WHEN** 60 minutes of wall-clock time pass
- **THEN** `revenue` SHALL remain unchanged

### Requirement: Facility upgrade SHALL increase room.roomFacility via revenue spend

The system SHALL provide a facility upgrade action per room. Each upgrade level SHALL increment `room.roomFacility` by a fixed step, with cost scaling:

| Level | roomFacility value | Revenue cost to reach this level |
|---|---|---|
| 1 (default) | 1.0 | — (free seed) |
| 2 | 1.5 | 10,000 |
| 3 | 2.0 | 50,000 |
| 4 | 2.5 | 200,000 |
| 5 | 3.0 (max) | 1,000,000 |

Once a room reaches level 5, the upgrade button SHALL be disabled. Throughput formula remains `baseRate × powerMultiplier × roomFacility × affinityBonus` — increased `roomFacility` lifts all assigned doctors' output proportionally.

#### Scenario: Upgrade outpatient-1 from level 1 to level 2

- **GIVEN** `room.roomFacility = 1.0` and `revenue = 15,000`
- **WHEN** the player upgrades the room
- **THEN** `roomFacility` SHALL equal `1.5`
- **AND** `revenue` SHALL equal `5,000`

#### Scenario: Upgrade blocked when revenue insufficient

- **GIVEN** `room.roomFacility = 1.0` and `revenue = 5,000` (cost is 10,000)
- **WHEN** the player attempts the upgrade
- **THEN** `roomFacility` SHALL remain `1.0`
- **AND** `revenue` SHALL remain `5,000`
- **AND** the UI SHALL display an insufficient-funds error

#### Scenario: Max-level room shows disabled upgrade

- **GIVEN** `room.roomFacility = 3.0` (level 5)
- **WHEN** the upgrade UI renders
- **THEN** the upgrade button SHALL be disabled
- **AND** a label SHALL state「已達最高設施等級」or equivalent

### Requirement: Room extension SHALL allow adding extra rooms within current tier

The system SHALL allow the player to purchase additional rooms beyond the tier-default roster. Available room types and costs:

| Room type | Cost per additional unit | Max per tier |
|---|---|---|
| outpatient | 20,000 | tier default + 3 |
| surgery | 100,000 | tier default + 2 |
| ward | 300,000 | tier default + 2 |

Room extension SHALL only be available when current tier ≥ 區域醫院 (locked at 診所). Extended room ids SHALL follow `${type}-${slot}` pattern; `slot` SHALL be the next available integer. The cost calibration targets ~17 hr of saving for outpatient payback (default-config 區域醫院 +36/min net × ~17 hr ≈ 36,000 revenue → 20k cost recouped quickly and remaining revenue accelerates further expansion).

#### Scenario: Buy extra outpatient at 區域醫院 tier

- **GIVEN** tier `'區域醫院'`, 4 existing outpatient rooms (slots 1-4), and `revenue = 30,000`
- **WHEN** the player purchases 1 extra outpatient
- **THEN** `db.rooms` SHALL contain 5 outpatient rooms (slot 5 added)
- **AND** the new room SHALL have `roomFacility = 1.0` and `assignedDoctorId = null`
- **AND** `revenue` SHALL equal `10,000`

#### Scenario: Room extension blocked at 診所 tier

- **GIVEN** tier `'診所'` and `revenue = 100,000`
- **WHEN** the player opens room extension UI
- **THEN** the extension actions SHALL be disabled
- **AND** a label SHALL state「需升級至 區域醫院 以上才能擴建」or equivalent

### Requirement: Voluntary doctor retirement SHALL allow payroll relief with 24-hour diversification grace

The system SHALL allow the player to manually retire (fire) an owned doctor at any time via an「AAD」button on the doctor detail panel. The「AAD」label is an in-joke reference to the medical abbreviation Against Advice Discharge (病人不顧醫療勸阻自行離院) — here repurposed for doctors voluntarily leaving the hospital. To preserve clarity for players unfamiliar with the abbreviation, the button SHALL carry a native HTML `title` attribute (hover tooltip) reading「自願離院（退休）— 退還 {refund} 💰」where `{refund}` is the live computed refund amount for that specific doctor (`doctor.powerMultiplier × 1000`, formatted via the project-wide `fmt` number formatter, with the trailing 💰 emoji matching the codebase convention for revenue amounts). The confirmation modal opened by the button SHALL continue to use the full-name terminology「退休」/「自願離院」in its title, body copy, and action buttons — only the trigger button itself uses the「AAD」abbreviation.

The retired doctor SHALL:

- Be removed from `db.doctors` (record deleted)
- If currently assigned to a room, the room's `assignedDoctorId` SHALL be set to `null` in the same transaction
- A `retirementLog` row SHALL be appended with `{retiredAt, doctorId, rarity, subjectId}`
- Refund: `retirement_refund = doctor.powerMultiplier × 1000` revenue (e.g., P1 → 5,000, P5 → 500)

**24-hour diversification grace**: For 24 wall-clock hours after retirement, the retired doctor's `subjectId + rarity` SHALL still count toward the diversification gate as if the doctor still existed. After 24 hours, the credit expires and the player may fall back below the gate threshold (no tier regression — tier stays, but next-tier upgrade is blocked).

**P1-anchor exception (no grace)**: The `requireP1` sub-requirement at the 醫學中心 → 國家級教學醫院 tier-upgrade gate (see `clinic-level-up` spec) SHALL NOT honor retirement grace. Only live (non-retired) doctors with rarity P1 SHALL count toward `requireP1`. A player who retires their only P1 doctor SHALL immediately lose `requireP1` satisfaction at the tier-upgrade gate, even within the 24-hour grace window. This closes the double-dip exploit where a player retires their P1 for the 5,000 refund and still satisfies the P1 anchor for the next upgrade — the 24h grace exists to absorb mid-build reshuffling churn, not to subsidize the top-tier anchor requirement.

The retirement button SHALL be guarded by a confirmation modal showing:
- Refund amount
- Diversification impact (which gate this doctor contributes to, when the 24-hour credit expires)
- If retiring the player's only P1: an explicit warning that `requireP1` will be lost immediately at the 國家級 upgrade gate
- "Cannot be undone" warning

**Internal naming invariance**: The CSS class (`.training-retire-btn`), the service function (`retireDoctor`), the Dexie table (`retirementLog`), the HelpMenu accordion entry id (`retire`), and any internal semantic identifier SHALL retain their existing names. Only the user-visible button label and its hover tooltip are affected by the「AAD」rename — code-level identifiers stay neutral so a future contributor reading the source does not interpret the in-joke as a typo and revert it.

#### Scenario: Retire P3 doctor refunds revenue and frees room

- **GIVEN** a P3 doctor with `assignedRoomId = 'outpatient-2'` and `revenue = 1,000`
- **WHEN** the player retires this doctor via confirmation
- **THEN** `db.doctors` SHALL no longer contain this doctor
- **AND** room `outpatient-2.assignedDoctorId` SHALL equal `null`
- **AND** `revenue` SHALL equal `3,000` (1,000 + P3 refund 2,000)
- **AND** `retirementLog` SHALL contain a new row with the retired doctor's data

#### Scenario: 24-hour grace preserves diversification credit

- **GIVEN** the player has exactly 8 distinct P3+ subjects (meeting 區域 → 醫學中心 gate)
- **WHEN** the player retires one of those P3 doctors
- **THEN** for the next 24 hours, the diversification count SHALL still report `8 distinct P3+ subjects`
- **AND** after 24 hours, the count SHALL drop to `7` (if no new P3+ in that subject was recruited)

#### Scenario: Grace doesn't cause tier regression

- **GIVEN** the player is at tier `'醫學中心'` (already upgraded with 8 P3+ subjects)
- **WHEN** the player retires a P3 doctor and 24 hours pass without replacement
- **THEN** `gameCounters.tier` SHALL still equal `'醫學中心'` (no regression per `clinic-level-up` monotonicity)
- **AND** the diversification count SHALL drop to 7
- **AND** the player SHALL NOT be eligible to upgrade to `'國家級教學醫院'` until they re-collect that subject at P2+

#### Scenario: Retiring only P1 immediately fails requireP1 despite 24h grace

- **GIVEN** the player is at tier `'醫學中心'`, has 10 distinct P2+ subjects, exactly 1 P1 doctor, and `reputation = 2,500,000` (above the 國家級 threshold)
- **WHEN** the player retires that sole P1 doctor (refund 5,000 credited to revenue)
- **AND** the next tick fires within the 24-hour grace window
- **THEN** the tier-upgrade gate SHALL evaluate `requireP1 = false` (live-only count = 0)
- **AND** `gameCounters.tier` SHALL still equal `'醫學中心'` (upgrade blocked)
- **AND** the player SHALL be required to recruit or train another live P1 before 國家級 unlocks

#### Scenario: Retiring one of multiple P1 doctors preserves requireP1

- **GIVEN** the player has 2 live P1 doctors (same or different subjects), 10 distinct P2+ subjects, and `reputation = 2,500,000`
- **WHEN** the player retires one of the P1 doctors
- **AND** the next tick fires within the 24-hour grace window
- **THEN** the tier-upgrade gate SHALL evaluate `requireP1 = true` (live-only count = 1, still ≥ 1)
- **AND** if all other gate conditions are met the tier SHALL upgrade to `'國家級教學醫院'`

#### Scenario: AAD button displays abbreviation with full-name tooltip

- **GIVEN** a P3 doctor with `powerMultiplier = 2.0` selected on the doctor detail panel
- **WHEN** the panel renders the retirement button
- **THEN** the button visible text SHALL equal `「AAD」`
- **AND** the button SHALL carry an HTML `title` attribute equal to `「自願離院（退休）— 退還 2,000 💰」` (refund value computed as `2.0 × 1000`, formatted via the project `fmt` helper with thousands separator)

#### Scenario: Confirmation modal uses full-name terminology

- **GIVEN** the player clicks the「AAD」button on any doctor
- **WHEN** the confirmation modal opens
- **THEN** the modal title and body copy SHALL use「退休」or「自願離院」, NOT the「AAD」abbreviation
- **AND** the existing modal contents (refund / diversification impact / P1 warning / cannot-be-undone) SHALL remain unchanged

### Requirement: Finance dashboard SHALL display revenue breakdown

The HomePage finance panel SHALL display:

- Current `revenue` (large number)
- Net rate per minute (revenue gain - salary drain at current throughput)
- Salary breakdown (count × rate per rarity tier)
- Last-minute delta (visible during active session)

The display SHALL be reactive to counter updates via `liveQuery`.

#### Scenario: Finance panel shows net rate

- **GIVEN** active session, throughput 100/min, salary drain 60/min
- **WHEN** the HomePage renders
- **THEN** the finance panel SHALL display a net rate of `+40/min`

<!-- Added by fix-doctor-retire-cloud-resurrection-v2 (synced 2026-05-27) -->

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
