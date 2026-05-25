## Context

The 二階 leaderboard (Cloudflare D1 + KV + Worker, capability `hospital-leaderboard`) shipped in 2026-05-18 alongside the achievement system. The owner adopted the `tierLabel()` short-label convention later via `add-abbreviated-tier-labels-medexam2` (archived 2026-05-23), which centralised hospital-tier display strings in `apps/medexam2-hospital-tw/src/lib/tier-labels.ts`. The migration touched many app surfaces (HelpMenu, room scenes, tutorial, settings) but **missed the leaderboard table** because the leaderboard render path serialises tier as an integer (D1 column `hospital_tier INTEGER`) instead of the canonical `HospitalTier` union type.

At the same time, the leaderboard schema was provisioned with `CHECK (hospital_tier BETWEEN 1 AND 3)` because at ship time the only end-game tier (`國家級教學醫院` / 大廟) had only one player. The Worker `TIER_MAX = 3` and the client `TIER_TO_NUMBER.國家級教學醫院: 3` clamp were marked「Phase 4 follow-up: bump Worker TIER_MAX to 4」in code comments. Phase 4 of the original leaderboard rollout was completed without executing this follow-up — the comment rotted.

Two independent issues, one user-visible symptom: the owner (T4 player) opens the leaderboard, sees `T1` / `T2` / `T3` instead of「診所 / 區域 / 醫中 / 大廟」, and cannot find themselves as a separate T4 entry.

**Why both must ship**: even if Wave A ships alone (display fix), T4 players still render as `醫中` because they're clamped to 3 in D1. Even if Wave B ships alone (T4 distinction), all rows still render as `T1` / `T2` / `T3` / `T4`. The user-visible regression requires both.

## Goals / Non-Goals

**Goals:**

- Restore canonical `tierLabel()` short labels on every leaderboard row, matching every other tier surface in the 二階 app.
- Allow T4 (大廟) players to have a distinct `hospital_tier = 4` value end-to-end (client → Worker → D1 → KV snapshot → leaderboard render).
- Keep existing D1 rows (current 3 rows at T1–T3) valid through the migration — no data loss, no silent type coercion.
- Allow Wave A to ship independently of Wave B so the more-visible label regression resolves quickly even if the Cloudflare-side change is delayed.

**Non-Goals:**

- Refactoring tier-to-number serialisation into a shared util (deferred — the current per-call site lookups are small enough and a refactor balloons scope).
- Migrating the D1 schema to store `HospitalTier` strings directly instead of integers (would require KV snapshot schema change + Worker code surface area unrelated to this bug).
- Backfilling owner's specific stale row that reportedly shows T1 instead of true T4 — this is a Wave B side effect; the next sync push from the owner's authed session auto-overwrites once Wave B ships.
- Adding a「上次更新」disclaimer for the migration window (would touch the unrelated KV cache freshness requirement).
- Adding telemetry / metrics around tier distribution (out of scope; D1 SELECT can answer ad-hoc).

## Decisions

### D1: Two waves in one change, not two separate changes

**Decision**: Ship Wave A (display fix) and Wave B (schema bump) as a single OpenSpec change with `tasks.md` split into Phase A and Phase B sections.

**Alternatives considered**:

- (a) Two changes (`fix-leaderboard-tier-display` + `bump-leaderboard-tier-to-4`): cleaner separation, easier rollback. Rejected because the spec deltas live in the same capability and both modifications are tightly coupled — splitting forces awkward sequencing in `openspec/specs/hospital-leaderboard/spec.md` where Wave A's MODIFIED block would have to be re-modified by Wave B's archive.
- (b) One change with both waves landing in a single commit: rejected because Wave B needs owner manual `wrangler d1 migrations apply --remote` (a different deploy surface than Wave A's normal frontend deploy). Forcing them into one atomic deploy creates a bad ops dependency.

**Chosen**: one change, two phases, two commits. Phase A commits + GH Pages auto-deploys + Chrome MCP smoke. Phase B writes the SQL + edits Worker/client + owner runs `wrangler` manually, then commits the code + smoke verifies T4 player appears distinctly. Archive only after both phases verified.

### D2: SQLite CHECK constraint rewrite pattern

**Decision**: Use the canonical `CREATE TABLE _new + INSERT SELECT + DROP + RENAME + recreate indexes` pattern for Wave B's migration. Do NOT attempt `ALTER TABLE DROP CONSTRAINT` (uncertain D1 support).

**Why the pattern is needed**: SQLite ≤ 3.34 has no `ALTER TABLE DROP CONSTRAINT`; even 3.35+ syntax is `ALTER TABLE ... DROP COLUMN`, not `DROP CONSTRAINT`. D1 runs SQLite — Cloudflare's docs don't explicitly state CHECK-constraint mutability, so the safe assumption is "no". The recreate-table pattern is well-documented and works on every SQLite version since 3.0.

**Pattern steps** (exactly):

```sql
-- 0004_bump_tier_to_4.sql
BEGIN TRANSACTION;

-- 1. Create new table with widened CHECK
CREATE TABLE leaderboard_m2_new (
  user_id           TEXT PRIMARY KEY,
  nickname          TEXT NOT NULL,
  nickname_lower    TEXT NOT NULL,
  hospital_tier     INTEGER NOT NULL,
  reputation        INTEGER NOT NULL DEFAULT 0,
  doctor_count      INTEGER NOT NULL DEFAULT 0,
  total_study_min   INTEGER NOT NULL DEFAULT 0,
  is_public         INTEGER NOT NULL DEFAULT 1,
  updated_at        INTEGER NOT NULL,
  badges_csv        TEXT NOT NULL DEFAULT '',
  subject_mastery_count INTEGER NOT NULL DEFAULT 0,
  CHECK (hospital_tier BETWEEN 1 AND 4),  -- ← widened from 3
  CHECK (reputation >= 0),
  CHECK (doctor_count BETWEEN 0 AND 50),
  CHECK (total_study_min >= 0),
  CHECK (is_public IN (0, 1)),
  CHECK (subject_mastery_count BETWEEN 0 AND 14)
);

-- 2. Copy all existing rows (preserves T1/T2/T3 data)
INSERT INTO leaderboard_m2_new SELECT * FROM leaderboard_m2;

-- 3. Drop old table and rename
DROP TABLE leaderboard_m2;
ALTER TABLE leaderboard_m2_new RENAME TO leaderboard_m2;

-- 4. Recreate the composite + nickname_lower indexes
CREATE INDEX idx_leaderboard_m2_rank
  ON leaderboard_m2 (hospital_tier DESC, reputation DESC, doctor_count DESC)
  WHERE is_public = 1;
CREATE UNIQUE INDEX idx_leaderboard_m2_nickname_lower
  ON leaderboard_m2 (nickname_lower);

COMMIT;
```

The SELECT-COUNT-pre/post pattern (verifying row count matches before COMMIT) is **not** in the migration itself — Wrangler migrations don't have a rollback hook. Instead, the task list mandates a manual pre-check (`SELECT COUNT(*)` before apply) and post-check (`SELECT COUNT(*)` after apply) so the owner can detect data loss before the change is treated as shipped.

**Alternatives considered**:

- (a) `ALTER TABLE leaderboard_m2 DROP CONSTRAINT chk_tier`: unsupported in standard SQLite + uncertain in D1.
- (b) Recreate as new table `leaderboard_m2_v2` + view rewrite: massive scope inflation for a single CHECK widening.
- (c) Skip CHECK entirely + rely on Worker-side bound check: removes a defence-in-depth layer that already exists; would invite future schema drift.

Chosen: the recreate pattern. Inline in single migration file. Wrapped in transaction.

**Migration filename: 0004_bump_tier_to_4.sql** — confirmed 0003 reserved by `add-hospital-leaderboard-correct-count-filter` (currently 0/32 tasks, but the filename was committed in its `tasks.md` so the slot is morally taken).

### D3: Reverse map `NUM_TO_TIER` lives in `lib/tier-labels.ts`

**Decision**: Add a single `NUM_TO_TIER: Record<number, HospitalTier>` export to `lib/tier-labels.ts` alongside the existing `tierLabel()` and `TIER_DISPLAY_LABEL`. Do NOT duplicate the map in `LeaderboardPage.tsx`.

**Why**: `tier-labels.ts` is the existing canonical mapping module per `add-abbreviated-tier-labels-medexam2`. The leaderboard's tier-as-integer is the only consumer that needs the reverse direction today, but the precedent (centralise tier display logic) should be honoured.

**Alternatives considered**:

- (a) Inline `NUM_TO_TIER` in LeaderboardPage.tsx: less import surface but violates the centralisation precedent.
- (b) Auto-derive via `Object.entries(TIER_DISPLAY_LABEL)` reverse: clever but less inspectable, and `TIER_DISPLAY_LABEL` has no numeric basis (it's keyed by `HospitalTier` strings, not numbers).
- (c) Refactor leaderboard to store `HospitalTier` string in D1: out-of-scope, schema-touching.

Chosen: explicit `NUM_TO_TIER` constant alongside `TIER_DISPLAY_LABEL` in `tier-labels.ts`. One-liner addition.

### D4: Wave A defensive render for out-of-range tier values

**Decision**: `tierLabel(NUM_TO_TIER[row.hospital_tier] ?? '診所')` — fall back to 診所 if the integer is unexpected (e.g., 0, 5, or a non-integer from a corrupted KV snapshot).

**Why**: Wave A ships before Wave B. During the window when Wave B is pending, if a stale or malformed KV cache returns `hospital_tier = 4` (unlikely but possible if someone tested with a hand-edited D1 row), the leaderboard would crash on `tierLabel(undefined)`. Defaulting to 診所 produces a misleading but non-broken render, which is the lesser evil — a broken leaderboard tab hides ALL rows.

After Wave B ships, `4` becomes valid and the fallback is dead code — but worth keeping for future defence-in-depth (e.g., if a tier 5 is ever proposed).

**Alternatives considered**:

- (a) Throw / crash on unknown integer: makes the bug loud but kills the leaderboard tab for all users.
- (b) Render literal `T${n}` as fallback: keeps old behaviour during fallback path, but conflicts with the goal of removing `T${n}` entirely.

Chosen: silent fallback to 診所 with a console.warn (so debugging is still possible).

### D5: Wave A spec change to `Top 100 list` requirement

**Decision**: MODIFY the existing「Top 100 list plus my-rank chip」requirement to include language about tier-cell rendering via canonical short label. Add **one new scenario**「Tier cell renders canonical short label」.

The requirement's purpose statement currently mentions cells include「hospital tier」but is silent on whether that's a label or integer. Specifying short-label rendering closes the gap that this bug exposed.

### D6: Wave B spec change to `Server-side LWW and sanity bounds`

**Decision**: MODIFY the existing「Server-side LWW and sanity bounds」requirement to change `hospital_tier ∈ [1, 3]` → `[1, 4]`. Update the existing scenario「Out-of-bounds hospital_tier rejected」to use `hospital_tier = 5 or 0` (instead of `4 or 0`).

Do NOT add a new scenario about T4 acceptance — the broader「LWW + sanity bounds」requirement implicitly covers it because once `[1, 4]` is the bound, T4 just passes the existing check path.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| SQLite recreate-table pattern drops rows silently if SELECT fails mid-INSERT | Wrap in `BEGIN TRANSACTION ... COMMIT`. Mandate manual `SELECT COUNT(*)` pre/post owner verification. If counts differ, owner runs rollback by re-creating old schema from `0001_leaderboard.sql` + restoring from R2 daily backup (`runBackupCron` writes nightly). |
| D1 doesn't support `BEGIN TRANSACTION` / `COMMIT` inside migration file | Cloudflare D1 docs confirm transactions work in migrations. If they don't (unlikely), the recreate pattern is still safe because the only "in-flight" failure mode is post-DROP-pre-RENAME, leaving `leaderboard_m2_new` populated — owner can manually RENAME to recover. |
| Wave B Worker deploy precedes Wave B client deploy → updated clients (sending tier=4) get rejected by old Worker (TIER_MAX=3) | Wave B tasks order: Worker code + migration apply FIRST → wait for `deploy-worker.yml` to confirm new Worker live → THEN merge client code. Owner triggers the manual `wrangler` apply between these two. |
| Wave A client deploy precedes Wave B → leaderboard renders 大廟 for T3 rows (because old Worker still clamps T4 → 3, old D1 rows are all 3, so 醫中 + 大廟 collide visually) | This is the current behaviour minus the `T${n}` prefix. Wave A's purpose is to fix the much-bigger label regression; the T3/T4 collision is what Wave B fixes. Acceptable interim state, called out in proposal.md「Apply order」section. |
| Owner forgets to run `wrangler d1 migrations apply --remote` after Wave B merge | Tasks.md Phase B has explicit checkbox `[ ] Owner runs wrangler d1 migrations apply` with command verbatim. Verify-step then queries D1 schema to confirm widened CHECK is live. |
| Future change `add-hospital-leaderboard-correct-count-filter` (0/32 tasks) chooses 0003 → Wave B's 0004 must not collide | The other change's `tasks.md` explicitly claims 0003 (verified). Our 0004 is one slot ahead — safe regardless of apply order. |
| Existing stale row (owner's account showing T1 instead of T4) is not auto-fixed by Wave B migration | This is a one-off data issue, not a schema issue. Wave B's tasks include a manual `wrangler d1 execute` SELECT + UPDATE step for the owner to inspect + correct, OR rely on the next sync push (which will auto-LWW-overwrite as soon as owner opens the app). Tasks.md notes this as a optional cleanup. |

## Migration Plan

### Phase A — Display fix

1. Edit `lib/tier-labels.ts`: add `NUM_TO_TIER` map export.
2. Edit `LeaderboardPage.tsx:364` + `:494`: import `tierLabel` + `NUM_TO_TIER`; replace `T{row.hospital_tier}` with `tierLabel(NUM_TO_TIER[row.hospital_tier] ?? '診所')`.
3. Local typecheck: `pnpm -r typecheck`.
4. Chrome MCP smoke at `localhost:5173/#/leaderboard`: confirm rows render「診所 / 區域 / 醫中」short labels.
5. Owner reviews + confirms commit (auto-git skill).
6. Push to track-m2 → GH Pages auto-deploys (~3 min).
7. Owner manual: post-deploy Chrome MCP smoke at `https://fireman333.github.io/study-rpg/hospital/#/leaderboard` AND `https://med-study-rpg.com/2nd/#/leaderboard` confirms short labels on live.

### Phase B — T4 schema distinction

Order matters here — Worker side first, client side second:

1. Write `cloudflare/sync-worker/migrations/0004_bump_tier_to_4.sql` per D2 spec exactly.
2. Edit `cloudflare/sync-worker/src/leaderboard.ts:39`: `TIER_MAX = 3 → 4`.
3. Local Worker tests if any (otherwise skip — Worker has no unit tests today).
4. Owner runs locally first: `cd cloudflare/sync-worker && wrangler d1 migrations apply study-rpg-leaderboard --local && wrangler d1 execute study-rpg-leaderboard --local --command "PRAGMA table_info(leaderboard_m2)"` to verify migration syntax.
5. Commit Worker + migration on track-m2.
6. Owner manual REMOTE apply: `cd cloudflare/sync-worker && wrangler d1 execute study-rpg-leaderboard --remote --command "SELECT COUNT(*) FROM leaderboard_m2"` (pre-count) → `wrangler d1 migrations apply study-rpg-leaderboard --remote` → `wrangler d1 execute study-rpg-leaderboard --remote --command "SELECT COUNT(*) FROM leaderboard_m2"` (post-count, MUST equal pre-count).
7. Push triggers `deploy-worker.yml` → new Worker live with TIER_MAX=4.
8. Verify: `wrangler d1 execute study-rpg-leaderboard --remote --command "INSERT OR REPLACE INTO leaderboard_m2 (user_id, nickname, nickname_lower, hospital_tier, reputation, doctor_count, total_study_min, is_public, updated_at) VALUES ('test-t4', 'test-t4', 'test-t4', 4, 0, 0, 0, 1, 1)"` succeeds (then DELETE the test row).
9. Edit `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts:109`: `國家級教學醫院: 3 → 4`; delete the「Phase 4 follow-up」comment block (~lines 99–104).
10. Local typecheck + Chrome MCP smoke at localhost.
11. Commit client on track-m2 → GH Pages auto-deploys.
12. Live smoke: opt-in flow with owner's T4 account triggers push → next KV refresh shows owner as a distinct「大廟」row, not「醫中」.

### Rollback

- **Wave A**: revert frontend commit. Old `T${n}` rendering restored.
- **Wave B client**: revert client commit to restore `國家級教學醫院: 3` clamp. Existing D1 T4 rows (if any pushed in the meantime) remain valid because CHECK is widened.
- **Wave B Worker**: revert Worker commit + redeploy. With CHECK still widened, old TIER_MAX=3 Worker will reject T4 writes but already-stored T4 rows remain readable.
- **Wave B schema**: NOT trivially reversible. SQLite has no `ALTER TABLE NARROW CHECK`; would need full re-recreate. Tasks specify pre-count check to avoid getting here. If owner needs to roll back the schema after T4 rows exist, options are (a) UPDATE T4 → T3 then re-recreate with old CHECK, or (b) leave widened CHECK live and revert Worker/client only — schema widening is forward-compatible so this is the recommended rollback. Rollback risk is low because the change is a constraint relaxation, not a data shape change.

## Open Questions

- (Q1) Should Wave B include a one-off `UPDATE leaderboard_m2 SET hospital_tier = 4 WHERE user_id = '<owner_uid>'` to fix the reportedly-stale owner row, or wait for next sync push? — **Resolved**: leave as optional `wrangler` execute step in tasks.md. Next sync push auto-corrects; owner only runs the manual UPDATE if for some reason they don't open the app for days.
- (Q2) Should the「Out-of-bounds hospital_tier rejected」scenario test `hospital_tier = 5` (one above the new bound) or stay at `hospital_tier = 0`? — **Resolved**: include both. Modified scenario tests `5 or 0`.
- (Q3) Does `tier-labels.ts` already export `NUM_TO_TIER` from some other path? — **Verified**: no, it currently exports only `TIER_DISPLAY_LABEL` + `tierLabel()`. Safe to add.
