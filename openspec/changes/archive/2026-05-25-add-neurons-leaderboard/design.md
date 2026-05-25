## Context

借鏡自 二階 `hospital-leaderboard` per `neurons-mode` Req 5 borrowing pattern. Semantic mappings:

| 二階 source | 神經元 here |
|---|---|
| `hospital_tier` (1-4: 診所 / 區域 / 醫中 / 大廟) | `variant_count` (0-55) — Pokédex completion as the primary tier-equivalent |
| `reputation` (numeric grind) | `total_AP` (numeric grind across 11 families) |
| `doctor_count` (0-50, capped count of recruited doctors) | `family_complete` (0-11, count of families with all 5 slots filled) + `synapse_strong` (Hebbian achievement count, no cap) |
| `total_study_min` | `total_study_min` (kept verbatim, identical semantic) |
| `total_correct` (从 hospital-leaderboard 后加的) | NOT included this change (defer to follow-up if dogfood demands it) |
| `badges_csv` / `subject_mastery_count` (from achievement-system) | reserved column `badges_csv` only (nullable, populated by `add-neurons-achievements`); 二階's `subject_mastery_count` equivalent NOT reserved this change — `family_complete` already covers the natural collection-progress signal |
| D1 table `leaderboard_m2` | D1 table `leaderboard_neurons` (separate table, same database) |
| KV prefix `leaderboard:m2:top100:` | KV prefix `leaderboard:neurons:top100:` (same namespace, different prefix) |
| Worker module `cloudflare/sync-worker/src/leaderboard.ts` | new module `cloudflare/sync-worker/src/neurons-leaderboard.ts` |
| Cron trigger `0,30 * * * *` (existing twice-per-hour) | reused — neurons cron handler runs in the same scheduled invocation, no new cron expression |
| Endpoints `/leaderboard/*` | `/leaderboard/neurons/*` (separate path prefix) |

Critical scope-cut: this change does NOT modify `openspec/specs/hospital-leaderboard/spec.md` and does NOT reuse its spec text. The borrowing-without-modification rule is mandated by `neurons-mode` Req 5 Scenario「Leaderboard infrastructure may be shared but spec is independent」.

**Current state**:
- `cloudflare/sync-worker` is shipped (via 二階 `add-r2-cloud-sync-migration` + `add-hospital-leaderboard`), already binds D1 `study-rpg-leaderboard` + KV `LEADERBOARD_KV`, runs cron triggers `0,30 * * * *`
- Worker auth bridge (Supabase JWT via JWKS) is shipped and reusable as-is
- `apps/neurons-tw` Dexie schema is at v3 after `wire-neuron-variant-gacha` (added `neuronVariants` table)
- `wire-neurons-content-and-theme` shipped 11 family display names ready to use in leaderboard row context
- `connectome-collection` shipped synapse state machine (so `synapse_strong` count is queryable from Dexie)

**Stakeholders**:
- Dogfood owner (medical student) — primary player whose v3 save will start pushing leaderboard rows on first opt-in
- Future external players (post-public launch) — see global ranking, motivated to grind variants / strong synapses
- 二階 leaderboard players — MUST NOT see neurons rows polluting their hospital leaderboard view (data isolation)

## Goals / Non-Goals

**Goals:**
- Mirror 二階 leaderboard's opt-in discipline (consent checkbox + nickname + privacy disclosure) verbatim — proven UX from production
- Establish a forward-compatible D1 schema with nullable `badges_csv` + `variant_completion_count` so `add-neurons-achievements` only writes new data, no future migrations
- Reuse Cloudflare D1 + KV + Worker code path for cost efficiency (zero new infra cloud resources)
- Make composite ranking align with the closed-cap collection narrative: variant_count first, family_complete tie-break — players who finish more families rank higher than players who scatter variants across many families
- Surface "synapse_strong" as a separate filter tab even though early-game it will be sparse — gives long-term players a unique bragging surface that variant-collection-only can't capture

