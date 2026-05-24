## Context

The hospital leaderboard was shipped with 4 filter tabs (composite / reputation / doctor / study) backed by:
- Cloudflare D1 table `leaderboard_m2` with one column per ranking attribute + partial indexes `WHERE is_public = 1`
- Worker dispatch via a `FILTERS` const array → `ORDER_BY` map → `SNAPSHOT_COLUMNS`
- Hourly cron `runLeaderboardCron` writing one KV snapshot per filter
- Client `buildLeaderboardAttributes()` reading from Dexie + pushing on `onPushComplete` hook

Architecturally a 5th filter slots in cleanly because the Worker already derives most logic from the `FILTERS` array (route regex, KV keys, cron loop). The only places that need a new branch are: (1) D1 column + index, (2) the `ORDER_BY` map entry, (3) `SNAPSHOT_COLUMNS` list, (4) sanity bound check, (5) `UpsertBody` interface, (6) upsert SQL.

The Cloudflare account already runs on the free tier with ample headroom (D1 row limit, KV ops budget). Adding one more KV write per cron tick and one more column per row is a no-op cost-wise.

## Goals / Non-Goals

**Goals:**
- Add a 5th leaderboard filter `correct` (display label「答對總題數」) that ranks by `total_correct DESC`.
- Use `mastery.correct` aggregate as the data source (per-subject `correct` count already maintained by quiz logic).
- Backfill story: zero retroactive write — existing D1 rows get `DEFAULT 0`; next natural push from each client picks up the real value within the existing sync cadence.
- Keep composite ranking semantics untouched (`tier DESC, reputation DESC, doctor_count DESC`).

**Non-Goals:**
- Backfill from `question_history` via a one-off cron / migration. Players who have not opened the app since the change ship simply show 0 until their next sync; this is acceptable for a discovery-tier feature.
- Adding `total_correct` to the composite formula. Composite stays as the existing 3-tier sort to preserve the existing visual rank ordering on the default tab.
- Adding any other derived metric (e.g. accuracy %, attempts per question). Out of scope for this change; can be addressed in a follow-up if data shows demand.
- Touching `question_history` table. Mastery is already the authoritative aggregate the existing UI uses for "correct count per subject".

## Decisions

### D1: Data source = mastery.correct, not question_history.correctCount

`mastery` table holds one row per subject with `{correct, total}` counters bumped atomically by `recordCorrectAnswer()` / `recordWrongAnswer()` in `apps/medexam2-hospital-tw/src/lib/mastery.ts`. Summing `mastery.correct` across all subject rows yields total correct answers across all quiz attempts, including repeat answers.

**Alternative considered**: `SUM(questionHistory.correctCount)` — same numeric result, but reads N >> subject_count rows (potentially 6066+) per push vs ~14 subject rows. mastery is also the source of truth the existing「答對 X 題 / Y 題」UI displays use, so consistency is preserved.

### D2: D1 migration via ALTER TABLE ADD COLUMN with DEFAULT 0

SQLite supports `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT 0` without rewriting existing rows (constant default is fast-path). The CHECK constraint is added inline. New partial index `WHERE is_public = 1` mirrors the existing 4 indexes' shape.

**Alternative considered**: Recreating the table via `CREATE TABLE leaderboard_m2_new ...; INSERT INTO ... SELECT ...; DROP TABLE; ALTER RENAME;`. Rejected — table has live opted-in users; downtime risk for zero benefit since SQLite handles `ADD COLUMN ... DEFAULT 0` instantly.

### D3: Cron-derived snapshot key — automatic, no code change to KV key list

The existing helper `snapshotKvKey(filter: Filter)` already generates the KV key as `leaderboard:m2:top100:${filter}`. Adding `"correct"` to the `FILTERS` const automatically extends:
- The cron loop (`FILTERS.map(...)`)
- The route regex (`FILTER_ROUTE_REGEX` built from `FILTERS.join("|")`)
- The KV key generation

No separate registration needed — the `FILTERS` array is the single source of truth.

### D4: Sanity bound for total_correct = no hard upper bound, just ≥ 0

The hospital question pack has 6066 questions; in theory `total_correct` could grow unbounded across re-attempts. Setting a hard upper cap risks silently dropping legitimate end-game players. The existing pattern for `reputation` and `total_study_min` is `≥ 0` only, no upper bound — `total_correct` follows the same shape.

Sanity bound check: `Number.isFinite(correct) && correct >= 0`. Out-of-bound payloads are silently dropped with `200 OK + dropped: "correct_oob"` per existing D3 design pattern.

### D5: Backfill is lazy via natural sync cadence, no one-shot migration cron

When the migration applies:
- Existing rows get `total_correct = 0` (DEFAULT)
- Next hourly cron tick rewrites all 5 KV snapshots; the new `correct` tab shows everyone tied at 0 initially
- Each player's next `onPushComplete` push (typically within the same gameplay session) writes their real value
- Within ~24 hours nearly all active players have updated values; inactive players stay at 0 until they next open the app

