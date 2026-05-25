## ADDED Requirements

### Requirement: Opt-in modal SHALL gate leaderboard participation with consent checkbox and nickname

The system SHALL present a one-time opt-in modal the first time an authenticated player opens the neurons-tw `/leaderboard` tab. The modal SHALL:

- Explicitly list the five public fields that will be visible to other players: 變體收集數量 (`variant_count`) / 完整集齊家族數 (`family_complete`) / Action Potential 總量 (`total_AP`) / Strong Synapse 數 (`synapse_strong`) / 累積唸書時間 (`total_study_min`) — plus the chosen 暱稱 (`nickname`)
- Include an unchecked checkbox labelled「同意公開以上資訊」; the「加入排行榜」submit button SHALL remain disabled until the checkbox is checked
- Include a nickname input with inline length + uniqueness validation
- Include a「了解更多 — 隱私說明」link that expands an inline section explaining what is stored, who can see it, and how to opt out / delete
- NOT auto-submit and NOT pre-check the consent checkbox
- Re-appear on subsequent visits until the player either successfully opts in or explicitly dismisses via「不再顯示」

#### Scenario: First-time visit shows opt-in modal

- **WHEN** an authenticated player clicks the「排名」tab and has never previously opted in or declined
- **THEN** the system displays the opt-in modal listing the 5 public fields plus the nickname field, with the consent checkbox unchecked and the submit button disabled

#### Scenario: Consent checkbox gates submission

- **WHEN** the opt-in modal is displayed and the player has not checked the consent checkbox
- **THEN** the「加入排行榜」submit button SHALL be disabled and a tooltip / inline label explains「請先勾選同意才能加入」

#### Scenario: Cancelling opt-in leaves player off the leaderboard

- **WHEN** the player closes the opt-in modal without submitting
- **THEN** no row SHALL be written to the leaderboard backend, the leaderboard tab SHALL show a「未加入」empty state for the player's own status row, and the modal SHALL re-appear on the next visit until the player either opts in or dismisses via「不再顯示」

### Requirement: Nickname SHALL be 2–12 codepoints, case-insensitive unique, with debounced async uniqueness check

The system SHALL require the player to provide a display nickname during the opt-in flow. The nickname MUST be 2 to 12 Unicode codepoints in length (`[...str].length`), MUST be case-insensitive unique across all opted-in neurons-tw players (e.g. `wlk` collides with `WLK` and `Wlk`), and MAY be left blank — in which case the system falls back to the player's Google display name (subject to the same length + uniqueness rules).

The nickname uniqueness pool SHALL be isolated per app per `neurons-mode` Req 4: a `wlk` nickname in 二階 `hospital-leaderboard` does NOT collide with `wlk` in `neurons-leaderboard`. Each app maintains an independent `nickname_lower` index in its own D1 table.

The nickname MUST be uniqueness-checked against the backend with a debounced async call (400ms after last keystroke) before submission. Submission SHALL be rejected if the nickname is already taken at submit time.

#### Scenario: Nickname under 2 codepoints rejected

- **WHEN** the player enters a nickname of length 0 or 1 codepoint and the nickname field is non-blank
- **THEN** the field SHALL show an inline error「暱稱長度需 2–12 字元」and submission SHALL be blocked

#### Scenario: Nickname over 12 codepoints rejected

- **WHEN** the player enters a nickname of length > 12 Unicode codepoints
- **THEN** the field SHALL show「暱稱長度需 2–12 字元」and submission SHALL be blocked

#### Scenario: Case-insensitive uniqueness collision within neurons app

- **WHEN** the player enters「WLK」and another opted-in neurons-tw player's stored nickname is「wlk」
- **THEN** the debounced uniqueness check SHALL return「已被使用」and the field SHALL display the error inline

#### Scenario: Nickname collision pool is per-app

- **GIVEN** another player has nickname `wlk` registered in 二階 `leaderboard_m2` table only
- **WHEN** a neurons-tw player attempts to register nickname `wlk` and 沒有 row exists in `leaderboard_neurons` with `nickname_lower = 'wlk'`
- **THEN** the uniqueness check SHALL return「available」(true)
- **AND** the player SHALL successfully claim `wlk` in `leaderboard_neurons` without affecting 二階

#### Scenario: Blank nickname falls back to Google display name