**Non-Goals:**
- Cloud-sync push integration (the actual hook into `sync engine onPushComplete`) — deferred to `add-neurons-deploy`. This change wires the upsert helper and ALL endpoints, but the trigger from cloud sync arrives separately
- Friend-only / social-graph leaderboards (deferred to M6 stretch)
- Achievement badge population — D1 columns reserved, but `badges_csv` will remain NULL until `add-neurons-achievements` populates
- Live-update ranking (websocket / SSE) — same hourly KV cache model as 二階, "stale snapshot acceptable" trade-off
- Anti-cheat beyond sanity bounds — same trust model as 二階 ("自填無驗證" disclosure)
- Per-domain (neurons sub-leaderboard by NT branch) — single global ranking only
- Cross-app aggregate leaderboard (combined neurons + 二階 score) — explicitly forbidden by `neurons-mode` Req 4 data isolation

## Decisions

### D1: Backend reuse strategy = new D1 table in existing database, new KV prefix in existing namespace, new module in existing Worker

**Decision**: Add a new D1 table `leaderboard_neurons` inside the existing `study-rpg-leaderboard` D1 database (binding `LEADERBOARD_DB` in wrangler). Add new KV keys with prefix `leaderboard:neurons:top100:` inside the existing `LEADERBOARD_KV` namespace. Add a new Worker source module `cloudflare/sync-worker/src/neurons-leaderboard.ts` mirroring the existing `leaderboard.ts` shape. The cron handler in `cloudflare/sync-worker/src/index.ts` SHALL be extended to also dispatch the neurons cron path.

**Rationale**:
- Single Cloudflare account, single D1 database with both tables = simpler ops + lower cost (no extra wrangler config / secrets / domain bindings)
- KV prefix isolation prevents read collisions: `/leaderboard/composite` reads `leaderboard:m2:top100:composite`; `/leaderboard/neurons/composite` reads `leaderboard:neurons:top100:composite`
- Per `neurons-mode` Req 4 data isolation: separate **tables** suffice for the "no cross-app rows" rule. The infra-sharing decision doesn't violate the spec — it just means the dogfood owner can SQL-query both leaderboards from the same Cloudflare dashboard (a maintenance win)
- Worker module split keeps code locality high: anyone touching neurons-leaderboard logic only edits one file, doesn't risk breaking 二階 leaderboard

**Alternatives considered**:
1. Extend `leaderboard_m2` table with `app_id` column → rejected: violates data isolation aesthetics, breaks 二階 queries that don't filter by `app_id`, creates schema complexity
2. Brand-new Cloudflare account / new D1 / new Worker / new domain → rejected: massive ops overhead for zero benefit (no isolation requirement beyond table-level)
3. Same Worker but route through one shared `/leaderboard/*` endpoint with `app: 'neurons'` body param → rejected: breaks the "looks like a separate API" feeling; couples the two APIs at the routing layer

### D2: Public field lineup = `variant_count / family_complete / total_AP / synapse_strong / total_study_min` + `nickname`

**Decision**: D1 schema includes 5 numeric public fields plus nickname:

```sql
CREATE TABLE leaderboard_neurons (
  user_id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  nickname_lower TEXT NOT NULL,  -- for case-insensitive uniqueness checks
  variant_count INTEGER NOT NULL DEFAULT 0 CHECK (variant_count BETWEEN 0 AND 55),
  family_complete INTEGER NOT NULL DEFAULT 0 CHECK (family_complete BETWEEN 0 AND 11),
  total_AP INTEGER NOT NULL DEFAULT 0 CHECK (total_AP >= 0),
  synapse_strong INTEGER NOT NULL DEFAULT 0 CHECK (synapse_strong >= 0),
  total_study_min INTEGER NOT NULL DEFAULT 0 CHECK (total_study_min >= 0),
  badges_csv TEXT DEFAULT '',  -- reserved for add-neurons-achievements
  is_public INTEGER NOT NULL DEFAULT 1 CHECK (is_public IN (0, 1)),
  updated_at INTEGER NOT NULL  -- millisecond epoch
);
CREATE INDEX idx_nickname_lower ON leaderboard_neurons (nickname_lower);
CREATE INDEX idx_is_public ON leaderboard_neurons (is_public);
```

