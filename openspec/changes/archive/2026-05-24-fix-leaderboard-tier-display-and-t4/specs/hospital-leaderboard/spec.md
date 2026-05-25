## MODIFIED Requirements

### Requirement: Top 100 list plus my-rank chip

The leaderboard UI SHALL display up to 100 ranked rows for the active filter as a **pixel-art tabular grid** (not an unstyled list), rendering one row per opted-in player with one cell per data attribute (rank / nickname / hospital tier / reputation / doctor count / total study minutes). The hospital tier cell SHALL render the canonical short label (「診所 / 區域 / 醫中 / 大廟」) via the shared `tierLabel()` helper from `apps/medexam2-hospital-tw/src/lib/tier-labels.ts`, NOT the raw integer (`T1` / `T2` / `T3` / `T4`). The grid SHALL use the existing pixel design tokens (`--frame-dark` border, `--accent-gold` highlight, Cubic 11 font for nicknames and numeric stats) so the visual style matches the rest of the 二階 hospital UI shell. The player's own current rank SHALL remain accessible regardless of scroll position via either the existing sticky top chip OR a new sticky-bottom "my row" repeat that mirrors the user's row data.

#### Scenario: Top 100 displayed when ≥ 100 opted-in players

- **WHEN** the leaderboard backend has ≥ 100 opted-in players and the player views any filter tab
- **THEN** the UI SHALL display 100 rows in a single scrollable tabular grid where each row aligns its cells vertically with the row above and below

#### Scenario: All rows displayed when < 100 opted-in players

- **WHEN** the leaderboard backend has fewer than 100 opted-in players
- **THEN** the UI SHALL display all available rows and SHALL show a counter「目前 N 位玩家加入排行」 at the top or bottom of the grid

#### Scenario: Rank 1 / 2 / 3 visually distinguished

- **WHEN** any row's display rank is 1, 2, or 3
- **THEN** that row's rank cell SHALL be styled with gold (rank 1) / silver (rank 2) / bronze (rank 3) accent color and pixel-art emboss, distinct from the default frame color used by ranks 4–100

#### Scenario: My-row visually highlighted when present in top 100

- **WHEN** the current authenticated user's `user_id` matches one of the rows in the active filter's top 100
- **THEN** that row SHALL be highlighted with `--accent-gold` border (or equivalent pixel design token) so the user can spot themselves at a glance while scrolling

#### Scenario: My-rank chip shows when player is opted in

- **WHEN** an opted-in player views any filter tab
- **THEN** a chip SHALL display「你目前第 X 名 (共 N 人)」using the player's rank in the active filter; if the player's row is scrolled offscreen the chip MAY be pinned (e.g., via `position: sticky` or a sticky-bottom repeat row that mirrors the player's data) so it stays visible while scrolling the grid

#### Scenario: My-rank chip hidden when player is opted out

- **WHEN** a player has not opted in (or has opted out)
- **THEN** the my-rank chip SHALL be hidden and an explanation「未加入排行 — 至「設定」開啟以參與」 SHALL be shown in its place

#### Scenario: Mobile viewport prioritizes essential columns

- **WHEN** the leaderboard page is rendered at viewport width < 768 px
- **THEN** the grid SHALL show at minimum: rank, nickname, the **active filter's primary stat** bolded, and one secondary stat; non-essential columns MAY be hidden via CSS to prevent horizontal overflow; the row order and underlying row data MUST remain identical to the desktop layout

#### Scenario: Empty state preserved

- **WHEN** the active filter's snapshot has zero rows
- **THEN** the existing message「期待第一個上榜的玩家！」 SHALL render in place of the grid; no empty grid frame SHALL appear

#### Scenario: Tier cell renders canonical short label

- **WHEN** a leaderboard row has `hospital_tier = 1` (or `2` / `3` / `4`)
- **THEN** the tier cell SHALL render「診所」(or「區域」/「醫中」/「大廟」respectively) via `tierLabel(NUM_TO_TIER[row.hospital_tier])`, NOT the literal string `T1` / `T2` / `T3` / `T4`; if `hospital_tier` is outside the supported range the cell SHALL fall back to「診所」and log a `console.warn`, so a single malformed row never crashes the entire leaderboard tab

### Requirement: Server-side LWW and sanity bounds

The Worker `/leaderboard/upsert` endpoint SHALL enforce last-write-wins semantics using `updated_at` (millisecond epoch) and SHALL reject payloads whose values fall outside known sanity bounds: `hospital_tier ∈ [1, 4]`, `reputation ≥ 0`, `doctor_count ∈ [0, 50]`, `total_study_min ≥ 0`. Rejected payloads SHALL log a structured warning but MUST NOT surface a UI error to the player (silent server-side filtering). The D1 table `leaderboard_m2` SHALL declare `CHECK (hospital_tier BETWEEN 1 AND 4)` as defence-in-depth so any divergence between Worker bound and schema is caught at the database layer.

#### Scenario: Older updated_at rejected

- **WHEN** an upsert arrives with `updated_at` older than the existing D1 row's `updated_at`
- **THEN** the Worker SHALL leave the existing row unchanged and respond `200 OK`（避免 client retry storm）

#### Scenario: Out-of-bounds hospital_tier rejected

- **WHEN** an upsert arrives with `hospital_tier = 5` or `hospital_tier = 0`
- **THEN** the Worker SHALL discard the upsert, log a structured warning with the offending user_id, and respond `200 OK` without writing to D1

#### Scenario: T4 (大廟) hospital_tier accepted

- **WHEN** an upsert arrives with `hospital_tier = 4` and all other fields are within bounds
- **THEN** the Worker SHALL accept the payload, upsert the D1 row with `hospital_tier = 4`, and the next KV snapshot refresh SHALL include this row sortable as a distinct tier above `hospital_tier = 3` rows in the composite filter
