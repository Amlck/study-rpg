## Why

M_3rd track neurons-mode has shipped variant collection (55 cap), AP threshold ladder, synapse state machine, family mastery, motion library — but no social / competitive surface. Players have no way to see how their collection compares to other dogfood users, no leaderboard hook to drive sustained engagement past the closed-cap variant collection target, and no public identity beyond their local save.

Shipping this change lights up the public ranking surface — opt-in, 5 filter tabs, Top 100 + my-rank chip — borrowing the proven 二階 `hospital-leaderboard` pattern (Cloudflare D1 + KV via existing sync Worker) so the dogfood owner gets cross-account visibility into who's grinding variants / synapses / AP / study time, and external eventually-public players have a Pokédex-completion + Hebbian-progression bragging surface.

## What Changes

- **New capability `neurons-leaderboard`**: opt-in modal with consent checkbox + nickname (2–12 codepoints, case-insensitive unique) gating leaderboard participation; same strict opt-in model as 二階 `hospital-leaderboard`
- **5 filter tabs** mirroring 二階's count but with neurons-specific sort criteria:
  - 1. 綜合排名 (composite: `variant_count DESC, family_complete DESC, study_min DESC`)
  - 2. 變體收集排名 (`variant_count DESC`) — the Pokédex-style primary metric
  - 3. AP 排名 (`total_AP DESC`) — total action-potential grind across 11 families
  - 4. Synapse 強連結排名 (`synapse_strong DESC`) — Hebbian achievement count
  - 5. 累積唸書時間排名 (`study_min DESC`) — time-invested mirror of 二階
- **5 public per-player fields** (plus nickname): `variant_count` (0–55) / `family_complete` (0–11, count of families with all 5 slots filled) / `total_AP` (sum across families) / `synapse_strong` (count of synapses currently in `strong` state) / `total_study_min`
- **New D1 table `leaderboard_neurons`** in existing `study-rpg-leaderboard` D1 database (reuse Worker code path + auth bridge, isolate data plane per `neurons-mode` Req 4)
- **5 KV snapshot keys** `leaderboard:neurons:top100:<filter>` (`composite | variants | ap | synapse | study`) refreshed twice per hour via existing Worker scheduled cron handler (extended to dispatch new neurons-leaderboard cron)
- **5 new Worker endpoints** under `/leaderboard/neurons/*` (mirroring 二階 path shape but isolated):
  - `POST /leaderboard/neurons/upsert` (JWT verify → sanity bounds → D1 LWW upsert)
  - `GET /leaderboard/neurons/:filter` (public KV read)
  - `GET /leaderboard/neurons/nickname-check?n=<candidate>` (JWT verify → case-insensitive lookup)
  - `POST /leaderboard/neurons/opt-out` (JWT verify → flip `is_public=0` + bump `updated_at`)
  - `DELETE /leaderboard/neurons/me` (JWT verify → hard delete; called from account-reset flow)
- **Cron dispatch extended**: existing `runLeaderboardCron` handler in `cloudflare/sync-worker/src/index.ts` SHALL be split or extended to also write the 5 `leaderboard:neurons:top100:<filter>` snapshots, sharing the `:00` / `:30` cron schedule with 二階 leaderboard (no additional cron expression)
- **Dexie v3 → v4** in `apps/neurons-tw/src/lib/db.ts`: new `leaderboardProfile` table (`user_id` PK + `nickname / opted_in / is_public / dismissed_at / last_pushed_at`)
- **Sync engine integration**: when wired in `add-neurons-deploy` (cloud sync follow-up) the leaderboard push SHALL piggyback the existing R2 bundle push debounce window; for this change, the upsert path is wired but cloud sync infra arrives separately
- **Opt-in flow components**: `LeaderboardOptInModal.tsx` (consent + nickname + privacy link), `LeaderboardPage.tsx` (5-tab grid + my-rank chip + footer disclosures), `LeaderboardSettingsControls.tsx` (opt-out toggle + nickname-change in settings)
- **HomePage promo banner**: dismissible banner on neurons-tw home (`OverviewPage`) promoting the new leaderboard tab; localStorage-versioned dismiss key
- **Hard isolation from 二階**: the neurons leaderboard SHALL NOT read or display rows from 二階's `leaderboard_m2`, SHALL NOT share nicknames (different uniqueness pool per app), SHALL NOT cross-grant badges from 二階 `achievement-system`
- **Forward compatibility for `add-neurons-achievements`**: D1 schema SHALL reserve a nullable `badges_csv` column from day one (mirroring 二階's pattern), so the achievement follow-up only writes data without a schema migration. `variant_completion_count` (二階's `subject_mastery_count` analogue) is NOT reserved — `family_complete` already covers that signal, and adding a separate column would be redundant. If a genuinely new metric column is needed later, `add-neurons-achievements` ships its own migration cheaply
- **NOT in scope this change**: cloud-sync integration (deferred to `add-neurons-deploy`); achievement-driven badge population (deferred to `add-neurons-achievements`); friend-only leaderboards / social graph (deferred to M6 stretch)

