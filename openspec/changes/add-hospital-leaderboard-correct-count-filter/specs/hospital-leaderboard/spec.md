## MODIFIED Requirements

### Requirement: Four filter tabs for ranking criteria

The leaderboard UI SHALL provide **five** filter tabs that determine the ranking criterion. The default tab SHALL be「綜合排名」. Switching tabs SHALL update the displayed ranking without re-querying if the data is already cached client-side for the current hour.

| Tab order | Tab | Sort key |
|---|---|---|
| 1 | 綜合排名 | hospital_tier DESC, reputation DESC, doctor_count DESC |
| 2 | 答對總題數排名 | total_correct DESC |
| 3 | 聲望排名 | reputation DESC |
| 4 | 醫師個數排名 | doctor_count DESC |
| 5 | 累積唸書時間排名 | total_study_min DESC |

The「答對總題數排名」tab SHALL render at position 2 in the tab strip — immediately after「綜合排名」and before「聲望排名」— so that the most recently added discovery surface sits next to the default tab rather than at the far edge of the strip.

#### Scenario: Default tab is 綜合排名

- **WHEN** the player opens the leaderboard tab for the first time within a session
- **THEN** the「綜合排名」tab SHALL be selected by default and its rows displayed first

#### Scenario: Switching filter tabs updates the displayed ranking

- **WHEN** the player clicks the「聲望排名」tab
- **THEN** the displayed top-100 list SHALL re-order by `reputation DESC` from the same hourly snapshot, and the player's own my-rank chip SHALL update to show their reputation-only rank

#### Scenario: Composite ranking tie-breaker order

- **WHEN** two players have identical hospital_tier and reputation in the 綜合排名 tab
- **THEN** the player with higher doctor_count SHALL rank above the other; if doctor_count also ties, ordering between the tied players MAY be arbitrary but MUST be stable within a single snapshot

#### Scenario: Answer-count tab orders by total_correct

- **WHEN** the player clicks the「答對總題數排名」tab
- **THEN** the displayed top-100 list SHALL re-order by `total_correct DESC` from the same hourly snapshot, and the my-rank chip SHALL update to show the player's rank within the `correct` filter; the「答對總題數」column SHALL be bolded as the primary stat in this tab

### Requirement: Server-side LWW and sanity bounds

The Worker `/leaderboard/upsert` endpoint SHALL enforce last-write-wins semantics using `updated_at` (millisecond epoch) and SHALL reject payloads whose values fall outside known sanity bounds: `hospital_tier ∈ [1, 3]`, `reputation ≥ 0`, `doctor_count ∈ [0, 50]`, `total_study_min ≥ 0`, `total_correct ≥ 0`. Rejected payloads SHALL log a structured warning but MUST NOT surface a UI error to the player (silent server-side filtering). The `total_correct` field MAY be omitted from the payload by older clients; in that case it SHALL be treated as `0` for forward-compatibility during the rollout window.

#### Scenario: Older updated_at rejected

- **WHEN** an upsert arrives with `updated_at` older than the existing D1 row's `updated_at`
- **THEN** the Worker SHALL leave the existing row unchanged and respond `200 OK`（避免 client retry storm）

#### Scenario: Out-of-bounds hospital_tier rejected

- **WHEN** an upsert arrives with `hospital_tier = 4` or `hospital_tier = 0`
- **THEN** the Worker SHALL discard the upsert, log a structured warning with the offending user_id, and respond `200 OK` without writing to D1

#### Scenario: Negative total_correct rejected

- **WHEN** an upsert arrives with `total_correct = -1` or `total_correct = NaN`
- **THEN** the Worker SHALL discard the upsert, log a structured warning `"[leaderboard] dropped upsert: correct oob"` with the offending user_id and value, and respond `200 OK` with `dropped: "correct_oob"` without writing to D1

#### Scenario: Missing total_correct in legacy client payload defaults to 0

- **WHEN** a client whose JS bundle predates this change pushes an upsert without the `total_correct` field
- **THEN** the Worker SHALL treat the missing field as `0` and persist the row with `total_correct = 0`, allowing the legacy client to keep syncing the four pre-existing fields while the new field stays at the default until the client bundle refreshes

### Requirement: Push leaderboard row on cloud sync

