# hospital-leaderboard Specification

## Purpose

Defines the opt-in global leaderboard for 二階 `apps/medexam2-hospital-tw`: a Cloudflare-D1-backed ranking system showing all opted-in players sorted by four criteria (綜合 / 聲望 / 醫師個數 / 累積唸書時間) up to top 100, with hourly KV-cached snapshots refreshed by a Worker scheduled cron. Lives in the Cloudflare data plane (`study-rpg-leaderboard` D1 + `LEADERBOARD_KV`) and integrates with the existing R2 sync engine (shares the 3-second debounce push window). Auth uses the existing Supabase JWT bridge — the Worker only consumes the public JWKS to verify tokens, never reads Supabase data.

Strict opt-in (unchecked consent checkbox + nickname required), case-insensitive unique nicknames (2–12 codepoints), full-trust anti-cheat (sanity bounds only + 「自填無驗證」UI disclosure), and toggle-based opt-out that preserves the D1 row while excluding it from KV snapshots. Account deletion is the only path that removes the leaderboard row entirely.

The capability is independent of the M4 cloud sync data plane and the R2 migration — it does not write any Supabase tables and shares only the existing Cloudflare sync Worker for auth + endpoints.

## Requirements

### Requirement: Opt-in flow on first leaderboard visit

The system SHALL present a one-time opt-in modal the first time an authenticated player opens the leaderboard tab. The modal MUST explicitly list the data fields that will be made public (醫院 tier、聲望、醫師個數、累積唸書時間、暱稱), MUST include an unchecked checkbox labelled「同意公開以上資訊」, and MUST require the checkbox be checked before the "加入排行榜" submit button becomes enabled. The modal MUST NOT auto-submit and MUST NOT pre-check the consent checkbox.

#### Scenario: First-time visit shows opt-in modal

- **WHEN** an authenticated player clicks the「排名」tab and has never previously opted in or declined
- **THEN** the system displays a modal listing the four public fields plus the nickname field, with the consent checkbox unchecked and the submit button disabled

#### Scenario: Consent checkbox gates submission

- **WHEN** the opt-in modal is displayed and the player has not checked the consent checkbox
- **THEN** the「加入排行榜」submit button SHALL be disabled and a tooltip / inline label explains "請先勾選同意才能加入"

#### Scenario: Cancelling opt-in leaves player off the leaderboard

- **WHEN** the player closes the opt-in modal without submitting
- **THEN** no row is written to the leaderboard backend, the leaderboard tab shows a「未加入」empty state for the player's own status row, and the modal will re-appear on the next visit until the player either opts in or explicitly dismisses via "不再顯示"

### Requirement: Nickname selection during opt-in

The system SHALL require the player to provide a display nickname during the opt-in flow. The nickname MUST be 2 to 12 Unicode codepoints in length (`[...str].length`), MUST be case-insensitive unique across all opted-in players (e.g. `wlk` collides with `WLK` and `Wlk`), and MAY be left blank — in which case the system falls back to the player's Google display name. The nickname MUST be uniqueness-checked against the backend with a debounced async call before submission, and the system MUST reject submission if the nickname is already taken at submit time.

#### Scenario: Nickname under 2 codepoints rejected

- **WHEN** the player enters a nickname of length 0 or 1 codepoint and the nickname field is non-blank
- **THEN** the field SHALL show an inline error "暱稱長度需 2–12 字元" and submission SHALL be blocked

#### Scenario: Nickname over 12 codepoints rejected

- **WHEN** the player enters a nickname of length > 12 Unicode codepoints
- **THEN** the field SHALL show "暱稱長度需 2–12 字元" and submission SHALL be blocked

#### Scenario: Case-insensitive uniqueness collision

- **WHEN** the player enters「WLK」and another opted-in player's stored nickname is「wlk」
- **THEN** the debounced uniqueness check SHALL return "已被使用" and the field SHALL display the error inline

#### Scenario: Blank nickname falls back to Google display name

- **WHEN** the player leaves the nickname field blank and submits
- **THEN** the system SHALL persist the player's Google display name as the leaderboard `nickname` value, subject to the same length and uniqueness rules; if the Google name violates these rules, the system SHALL block submission and prompt the player to set a custom nickname

#### Scenario: Nickname is changeable post opt-in

- **WHEN** an opted-in player edits their nickname via the settings panel
- **THEN** the new nickname SHALL be subject to the same length and uniqueness checks, and on save SHALL update both the local profile and the next D1 upsert; there SHALL be no cooldown or rate limit on nickname changes

### Requirement: Four filter tabs for ranking criteria

The leaderboard UI SHALL provide four filter tabs that determine the ranking criterion. The default tab SHALL be「綜合排名」. Switching tabs SHALL update the displayed ranking without re-querying if the data is already cached client-side for the current hour.