## Capabilities

### New Capabilities
- `neurons-leaderboard`: opt-in global ranking for neurons-tw with 5 filter tabs, Top 100 + my-rank chip, Cloudflare D1 + KV backend via existing sync Worker, isolated from 二階 `hospital-leaderboard`

### Modified Capabilities

None. This change explicitly does NOT modify `hospital-leaderboard` (二階 source) or `neurons-mode` (umbrella already declared this capability would be deferred to this change). The borrowing-without-modification pattern is mandated by `neurons-mode` Req 5.

## Impact

**Affected code**:
- `cloudflare/sync-worker/src/neurons-leaderboard.ts` — NEW module, endpoints + cron handler
- `cloudflare/sync-worker/src/index.ts` — extend `scheduled` dispatch to call `runNeuronsLeaderboardCron` on `:00` / `:30`
- `cloudflare/sync-worker/migrations/0003_neurons_leaderboard.sql` — NEW D1 migration creating `leaderboard_neurons` table
- `cloudflare/sync-worker/wrangler.jsonc` — no change (reuse existing cron triggers + D1 + KV bindings)
- `apps/neurons-tw/src/lib/db.ts` — Dexie v3 → v4 add `leaderboardProfile` table
- `apps/neurons-tw/src/lib/services/neurons-leaderboard.ts` — NEW client adapter (push helper + opt-in/out + nickname check)
- `apps/neurons-tw/src/components/LeaderboardOptInModal.tsx` — NEW opt-in modal
- `apps/neurons-tw/src/components/LeaderboardSettingsControls.tsx` — NEW settings opt-out toggle + nickname edit
- `apps/neurons-tw/src/components/LeaderboardPromoBanner.tsx` — NEW HomePage banner (dismissible)
- `apps/neurons-tw/src/routes/LeaderboardPage.tsx` — NEW route page with 5-tab grid
- `apps/neurons-tw/src/App.tsx` — add `/leaderboard` route + nav link
- `apps/neurons-tw/src/routes/OverviewPage.tsx` — mount promo banner
- `apps/neurons-tw/public/...` — no asset changes (pixel-art uses existing CSS tokens)

**Affected APIs / contracts**:
- New Worker endpoints under `/leaderboard/neurons/*` — isolated from existing `/leaderboard/*` paths so 二階 callers unaffected
- D1 schema: new table `leaderboard_neurons` with same `user_id` PK shape as `leaderboard_m2` (both Supabase Auth UUID), no foreign key relationship between the two tables
- KV namespace `LEADERBOARD_KV`: 5 new key prefixes `leaderboard:neurons:top100:*` alongside existing `leaderboard:m2:top100:*`; same namespace, different prefixes — no read collision

**Dependencies**: no new npm packages. Reuses existing Worker auth bridge (Supabase JWT verification via JWKS), existing `dexie`, existing Framer Motion (for opt-in modal entry).

**Risks**:
- Cron dispatch divergence: new neurons cron must be added to the `scheduled` switch in `cloudflare/sync-worker/src/index.ts` with a named constant matching the wrangler trigger string. Mirror existing pattern (per `hospital-leaderboard` Req「Cron dispatch handler matches wrangler trigger expression」) — same constant pattern, just new name `CRON_NEURONS_LEADERBOARD_30MIN` (or reuse `CRON_LEADERBOARD_30MIN` if both share the same trigger string, which is likely)
- D1 quota: each player has 2 rows max (one in `leaderboard_m2`, one in `leaderboard_neurons`); at ~1000 dogfood scale this is well under Cloudflare D1 free tier limits
- Nickname collision across apps: a `wlk` nickname in 二階 does NOT collide with `wlk` in neurons (separate uniqueness pools per neurons-mode Req 4 data isolation). Player may need different nicknames in each app — acceptable trade-off for app independence
- Cloud sync not yet wired: this change ships the leaderboard infrastructure but the actual push-on-sync hook lives in `add-neurons-deploy`. Until that lands, leaderboard upserts only fire when the player explicitly interacts with the opt-in modal or settings page (manual save). Acceptable for staged rollout — gives the dogfood owner time to verify the leaderboard UI + Worker behavior before sync engine integration
- "Empty leaderboard" early-game UX: for the first few weeks `synapse_strong` will be near-zero for most players (synapses need same-day cross-family co-firing 2x to reach `strong`). The Synapse tab will be sparse. Mitigation: ship empty-state copy「期待第一個 strong synapse 上榜！」 + composite tab default