- **WHEN** the player leaves the nickname field blank and submits
- **THEN** the system SHALL persist the player's Google display name as the leaderboard `nickname` value, subject to the same length and uniqueness rules; if the Google name violates these rules, the system SHALL block submission and prompt the player to set a custom nickname

#### Scenario: Nickname is changeable post opt-in

- **WHEN** an opted-in player edits their nickname via the settings panel
- **THEN** the new nickname SHALL be subject to the same length and uniqueness checks, and on save SHALL update both the local profile and the next D1 upsert; there SHALL be no cooldown or rate limit on nickname changes

### Requirement: Five filter tabs SHALL provide composite ranking plus four single-dimension rankings

The leaderboard UI SHALL provide **five** filter tabs that determine the ranking criterion. The default tab SHALL be「綜合排名」. Switching tabs SHALL update the displayed ranking without re-querying if the data is already cached client-side for the current half-hour.

| Tab order | Tab | Sort key |
|---|---|---|
| 1 | 綜合排名 | `variant_count DESC, family_complete DESC, total_study_min DESC` |
| 2 | 變體收集排名 | `variant_count DESC` |
| 3 | AP 排名 | `total_AP DESC` |
| 4 | Synapse 強連結排名 | `synapse_strong DESC` |
| 5 | 累積唸書時間排名 | `total_study_min DESC` |

#### Scenario: Default tab is 綜合排名

- **WHEN** the player opens the leaderboard tab for the first time within a session
- **THEN** the「綜合排名」tab SHALL be selected by default and its rows displayed first

#### Scenario: Switching filter tabs updates the displayed ranking

- **WHEN** the player clicks the「AP 排名」tab
- **THEN** the displayed top-100 list SHALL re-order by `total_AP DESC` from the same hourly snapshot, and the player's own my-rank chip SHALL update to show their AP-only rank

#### Scenario: Composite ranking tie-breaker order

- **WHEN** two players have identical `variant_count` in the 綜合排名 tab
- **THEN** the player with higher `family_complete` SHALL rank above the other; if `family_complete` also ties, the player with higher `total_study_min` SHALL rank above; if all three tie, ordering MAY be arbitrary but MUST be stable within a single snapshot

#### Scenario: Synapse tab empty-state copy for early game

- **WHEN** the「Synapse 強連結排名」tab is selected AND all top-100 rows have `synapse_strong = 0`
- **THEN** the UI SHALL render an explanatory empty-state「期待第一個 strong synapse 上榜！同一天兩個 family 各答對 5 題形成 synapse, 連續同日重激發兩次達 strong 狀態」alongside (not replacing) the row list

### Requirement: Top 100 list plus my-rank chip SHALL render in pixel-art tabular grid

The leaderboard UI SHALL display up to 100 ranked rows for the active filter as a pixel-art tabular grid (not an unstyled list), rendering one row per opted-in player with cells for: rank / nickname / `variant_count` (with `/55` suffix) / `family_complete` (with `/11` suffix) / `total_AP` / `synapse_strong` / `total_study_min` (formatted as `Xh Ym`). The grid SHALL use the existing pixel design tokens (`--frame-cell-light` / `--frame-cell-dark` border colors from `theme-pixel-neurons`, `--accent-gold` for rank-1 emphasis, Cubic 11 font for nicknames and numeric stats) so the visual style matches the rest of the neurons-tw UI shell.

The player's own current rank SHALL remain accessible regardless of scroll position via either the existing sticky top chip OR a new sticky-bottom "my row" repeat that mirrors the user's row data.

#### Scenario: Top 100 displayed when ≥ 100 opted-in players

- **WHEN** the leaderboard backend has ≥ 100 opted-in players and the player views any filter tab
- **THEN** the UI SHALL display 100 rows in a single scrollable tabular grid where each row aligns its cells vertically with the row above and below

#### Scenario: All rows displayed when < 100 opted-in players

- **WHEN** the leaderboard backend has fewer than 100 opted-in players
- **THEN** the UI SHALL display all available rows and SHALL show a counter「目前 N 位玩家加入排行」at the top or bottom of the grid

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
- **THEN** the grid SHALL show at minimum: rank, nickname, the active filter's primary stat bolded, and one secondary stat; non-essential columns MAY be hidden via CSS to prevent horizontal overflow; the row order and underlying row data MUST remain identical to the desktop layout

#### Scenario: Empty leaderboard state