| Tab | Sort key |
|---|---|
| 綜合排名 | hospital_tier DESC, reputation DESC, doctor_count DESC |
| 聲望排名 | reputation DESC |
| 醫師個數排名 | doctor_count DESC |
| 累積唸書時間排名 | total_study_min DESC |

#### Scenario: Default tab is 綜合排名

- **WHEN** the player opens the leaderboard tab for the first time within a session
- **THEN** the「綜合排名」tab SHALL be selected by default and its rows displayed first

#### Scenario: Switching filter tabs updates the displayed ranking

- **WHEN** the player clicks the「聲望排名」tab
- **THEN** the displayed top-100 list SHALL re-order by `reputation DESC` from the same hourly snapshot, and the player's own my-rank chip SHALL update to show their reputation-only rank

#### Scenario: Composite ranking tie-breaker order

- **WHEN** two players have identical hospital_tier and reputation in the 綜合排名 tab
- **THEN** the player with higher doctor_count SHALL rank above the other; if doctor_count also ties, ordering between the tied players MAY be arbitrary but MUST be stable within a single snapshot

### Requirement: Top 100 list plus my-rank chip

The leaderboard UI SHALL display up to 100 ranked rows for the active filter, in a single scrollable list without pagination. The player's own current rank SHALL be displayed as a sticky chip element regardless of whether the player's row appears within the visible top 100.

#### Scenario: Top 100 displayed when ≥ 100 opted-in players

- **WHEN** the leaderboard backend has ≥ 100 opted-in players and the player views any filter tab
- **THEN** the UI SHALL display 100 rows in a single scrollable list

#### Scenario: All rows displayed when < 100 opted-in players

- **WHEN** the leaderboard backend has fewer than 100 opted-in players
- **THEN** the UI SHALL display all available rows and SHALL show a counter「目前 N 位玩家加入排行」at the top or bottom of the list

#### Scenario: My-rank chip shows when player is opted in

- **WHEN** an opted-in player views any filter tab
- **THEN** a sticky chip SHALL display「你目前第 X 名 (共 N 人)」using the player's rank in the active filter; if the player is outside the top 100, the chip remains visible while scrolling the list

#### Scenario: My-rank chip hidden when player is opted out

- **WHEN** a player has not opted in (or has opted out)
- **THEN** the my-rank chip SHALL be hidden and an explanation「未加入排行 — 至「設定」開啟以參與」SHALL be shown in its place

### Requirement: Hourly KV cache refresh

The leaderboard backend SHALL pre-compute the top-100 ranking for each of the four filter tabs once per hour via a Worker scheduled cron trigger at minute `:00`. Client read requests SHALL fetch from the KV cache, NOT directly from D1. The system MAY serve a stale snapshot (older than 1 hour) if the cron has not yet refreshed, but MUST surface a「上次更新：HH:MM」timestamp in the leaderboard UI.

#### Scenario: Hourly cron pre-computes all four filters

- **WHEN** the Worker scheduled trigger fires at `:00` of each hour
- **THEN** the system SHALL run four D1 queries (one per filter) and write the resulting top-100 row arrays to four KV keys (`leaderboard:m2:top100:composite|reputation|doctor|study`), and SHALL log a single line entry for monitoring

#### Scenario: Client read serves KV cache

- **WHEN** a client GETs `/leaderboard/composite`
- **THEN** the Worker SHALL return the value from `leaderboard:m2:top100:composite` KV key directly, without querying D1, and include a `last_updated_at` timestamp in the response

#### Scenario: Stale snapshot served on cron failure

- **WHEN** the Worker scheduled cron fails to run for two consecutive hours
- **THEN** the client SHALL still receive the most recent successful snapshot from KV; the UI SHALL surface the「上次更新：HH:MM」timestamp so the player can detect staleness

### Requirement: Push leaderboard row on cloud sync

The system SHALL upsert the player's leaderboard row to D1 via the Worker `POST /leaderboard/upsert` endpoint as part of the existing cloud sync push pipeline. The leaderboard push MUST share the same 3-second debounce window as the R2 bundle push and MUST NOT generate additional standalone network requests outside the sync cycle.

#### Scenario: Cloud sync triggers leaderboard upsert

- **WHEN** an opted-in player completes a gameplay action that triggers cloud sync (e.g. recruits a doctor, completes a study session)
- **THEN** within the next 3-second debounce window the sync engine SHALL POST the current `{user_id, nickname, hospital_tier, reputation, doctor_count, total_study_min, is_public, updated_at}` payload to `/leaderboard/upsert` in addition to the R2 bundle push

#### Scenario: Opted-out player still upserts is_public=0

- **WHEN** an opted-out player triggers cloud sync
- **THEN** the leaderboard adapter SHALL still POST to `/leaderboard/upsert` with `is_public: 0`, so that the D1 row remains current if the player re-opens opt-in later, but the row SHALL be excluded from KV snapshots

#### Scenario: Player who never opted in does not push