`family_complete` is included in the schema even though it's not a separate filter tab — it serves as the composite ranking tie-break per D3. Computed at client-push time from `db.neuronVariants.toArray()` (grouping by familyId, counting families where the group's length equals 5).

**Rationale**:
- Mirrors 二階's 4-numeric-fields-plus-nickname shape (the missing one in 二階 is `total_correct`, added later; here we proactively reserve the achievement columns)
- `family_complete` as schema column (not just computed) means future Worker-side analytics (queries like「平均 family_complete」) work without re-deriving from raw variant data
- Sanity bounds on every numeric field — defence-in-depth at the schema layer matching the Worker validation

**Alternatives considered**:
1. 4 fields (drop `family_complete`) and compute tie-break client-side → rejected: KV snapshot already pre-sorted by Worker cron; client receives ordered list, can't re-sort
2. Add `total_correct` like 二階 → rejected for now: neurons doesn't have a clear "answer count" surface beyond AP (which doubles as correct-answer count since AP increments only on correct). Could add later if dogfood demands

### D3: Composite ranking formula = `variant_count DESC, family_complete DESC, study_min DESC`

**Decision**: The 綜合排名 tab sorts by three keys in order:
1. `variant_count DESC` (primary — closed-cap collection completion is the headline metric)
2. `family_complete DESC` (tie-break 1 — distinguishes "10 random variants across 10 families" from "10 variants forming 2 complete families")
3. `total_study_min DESC` (tie-break 2 — among players with identical collection, who put in more time)

Players with identical all-3-values MAY be ordered arbitrarily but the order MUST be stable within a single snapshot.

