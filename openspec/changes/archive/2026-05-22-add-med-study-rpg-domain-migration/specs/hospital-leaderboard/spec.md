## ADDED Requirements

### Requirement: Leaderboard endpoints accept requests from new domain via `api.med-study-rpg.com`

The leaderboard endpoints (`/leaderboard/upsert`, `/leaderboard/:filter`, `/leaderboard/nickname-check`, `/leaderboard/opt-out`, `/leaderboard/me`) are hosted by the same Worker as the R2 sync API. Per the `cloud-sync` capability's new `Worker Custom Domain` requirement, those endpoints SHALL also be reachable under `https://api.med-study-rpg.com/leaderboard/...` once the Custom Domain binding is in place.

Browser clients on `https://med-study-rpg.com/2nd/` SHALL issue leaderboard requests to `https://api.med-study-rpg.com/leaderboard/...` (constructed by concatenating `VITE_SYNC_WORKER_URL` + `/leaderboard/...`).

The Worker's CORS allowed origins SHALL include `https://med-study-rpg.com` per the `cloud-sync` modification. No leaderboard-specific CORS configuration is required beyond what `cloud-sync` already covers — the Worker uses a single allowed-origins list for all routes.

#### Scenario: 二階 client on new domain reads leaderboard

- **GIVEN** a user on `https://med-study-rpg.com/2nd/` opens the leaderboard page
- **WHEN** the leaderboard hook fetches `/leaderboard/composite`
- **THEN** the network request SHALL be a GET to `https://api.med-study-rpg.com/leaderboard/composite`
- **AND** the Worker SHALL return the same KV-cached top-100 snapshot as the workers.dev URL returns
- **AND** the response SHALL include `Access-Control-Allow-Origin: https://med-study-rpg.com`

#### Scenario: 二階 client on new domain pushes leaderboard row after successful sync

- **GIVEN** an opted-in user on `https://med-study-rpg.com/2nd/` completes a sync push with `firstError === null && !anyOffline`
- **WHEN** the `onPushComplete` callback fires
- **THEN** the leaderboard upsert SHALL POST to `https://api.med-study-rpg.com/leaderboard/upsert`
- **AND** the Worker SHALL verify the JWT, apply sanity bounds, and UPSERT into D1 (existing leaderboard write logic unchanged)
- **AND** subsequent KV cron refresh SHALL pick up the new row in the snapshot

#### Scenario: Nickname uniqueness check works on new domain

- **GIVEN** a user on `https://med-study-rpg.com/2nd/` is choosing a nickname during opt-in
- **WHEN** the nickname field debounces and calls `/leaderboard/nickname-check?n=<candidate>`
- **THEN** the request SHALL go to `https://api.med-study-rpg.com/leaderboard/nickname-check?n=<candidate>`
- **AND** the Worker SHALL respond with the same availability verdict as the workers.dev URL would

#### Scenario: Account reset hard-deletes leaderboard row from new domain

- **GIVEN** an opted-in user on `https://med-study-rpg.com/2nd/` triggers in-place account reset
- **WHEN** `safeResetAccountData` calls `deleteLeaderboardMe`
- **THEN** the request SHALL be a DELETE to `https://api.med-study-rpg.com/leaderboard/me` with a valid JWT
- **AND** the Worker SHALL hard-delete the user's row from D1 (existing logic unchanged)
- **AND** subsequent reads SHALL no longer surface that user in the leaderboard
