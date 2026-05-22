## MODIFIED Requirements

### Requirement: Hourly KV cache refresh

The leaderboard backend SHALL pre-compute the top-100 ranking for each of the four filter tabs **twice per hour** via a Worker scheduled cron trigger at minutes `:00` and `:30`. Client read requests SHALL fetch from the KV cache, NOT directly from D1. The system MAY serve a stale snapshot (older than 30 min) if the cron has not yet refreshed, but MUST surface a「上次更新：HH:MM」timestamp in the leaderboard UI.

#### Scenario: 30-min cron pre-computes all four filters

- **WHEN** the Worker scheduled trigger fires at `:00` or `:30` of each hour
- **THEN** the system SHALL run four D1 queries (one per filter) and write the resulting top-100 row arrays to four KV keys (`leaderboard:m2:top100:composite|reputation|doctor|study`), and SHALL log a single line entry for monitoring

#### Scenario: Client read serves KV cache

- **WHEN** a client GETs `/leaderboard/composite`
- **THEN** the Worker SHALL return the value from `leaderboard:m2:top100:composite` KV key directly, without querying D1, and include a `last_updated_at` timestamp in the response

#### Scenario: Stale snapshot served on cron failure

- **WHEN** the Worker scheduled cron fails to run for two consecutive scheduled slots
- **THEN** the client SHALL still receive the most recent successful snapshot from KV; the UI SHALL surface the「上次更新：HH:MM」timestamp so the player can detect staleness
