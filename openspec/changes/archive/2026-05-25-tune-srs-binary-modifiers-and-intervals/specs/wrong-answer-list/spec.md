## MODIFIED Requirements

### Requirement: The `questionHistory` store SHALL persist an `everWrong` flag set on first wrong answer and never unset

The `questionHistory` Dexie store SHALL include a column `everWrong: boolean` (default `false`) introduced in Dexie schema version 17. A single-column index on `everWrong` SHALL be added to support efficient query of `everWrong === true` rows.

The `recordWrongAnswer` flow (per `hospital-quiz` capability) SHALL set `everWrong = true` on the upserted row whenever the row is being written with `lastResult = 'wrong'`. If the row already has `everWrong = true`, the write SHALL be idempotent (no-op flip).

The `recordCorrectAnswer` flow SHALL NOT modify `everWrong` — the default correct-answer path leaves the flag untouched.

The `everWrong` flag MAY transition from `true` to `false` ONLY via the player's explicit click on the 「太簡單」 button in `QuizModal` (per the `hospital-srs` capability's `Easy modifier path (二階)` requirement). No other code path SHALL clear `everWrong`. A row that was set `true` by `recordWrongAnswer` and has not received a player-explicit 「太簡單」 click SHALL remain `true` indefinitely.

The Dexie v17 migration SHALL NOT backfill `everWrong` on pre-existing rows. Rows existing before the migration retain `everWrong = false` until the next write touches them.

The R2 `m2` bundle schema_version SHALL bump from `1` to `2` in this change. The bundle's `questionHistory` adapter SHALL pass through the `everWrong` field on serialize. On deserialize, missing `everWrong` (from older payloads) SHALL be treated as `false`.

The `questionHistory` adapter's `applyToLocal` (or equivalent merge function) SHALL implement **last-explicit-write-wins** semantics for the `everWrong` field — distinct from the prior monotonic-OR behavior. The merge SHALL use the row's `lastAnsweredAt` as the LWW timestamp for `everWrong` alongside all other SRS / answer fields (uniform row-level LWW). Concretely: the row whose `lastAnsweredAt` is more recent dictates the final `everWrong` value (regardless of whether the value is `true` or `false`).

This intentionally permits cross-device `true → false` propagation: when device A writes `everWrong = false` via 「太簡單」 click (which also updates `lastAnsweredAt` to `now`), the next sync push delivers that newer timestamp to device B; on pull, device B's older `everWrong = true` is overwritten by the newer `false`.

To prevent a stale-clock device from inadvertently revoking a fresh `everWrong = true`, write paths SHALL always update `lastAnsweredAt = Date.now()` whenever `everWrong` is mutated (both `recordWrongAnswer` setting `true` and 「太簡單」 setting `false`). This couples the field to the canonical row timestamp.

#### Scenario: First wrong answer sets everWrong to true

- **GIVEN** the player has no `questionHistory` row for question `Q_A`
- **WHEN** the player selects an incorrect option for `Q_A` and `recordWrongAnswer` writes the row
- **THEN** the row SHALL exist with `lastResult = 'wrong'`, `attempts = 1`, `everWrong = true`, `lastAnsweredAt = now`

#### Scenario: Subsequent correct answer preserves everWrong (default path)

- **GIVEN** `questionHistory[Q_A] = { lastResult: 'wrong', attempts: 1, correctCount: 0, everWrong: true }`
- **WHEN** the player answers `Q_A` correctly via default path (no 「太簡單」 click) and `recordCorrectAnswer` writes the row
- **THEN** the row SHALL update to `{ lastResult: 'correct', attempts: 2, correctCount: 1, everWrong: true, lastAnsweredAt: now }`
- **AND** `everWrong` SHALL remain `true`

#### Scenario: 「太簡單」 click clears everWrong (explicit player action)