- **WHEN** the active filter's snapshot has zero rows
- **THEN** an empty-state message「期待第一個上榜的 neurons-tw 玩家！」 SHALL render in place of the grid; no empty grid frame SHALL appear

### Requirement: Hourly KV cache refresh SHALL pre-compute all five filter snapshots twice per hour

The leaderboard backend SHALL pre-compute the top-100 ranking for each of the five filter tabs **twice per hour** via the existing Worker scheduled cron trigger at minutes `:00` and `:30` (shared with 二階 `hospital-leaderboard` schedule, no additional cron expression). Client read requests SHALL fetch from the KV cache, NOT directly from D1. The system MAY serve a stale snapshot (older than 30 min) if the cron has not yet refreshed, but MUST surface a「上次更新：HH:MM」timestamp in the leaderboard UI.

#### Scenario: 30-min cron pre-computes all five neurons filters

- **WHEN** the Worker scheduled trigger fires at `:00` or `:30` of each hour
- **THEN** the system SHALL run five D1 queries (one per filter) on `leaderboard_neurons` table and write the resulting top-100 row arrays to five KV keys (`leaderboard:neurons:top100:composite | variants | ap | synapse | study`), and SHALL log a single line entry for monitoring

#### Scenario: Client read serves KV cache

- **WHEN** a client GETs `/leaderboard/neurons/composite`
- **THEN** the Worker SHALL return the value from `leaderboard:neurons:top100:composite` KV key directly, without querying D1, and include a `last_updated_at` timestamp in the response

#### Scenario: Stale snapshot served on cron failure

- **WHEN** the Worker scheduled cron fails to run for two consecutive scheduled slots
- **THEN** the client SHALL still receive the most recent successful snapshot from KV; the UI SHALL surface the「上次更新：HH:MM」timestamp so the player can detect staleness

### Requirement: Worker upsert endpoint SHALL accept all neurons leaderboard fields with sanity bounds and LWW

The Worker `POST /leaderboard/neurons/upsert` endpoint SHALL enforce last-write-wins semantics using `updated_at` (millisecond epoch) and SHALL reject payloads whose values fall outside known sanity bounds:

- `variant_count ∈ [0, 55]`
- `family_complete ∈ [0, 11]`
- `total_AP ≥ 0`
- `synapse_strong ≥ 0`
- `total_study_min ≥ 0`
- `nickname` length 2-12 codepoints, matches stored regex (basic anti-injection: no control chars, no leading/trailing whitespace)
- `badges_csv` (when present) matches `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` (mirror 二階 pattern, ≤ 6 entries, ≤ 60 chars)

Rejected payloads SHALL log a structured warning but MUST NOT surface a UI error to the player (silent server-side filtering, mirror 二階 pattern). The D1 table SHALL declare `CHECK` constraints matching every numeric sanity bound as defence-in-depth.

The request MUST be authenticated (Supabase JWT in `Authorization: Bearer <token>` header). The Worker SHALL verify the JWT via the existing JWKS endpoint reused from `leaderboard.ts`. The `user_id` SHALL be derived from the JWT `sub` claim, NOT from the request body.

#### Scenario: Older updated_at rejected

- **WHEN** an upsert arrives with `updated_at` older than the existing D1 row's `updated_at`
- **THEN** the Worker SHALL leave the existing row unchanged and respond `200 OK` (avoid client retry storm)

#### Scenario: Out-of-bounds variant_count rejected

- **WHEN** an upsert arrives with `variant_count = 56` or `variant_count = -1`
- **THEN** the Worker SHALL discard the upsert, log a structured warning with the offending user_id, and respond `200 OK` with `dropped: "variant_count_oob"` without writing to D1

#### Scenario: Out-of-bounds family_complete rejected

- **WHEN** an upsert arrives with `family_complete = 12` (impossible: only 11 families)
- **THEN** the Worker SHALL discard the upsert with `dropped: "family_complete_oob"`

#### Scenario: Missing JWT rejected with 401

- **WHEN** the endpoint receives a request without a valid Supabase JWT in the Authorization header
- **THEN** the Worker SHALL respond `401 Unauthorized` without executing any D1 query

#### Scenario: user_id derived from JWT, not body

- **GIVEN** a request body containing `user_id: "evil-attacker-uuid"` but a valid JWT for `sub: "real-player-uuid"`
- **WHEN** the upsert endpoint processes the request
- **THEN** the D1 row SHALL be written with `user_id = "real-player-uuid"` (from JWT)
- **AND** the `user_id` value in the request body SHALL be ignored