The system SHALL upsert the player's leaderboard row to D1 via the Worker `POST /leaderboard/upsert` endpoint as part of the existing cloud sync push pipeline. The leaderboard push MUST share the same 3-second debounce window as the R2 bundle push and MUST NOT generate additional standalone network requests outside the sync cycle.

#### Scenario: Cloud sync triggers leaderboard upsert

- **WHEN** an opted-in player completes a gameplay action that triggers cloud sync (e.g. recruits a doctor, completes a study session)
- **THEN** within the next 3-second debounce window the sync engine SHALL POST the current `{user_id, nickname, hospital_tier, reputation, doctor_count, total_study_min, total_correct, is_public, updated_at}` payload to `/leaderboard/upsert` in addition to the R2 bundle push

#### Scenario: Opted-out player still upserts is_public=0

- **WHEN** an opted-out player triggers cloud sync
- **THEN** the leaderboard adapter SHALL still POST to `/leaderboard/upsert` with `is_public: 0`, so that the D1 row remains current if the player re-opens opt-in later, but the row SHALL be excluded from KV snapshots

#### Scenario: Player who never opted in does not push

- **WHEN** an authenticated player who has never opted in triggers cloud sync
- **THEN** the leaderboard adapter SHALL skip the upsert call entirely; no D1 row is created

#### Scenario: total_correct computed from mastery aggregate

- **WHEN** the leaderboard adapter computes the payload for an upsert
- **THEN** the `total_correct` field SHALL equal `Math.max(0, Math.floor(SUM(mastery.correct)))` across all rows in the local Dexie `mastery` table; the adapter SHALL NOT query `questionHistory` for this value

### Requirement: Hourly KV cache refresh

The leaderboard backend SHALL pre-compute the top-100 ranking for each of the **five** filter tabs **twice per hour** via a Worker scheduled cron trigger at minutes `:00` and `:30`. Client read requests SHALL fetch from the KV cache, NOT directly from D1. The system MAY serve a stale snapshot (older than 30 min) if the cron has not yet refreshed, but MUST surface a「上次更新：HH:MM」timestamp in the leaderboard UI.

#### Scenario: 30-min cron pre-computes all five filters

- **WHEN** the Worker scheduled trigger fires at `:00` or `:30` of each hour
- **THEN** the system SHALL run five D1 queries (one per filter) and write the resulting top-100 row arrays to five KV keys (`leaderboard:m2:top100:composite|reputation|doctor|study|correct`), and SHALL log a single line entry for monitoring

#### Scenario: Client read serves KV cache

- **WHEN** a client GETs `/leaderboard/composite` or `/leaderboard/correct`
- **THEN** the Worker SHALL return the value from the matching `leaderboard:m2:top100:<filter>` KV key directly, without querying D1, and include a `last_updated_at` timestamp in the response

#### Scenario: Stale snapshot served on cron failure

- **WHEN** the Worker scheduled cron fails to run for two consecutive scheduled slots
- **THEN** the client SHALL still receive the most recent successful snapshot from KV; the UI SHALL surface the「上次更新：HH:MM」timestamp so the player can detect staleness

## ADDED Requirements

### Requirement: total_correct column persists in D1

The D1 `leaderboard_m2` table SHALL include a `total_correct INTEGER NOT NULL DEFAULT 0` column constrained by `CHECK (total_correct >= 0)`. A partial index `WHERE is_public = 1` SHALL exist on `total_correct DESC` to back the cron's `correct` filter query without a table scan. Existing rows at migration time SHALL receive `total_correct = 0` from the column default; no retroactive backfill from quiz history is required because each opted-in client's next sync push will overwrite the row with the real value.

#### Scenario: Migration adds column without rewriting rows

- **WHEN** the D1 migration `0003_add_total_correct.sql` is applied via `wrangler d1 migrations apply study-rpg-leaderboard --remote`
- **THEN** all existing `leaderboard_m2` rows SHALL gain a `total_correct = 0` column value via SQLite's constant-default fast-path, and the new partial index `idx_leaderboard_m2_total_correct` SHALL be created with the same `WHERE is_public = 1` clause as the other four indexes

#### Scenario: Existing rows surface as zero on the correct tab until next push

- **WHEN** a player who opted in before the migration opens the leaderboard within the first 30-min cron window after migration apply
- **THEN** their row SHALL appear in the「答對總題數排名」tab with `total_correct = 0`; the value SHALL update to the real aggregate after their next `onPushComplete` upsert
