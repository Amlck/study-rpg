# daily-study-log Specification

## Purpose

Forward-only per-day snapshot of player study minutes for `apps/medexam2-hospital-tw`. Created to power the 成就 → 統計 sub-tab charts (`/achievements`) and to provide a time-series foundation for future daily-streak / weekly-summary features. Lives alongside the lifetime `monotonicCounters.totalStudyMinutes` counter without replacing it — the monotonic counter remains the source of truth for lifetime totals, and this table is the audit-log of when those minutes accrued. Synced via the R2 m2 bundle only (R2-only adapter, mirror `LEADERBOARD_PROFILE` / `ACHIEVEMENTS` precedent — no Supabase storage, no `upsert_lww` whitelist entry).

## Requirements

### Requirement: Daily study log SHALL persist per-day study minutes via forward-only Dexie table

The system SHALL provide a Dexie table `dailyStudyLog` whose rows snapshot the player's cumulative study minutes for each calendar day, scoped to `apps/medexam2-hospital-tw`. Each row's primary key SHALL be the local-timezone date string in `YYYY-MM-DD` format (e.g., `2026-05-26`). Row shape:

```ts
interface DailyStudyLogRow {
  date: string;        // 'YYYY-MM-DD' local timezone, PK
  minutesAdded: number; // cumulative minutes credited on this date
  updatedAt: number;   // epoch ms, for LWW conflict resolution
}
```

The table SHALL be introduced via Dexie schema bump from v17 to v18, defined as `dailyStudyLog: '&date, updatedAt'`. The migration SHALL be additive only — it MUST NOT backfill historical rows from `monotonicCounters.totalStudyMinutes` or any other source. Existing players upgrading to v18 SHALL see an empty `dailyStudyLog` table at first cold-open.

#### Scenario: Fresh install creates empty table

- **GIVEN** a player installing the app for the first time
- **WHEN** the Dexie database opens at version 18
- **THEN** `dailyStudyLog` SHALL exist as a registered object store
- **AND** `await db.dailyStudyLog.toArray()` SHALL return `[]`

#### Scenario: Existing v17 player upgrades to v18

- **GIVEN** a player with prior `monotonicCounters.totalStudyMinutes = 4320` and no `dailyStudyLog` table
- **WHEN** the app boots after Dexie schema bump to v18
- **THEN** `dailyStudyLog` SHALL be created as empty
- **AND** `monotonicCounters.totalStudyMinutes` SHALL remain `4320` unchanged
- **AND** no row SHALL be auto-inserted into `dailyStudyLog` from the existing 4320 value

### Requirement: Tick hook SHALL upsert the current-day row whenever study minutes accrue

Every code path that credits study minutes to the player (currently `apps/medexam2-hospital-tw/src/lib/tick.ts` `applyTick`-equivalent) SHALL, within the same transaction as updating `monotonicCounters.totalStudyMinutes`, upsert the `dailyStudyLog` row keyed by the current local date. The upsert SHALL:

1. Compute the date key via `formatYMD(new Date())` (local timezone start-of-day)
2. Read existing row (if any)
3. Set `minutesAdded = (existing?.minutesAdded ?? 0) + deltaMinutes`
4. Set `updatedAt = Date.now()`
5. `put` back

The upsert SHALL NOT depend on `monotonicCounters` having been written first, but it SHOULD occur in the same Dexie `transaction('rw', ...)` block for atomicity.

#### Scenario: First tick of the day creates a new row

- **GIVEN** today is `2026-05-26` and `dailyStudyLog` has no row for that date
- **WHEN** `applyTick(5)` is invoked (5 minutes credited)
- **THEN** `dailyStudyLog.get('2026-05-26')` SHALL return `{ date: '2026-05-26', minutesAdded: 5, updatedAt: <now> }`

#### Scenario: Subsequent same-day tick accumulates

- **GIVEN** today is `2026-05-26` and `dailyStudyLog.get('2026-05-26')` returns `{ minutesAdded: 5, updatedAt: T1 }`
- **WHEN** `applyTick(3)` is invoked at time `T2 > T1`
- **THEN** the row SHALL update to `{ date: '2026-05-26', minutesAdded: 8, updatedAt: T2 }`

#### Scenario: Crossing midnight creates a new row, preserves yesterday