### Requirement: Push leaderboard row SHALL be triggered on cloud sync when wired (deferred), with manual-push button as interim

The system SHALL provide a client-side adapter `pushNeuronsLeaderboardRow(client)` that builds the upsert payload from local Dexie state (`neuronVariants` → `variant_count` + `family_complete`; `familyAccrual` → `total_AP`; `synapses` where `state='strong'` → `synapse_strong`; existing study-minute accumulator → `total_study_min`; `leaderboardProfile` → `nickname` + `is_public`) and POSTs to `/leaderboard/neurons/upsert`.

The adapter SHALL be wired into the cloud-sync pipeline in a separate follow-up change (`add-neurons-deploy`), piggy-backing the existing R2 bundle push debounce window. In the interim (this change ships with no cloud sync), the adapter SHALL be reachable via:

- **Settings panel manual button**「立即更新排行榜」which calls the adapter directly when clicked
- **Opt-in modal submission**, which always pushes a fresh row on success
- **Opt-out toggle**, which pushes `is_public = 0` immediately

Players who have never opted in SHALL NOT have their data pushed.

#### Scenario: Settings manual-push button triggers upsert

- **GIVEN** an opted-in player on `LeaderboardSettingsControls`
- **WHEN** the player clicks「立即更新排行榜」
- **THEN** the adapter SHALL build the current payload and POST to `/leaderboard/neurons/upsert`
- **AND** the button SHALL disable for 3 seconds after click to prevent rate-storm

#### Scenario: Opted-out player still upserts is_public=0

- **WHEN** an opted-out player triggers a manual push or opt-out toggle
- **THEN** the leaderboard adapter SHALL still POST to `/leaderboard/neurons/upsert` with `is_public: 0`, so that the D1 row remains current if the player re-opens opt-in later, but the row SHALL be excluded from KV snapshots

#### Scenario: Player who never opted in does not push

- **WHEN** an authenticated player who has never opted in triggers any path that would otherwise upsert
- **THEN** the leaderboard adapter SHALL skip the upsert call entirely; no D1 row SHALL be created

#### Scenario: family_complete computed from neuronVariants by client at push time

- **WHEN** the adapter builds the payload
- **THEN** `family_complete` SHALL equal `count of family IDs in db.neuronVariants where the count of variants for that family equals 5`
- **AND** the count SHALL be computed from `db.neuronVariants.toArray()` at push time, NOT cached from a separate source

#### Scenario: synapse_strong computed from synapses table at push time

- **WHEN** the adapter builds the payload
- **THEN** `synapse_strong` SHALL equal `count of rows in db.synapses where state === 'strong'`

### Requirement: Opt-out toggle SHALL hide row from snapshots without deleting D1 row

The system SHALL provide a「公開到排行榜」toggle in `LeaderboardSettingsControls`. When toggled off, the system SHALL POST to `/leaderboard/neurons/opt-out` which sets `is_public = 0` for the player's D1 row. Subsequent KV snapshots MUST exclude `is_public = 0` rows. The D1 row itself MUST be preserved so the player can re-enable opt-in without losing rank history.

#### Scenario: Toggling opt-out hides player from snapshots

- **WHEN** an opted-in player turns off the「公開到排行榜」toggle
- **THEN** the next hourly KV refresh SHALL exclude this player's row from all five filter snapshots, and the player's my-rank chip SHALL switch to「未加入排行」state

#### Scenario: Re-enabling opt-in restores ranking

- **WHEN** an opted-out player turns the toggle back on
- **THEN** the leaderboard adapter SHALL POST `is_public = 1` on next sync (or manual push), and the player SHALL appear in the next hourly KV snapshot without re-entering nickname or re-consenting

### Requirement: Account deletion SHALL remove leaderboard row irreversibly

The system SHALL extend the existing `safeResetAccountData()` flow (or equivalent neurons-tw account-reset entry) so that when a player triggers account deletion, the D1 leaderboard row for that `user_id` SHALL also be deleted via `DELETE /leaderboard/neurons/me`. The deletion MUST be irreversible from the player's perspective — re-creating an account starts fresh on the leaderboard.

The Worker endpoint MUST authenticate via JWT and SHALL only delete the row matching `user_id = jwt.sub`. Deleting other players' rows SHALL NOT be possible.