This is acceptable because:
1. The leaderboard is opt-in; data freshness was never strictly guaranteed
2. The UI already surfaces a「上次更新：HH:MM」timestamp
3. A one-shot Worker-side backfill would require either (a) trusting clients to push immediately (no benefit) or (b) reading from R2 bundles to extract mastery data (cross-system coupling, way out of scope)

### D6: UI placement — insert at 2nd position (after 綜合, before 聲望), default unchanged

The new tab renders at position 2 in the tab strip — between「綜合排名」(position 1) and「聲望排名」(position 3). Final order: `綜合 → 答對 → 聲望 → 醫師個數 → 累積唸書時間`. Default tab remains「綜合排名」per existing spec. The「答對總題數」column is added to the table for all tabs but is the bolded primary stat only on the `correct` tab (mirrors how `reputation` bolds on its own tab).

Rationale for position 2 over the original "append as 5th": placing the new filter adjacent to the default tab maximizes discovery for players who only glance at the leaderboard, while preserving「綜合排名」as the entry surface. The 5-tab strip stays within the existing pixel-art horizontal budget on desktop, and the mobile prioritization rule (active filter's primary stat bolded, hide non-essential columns) is unaffected by tab ordering.

Note: this reorder affects only the **UI tab strip ordering**. The Worker's `FILTERS` const, cron loop, KV key list, and D1 column order are independent of the tab strip order — they continue to iterate / store in the original schema-natural order. The client `LeaderboardFilter` union and tab metadata array are the only places that encode the new visual ordering.

## Risks / Trade-offs

[Risk] Mismatch between `mastery.correct` and `questionHistory.correctCount` — if a code path bumps one but not the other, the leaderboard number drifts from what the user sees in subject mastery UI.
→ Mitigation: `mastery.ts` is the only writer to both tables and it bumps them in a single Dexie transaction (`db.transaction('rw', db.mastery, db.questionHistory, db.affinity, ...)`). No drift possible by construction.

[Risk] Players whose sync engine is paused (offline, opt-out) never push the new field — their snapshot row stays at 0 forever, making them look like newbies on the correct-count leaderboard.
→ Mitigation: Acceptable — players who never sync are by definition out of the leaderboard ecosystem; this is consistent with how all other fields behave when sync is paused.

[Risk] D1 migration applied to `--remote` before Worker code deploys — Worker still references 4-column SQL, INSERT works (new column has DEFAULT), but old INSERT statement is missing the new column entirely.
→ Mitigation: Migration is additive with DEFAULT 0, so old Worker code keeps working unchanged. Deploy order doesn't matter for correctness. The first push from a player after the new Worker code ships will be the first to actually populate `total_correct`.

[Risk] Cron writes a snapshot for `correct` before any client has pushed real values — the new tab shows all-zero rows the moment users open it.
→ Mitigation: Same as D5. UI surfaces the timestamp; players see real data within their next sync push. We could ship a one-line empty-state copy「資料剛同步，第一份完整排名稍後產生」 but is is over-engineered.

## Migration Plan

1. **Apply D1 migration locally first** — `wrangler d1 migrations apply study-rpg-leaderboard --local` to validate SQL.
2. **Apply D1 migration to remote** — `wrangler d1 migrations apply study-rpg-leaderboard --remote`. Existing rows get `total_correct = 0` instantly.
3. **Deploy Worker** with new dispatch logic. Old clients continue pushing 4-field payloads (the upsert SQL uses positional binds in a fixed order — old clients without the new field will fail validation cleanly; see below).
4. **Deploy client** with `buildLeaderboardAttributes()` returning the 5-field payload. Sync engine's next `onPushComplete` push includes the new value.
5. **Cron picks up real values** within 30 min of first batch of clients pushing.

**Critical ordering nuance**: between steps 3 and 4, an old client (cached JS, stale tab open) pushes a 4-field payload. The new Worker SQL expects 5 fields. Three handling options:
- (a) **Recommended**: Make `total_correct` an optional field in `UpsertBody` validation — `body.total_correct ?? 0` — so missing field is treated as 0. Old clients keep working; their next page reload picks up new JS and starts sending the real value.
- (b) Reject 4-field payloads with `400 invalid_payload` — risks logout-storm if any cached tab is stale.
- (c) Deploy Worker + client in a single coordinated push (impossible across CDN cache).

Choosing (a). Implementation: `const correct = Number(body.total_correct ?? 0)`.

**Rollback strategy**: revert Worker + client deploy. D1 column stays (harmless — partial index continues working; `correct` tab in old UI is gone, KV snapshot key continues being written but nobody reads it). If the migration itself needs reverting, `ALTER TABLE ... DROP COLUMN total_correct` — supported by SQLite 3.35+ which Cloudflare D1 uses.

## Open Questions

(none — all decisions resolved)