**Rationale**:
- Primary `variant_count` reflects the dogfood-confirmed psychological hook: "55 lifetime collectible Pokémon-style target"
- `family_complete` tie-break creates a meaningful strategic differentiation — focused grinders rank above scattered grinders even at the same raw collection count
- `study_min` as second tie-break aligns with the underlying time-invested signal — among collection equals, time wins
- `total_AP` deliberately NOT in composite (it's a separate filter tab) — would double-count effort with variant_count (both grow with correct answers)

**Alternatives considered**:
1. Weighted composite `0.6 * variant_count + 0.3 * synapse_strong + 0.1 * (study_min / 100)` → rejected during grill: human-weighted formulas confuse new players ("why am I ranked here?"), and dogfood owner specifically chose the cleaner tie-break model
2. `synapse_strong` as primary → rejected: early-game sparsity means 90% of leaderboard rows tied at zero; doesn't reflect 90% of player effort
3. Just `variant_count` (single-key sort) → rejected: too many ties at low-mid game; need the `family_complete` differentiator

### D4: Nickname pool isolation = neurons has its own uniqueness namespace, separate from 二階

**Decision**: A player who has `nickname = 'wlk'` in 二階 `leaderboard_m2` does NOT automatically claim `'wlk'` in neurons `leaderboard_neurons`. Each app maintains an independent `nickname_lower` index. The same player may set different (or same, if available) nicknames in each app.

**Rationale**:
- Per `neurons-mode` Req 4: "Cross-app recognition absence: neurons-tw SHALL NOT display any achievement badge, leaderboard entry, cosmetic unlock, or progress indicator referencing the player's medexam-tw or medexam2-hospital-tw saves"
- Independent uniqueness pools = independent identities = clean fork story for future content packs (a TOEFL fork can ship its own nickname pool too)
- Trivial implementation: `nickname-check` endpoint queries only `leaderboard_neurons.nickname_lower` index, never joins to `leaderboard_m2`

**Alternatives considered**:
1. Shared nickname pool across apps → rejected: breaks data isolation rule, plus would require cross-table uniqueness checks (more complex query, more chances for race conditions on signup)
2. Auto-clone 二階 nickname on neurons first opt-in → rejected: same data-isolation violation, plus the player might want different identities in different apps (mediadora 二階 = serious, neurons = playful)

### D5: Forward-compat reservation for `add-neurons-achievements` — `badges_csv` only

**Decision**: D1 schema reserves **one** nullable column: `badges_csv TEXT DEFAULT ''` — will eventually carry a CSV of `<category>:P<tier>` entries (e.g. `'mastery:P1,recruitment:P2'`), max 60 chars / max 6 entries.

**Rejected reservation** (after grill): `variant_completion_count INTEGER` was originally proposed mirroring 二階's `subject_mastery_count` pattern, but it is semantically redundant with the already-present `family_complete` column (0–11). `family_complete * 5` IS the variant completion count; storing both is duplicate signal. If `add-neurons-achievements` later needs a genuinely different metric (e.g., rarity-weighted score), it ships its own migration `0004_add_<metric>.sql` — single column add is cheap.

**Rationale**:
- 二階 `hospital-leaderboard` was extended with `badges_csv` AFTER initial ship via migration 0002. That migration was painful (manual `wrangler d1 migrations apply --remote` step gated on owner). Reserving `badges_csv` up-front avoids that cost — `add-neurons-achievements` (future) only writes data, no schema work
- `badges_csv` is optional in the API payload — older clients omit it, newer ones populate. Worker validates as nullable
- Avoiding redundancy with `family_complete` keeps the schema signal clean: every column represents a distinct dimension, not a derived restatement of another

**Alternatives considered**:
1. Reserve both `badges_csv` + `variant_completion_count` (original draft) → rejected at grill: column redundancy with `family_complete` muddies the schema; future achievement-system can add its own column with one cheap migration
2. Reserve neither → rejected: `badges_csv` is a known-coming requirement per `add-neurons-achievements` roadmap entry; the migration cost is worth pre-empting now
3. Rename `variant_completion_count` to `achievement_score` (catchall placeholder) → rejected: still adds an undefined-semantic column; better to wait until the achievement-system actually defines what it needs

### D6: Cron handler dispatch = extend existing `scheduled` switch, not new cron expression

**Decision**: Use the existing `0,30 * * * *` cron trigger in `cloudflare/sync-worker/wrangler.jsonc`. In `cloudflare/sync-worker/src/index.ts` `scheduled()` dispatch, the existing `CRON_LEADERBOARD_30MIN` case SHALL call BOTH `runLeaderboardCron(env, ctx)` (existing 二階) AND `runNeuronsLeaderboardCron(env, ctx)` (new). Optionally split into a separate constant `CRON_NEURONS_LEADERBOARD_30MIN` only if Cloudflare's cron string deduplicates them — most likely it does (same trigger string).

**Rationale**:
- Two leaderboards refresh at the same `:00` / `:30` boundary → identical staleness expectation across apps
- One scheduled invocation, two function calls → simpler than registering two cron triggers
- No wrangler config change → no risk of breaking 二階 cron schedule

**Alternatives considered**:
1. New cron expression e.g. `15,45 * * * *` for neurons → rejected: makes monitoring harder ("two cron windows, two staleness profiles"); no benefit at <1000-player scale
2. Inline call from `runLeaderboardCron` → rejected: couples the two functions; if neurons cron throws it could damage 二階 leaderboard refresh

## Risks / Trade-offs

- **[Risk]** Worker code drift between `leaderboard.ts` (二階) and `neurons-leaderboard.ts` — copy-paste at start, divergence over time. **Mitigation**: extract truly shared helpers (`verifySupabaseJWT`, `enforceLWW`, `sanityCheck`) into `cloudflare/sync-worker/src/lib/auth-utils.ts` and `cloudflare/sync-worker/src/lib/lww.ts` so both modules consume them. Drift on the truly-different parts (table name, sanity bounds, KV key prefix) is acceptable
- **[Risk]** D1 free tier hit if neurons leaderboard pushes more frequently than 二階 — **Mitigation**: 3-second debounce on client push (mirror 二階); the volume is identical to 二階, just on a separate row. Free tier is 5M reads / 25M writes per day — well under
- **[Risk]** Sparse early-game leaderboard for `synapse_strong` filter — looks broken if 90% rows are 0 — **Mitigation**: empty-state copy「期待第一個 strong synapse 上榜！」 + composite tab default + add a "filters with non-zero data only" toggle as polish later
- **[Risk]** `family_complete` requires the client to scan all 55 variant rows to compute → small perf cost on every push — **Mitigation**: ~55 row scan in Dexie is < 1ms, irrelevant. If profiling later shows hot path issues, cache the computed value in `LeaderboardProfile` row
- **[Risk]** Cloud sync push hook not wired this change → dogfood owner has to manually trigger opt-in (which DOES write to D1) before first leaderboard appearance. After first opt-in, subsequent updates require either (a) opening the opt-in modal again, (b) toggling opt-out then back on, or (c) waiting for `add-neurons-deploy` to wire the sync engine — **Mitigation**: ship this change with a "manual push" button in `LeaderboardSettingsControls` so dogfood owner can manually trigger D1 upsert during pre-cloud-sync dogfood phase. Removable in `add-neurons-deploy` once auto-push lands
- **[Trade-off]** Same Cloudflare account / D1 / KV / Worker as 二階 (D1 decision) — saves ops + lets dogfood owner query both leaderboards in one SQL editor — but means a 二階 incident (e.g. Cloudflare account suspension, D1 corruption) takes both leaderboards down. Acceptable for single-owner dogfood + cheap to revisit if we ever go multi-account
- **[Trade-off]** No `total_correct` field — diverges slightly from 二階's superset. Acceptable: neurons collection model is fundamentally different (closed cap), and "answer count" is implicit in `total_AP` (each correct = +1 AP for that family)

## Migration Plan

1. **Pre-flight**: confirm `study-rpg-leaderboard` D1 database is healthy (二階 already using it; `wrangler d1 info study-rpg-leaderboard` shows non-zero size)
2. **Phase 1 — D1 migration**: ship `0003_neurons_leaderboard.sql` creating the new table. Manual `wrangler d1 migrations apply study-rpg-leaderboard --remote` step gated on owner (per established 二階 `add-hospital-leaderboard` precedent)
3. **Phase 2 — Worker module + cron extension**: ship `neurons-leaderboard.ts` with 5 endpoints + `runNeuronsLeaderboardCron`. Extend `scheduled()` dispatch in `index.ts`. Deploy via `wrangler deploy` (auto via existing `.github/workflows/deploy-worker.yml`)
4. **Phase 3 — Client wiring**: Dexie v3→v4 with `leaderboardProfile` table; new components (modal / settings / banner / page); App.tsx route + nav. NO cloud-sync push hook yet
5. **Phase 4 — Verify**: typecheck (`pnpm -r typecheck`), build (`pnpm -r build`), Chrome MCP smoke per `~/.claude/imports/chrome_mcp_preflight.md`:
   - Opt-in flow: modal renders → consent checkbox → nickname validation → submit → POST `/leaderboard/neurons/upsert` → D1 row created
   - Nickname check: typing same-nickname-as-existing → "已被使用" inline error
   - Opt-out: settings toggle → POST `/leaderboard/neurons/opt-out` → next KV snapshot excludes this row
   - LeaderboardPage: navigate to `/leaderboard` → 5 tabs render → top 100 (or empty state) → my-rank chip
   - 二階 isolation: open 二階 app, verify `leaderboard_m2` queries unaffected
6. **Rollback**: if Phase 2 Worker deploy breaks, `wrangler rollback` reverts module; D1 table can stay (unused, no harm). If Phase 3 client breaks, revert app commits — D1 + Worker keep working independently for future re-deploy

## Open Questions

- **Push frequency cap**: 二階 throttles by sync engine's 3s debounce. Without cloud sync this change, manual-only push could exceed reasonable rate if owner clicks the manual push button rapidly. Add client-side cooldown? Defer to dogfood feedback — start with no cooldown
- **Default tab selection per-user**: 二階 always defaults to 綜合; should neurons remember last-viewed tab in localStorage? Polish for follow-up
- **Cross-app player identity hint**: when dogfood owner opts into both 二階 and neurons leaderboards, should the UI subtly mark "same player" somewhere (e.g., a tiny avatar in both)? No — `neurons-mode` Req 4 forbids cross-app recognition. Hard rule, defer indefinitely
- **Achievement integration timing**: `add-neurons-achievements` will populate `badges_csv` + `variant_completion_count` columns. Should LeaderboardPage display them even when NULL/empty? Render placeholder gray cells in this change; once achievements ship, the cells light up automatically