#### Scenario: Account deletion triggers leaderboard row delete

- **WHEN** a player triggers `safeResetAccountData` from the settings panel
- **THEN** within the same atomic flow, the client SHALL call `DELETE /leaderboard/neurons/me` to remove the D1 row, and the next KV snapshot MUST NOT contain the deleted user_id

#### Scenario: Cross-user delete attempt rejected

- **GIVEN** a malicious request with valid JWT for player A but a request body claiming to delete player B
- **WHEN** the Worker processes `DELETE /leaderboard/neurons/me`
- **THEN** the Worker SHALL only delete the row for `user_id = jwt.sub` (player A)
- **AND** player B's row SHALL remain untouched

### Requirement: Privacy and integrity disclosures SHALL surface on the leaderboard footer

The leaderboard UI footer SHALL display, at all times when the leaderboard list is visible, two disclosure lines:

1.「資料為玩家本機記錄、自填無驗證」(integrity disclosure — anti-cheat policy mirror 二階)
2.「累積唸書計時自 neurons-tw 上線（YYYY-MM-DD）起算；neurons-tw 與 二階 排行榜各自獨立」(scope disclosure)

The opt-in modal MUST additionally surface a link to a「隱私說明」section explaining what is stored, who can see it, and how to opt out / delete.

#### Scenario: Footer integrity disclosure always visible

- **WHEN** the leaderboard list is rendered on any filter tab
- **THEN** both disclosure lines SHALL be visible at the bottom of the page, not requiring scroll past the list to surface

#### Scenario: Opt-in modal links to privacy section

- **WHEN** the opt-in modal is displayed
- **THEN** the modal SHALL include a「了解更多 — 隱私說明」link that expands an inline section (or opens a sub-modal) explaining the privacy model, opt-out, and deletion paths

### Requirement: Nickname uniqueness check endpoint SHALL respond with case-insensitive availability

The Worker SHALL expose a `GET /leaderboard/neurons/nickname-check?n=<candidate>` endpoint that returns whether the proposed nickname is available (case-insensitively) within the neurons-tw nickname pool. The client SHALL debounce calls to this endpoint with a 400ms delay after the last keystroke. The endpoint MUST be authenticated (Supabase JWT in header) to prevent unauthenticated enumeration of nicknames.

The endpoint SHALL only query `leaderboard_neurons.nickname_lower` index; it SHALL NOT query 二階 `leaderboard_m2.nickname_lower` (data isolation).

#### Scenario: Available nickname returns ok

- **WHEN** the client GETs `/leaderboard/neurons/nickname-check?n=newname` and no existing row in `leaderboard_neurons` has `nickname_lower = 'newname'`
- **THEN** the Worker SHALL respond `{"available": true}` with `200 OK`

#### Scenario: Taken nickname returns conflict

- **WHEN** the client GETs `/leaderboard/neurons/nickname-check?n=WLK` and an existing row in `leaderboard_neurons` has `nickname_lower = 'wlk'`
- **THEN** the Worker SHALL respond `{"available": false}` with `200 OK`

#### Scenario: Unauthenticated request rejected

- **WHEN** the endpoint receives a request without a valid Supabase JWT in the Authorization header
- **THEN** the Worker SHALL respond `401 Unauthorized` without executing the D1 query

#### Scenario: 二階 leaderboard nickname does NOT collide

- **GIVEN** an existing row in `leaderboard_m2` with `nickname_lower = 'wlk'`
- **AND** no existing row in `leaderboard_neurons` with `nickname_lower = 'wlk'`
- **WHEN** the client checks `'wlk'` against `/leaderboard/neurons/nickname-check`
- **THEN** the Worker SHALL respond `{"available": true}` (the 二階 row is not consulted)

### Requirement: D1 schema SHALL include a reserved `badges_csv` column for future achievement integration

The `leaderboard_neurons` D1 table SHALL include from initial migration one nullable column reserved for `add-neurons-achievements`:

- `badges_csv TEXT DEFAULT ''` — populated by future change with `<category>:P<tier>` CSV entries, max 60 chars, max 6 entries

This change SHALL ship with `badges_csv` at its default value (empty string). `add-neurons-achievements` SHALL populate it without requiring a schema migration. The Worker `upsert` endpoint SHALL accept `badges_csv` as an optional payload field; missing values SHALL be treated as default empty string.

