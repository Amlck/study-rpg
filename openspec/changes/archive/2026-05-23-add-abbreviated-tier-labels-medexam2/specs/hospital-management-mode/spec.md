## ADDED Requirements

### Requirement: UI SHALL render hospital tier names via the abbreviated display-label mapping

All user-facing UI surfaces in `apps/medexam2-hospital-tw` that display a hospital tier name SHALL render the abbreviated display label, not the canonical type string. The canonical type strings (`'診所'` / `'區域醫院'` / `'醫學中心'` / `'國家級教學醫院'`) SHALL remain unchanged in Dexie storage, R2 sync bundles, D1 leaderboard rows, the `HospitalTier` literal union in `packages/core/src/types.ts`, internal logs, and OpenSpec scenarios.

The mapping is:

| Canonical (`HospitalTier`) | Abbreviated UI display label |
|---|---|
| `'診所'` | `診所` |
| `'區域醫院'` | `區域` |
| `'醫學中心'` | `醫中` |
| `'國家級教學醫院'` | `大廟` |

The mapping SHALL be exported from a single module (`apps/medexam2-hospital-tw/src/lib/tier-labels.ts`) as `TIER_DISPLAY_LABEL: Record<HospitalTier, string>` plus a thin helper `tierLabel(tier: HospitalTier): string`. UI render sites SHALL delegate to this helper rather than inlining the abbreviated strings, so future label adjustments touch a single file.

The HelpMenu tier-upgrade explanation SHALL additionally include the canonical name in parentheses on first mention per tier (e.g., `區域（區域醫院）`) so players familiar with the prior long names can correlate.

#### Scenario: Hospital scene tier badge shows abbreviated label

- **GIVEN** a player whose `gameCounters.tier = '國家級教學醫院'`
- **WHEN** the HospitalScene tier badge renders
- **THEN** the visible text SHALL equal `大廟`
- **AND** the underlying `gameCounters.tier` Dexie value SHALL still equal `'國家級教學醫院'`

#### Scenario: Leaderboard tier column shows abbreviated label

- **GIVEN** a leaderboard row representing a player at `'醫學中心'` tier
- **WHEN** the LeaderboardPage table renders this row's tier cell
- **THEN** the cell text SHALL equal `醫中`
- **AND** the my-rank chip and any tooltip referencing the player's hospital tier SHALL also use the abbreviated label

#### Scenario: HelpMenu tier-upgrade copy uses abbreviated labels with canonical parenthetical

- **WHEN** the player opens the HelpMenu「升級規則」 accordion section
- **THEN** the body copy SHALL use the abbreviated labels for each tier mention
- **AND** on the first mention of each tier (per transition), the canonical name SHALL appear in parentheses immediately after the abbreviated label (e.g., `區域（區域醫院）`)

#### Scenario: V6 migration modal notes the display change

- **GIVEN** a player whose save predates this change and has a tier other than `'診所'`
- **WHEN** the V6MigrationModal opens
- **THEN** the modal body SHALL include a line noting that tier display has switched to abbreviated names while the underlying save data is unchanged

#### Scenario: Internal log and analytics output retains canonical name

- **GIVEN** an internal event log entry firing on a tier upgrade
- **WHEN** the log line is emitted (console.log / structured log)
- **THEN** the log SHALL reference the canonical name (e.g., `[tier-up] 區域醫院 → 醫學中心`), not the abbreviated label, so log search and dashboards using the canonical name continue to work

#### Scenario: Canonical strings remain unchanged in storage and sync

- **WHEN** the player at any tier triggers cloud sync
- **THEN** the R2 bundle SHALL serialize `gameCounters.tier` as its canonical string (e.g., `'醫學中心'`)
- **AND** the D1 leaderboard upsert SHALL clamp the canonical-to-numeric mapping (`HOSPITAL_TIER_TO_NUM`) with the same canonical keys it used before this change
- **AND** the Dexie `gameCounters` row SHALL store the canonical string

#### Scenario: TypeScript helper rejects non-canonical input

- **GIVEN** a developer attempts to pass an arbitrary string to `tierLabel()`
- **WHEN** the TypeScript compiler checks the call site
- **THEN** the compiler SHALL reject the call unless the argument is provably one of the four `HospitalTier` literal values
- **AND** no runtime fallback (e.g., `default → '?'`) SHALL be present in the helper implementation — silent fallback would mask the underlying invariant violation