- **WHEN** an authenticated player who has never opted in triggers cloud sync
- **THEN** the leaderboard adapter SHALL skip the upsert call entirely; no D1 row is created

### Requirement: Server-side LWW and sanity bounds

The Worker `/leaderboard/upsert` endpoint SHALL enforce last-write-wins semantics using `updated_at` (millisecond epoch) and SHALL reject payloads whose values fall outside known sanity bounds: `hospital_tier ∈ [1, 3]`, `reputation ≥ 0`, `doctor_count ∈ [0, 50]`, `total_study_min ≥ 0`. Rejected payloads SHALL log a structured warning but MUST NOT surface a UI error to the player (silent server-side filtering).

#### Scenario: Older updated_at rejected

- **WHEN** an upsert arrives with `updated_at` older than the existing D1 row's `updated_at`
- **THEN** the Worker SHALL leave the existing row unchanged and respond `200 OK`（避免 client retry storm）

#### Scenario: Out-of-bounds hospital_tier rejected

- **WHEN** an upsert arrives with `hospital_tier = 4` or `hospital_tier = 0`
- **THEN** the Worker SHALL discard the upsert, log a structured warning with the offending user_id, and respond `200 OK` without writing to D1

### Requirement: Opt-out hides row without deletion

The system SHALL provide a「公開到排行榜」toggle in the settings panel. When toggled off, the system SHALL POST to `/leaderboard/opt-out` which sets `is_public = 0` for the player's D1 row. Subsequent KV snapshots MUST exclude `is_public = 0` rows. The D1 row itself MUST be preserved so the player can re-enable opt-in without losing rank history.

#### Scenario: Toggling opt-out hides player from snapshots

- **WHEN** an opted-in player turns off the「公開到排行榜」toggle
- **THEN** the next hourly KV refresh SHALL exclude this player's row from all four filter snapshots, and the player's my-rank chip SHALL switch to「未加入排行」state

#### Scenario: Re-enabling opt-in restores ranking

- **WHEN** an opted-out player turns the toggle back on
- **THEN** the leaderboard adapter SHALL POST `is_public = 1` on next sync, and the player SHALL appear in the next hourly KV snapshot without re-entering nickname or re-consenting

### Requirement: Account deletion removes leaderboard row

The system SHALL extend the existing `delete_my_account()` flow so that when a player triggers account deletion, the D1 leaderboard row for that `user_id` SHALL also be deleted. The deletion MUST be irreversible from the player's perspective — re-creating an account starts fresh on the leaderboard.

#### Scenario: Account deletion triggers leaderboard row delete

- **WHEN** a player triggers `delete_my_account` from the settings panel
- **THEN** within the same atomic flow, the Worker SHALL `DELETE /leaderboard/me` to remove the D1 row, and the next KV snapshot MUST NOT contain the deleted user_id

### Requirement: Privacy and integrity disclosures

The leaderboard UI footer SHALL display, at all times when the leaderboard list is visible, two disclosure lines:

1.「資料為玩家本機記錄、自填無驗證」(integrity disclosure — anti-cheat policy)
2.「累積唸書計時自 V6（YYYY-MM-DD）起算；之前的時間不計」(V6 migration disclosure)

The opt-in modal MUST additionally surface a link to a「隱私說明」section explaining what is stored, who can see it, and how to opt out / delete.

#### Scenario: Footer integrity disclosure always visible

- **WHEN** the leaderboard list is rendered on any filter tab
- **THEN** both disclosure lines SHALL be visible at the bottom of the page, not requiring scroll past the list to surface

#### Scenario: Opt-in modal links to privacy section

- **WHEN** the opt-in modal is displayed
- **THEN** the modal SHALL include a「了解更多 — 隱私說明」link that expands an inline section (or opens a sub-modal) explaining the privacy model, opt-out, and deletion paths

### Requirement: Nickname uniqueness check endpoint

The Worker SHALL expose a `GET /leaderboard/nickname-check?n=<candidate>` endpoint that returns whether the proposed nickname is available (case-insensitively). The client SHALL debounce calls to this endpoint with a 400ms delay after the last keystroke. The endpoint MUST be authenticated (Supabase JWT in header) to prevent unauthenticated enumeration of nicknames.

#### Scenario: Available nickname returns ok

- **WHEN** the client GETs `/leaderboard/nickname-check?n=newname` and no existing row has `nickname_lower = 'newname'`
- **THEN** the Worker SHALL respond `{"available": true}` with `200 OK`

#### Scenario: Taken nickname returns conflict

- **WHEN** the client GETs `/leaderboard/nickname-check?n=WLK` and an existing row has `nickname_lower = 'wlk'`
- **THEN** the Worker SHALL respond `{"available": false}` with `200 OK`

#### Scenario: Unauthenticated request rejected

- **WHEN** the endpoint receives a request without a valid Supabase JWT in the Authorization header
- **THEN** the Worker SHALL respond `401 Unauthorized` without executing the D1 query