This change SHALL NOT reserve a `variant_completion_count` (or `subject_mastery_count`-equivalent) column. The existing `family_complete` column already covers that signal — `family_complete * 5 = variant completion count`. If `add-neurons-achievements` later needs a genuinely different metric column (e.g., rarity-weighted score), it SHALL ship its own migration at that time. The trade-off is one cheap future migration step in exchange for keeping the day-one schema free of redundant signals.

#### Scenario: Schema migration 0003 creates badges_csv at default

- **WHEN** `wrangler d1 migrations apply study-rpg-leaderboard --remote` runs the new `0003_neurons_leaderboard.sql`
- **THEN** the `leaderboard_neurons` table SHALL be created with `badges_csv TEXT DEFAULT ''`
- **AND** the existing `leaderboard_m2` table SHALL remain untouched

#### Scenario: Schema does NOT include variant_completion_count

- **WHEN** the developer inspects the migrated table via `wrangler d1 execute study-rpg-leaderboard --command "PRAGMA table_info(leaderboard_neurons)"`
- **THEN** the table SHALL NOT have a column named `variant_completion_count`
- **AND** the table SHALL have `family_complete` as the sole collection-completion signal

#### Scenario: Worker accepts missing badges_csv field

- **WHEN** a client (this change's pre-achievement state) sends an upsert payload omitting `badges_csv`
- **THEN** the Worker SHALL persist the row with `badges_csv = ''`
- **AND** the upsert SHALL succeed

#### Scenario: Worker validates badges_csv format when populated

- **WHEN** a future client (`add-neurons-achievements`) sends an upsert with `badges_csv = 'mastery:P1,recruitment:P2'`
- **THEN** the Worker SHALL validate against regex `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` and accept the payload
- **WHEN** a malformed payload like `badges_csv = 'mastery:P9'` arrives
- **THEN** the Worker SHALL discard the upsert with `dropped: "badges_csv_format"` and log a structured warning

### Requirement: HomePage promo banner SHALL surface leaderboard discovery on first visit

The neurons-tw `OverviewPage` SHALL render a dismissible promo banner at the top of the page that surfaces the leaderboard feature to all visitors (authed + anonymous). The banner SHALL include a headline, sub-line description, a call-to-action link to `/leaderboard`, and a single dismiss button (✕).

Dismiss state SHALL be persisted in localStorage under a versioned key `neurons-leaderboard-promo-banner-dismissed-v1` so future major leaderboard changes can force the banner to re-appear by bumping the version suffix. The banner styling SHALL use the existing pixel `.frame` design tokens (2px `--frame-cell-dark` border + 4px offset shadow + `--bg-cream` background + Cubic 11 font) so it visually integrates with the rest of the neurons-tw shell.

#### Scenario: Banner visible on first homepage visit

- **WHEN** any player (authed or anonymous) opens the neurons-tw `OverviewPage` AND the localStorage key `neurons-leaderboard-promo-banner-dismissed-v1` is absent or not equal to `"true"`
- **THEN** the banner SHALL render at the top of the page, above all other overview cards

#### Scenario: Banner hidden after dismiss

- **WHEN** the player clicks the dismiss button (✕) once
- **THEN** the banner SHALL hide immediately AND localStorage SHALL be updated to `"neurons-leaderboard-promo-banner-dismissed-v1" = "true"`; subsequent visits SHALL NOT render the banner unless localStorage is cleared or the version suffix bumps

#### Scenario: CTA links to leaderboard route

- **WHEN** the player clicks the call-to-action link
- **THEN** the app SHALL navigate to `/leaderboard` via the existing react-router

#### Scenario: localStorage unavailable degrades gracefully

- **WHEN** localStorage read / write throws (e.g., private mode, quota exceeded)
- **THEN** the banner SHALL treat the error as「not dismissed」and render the banner; the dismiss ✕ button SHALL still hide the banner for the current page lifetime via React state, but the dismiss SHALL NOT persist across page loads

### Requirement: Cron handler dispatch SHALL extend existing scheduled switch with neurons-leaderboard cron path

The Worker's `scheduled(event, env, ctx)` dispatch logic in `cloudflare/sync-worker/src/index.ts` SHALL extend the existing match against `CRON_LEADERBOARD_30MIN` (the `0,30 * * * *` cron trigger) to also call `runNeuronsLeaderboardCron(env, ctx)` immediately after `runLeaderboardCron(env, ctx)`. Both cron handlers SHALL be invoked sequentially within the same `event.cron` match arm.

`runNeuronsLeaderboardCron` SHALL be implemented in `cloudflare/sync-worker/src/neurons-leaderboard.ts` and SHALL:

1. Query `leaderboard_neurons` for rows where `is_public = 1`
2. For each of the 5 filter sort orders, take top 100 rows
3. Write each top-100 array to its KV key (`leaderboard:neurons:top100:<filter>`)
4. Log a single structured line `[neurons-leaderboard] cron complete: 5 snapshots refreshed, N rows total`

Failures in `runNeuronsLeaderboardCron` SHALL be caught and logged via `console.error` so that they do NOT propagate up and break `runLeaderboardCron` (or vice versa). Each cron call is independently fault-tolerant.

#### Scenario: Cron at :00 dispatches both leaderboard handlers

- **WHEN** Cloudflare invokes the scheduled handler with `event.cron === '0,30 * * * *'` (or its canonical-string equivalent)
- **THEN** the handler SHALL call `runLeaderboardCron(env, ctx)` followed by `runNeuronsLeaderboardCron(env, ctx)`
- **AND** both handlers SHALL produce their respective KV snapshots
- **AND** a single Workers Log line per handler SHALL be emitted

#### Scenario: Neurons cron failure does not break 二階 cron

- **GIVEN** `runLeaderboardCron` succeeds
- **WHEN** `runNeuronsLeaderboardCron` throws (e.g., transient D1 error)
- **THEN** the error SHALL be caught with `console.error` logging the error + structured payload `{ source: 'neurons-leaderboard', error: <message> }`
- **AND** the 二階 KV snapshots SHALL remain refreshed correctly
- **AND** the next cron run SHALL retry the neurons handler

### Requirement: Neurons leaderboard data plane SHALL remain isolated from 二階 hospital-leaderboard

The `neurons-leaderboard` capability SHALL maintain complete data isolation from `hospital-leaderboard`:

- **Table isolation**: `leaderboard_m2` and `leaderboard_neurons` SHALL be separate D1 tables. SQL queries SHALL never join the two tables for any purpose (analytics, ranking, badges, anything)
- **KV prefix isolation**: `leaderboard:m2:top100:*` and `leaderboard:neurons:top100:*` SHALL be separate KV key spaces. Reads on one prefix SHALL never return rows from the other
- **Endpoint isolation**: `/leaderboard/*` paths (二階) and `/leaderboard/neurons/*` paths SHALL be separate URL spaces. CORS / auth / rate-limit treatment SHALL be configured per-prefix even if currently identical
- **Nickname pool isolation**: per the「Nickname SHALL be 2-12 codepoints」requirement above — verified by the「Nickname collision pool is per-app」 scenario
- **Cross-app references absence**: neurons-tw UI SHALL NOT display 二階 leaderboard data (e.g., "you rank #5 in 二階" banner)
- **Cross-app references absence direction 2**: 二階 `LeaderboardPage` SHALL NOT display neurons-tw data (no "you also have a neurons rank" cross-promotion)

#### Scenario: 二階 LeaderboardPage shows only m2 data

- **GIVEN** a player has rows in both `leaderboard_m2` and `leaderboard_neurons`
- **WHEN** they navigate to 二階 `/leaderboard`
- **THEN** the page SHALL display only `leaderboard_m2`-derived ranking
- **AND** the page SHALL NOT display any neurons-leaderboard data

#### Scenario: neurons-tw LeaderboardPage shows only neurons data

- **GIVEN** a player has rows in both `leaderboard_m2` and `leaderboard_neurons`
- **WHEN** they navigate to neurons-tw `/leaderboard`
- **THEN** the page SHALL display only `leaderboard_neurons`-derived ranking
- **AND** the page SHALL NOT display any 二階 data

#### Scenario: Worker module separation enforced

- **WHEN** a future developer reads `cloudflare/sync-worker/src/neurons-leaderboard.ts`
- **THEN** the file SHALL NOT import from `'./leaderboard.ts'` (the 二階 module)
- **AND** the file MAY import shared helpers from a future `'./lib/auth-utils.ts'` or `'./lib/lww.ts'` (extracted as common code)
- **AND** the file SHALL NOT query `leaderboard_m2` directly
