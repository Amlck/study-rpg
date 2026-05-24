## 0. Sequencing prerequisites (READ BEFORE APPLY)

**Status (apply 2026-05-24)**: `add-achievement-system` §9–§10 have shipped (migrations 0002 + Worker badge wire + LeaderboardPage badge render). `fix-leaderboard-tier-display-and-t4` Wave B has also shipped (migration 0004 + TIER_MAX bump to 4). Migration number for this change is therefore **0005**, not the original 0003 — see §1.1 update.

Original rationale below kept for historical context.

This change SHALL apply **after** `add-achievement-system` §9–§10 ship. Rationale:

1. **D1 migration filename collision**: `add-achievement-system` §9.1 claims `cloudflare/sync-worker/migrations/0002_add_badges.sql`. Wrangler migrations are numbered sequentially — only one change can be 0002. Since `add-achievement-system` is mid-implementation while this change is at 0/32, achievement-system applies first as 0002. **This change uses 0003** to avoid collision.
2. **Worker code shared file**: both changes edit `cloudflare/sync-worker/src/leaderboard.ts` (achievement-system extends `UpsertBody` + cron payload for badges/subject_mastery; this change extends `FILTERS` + adds 5th filter dispatch). Different sections, but applying achievement-system first lets this change build on a known-extended baseline rather than fighting two simultaneous diffs.
3. **LeaderboardPage.tsx shared file**: same pattern — achievement-system adds badge rendering after nickname; this change adds 5th tab + 答對 column. Apply achievement-system first.
4. **sync/leaderboard.ts shared file**: same.

If the order needs to flip for any reason (e.g., achievement-system blocks indefinitely), this change MAY be renumbered back to 0002, but the Worker / Page / sync file edits SHALL still be coordinated against whatever ships first.

## 1. D1 schema migration

- [x] 1.1 Write `cloudflare/sync-worker/migrations/0005_add_total_correct.sql` with `ALTER TABLE leaderboard_m2 ADD COLUMN total_correct INTEGER NOT NULL DEFAULT 0 CHECK (total_correct >= 0)` and `CREATE INDEX IF NOT EXISTS idx_leaderboard_m2_total_correct ON leaderboard_m2 (total_correct DESC) WHERE is_public = 1`. Bumped from 0003 → 0005 because by apply time 0002 (badges) and 0004 (T4 bump) had also shipped.
- [x] 1.2 Applied locally: `wrangler d1 migrations apply study-rpg-leaderboard --local` → `0005_add_total_correct.sql ✅`. `PRAGMA table_info` confirmed `total_correct` at cid 11 (INTEGER, notnull=1, dflt_value=0).

## 2. Worker dispatch + upsert

- [x] 2.1 In `cloudflare/sync-worker/src/leaderboard.ts`: extend `FILTERS` const to `["composite", "reputation", "doctor", "study", "correct"] as const` (route regex + KV keys auto-derived)
- [x] 2.2 Extend `ORDER_BY` map with `correct: "total_correct DESC"`
- [x] 2.3 Extend `SNAPSHOT_COLUMNS` string to include `total_correct`
- [x] 2.4 Extend `LeaderboardRowInternal` interface with `total_correct?: number` (optional for KV back-compat)
- [x] 2.5 Extend `UpsertBody` interface with `total_correct?: unknown`
- [x] 2.6 In `handleUpsert`: add `const correct = Number(body.total_correct ?? 0)` to default missing field to 0 (forward-compat per design D3 migration plan option a)
- [x] 2.7 Add sanity bound `if (!Number.isFinite(correct) || correct < 0)` → drop with `{ ok: true, dropped: "correct_oob" }` + warn log
- [x] 2.8 Extend INSERT statement bind list + `ON CONFLICT DO UPDATE` `excluded.total_correct` line; bump positional bind count from 11 → 12. Also extended `handleGetMe` SELECT to include `total_correct`. Applied one-way ratchet (mirror badges_csv/subject_mastery_count pattern) so a 0-payload from a stale client can't clobber a populated server-side value.
- [x] 2.9 Sanity-tested via `wrangler dev --local`: `curl http://localhost:8787/leaderboard/correct` → `{"rows":[],"last_updated_at":null,"total_count":0}` (KV miss → expected empty payload).

## 3. Client payload + push

- [x] 3.1 In `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts`: extend `LeaderboardAttributes` interface with `total_correct: number`
- [x] 3.2 In `buildLeaderboardAttributes()`: add `db.mastery.toArray()` to the parallel `Promise.all` and compute `total_correct = Math.max(0, Math.floor(mastery.reduce((acc, m) => acc + (m.correct ?? 0), 0)))`
- [x] 3.3 Include `total_correct` in the returned object
- [x] 3.4 Worker payload shape is typed by `LeaderboardUpsertPayload` in `@study-rpg/core` (`packages/core/src/lib/leaderboard-types.ts`); extended there with optional `total_correct` rather than in `apps/.../leaderboard/api.ts` directly. The `upsertLeaderboard()` signature accepts the extended type unchanged. `LeaderboardServerRow` in api.ts also extended with optional `badges_csv` / `subject_mastery_count` / `total_correct` for the `GET /leaderboard/me` seed path.

