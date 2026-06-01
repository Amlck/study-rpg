# hospital-tycoon-engine Specification

## Purpose

Defines the tycoon/idle simulation engine for the 二階 hospital management mode: room data model, doctor-to-room assignment semantics, the 5-second tick loop that accumulates revenue and reputation, and the HomePage/Hospital UI surface that surfaces those counters and assignment affordances. Lives in `@study-rpg/content-medexam2-tw` (not `@study-rpg/core`) to preserve engine/content separation — the core engine remains content-agnostic while hospital-specific simulation rules ship with the 二階 content pack.
## Requirements
### Requirement: Room data model SHALL persist with type, baseRate, roomFacility, and assignment fields

The system SHALL persist each room in an IndexedDB `rooms` table with the following schema:

```typescript
interface Room {
  id: string                                          // stable identifier (e.g., "outpatient-1")
  type: 'outpatient' | 'surgery' | 'ward'
  baseRate: number                                    // patients per minute, > 0
  roomFacility: number                                // multiplier, ≥ 1.0
  /** @deprecated since `fix-medexam2-doctor-room-pointer-drift`. Single source
   *  of truth for doctor↔room assignment is `Doctor.assignedRoom`. App code
   *  SHALL NOT read or write this field; new values SHALL always be `null`.
   *  Field retained for backward compatibility with the `hospital_state` cloud
   *  blob schema and export/import JSON. */
  assignedDoctorId: string | null
  slot: number                                        // 1-indexed display order within type
}
```

The `Room` interface SHALL be exported from `@study-rpg/content-medexam2-tw` (not from `@study-rpg/core`), reinforcing engine/content separation per `project.md`. The interface MAY be imported by the hospital app but SHALL NOT be referenced from any 一階 (`apps/medexam-tw`) source file.

App code reading or writing `assignedDoctorId` from any file outside the cloud sync layer (`apps/medexam2-hospital-tw/src/lib/sync/`) and Dexie schema migrations SHALL be a violation of this requirement.

#### Scenario: Room interface exported from content pack

- **GIVEN** a developer imports `Room` from `@study-rpg/content-medexam2-tw`
- **WHEN** the import is resolved
- **THEN** the type SHALL be available with all fields: `id`, `type`, `baseRate`, `roomFacility`, `assignedDoctorId`, `slot`

#### Scenario: Room persists to IndexedDB

- **GIVEN** an `outpatient` room with `baseRate = 10`, `roomFacility = 1.0`, `assignedDoctorId = null`, `slot = 1`
- **WHEN** the room is written to the `rooms` table
- **AND** the page is reloaded
- **THEN** the room SHALL be read back with all fields equal to the original values

#### Scenario: New writes never set assignedDoctorId to non-null

- **GIVEN** any code path in the app (assignment service / room-extension service / facility upgrade / retire service / tick loop)
- **WHEN** that code path writes a row to the `rooms` table
- **THEN** the written row's `assignedDoctorId` field SHALL equal `null`

### Requirement: Fresh save SHALL seed 3 outpatient rooms at 診所 tier baseline

The system SHALL detect empty `rooms` table on app boot and seed it with `TIER_ROOMS['診所']` from the `clinic-level-up` capability — exactly 3 entries:

| id | type | baseRate | roomFacility | assignedDoctorId | slot |
|---|---|---|---|---|---|
| `outpatient-1` | outpatient | 10 | 1.0 | null | 1 |
| `outpatient-2` | outpatient | 10 | 1.0 | null | 2 |
| `outpatient-3` | outpatient | 10 | 1.0 | null | 3 |

These constants represent 診所 tier defaults. The `clinic-level-up` capability extends the seeding to higher tiers (區域醫院, 醫學中心) via the same `TIER_ROOMS` table; tier upgrade logic appends new rooms when reputation crosses thresholds. The seeding logic SHALL be idempotent — re-running it on a non-empty table SHALL NOT duplicate or modify existing rooms.

The `INITIAL_ROOMS` named constant from `wire-hospital-tycoon-engine` is REMOVED in favor of `TIER_ROOMS['診所']` to enforce a single source of truth for the 診所 roster across both seeding and tier-upgrade code paths.

#### Scenario: New save seeds 3 outpatient rooms

- **GIVEN** a fresh IndexedDB with no `rooms` table entries
- **WHEN** the hospital app boots
- **THEN** the `rooms` table SHALL contain exactly 3 entries with `type = 'outpatient'`
- **AND** each room's `assignedDoctorId` SHALL equal `null`
- **AND** each room's `baseRate` SHALL equal `10`
- **AND** the source of the seed SHALL be `TIER_ROOMS['診所']` (not a separate `INITIAL_ROOMS` constant)

#### Scenario: Re-seeding is idempotent

- **GIVEN** the `rooms` table already contains 3 entries with `slot = 1, 2, 3`
- **AND** one room has been modified (`roomFacility = 1.5`)
- **WHEN** the seeding logic runs again on app boot
- **THEN** the `rooms` table SHALL still contain exactly 3 entries
- **AND** the modified room's `roomFacility` SHALL remain `1.5` (not reset to `1.0`)

