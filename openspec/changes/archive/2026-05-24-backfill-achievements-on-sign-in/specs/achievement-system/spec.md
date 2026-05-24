## ADDED Requirements

### Requirement: Silent backfill of pre-existing achievement state on every sync pull cycle

When the sync engine's `onPullComplete` callback fires (after every successful pull cycle, including cold-start force-pull and visibility-change incremental pull), the client SHALL evaluate all entries in the `ACHIEVEMENTS` catalog against the current Dexie state via `listUnlockedAchievements(player, stats, ACHIEVEMENTS)`, diff the result against IDs currently present in the local `achievements` table, and `bulkPut()` any unlocked-but-missing rows with `notificationShown: true`. The backfill SHALL NOT dispatch any reward (cosmetic intent log, title append, badge no-op), SHALL NOT push to the achievement toast queue, and SHALL NOT trigger the full-screen unlock modal for P1 tier rows. The complementary unlock-detection flow at `services/achievement-reward.ts` (diff-based, transition-driven) remains unchanged and continues to fire toasts + reward dispatch for **new** transitions during gameplay.

**Rationale**: The diff-based unlock detection at `services/achievement-reward.ts:104` only writes a Dexie row when `checkAchievementUnlocks` detects a transition from `false → true` between two consecutive `buildAchievementStats()` snapshots. Players whose stats already satisfy a predicate before the catalog ships (e.g., past 5 hours of reading or 50 quiz correct) never experience that transition — both snapshots evaluate to `true` — so no row is ever written, and `deriveAchievementSnapshot()` returns empty `badges_csv` for them. Verified live 2026-05-24: 9 of 10 leaderboard rows had `badges_csv: ""` despite players clearly past multiple thresholds. The silent backfill closes this gap retroactively without spamming users with toasts for accomplishments they don't remember earning.

#### Scenario: First pull after deploy backfills missing rows for pre-existing player

- **GIVEN** a player whose Dexie state shows `totalStudyMinutes: 1004`, `totalDoctorsRecruited: 48`, `currentHospitalTier: '醫學中心'`
- **AND** the local `achievements` table is empty (player was active before achievement system shipped)
- **WHEN** the sync engine completes a successful pull cycle and fires `onPullComplete`
- **THEN** the backfill service SHALL call `listUnlockedAchievements(player, stats, ACHIEVEMENTS)` and identify all entries whose predicate returns `true` given the current state
- **AND** the service SHALL `bulkPut()` each matching entry as `{id, unlockedAt: Date.now(), notificationShown: true}` into the `achievements` table
- **AND** no `dispatchReward` call SHALL fire for any backfilled row
- **AND** no `achievementToastQueue.push` call SHALL fire for any backfilled row
- **AND** the next debounced sync push SHALL include the new rows via the existing `ACHIEVEMENTS` table adapter, and the subsequent `onPushComplete` leaderboard upsert SHALL upload the now-populated `badges_csv`

#### Scenario: Subsequent pull cycles short-circuit when nothing to backfill

- **GIVEN** the backfill has already populated the `achievements` table on a previous pull cycle
- **AND** no new achievements have become eligible since the last backfill
- **WHEN** a subsequent `onPullComplete` callback fires
- **THEN** the backfill service SHALL compute `missing = unlockedNow.filter(a => !existingIds.has(a.id))` and find `missing.length === 0`
- **AND** the service SHALL return `0` without invoking `bulkPut`
- **AND** total per-call overhead SHALL be bounded by one transactional Dexie read in `buildAchievementStats()` plus a 49-entry catalog scan (< 500ms typical)

#### Scenario: Backfill never overwrites a row that has notificationShown: false

- **GIVEN** the diff-based unlock-detection flow at `services/achievement-reward.ts` has already written a row for achievement `study-hours-5` with `notificationShown: false` (pending toast queue display)
- **WHEN** the backfill service runs and sees `study-hours-5` in `listUnlockedAchievements`
- **THEN** the backfill SHALL detect `existingIds.has('study-hours-5') === true` and skip it
- **AND** the row's `notificationShown` flag SHALL remain `false` so the pending toast display proceeds normally on next consumer pump

#### Scenario: Backfill error does not break the pull cycle

- **GIVEN** the `onPullComplete` callback chain in `useSync.ts` runs `checkAssignmentInvariants()` followed by `backfillAchievementsFromCurrentStats()`
- **WHEN** the backfill call throws (e.g., transient Dexie transaction failure during `buildAchievementStats`)
- **THEN** the error SHALL be caught at the call site and logged via `console.warn` with the `[achievement-backfill]` channel prefix
- **AND** the pull cycle SHALL be considered complete; sync status SHALL transition to `idle` normally
- **AND** no error toast SHALL surface to the user
- **AND** the next pull cycle SHALL retry the backfill

#### Scenario: Backfill covers subject-master entries for subject_mastery_count derivation

- **GIVEN** a player whose `questionHistory` table shows that all 1306 內科 questions have at least one attempt, all 710 小兒科 questions also fully attempted, but 婦產科 only 200 / 644 attempted
- **AND** the `achievements` table contains no `subject-master-*` rows
- **WHEN** `onPullComplete` fires and backfill runs
- **THEN** the backfill SHALL add `subject-master-內科` and `subject-master-小兒科` rows (predicate true for both, false for 婦產科)
- **AND** the subsequent `deriveAchievementSnapshot()` call SHALL return `subject_mastery_count: 2`
- **AND** the next leaderboard upsert SHALL push `subject_mastery_count: 2` to the Worker, surfacing as `🩺 2/14` chip on the public LeaderboardPage

#### Scenario: Backfill timestamps reflect backfill time, not original threshold-crossing time

- **GIVEN** a player who first crossed the `totalStudyMinutes >= 300` threshold on 2026-04-01 (before the achievement system shipped)
- **WHEN** the backfill runs on 2026-05-25
- **THEN** the inserted `achievements` row SHALL have `unlockedAt: <Date.now()>` reflecting the backfill moment, NOT the historical 2026-04-01 timestamp
- **AND** this is an acceptable trade-off — the original crossing event was not recorded; the system has no way to reconstruct it. The AchievementsPage MAY display the backfill timestamp as the unlock date without further qualification.