- **GIVEN** yesterday `2026-05-25` has `{ minutesAdded: 60, updatedAt: T_y }` and the clock crosses to `2026-05-26 00:00:01` local time
- **WHEN** `applyTick(2)` is invoked
- **THEN** `dailyStudyLog.get('2026-05-25')` SHALL remain `{ minutesAdded: 60, updatedAt: T_y }` unchanged
- **AND** `dailyStudyLog.get('2026-05-26')` SHALL return `{ date: '2026-05-26', minutesAdded: 2, updatedAt: <now> }`

### Requirement: R2 m2 bundle SHALL carry dailyStudyLog with row-level LWW merge

The R2 m2 bundle schema version SHALL bump from `2` to `3` and include a new top-level array key `dailyStudyLog` of type `DailyStudyLogRow[]`. Bundle read/write SHALL support cross-version tolerance:

- **v3 client reading v2 bundle**: missing `dailyStudyLog` field SHALL default to `[]`
- **v2 client reading v3 bundle**: unknown `dailyStudyLog` field SHALL be silently dropped (existing parser behavior)
- **v3 client writing**: bundle SHALL always include `dailyStudyLog` array (possibly empty)
- **v3 client reading own v3 bundle**: `dailyStudyLog` SHALL round-trip exactly

The merge strategy for `dailyStudyLog` rows on pull SHALL be row-level LWW (last-write-wins) on `updatedAt`. The merge SHALL NOT use monotonic-OR semantics (unlike `everWrong` field on `questionHistory`), because `dailyStudyLog.minutesAdded` is a cumulative-per-day counter and cross-version contamination risk does not apply (v3 client always writes v3 bundle with this field).

#### Scenario: v3 round-trip preserves all rows

- **GIVEN** local has `dailyStudyLog = [{date:'2026-05-25', minutesAdded:60, updatedAt:T1}, {date:'2026-05-26', minutesAdded:8, updatedAt:T2}]`
- **WHEN** the bundle is serialized, written to R2, fetched back, and applied to a fresh local
- **THEN** local SHALL have the same two rows with identical values

#### Scenario: v2 bundle tolerates v3 client read

- **GIVEN** R2 has an old v2 bundle with `schema_version: 2` and no `dailyStudyLog` key
- **WHEN** a v3 client pulls the bundle
- **THEN** the client SHALL NOT throw on missing key
- **AND** local `dailyStudyLog` SHALL be unchanged (no rows applied)

#### Scenario: v3 bundle tolerates v2 client read

- **GIVEN** R2 has a v3 bundle with `dailyStudyLog: [{date:'2026-05-26', minutesAdded:8, updatedAt:T}]`
- **WHEN** a still-deployed v2 client fetches the bundle
- **THEN** the v2 client SHALL parse the bundle without error
- **AND** the v2 client SHALL apply non-`dailyStudyLog` fields normally
- **AND** the `dailyStudyLog` field SHALL be ignored (no Dexie operations against the not-yet-existing table)

#### Scenario: LWW resolves cross-device conflict by latest write

- **GIVEN** Device A has `{date:'2026-05-26', minutesAdded:5, updatedAt:1000}` and Device B has `{date:'2026-05-26', minutesAdded:8, updatedAt:2000}`
- **WHEN** Device A pulls Device B's bundle
- **THEN** Device A's local row SHALL update to `{date:'2026-05-26', minutesAdded:8, updatedAt:2000}` (Device B wins by later `updatedAt`)

### Requirement: Stats consumers SHALL surface forward-only data caveat in UI

UI components that read `dailyStudyLog` for chart rendering (e.g., the stats sub-tab in achievements page) SHALL display a contextual helper element informing players that the data is forward-only and historical accumulation cannot be subdivided by day. The element MAY take the form of:

- A summary chip near chart titles showing «升級前累積 N 分鐘 (無法分日顯示)» where N is `monotonicCounters.totalStudyMinutes` minus the sum of all `dailyStudyLog.minutesAdded`
- A one-line helper banner reading «歷史資料從升級當下開始累積»

This requirement exists to prevent player confusion when the chart appears empty or only partially populated immediately after the v18 upgrade.

#### Scenario: Player with no logged data sees an explanatory message

- **GIVEN** a player who upgraded to v18 today and has `dailyStudyLog = []` but `monotonicCounters.totalStudyMinutes = 4320`
- **WHEN** the player opens the stats sub-tab
- **THEN** the UI SHALL display the residual-minutes chip showing «升級前累積 4320 分鐘 (無法分日顯示)»
- **AND** the chart area SHALL display a helper banner explaining historical data starts from the upgrade
