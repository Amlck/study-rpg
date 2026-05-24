## MODIFIED Requirements

### Requirement: Push leaderboard row on cloud sync

The system SHALL upsert the player's leaderboard row to D1 via the Worker `POST /leaderboard/upsert` endpoint as part of the existing cloud sync push pipeline. The leaderboard push MUST share the same 3-second debounce window as the R2 bundle push and MUST NOT generate additional standalone network requests outside the sync cycle.

#### Scenario: Cloud sync triggers leaderboard upsert

- **WHEN** an opted-in player completes a gameplay action that triggers cloud sync (e.g. recruits a doctor, completes a study session)
- **THEN** within the next 3-second debounce window the sync engine SHALL POST the current `{user_id, nickname, hospital_tier, reputation, doctor_count, total_study_min, total_correct, is_public, updated_at}` payload to `/leaderboard/upsert` in addition to the R2 bundle push

#### Scenario: total_correct computed from questionHistory aggregate

- **WHEN** the leaderboard adapter computes the payload for an upsert
- **THEN** the `total_correct` field SHALL equal `Math.max(0, Math.floor(SUM(questionHistory.correctCount)))` across all rows in the local Dexie `questionHistory` table; the adapter SHALL NOT read from `mastery.correct` for this value because `mastery.correct` carries a partner-specialty multiplier weighting that does not match the player's intuitive「答對總題數」count, and `mastery` upserts were historically subject to outer-transaction rollback regressions that left `questionHistory` as the more reliable source

#### Scenario: Opted-out player still upserts is_public=0

- **WHEN** an opted-out player triggers cloud sync
- **THEN** the leaderboard adapter SHALL still POST to `/leaderboard/upsert` with `is_public: 0`, so that the D1 row remains current if the player re-opens opt-in later, but the row SHALL be excluded from KV snapshots

#### Scenario: Player who never opted in does not push

- **WHEN** an authenticated player who has never opted in triggers cloud sync
- **THEN** the leaderboard adapter SHALL skip the upsert call entirely; no D1 row is created