### Requirement: Doctor assignment SHALL use `Doctor.assignedRoom` as the single source of truth

The system SHALL maintain doctor↔room assignment state in **`Doctor.assignedRoom` only**. `Room.assignedDoctorId` is retained in the type but always `null`; reading it from app code outside the cloud sync layer is forbidden.

The invariants SHALL be:

1. A doctor with `assignedRoom === r.id` is considered assigned to room `r`; `r.assignedDoctorId` SHALL NOT be consulted
2. At most one doctor SHALL have `assignedRoom === r.id` for any room `r` (uniqueness on the doctors' `assignedRoom` value, ignoring `null`)
3. A doctor's `assignedRoom` SHALL either be `null` or reference an `id` that exists in the `rooms` table

The `assignDoctor(roomId, doctorId)` operation SHALL be wrapped in a Dexie `rw` transaction over the `doctors` table such that:

- If a different doctor `d'` previously had `d'.assignedRoom === roomId`, that doctor's `assignedRoom` SHALL be cleared to `null` in the same transaction (room reassignment)
- The target doctor's `assignedRoom` SHALL be set to `roomId`
- No write to the `rooms` table SHALL occur

The `unassignDoctor(roomId)` operation SHALL look up the doctor whose `assignedRoom === roomId` (via `doctors.where('assignedRoom').equals(roomId).first()`) and clear that doctor's `assignedRoom` to `null`. No write to the `rooms` table SHALL occur.

The transaction SHALL prevent a doctor from being assigned to two rooms simultaneously: if the doctor was previously assigned to another room (`d.assignedRoom === oldRoomId` and `oldRoomId !== roomId`), the new value SHALL replace the old in a single `doctors.put` call (per-row atomicity, since only one row is touched per doctor).

#### Scenario: Assign doctor to empty room

- **GIVEN** no doctor has `assignedRoom === 'room-A'` and `doctor-X.assignedRoom = null`
- **WHEN** `assignDoctor(roomId='room-A', doctorId='doctor-X')` is called
- **THEN** `doctor-X.assignedRoom` SHALL equal `'room-A'`
- **AND** no row in the `rooms` table SHALL be modified
- **AND** the write SHALL complete within a single Dexie transaction

#### Scenario: Reassign doctor from one room to another

- **GIVEN** `doctor-X.assignedRoom = 'room-A'`
- **WHEN** `assignDoctor(roomId='room-B', doctorId='doctor-X')` is called
- **THEN** `doctor-X.assignedRoom` SHALL equal `'room-B'`
- **AND** no row in the `rooms` table SHALL be modified
- **AND** the write SHALL complete within a single Dexie transaction

#### Scenario: Replace doctor in an occupied room

- **GIVEN** `doctor-X.assignedRoom = 'room-A'` and `doctor-Y.assignedRoom = null`
- **WHEN** `assignDoctor(roomId='room-A', doctorId='doctor-Y')` is called
- **THEN** `doctor-X.assignedRoom` SHALL equal `null` (displaced)
- **AND** `doctor-Y.assignedRoom` SHALL equal `'room-A'`
- **AND** no row in the `rooms` table SHALL be modified
- **AND** all writes SHALL complete within a single Dexie transaction

#### Scenario: Unassign clears doctor.assignedRoom

- **GIVEN** `doctor-X.assignedRoom = 'room-A'`
- **WHEN** `unassignDoctor(roomId='room-A')` is called
- **THEN** `doctor-X.assignedRoom` SHALL equal `null`
- **AND** no row in the `rooms` table SHALL be modified

#### Scenario: Unassign on empty room is a no-op

- **GIVEN** no doctor has `assignedRoom === 'room-A'`
- **WHEN** `unassignDoctor(roomId='room-A')` is called
- **THEN** the call SHALL complete without error
- **AND** no row in the `doctors` table SHALL be modified

#### Scenario: Transaction abort leaves doctor unchanged

- **GIVEN** `doctor-X.assignedRoom = null`
- **WHEN** `assignDoctor` is called but the transaction throws (e.g., simulated I/O failure)
- **THEN** `doctor-X.assignedRoom` SHALL still equal `null`

### Requirement: Tick loop SHALL accumulate revenue + reputation only during active study session

The system SHALL run a tick function every 5 seconds **only while a study session is active** (see `hospital-study-session` capability). When no session is active, the tick interval SHALL NOT be scheduled, and counters SHALL NOT change. Each session-active tick SHALL:

1. Read `gameCounters.singleton` (revenue, reputation, lastTickAt, totalStudyMinutes, currentSessionStartedAt)
2. Compute `elapsedSec = max(0, min((now - lastTickAt) / 1000, MAX_OFFLINE_TICK_SEC))` where `MAX_OFFLINE_TICK_SEC = 300`
3. **Build a `doctorByRoom: Map<roomId, DoctorRow>` from the `doctors` table where `assignedRoom !== null`** (via the shared `buildDoctorByRoom` helper). For each room in the `rooms` table, look up `doctorByRoom.get(room.id)`; if present, sum `throughput = baseRate × doctor.powerMultiplier × roomFacility × affinityBonus`, where `affinityBonus = getAffinityBonus(doctor.rarity, doctor.subjectId, room.type)` per the `hospital-reputation` capability. Rooms without a matching doctor SHALL contribute `0`.
4. **Determine `sessionMultiplier` based on `currentSessionStartedAt`:**
   - If `currentSessionStartedAt !== null` (session active): `sessionMultiplier = READING_SESSION_BUFF_MULTIPLIER` (1.5)
   - If `currentSessionStartedAt === null` (session inactive): `sessionMultiplier = READING_IDLE_RATE_REDUCTION` (0.3)
5. **Apply the session multiplier to the throughput before computing deltas:** `effectiveIdleThroughput = totalThroughput × sessionMultiplier`
6. Compute `deltaRevenueGross = effectiveIdleThroughput × elapsedSec / 60`
7. Compute `deltaSalary` per `hospital-finances` (ALL owned doctors × tier-staged salary rate). **Salary SHALL NOT be multiplied by `sessionMultiplier`** — salary drain stays at full rate to maintain payroll pressure
8. Compute `deltaReputation = effectiveIdleThroughput × elapsedSec / 60`
9. Compute `deltaTotalStudyMinutes = elapsedSec / 60`
10. Write `revenue = max(0, revenue + deltaRevenueGross - deltaSalary)` (clamp at 0 floor), `reputation += deltaReputation`, `totalStudyMinutes += deltaTotalStudyMinutes`, `lastTickAt = now` in a single Dexie transaction

All counter mutations from tick SHALL go through this tick function. Direct writes to `revenue` / `reputation` / `totalStudyMinutes` from UI code SHALL NOT be permitted, **except via the spend actions defined in `doctor-training` / `hospital-finances` / `hospital-events` / `hospital-fate-cards`, AND via quiz reward grants defined in the `hospital-quiz` capability (`applyQuizReward` service)**.

`READING_IDLE_RATE_REDUCTION` SHALL be exported from `packages/content-medexam2-tw/src/recruitment.ts` (or co-located tunable-constants module) as a locked literal value `0.3`. `READING_SESSION_BUFF_MULTIPLIER` SHALL be exported from the same module as a locked literal value `1.5`. Subsequent tuning of either SHALL replace it via a new change, not silently recompute.

#### Scenario: Tick accumulates idle revenue at 1.5× throughput during active session

- **GIVEN** `gameCounters.lastTickAt` was 60 seconds ago, study session is `'active'` (`currentSessionStartedAt !== null`), `totalThroughput = 40` (derived from `doctorByRoom`), no salary
- **WHEN** the next tick fires
- **THEN** `sessionMultiplier` SHALL equal `READING_SESSION_BUFF_MULTIPLIER` = `1.5`
- **AND** `effectiveIdleThroughput` SHALL equal `40 × 1.5 = 60`
- **AND** `revenue` SHALL increase by approximately `60`
- **AND** `reputation` SHALL increase by approximately `60`
- **AND** `totalStudyMinutes` SHALL increase by approximately `1`

#### Scenario: Tick accumulates idle revenue at 0.3× throughput during inactive session

- **GIVEN** `gameCounters.lastTickAt` was 60 seconds ago, study session is `'idle'` or `'paused'` (`currentSessionStartedAt === null`), `totalThroughput = 40` (derived from `doctorByRoom`), no salary
- **WHEN** the next tick fires (if scheduled — see below)
- **THEN** `sessionMultiplier` SHALL equal `READING_IDLE_RATE_REDUCTION` = `0.3`
- **AND** `effectiveIdleThroughput` SHALL equal `40 × 0.3 = 12`
- **AND** `revenue` SHALL increase by approximately `12`

#### Scenario: Tick zero when session idle and interval not scheduled

- **GIVEN** study session is `'idle'`
- **WHEN** 60 seconds pass
- **THEN** the tick interval SHALL NOT have been scheduled (per existing requirement "Tick loop SHALL pause whenever study session is paused or idle")
- **AND** `revenue` / `reputation` / `totalStudyMinutes` SHALL all be unchanged
- **AND** the inactive-session multiplier (0.3) SHALL be applicable only to UI projections (HomePage 淨收/分鐘 chip), NOT to any actual tick-loop write

#### Scenario: Tick zero for empty rooms during active session (any multiplier × 0 = 0)

- **GIVEN** session active, no doctor has `assignedRoom !== null` (all bench)
- **WHEN** the tick fires
- **THEN** `doctorByRoom` SHALL be an empty Map
- **AND** `totalThroughput` SHALL be `0`
- **AND** `effectiveIdleThroughput` SHALL be `0` (any multiplier × 0 = 0)
- **AND** `revenue` SHALL remain unchanged
- **AND** `reputation` SHALL remain unchanged
- **AND** `totalStudyMinutes` SHALL still increment by the elapsed minutes

#### Scenario: Salary drain is NOT multiplied by session buff or idle penalty

- **GIVEN** active session, 4 P3 doctors owned (3 with `assignedRoom !== null`, 1 on bench), tier 區域醫院
- **AND** the tick fires after 60 seconds
- **WHEN** salary deduction is computed
- **THEN** the deduction SHALL equal `4 × powerMultiplier(P3) × SALARY_BASE × TIER_SALARY_RATE(區域醫院) × elapsedMin`
- **AND** the salary deduction SHALL NOT be multiplied by `READING_SESSION_BUFF_MULTIPLIER` (salary stays at full rate)
- **AND** the salary deduction SHALL NOT be multiplied by `READING_IDLE_RATE_REDUCTION` (salary stays at full rate)

#### Scenario: Quiz reward grants bypass tick-only invariant

- **GIVEN** active or idle session (state independent)
- **WHEN** the QuizModal `applyQuizReward` service runs after a correct answer
- **THEN** the service MAY write directly to `gameCounters.revenue / reputation` outside the tick loop
- **AND** the write SHALL NOT conflict with the tick loop's lastTickAt cursor (independent counter update)

### Requirement: Tick loop SHALL cap session-active accumulation at 5 minutes (defense against clock skew)

The system SHALL enforce `MAX_OFFLINE_TICK_SEC = 300` even during active sessions to defend against system clock anomalies (e.g., suspend / hibernate during session). No single tick SHALL advance by more than 300 seconds of accumulated throughput.

The previous "offline accumulation" semantics (offline tick accruing when player returns) SHALL be removed — since tick only runs during active session, "offline" no longer applies. The UI SHALL display a notification only if a single tick exceeds the cap (rare: indicates suspend or clock skew).

#### Scenario: Suspend mid-session triggers cap notice

- **GIVEN** active session, `lastTickAt` was 30 minutes ago (player suspended laptop without ending session — see hospital-study-session auto-pause requirements)
- **WHEN** the tab regains focus and the next tick fires
- **THEN** `elapsedSec` SHALL be capped at `300`
- **AND** the UI SHALL display a notification mentioning clock-skew cap

### Requirement: Tick loop SHALL pause whenever study session is paused or idle

The system SHALL clear the tick `setInterval` whenever `studySession.state !== 'active'`. Specifically:

- `studySession.state` transitions to `'paused'` (visibility / idle / explicit) → clear interval
- `studySession.state` transitions to `'idle'` (explicit stop) → clear interval
- `studySession.state` transitions to `'active'` (start / resume) → schedule interval

Visibility transitions SHALL be handled via the study session pause logic (see `hospital-study-session`), NOT directly here. This removes the previous direct `visibilitychange` handler on the tick loop.

#### Scenario: Visibility hide pauses session, tick clears

- **GIVEN** active session and tick interval scheduled
- **WHEN** `document.visibilityState` transitions to `'hidden'`
- **THEN** `studySession.state` SHALL transition to `'paused'` (via hospital-study-session)
- **AND** the tick interval SHALL be cleared as a downstream effect

### Requirement: Game counters SHALL split LWW fields and monotonic fields into separate rows

The system SHALL persist game state across TWO rows in dedicated tables to support different cloud sync merge strategies:

1. **`gameCounters.singleton`** (LWW merge — last-write-wins):
   - `revenue: number`
   - `reputation: number`
   - `lastTickAt: number`
   - `tier: HospitalTier`
   - `hasUsedStarterPull: boolean`
   - `currentSessionStartedAt: number | null`
   - `lastSessionEndedAt: number | null`
   - `tutorial: { completedSteps: Record<string, true>, firstVisit: Record<string, true>, firedTips: Record<string, true> }`

2. **`monotonicCounters.singleton`** (MAX merge — strictly non-decreasing):
   - `totalStudyMinutes: number`
   - `fateCardBadLuckPity: { common: number, rare: number, epic: number }`

Each row SHALL be created on first read if missing (auto-seed both rows with default zero values + `tier = '診所'` / `hasUsedStarterPull = false`).

Existing saves (pre-redesign-hospital-economy v6) SHALL be patched by the v6 upgrade hook to:
- Create `monotonicCounters.singleton` with `totalStudyMinutes = 0` and `fateCardBadLuckPity = {common: 0, rare: 0, epic: 0}`
- Add `currentSessionStartedAt = null` / `lastSessionEndedAt = null` / `tutorial = { completedSteps: {}, firstVisit: {}, firedTips: {} }` to existing `gameCounters.singleton` if missing

This split SHALL allow cloud sync (per `add-cloud-sync` capability) to apply different merge strategies per row — `gameCounters` uses standard LWW, `monotonicCounters` uses field-wise max — without requiring per-field merge hook infrastructure in the sync engine.

#### Scenario: Fresh save initializes both rows

- **GIVEN** a new hospital save (no prior rows in either table)
- **WHEN** the app boots and ensureSeed runs
- **THEN** `gameCounters.singleton.tier` SHALL equal `'診所'`
- **AND** `monotonicCounters.singleton.totalStudyMinutes` SHALL equal `0`
- **AND** `monotonicCounters.singleton.fateCardBadLuckPity` SHALL equal `{common: 0, rare: 0, epic: 0}`

#### Scenario: Existing v5 save upgrades to v6 with new monotonic row

- **GIVEN** a v5 save with `gameCounters.singleton = { revenue: 100, reputation: 50, ... }` (no monotonicCounters row)
- **WHEN** the app upgrades to v6
- **THEN** `monotonicCounters.singleton.totalStudyMinutes` SHALL equal `0`
- **AND** `monotonicCounters.singleton.fateCardBadLuckPity` SHALL equal `{common: 0, rare: 0, epic: 0}`
- **AND** `gameCounters.singleton` LWW fields SHALL remain unchanged

#### Scenario: Cloud sync max-merge for monotonic counters

- **GIVEN** local `totalStudyMinutes = 100` and cloud `totalStudyMinutes = 80` (player studied 20 min offline on this device)
- **WHEN** the sync engine pulls
- **THEN** the local value SHALL remain `100` (max(local, cloud))
- **AND** the cloud value SHALL be pushed up to `100` on next push (LWW won't downgrade since this row uses max merge)

#### Scenario: Cloud sync LWW for gameCounters revenue

- **GIVEN** local `gameCounters.singleton.revenue = 5000` (updated 1 min ago) and cloud value `revenue = 8000` (updated 10 seconds ago, fresher)
- **WHEN** the sync engine pulls
- **THEN** the local value SHALL become `8000` (cloud fresher → LWW wins)

### Requirement: HomePage SHALL display revenue and reputation prominently

The `apps/medexam2-hospital-tw/src/pages/Home.tsx` SHALL render a banner at the top of the page (above the recruitment banner grid) showing the current `revenue` and `reputation` values. Both values SHALL be formatted with Chinese locale thousands separator (e.g., `1,234,567`). The banner SHALL include a brief hint when both counters are zero, directing the player to assign doctors.

#### Scenario: Banner displays formatted counters

- **GIVEN** `gameCounters.revenue = 12345` and `gameCounters.reputation = 678`
- **WHEN** the HomePage renders
- **THEN** the banner SHALL display revenue as `12,345`
- **AND** the banner SHALL display reputation as `678`

#### Scenario: Empty state hint shown when counters are zero

- **GIVEN** `gameCounters.revenue = 0` and `gameCounters.reputation = 0`
- **AND** no doctors are assigned to any room
- **WHEN** the HomePage renders
- **THEN** the banner SHALL display a hint containing `「指派」` and `「診間」`

### Requirement: Assignment UI SHALL list only unassigned doctors when picking

The `/hospital` page SHALL render a grid of rooms. Clicking a slot SHALL open an `AssignDoctorModal` that lists only doctors whose `assignedRoom === null`, plus (when the slot is occupied) the doctor currently assigned to that room at the top of the list.

Clicking a doctor in the modal SHALL trigger the `assignDoctor` operation defined above. Clicking an already-assigned slot SHALL also expose an **unassign** action that calls `unassignDoctor(roomId)`.

The modal SHALL identify the currently-assigned doctor by looking up the value of `buildDoctorByRoom(doctors).get(room.id)` (derived from `Doctor.assignedRoom`), NOT by reading `room.assignedDoctorId`.

#### Scenario: Modal lists only unassigned doctors

- **GIVEN** the `doctors` table contains 5 entries
- **AND** 2 doctors have `assignedRoom !== null`
- **WHEN** the player clicks an empty room slot to assign
- **THEN** the modal SHALL display 3 doctor cards
- **AND** the 2 assigned doctors SHALL NOT appear in the modal

#### Scenario: Swap option offered on assigned slot

- **GIVEN** `room-A` has an assigned doctor (`doctor-X.assignedRoom === 'room-A'`)
- **WHEN** the player clicks `room-A`
- **THEN** the UI SHALL identify `doctor-X` as the current occupant via `buildDoctorByRoom`
- **AND** selecting swap SHALL open the modal with unassigned doctors plus `doctor-X` available
- **AND** selecting unassign SHALL clear `doctor-X.assignedRoom` (no write to `rooms` table)

### Requirement: Hospital page SHALL render rooms with assigned doctor sprite

Each room cell on the `/hospital` page SHALL render a `RoomCard` component showing:

- Room type label (e.g., `「門診」` for outpatient, `「手術」` for surgery, `「病房」` for ward)
- Slot number (e.g., `#1`, `#2`, `#3`)
- Assigned doctor's sprite (via the same `lookupSprite` helper from `add-doctor-sprite-roster`) when assigned
- An empty placeholder with `「指派醫師」` CTA when unassigned
- Live throughput indicator showing `XX 患者/分` when assigned (reflecting the affinity-adjusted formula `baseRate × powerMultiplier × roomFacility × affinityBonus`), `0 患者/分` when empty
- Affinity bonus marker when the assigned doctor's subject maps to the room's type per `hospital-reputation` capability (see that capability for marker visual + scenario details)

The `RoomCard` SHALL identify the assigned doctor (if any) by looking up `buildDoctorByRoom(doctors).get(room.id)` (derived from `Doctor.assignedRoom`), NOT by reading `room.assignedDoctorId`.

The sprite SHALL apply `image-rendering: pixelated` consistent with the existing roster and recruitment modal.

#### Scenario: Empty room shows assign CTA

- **GIVEN** no doctor has `assignedRoom === 'room-outpatient-1'`
- **WHEN** the `/hospital` page renders
- **THEN** the corresponding `RoomCard` SHALL display `「門診」` and `#1`
- **AND** the card SHALL display an empty placeholder with `「指派醫師」` CTA
- **AND** the throughput indicator SHALL show `0`

#### Scenario: Assigned room shows sprite and affinity-adjusted throughput (match)

- **GIVEN** `room-surgery-1` has `type = 'surgery'`, `baseRate = 10`, `roomFacility = 1.0`
- **AND** `doctor-外科-P3.assignedRoom = 'room-surgery-1'` (subject = '外科' maps to surgery → match, P3 bonus = 1.3)
- **AND** the doctor has `powerMultiplier = 2.0`
- **WHEN** the `/hospital` page renders
- **THEN** the `RoomCard` SHALL render an `<img>` whose `src` resolves to `doctor-外科-P3` sprite
- **AND** the throughput indicator SHALL show `26 患者/分` (= 10 × 2.0 × 1.0 × 1.3)
- **AND** the card SHALL display the affinity match marker (per `hospital-reputation` capability)

#### Scenario: Assigned room shows lower throughput on mismatch

- **GIVEN** `room-ward-1` has `type = 'ward'`, `baseRate = 10`, `roomFacility = 1.0`
- **AND** the same P3 外科 doctor is assigned (mismatch: 外科 → surgery, room is ward)
- **WHEN** the `/hospital` page renders
- **THEN** the throughput indicator SHALL show `20 患者/分` (= 10 × 2.0 × 1.0 × 1.0)
- **AND** the card SHALL NOT display an affinity match marker

### Requirement: Read sites SHALL derive room→doctor mapping via shared helper

The hospital app SHALL expose a shared helper module at `apps/medexam2-hospital-tw/src/lib/room-doctor-map.ts` with the following API:

```typescript
export function buildDoctorByRoom(
  doctors: ReadonlyArray<DoctorRow>,
): Map<string, DoctorRow>

export function getAssignedDoctor(
  roomId: string,
  doctorByRoom: Map<string, DoctorRow>,
): DoctorRow | null
```

`buildDoctorByRoom` SHALL iterate the doctors array, skipping rows with `assignedRoom === null`, and populate a `Map<roomId, DoctorRow>`. When two doctors point to the same `roomId` (transient race state before `checkAssignmentInvariants` repairs), the helper SHALL keep the doctor with the larger `obtainedAt` value and silently drop the other (last-line race safety).

All React components, the tick loop, and any other read site SHALL look up assigned doctors through `buildDoctorByRoom` (typically wrapped in `useMemo`), NOT by reading `room.assignedDoctorId`.

The following files SHALL use the helper (non-exhaustive enumeration of known read sites):

- `apps/medexam2-hospital-tw/src/pages/Hospital.tsx`
- `apps/medexam2-hospital-tw/src/pages/HomePage.tsx`
- `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx`
- `apps/medexam2-hospital-tw/src/lib/tick.ts`
- `apps/medexam2-hospital-tw/src/components/RoomCard.tsx` (consumes derived prop from parent, no direct DB read)

#### Scenario: Helper returns mapping keyed by room id

- **GIVEN** a `doctors` array with 3 entries: `{id: 'd1', assignedRoom: 'r1', obtainedAt: 100}`, `{id: 'd2', assignedRoom: 'r2', obtainedAt: 200}`, `{id: 'd3', assignedRoom: null, obtainedAt: 300}`
- **WHEN** `buildDoctorByRoom(doctors)` is called
- **THEN** the returned Map SHALL have exactly 2 entries
- **AND** `map.get('r1')?.id` SHALL equal `'d1'`
- **AND** `map.get('r2')?.id` SHALL equal `'d2'`
- **AND** `map.get('r3')` SHALL be `undefined`

#### Scenario: Helper deduplicates two doctors pointing to same room (race safety)

- **GIVEN** a transient drift state where `doctor-X.assignedRoom = 'r1'` (obtainedAt = 100) and `doctor-Y.assignedRoom = 'r1'` (obtainedAt = 200)
- **WHEN** `buildDoctorByRoom(doctors)` is called
- **THEN** the returned Map SHALL have exactly 1 entry for `'r1'`
- **AND** `map.get('r1')?.id` SHALL equal `'doctor-Y'` (later obtainedAt)
- **AND** the helper SHALL NOT throw

#### Scenario: No app code outside sync layer reads room.assignedDoctorId

- **GIVEN** the full source tree of `apps/medexam2-hospital-tw/src/`
- **WHEN** a grep for `assignedDoctorId` is performed on `**/*.ts` and `**/*.tsx`
- **THEN** the only matches SHALL be in `lib/sync/tables.ts` (cloud blob sanitize), `db/schema.ts` (type definition + Dexie migration), and inline-deprecation comments

### Requirement: Cloud sync apply SHALL force `rooms[*].assignedDoctorId` to null

The `writeHospitalStateBlob` function in `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` SHALL, when applying a cloud `hospital_state` row to the local IndexedDB, sanitize the rooms array by setting every `room.assignedDoctorId` to `null` regardless of the cloud value.

This SHALL apply on every pull path (silent-pull, cloud-chosen migration, conflict-chooser cloud-side selection, visibility-pull, periodic pull). The sanitize SHALL happen after the `_updatedAt` stamp logic but before the `db.rooms.bulkPut` call.

The reason is defensive: pre-fix cloud rows may carry non-null `assignedDoctorId` values that would otherwise revive drift on apply. Going forward, push paths SHALL write `null` (by virtue of read sites never writing non-null), but tolerating stale cloud blobs avoids requiring a server-side SQL backfill.

#### Scenario: Stale cloud blob applies with assignedDoctorId nulled

- **GIVEN** a cloud `hospital_state.data.rooms` array where `rooms[0].assignedDoctorId = 'd-legacy-uuid'`
- **AND** local `doctors` table has `doctor-X.assignedRoom = 'room-0-id'`
- **WHEN** the cloud row is applied to local via `writeHospitalStateBlob`
- **THEN** the local `rooms` table SHALL contain a row with `id = 'room-0-id'` and `assignedDoctorId = null`
- **AND** local `doctor-X.assignedRoom` SHALL remain `'room-0-id'` (doctors path is independent)
- **AND** `buildDoctorByRoom` SHALL still resolve `room-0-id` to `doctor-X`

#### Scenario: Fresh cloud blob with null assignedDoctorId applies unchanged

- **GIVEN** a cloud `hospital_state.data.rooms` array where every `rooms[*].assignedDoctorId === null`
- **WHEN** the cloud row is applied to local
- **THEN** the local `rooms` table SHALL contain rows with `assignedDoctorId = null` (unchanged from cloud)
- **AND** no doctor record SHALL be modified by this apply

### Requirement: `checkAssignmentInvariants` SHALL actively repair drift on boot and after cloud pull

The `checkAssignmentInvariants` function in `apps/medexam2-hospital-tw/src/lib/assignment.ts` SHALL, when invoked, scan the `rooms` and `doctors` tables and **repair** detected drift in a single Dexie `rw` transaction. The repair logic SHALL prefer the `doctors` side as the source of truth.

Repair rules (in order):

1. For every `room` with `room.assignedDoctorId !== null`, reset to `null`
2. For every group of doctors with `assignedRoom === r.id` for the same `r.id` (uniqueness violation): keep the doctor with the largest `obtainedAt`, reset `assignedRoom = null` on all others
3. For every doctor with `assignedRoom !== null` referencing a room id not present in the `rooms` table (orphan), reset `assignedRoom = null`

The function SHALL log a `console.info` summary of repairs performed (count, brief detail) for telemetry. The function SHALL return `{ scanned: { rooms, doctors }, repaired: { roomsReset, doctorsDuplicates, doctorsOrphans } }`.

The function SHALL be invoked:

- On app boot, after Dexie open completes (existing call site in `App.tsx`)
- After every successful cloud pull resolves (new call site, wired via `useSync` or `SyncEngine.onPullComplete` hook)

#### Scenario: Boot scan repairs forward-pointer drift

- **GIVEN** local state where `rooms[*].assignedDoctorId !== null` (legacy drift from pre-fix data)
- **AND** `doctors[*].assignedRoom` reflects the desired assignment
- **WHEN** `checkAssignmentInvariants()` runs on app boot
- **THEN** all `rooms[*].assignedDoctorId` SHALL be reset to `null`
- **AND** no doctor record SHALL be modified
- **AND** `console.info` SHALL log a summary including `roomsReset` count

#### Scenario: Repair resolves duplicate doctor pointing to same room

- **GIVEN** `doctor-X.assignedRoom = 'r1'` with `obtainedAt = 100`
- **AND** `doctor-Y.assignedRoom = 'r1'` with `obtainedAt = 200`
- **WHEN** `checkAssignmentInvariants()` runs
- **THEN** `doctor-Y.assignedRoom` SHALL remain `'r1'` (later obtainedAt wins)
- **AND** `doctor-X.assignedRoom` SHALL be reset to `null`

#### Scenario: Repair clears orphan doctor pointing to non-existent room

- **GIVEN** `doctor-X.assignedRoom = 'room-deleted'`
- **AND** the `rooms` table does NOT contain a row with `id = 'room-deleted'`
- **WHEN** `checkAssignmentInvariants()` runs
- **THEN** `doctor-X.assignedRoom` SHALL be reset to `null`

#### Scenario: Repair runs after successful cloud pull

- **GIVEN** an authenticated session with cloud pull in flight
- **WHEN** the pull resolves successfully
- **THEN** `checkAssignmentInvariants()` SHALL be invoked with repair semantics
- **AND** any drift introduced by stale cloud state (e.g. `rooms[*].assignedDoctorId !== null` if sanitize fails) SHALL be repaired

#### Scenario: Clean state repair is a no-op

- **GIVEN** local state with no drift (all `rooms[*].assignedDoctorId === null` AND `doctors` uniqueness holds AND no orphans)
- **WHEN** `checkAssignmentInvariants()` runs
- **THEN** no row SHALL be modified
- **AND** the returned `repaired` counts SHALL all equal `0`

### Requirement: Dexie schema v12 SHALL force-null all rooms.assignedDoctorId on upgrade

The `HospitalDB` schema SHALL include a v12 version with an `.upgrade()` hook that iterates the `rooms` table and sets every `assignedDoctorId` to `null`. The store schema (indices, primary keys) SHALL be unchanged from v11.

#### Scenario: v11 → v12 upgrade nulls all rooms.assignedDoctorId

- **GIVEN** a user opening the app whose IndexedDB is currently at v11 with `rooms[*].assignedDoctorId !== null` for at least one row
- **WHEN** the Dexie open call triggers the v12 upgrade
- **THEN** after upgrade completes, all `rooms[*].assignedDoctorId` SHALL equal `null`
- **AND** no row in the `doctors` table SHALL be modified
- **AND** other rooms fields (`type`, `baseRate`, `roomFacility`, `facilityLevel`, `slot`) SHALL be unchanged

#### Scenario: Fresh install at v12 has all assignedDoctorId null

- **GIVEN** a fresh IndexedDB that opens directly at v12
- **WHEN** seeding runs (per "Fresh save SHALL seed 3 outpatient rooms" requirement)
- **THEN** all seeded rooms SHALL have `assignedDoctorId = null`
- **AND** the v12 upgrade hook SHALL NOT need to perform any modification (vacuous truth)

### Requirement: Facility upgrades, gacha rolls, ticket grants, and affinity increments SHALL propagate to cloud within the debounce window

For every mutation to the `rooms` table (manual facility upgrade via `services/facility.ts`; fate-card-triggered 全院 / 單室 / 升級券 facility upgrades via `services/fate-card.ts`), the `tickets` table (recruitment spend, quiz-reward grants, fate-card consumption, daily refills), the `gachaStats` table (pity-counter updates from recruit rolls), and the `affinity` table (per-subject `correctCount` increments from quiz correct answers), the cloud `hospital_state` row SHALL receive the updated values within the sync engine's debounce window (default 3000 ms, configured by `VITE_SYNC_DEBOUNCE_MS`).

This requirement is INDEPENDENT of the tick loop: it SHALL hold regardless of whether a study session is active. The tick loop's role in pushing `gameCounters` to cloud SHALL NOT be a prerequisite for propagating room / ticket / gachaStats / affinity changes.

#### Scenario: Manual facility upgrade with no active study session

- **GIVEN** the user is on the 醫院 page (no active study session)
- **AND** the cloud `hospital_state.data.rooms.outpatient-1.facilityLevel` equals 1
- **WHEN** the user clicks the facility upgrade button on `outpatient-1`, paying the upgrade cost
- **AND** the local `db.rooms.get('outpatient-1').facilityLevel` becomes 2
- **THEN** within 3000 ms (default debounce), a `pushNow` SHALL fire
- **AND** the cloud `hospital_state.data.rooms.outpatient-1.facilityLevel` SHALL equal 2

#### Scenario: Fate-card 全院 facility upgrade pushes all rooms

- **WHEN** the user activates a fate card whose effect is "全院設施 +1"
- **AND** `services/fate-card.ts` writes the new `facilityLevel` to every eligible room via repeated `db.rooms.put`
- **THEN** within 3000 ms of the last `db.rooms.put`, a single push SHALL fire
- **AND** the cloud `hospital_state.data.rooms` SHALL reflect the bumped levels for every eligible room
- **AND** no separate push SHALL fire per room (debounce coalesces)

#### Scenario: Recruit roll updates ticket count and pity counter cloud-side

- **GIVEN** the user has at least one recruitment ticket and cloud is in sync
- **WHEN** the user rolls a recruitment via `services/recruitment.ts`, which writes both `db.tickets` (decrement available) and `db.gachaStats` (pity counter)
- **THEN** within 3000 ms a push SHALL fire
- **AND** the cloud `hospital_state.data.tickets.available` SHALL equal the post-roll local value
- **AND** the cloud `hospital_state.data.gachaStats` SHALL equal the post-roll local pity counter

#### Scenario: Affinity increment during quiz answer pushes within debounce window

- **GIVEN** an active study session is producing `gameCounters` ticks every 5 seconds
- **WHEN** the user answers a question correctly, causing `lib/mastery.ts` to write `db.affinity.put({ subjectId, correctCount: next })`
- **AND** no `gameCounters` tick fires within 3000 ms of the affinity write
- **THEN** a push SHALL fire within 3000 ms based on the affinity write alone
- **AND** the cloud `hospital_state.data.affinity` SHALL include the new `correctCount` for `subjectId`