- **GIVEN** `questionHistory[Q_B] = { lastResult: 'wrong', attempts: 3, correctCount: 0, everWrong: true, lastAnsweredAt: T_old }`
- **WHEN** the player answers `Q_B` correctly AND clicks 「太簡單」
- **THEN** the row SHALL update to `{ lastResult: 'correct', attempts: 4, correctCount: 1, everWrong: false, lastAnsweredAt: now, interval: round(prev × 3), easeFactor: prev × 1.5 }`
- **AND** `Q_B` SHALL no longer appear in the 「歷史曾錯」 sub-view
- **AND** `Q_B` SHALL no longer appear in the 「目前未答對」 sub-view (because `lastResult = 'correct'`)

#### Scenario: 「我亂猜的」 click does NOT clear everWrong

- **GIVEN** `questionHistory[Q_C] = { lastResult: 'wrong', everWrong: true }`
- **WHEN** the player answers `Q_C` correctly AND clicks 「我亂猜的」 (not 「太簡單」)
- **THEN** the row SHALL update to `{ lastResult: 'correct', everWrong: true, interval: 1 }`
- **AND** `everWrong` SHALL remain `true`
- **AND** `Q_C` SHALL still appear in the 「歷史曾錯」 sub-view (with 「✅ 已答對」 chip)

#### Scenario: Player who never got Q wrong has everWrong false

- **GIVEN** `questionHistory[Q_D]` has been written only via `recordCorrectAnswer` (correct on first attempt)
- **THEN** `questionHistory[Q_D].everWrong` SHALL equal `false`

#### Scenario: Migration v17 does not backfill historical wrong-answer rows

- **GIVEN** before this change the player had `questionHistory[Q_E] = { lastResult: 'wrong', attempts: 3 }` (no `everWrong` column existed)
- **WHEN** the v17 migration runs on app upgrade
- **THEN** `questionHistory[Q_E]` SHALL be `{ lastResult: 'wrong', attempts: 3, everWrong: false }` (`everWrong` defaulted on insert, not backfilled)
- **AND** `Q_E` SHALL still appear in the 「目前未答對」 sub-view (because `lastResult === 'wrong'`)

#### Scenario: Cross-device 「太簡單」 click propagates clear

- **GIVEN** device A and device B are both signed in
- **AND** `questionHistory[Q_F]` on both devices = `{ lastResult: 'wrong', everWrong: true, lastAnsweredAt: T_old }`
- **WHEN** the player on device A answers `Q_F` correctly AND clicks 「太簡單」
- **AND** device A writes `{ lastResult: 'correct', everWrong: false, lastAnsweredAt: T_new }` (T_new > T_old)
- **AND** the sync engine pushes the m2 bundle to R2
- **AND** device B pulls
- **THEN** device B's `questionHistory[Q_F].everWrong` SHALL equal `false` (last-explicit-write-wins via row-level LWW)
- **AND** the 「歷史曾錯」 sub-view on device B SHALL no longer contain `Q_F`

#### Scenario: Stale-clock device cannot revoke a fresh everWrong=true

- **GIVEN** device A has `questionHistory[Q_G] = { lastResult: 'wrong', everWrong: true, lastAnsweredAt: T_now }`
- **AND** device B has a stale local clock reporting `T_stale < T_now`
- **AND** device B writes `{ lastResult: 'wrong', everWrong: true, lastAnsweredAt: T_stale }` (T_stale older)
- **WHEN** the sync engine merges
- **THEN** the row SHALL retain device A's `lastAnsweredAt = T_now` and `everWrong = true` (LWW wins for newer timestamp)
- **AND** device B's stale write SHALL lose the LWW resolution

#### Scenario: Pre-2026-05-25 monotonic-OR clients pulling v2 bundles handle the change gracefully

- **GIVEN** an older client running pre-this-change build (which expects monotonic-OR merge for `everWrong`)
- **WHEN** the older client pulls a v2 bundle containing a row with `everWrong = false` (written by a 「太簡單」 click on a newer client)
- **THEN** the older client SHALL apply the field per its monotonic-OR logic (existing `true` || incoming `false` = `true` — older client keeps its local `true`)
- **AND** the divergence SHALL self-heal on the older client's next upgrade (the LWW logic ships and the next pull resolves correctly)
- **AND** no error SHALL be thrown