## 4. UI surface

- [x] 4.1 Inserted at index 1 of `LEADERBOARD_FILTERS` in `packages/core/src/lib/leaderboard-types.ts` (single source of truth — `LeaderboardPage` iterates this const for the tab strip). Final UI order: `[composite, correct, reputation, doctor, study]`. Worker `FILTERS` keeps schema-natural order independently.
- [x] 4.2 Added「答對」column to header + data rows in `LeaderboardPage.tsx`; `isPrimaryFor('correct', cell)` returns `cell === 'correct'` so `.leaderboard-cell--primary` bold styling auto-applies on the correct tab.
- [x] 4.3 `MyRankChip` consumes the active filter's snapshot rows; no per-filter logic change required — rank derivation already works for any filter.
- [x] 4.4 Mobile rule extended in `styles.css`: `.leaderboard-cell--correct` is `display: none` on `< 768px` by default (joins tier + doctors). When `data-active-filter="correct"` is set on the list / sticky element, the correct cell is shown and 唸書 is hidden instead, keeping the 4-cell mobile budget. The `data-active-filter` attribute is set in `LeaderboardPage` from `activeFilter`.
- [x] 4.5 No separate `LeaderboardFilter` union in `apps/medexam2-hospital-tw/src/lib/leaderboard/types.ts` — that file doesn't exist; the type is owned by `@study-rpg/core` and re-exported. Extended there (step 4.1).

## 5. Docs

- [x] 5.1 Updated `docs/LEADERBOARD.md` — schema table adds `total_correct` row + index; filter enum in GET endpoint adds `correct`; sample JSON payload adds `total_correct`; cron description updated 4 → 5; dropped enum adds `correct_oob`.
- [x] 5.2 Project root `CLAUDE.md` does not currently mention the filter count anywhere (only the `LEADERBOARD.md` doc + spec source did). `openspec/project.md` roadmap row updated to reflect 5 filters.

## 6. Verify before deploy

- [x] 6.1 Typecheck: `pnpm -r typecheck` from repo root — all 8 workspace projects pass (`packages/core` must be `pnpm build`'d first; dist/ is the consumed surface per CLAUDE.md sharp edge).
- [x] 6.2 Chrome MCP smoke against `wrangler dev --local` (`localhost:8787`) + `vite dev` (`localhost:5175`): tab strip renders `[綜合, 答對, 聲望, 醫師, 唸書]` with 綜合 pressed by default; navigating `?tab=correct` flips pressed state to 答對; reload triggers 5 parallel GETs to `/leaderboard/{composite,correct,reputation,doctor,study}` — all 200, no CORS errors, no console exceptions. Empty state「期待第一個上榜的玩家！」renders as expected (local KV is cold).
- [x] 6.3 `openspec validate --strict add-hospital-leaderboard-correct-count-filter` → `Change 'add-hospital-leaderboard-correct-count-filter' is valid`. Also cross-checked main spec: `openspec validate --strict hospital-leaderboard` → valid.
- [x] 6.4 Chrome MCP three-件套 covered in §6.2: (a) in-app nav via tab click flips `aria-pressed` + URL `?tab=correct`; (b) direct URL `localhost:5175/study-rpg/hospital/#/leaderboard?tab=correct` opens with 答對 pre-selected; (c) HashRouter so F5 on a hash route is identical to direct URL — same smoke result. SPA fallback rule from CLAUDE.md doesn't apply here because hash routing.

## 7. Deploy

- [ ] 7.1 Apply D1 migration remote: `wrangler d1 migrations apply study-rpg-leaderboard --remote` from `cloudflare/sync-worker/`
- [ ] 7.2 Deploy Worker: confirm via `.github/workflows/deploy-worker.yml` push or local `wrangler deploy`; wait for active version flip
- [ ] 7.3 Verify new endpoint live: `curl https://study-rpg-sync-worker.tony85314.workers.dev/leaderboard/correct` → expect 200 empty payload pre-cron
- [ ] 7.4 Trigger client deploy: push to main → GH Pages action rebuilds `apps/medexam2-hospital-tw`
- [ ] 7.5 Manually trigger one own-account push (open hospital app, complete an action that hits sync) → verify D1 row's `total_correct` column updates via `wrangler d1 execute --remote --command "SELECT user_id, total_correct FROM leaderboard_m2 WHERE user_id = '<sub>'"`
- [ ] 7.6 Wait for next `:00`/`:30` cron tick → curl `/leaderboard/correct` and confirm non-empty rows when ≥ 1 player has pushed
