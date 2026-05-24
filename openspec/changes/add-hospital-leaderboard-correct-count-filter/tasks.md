## 0. Sequencing prerequisites (READ BEFORE APPLY)

This change SHALL apply **after** `add-achievement-system` §9–§10 ship. Rationale:

1. **D1 migration filename collision**: `add-achievement-system` §9.1 claims `cloudflare/sync-worker/migrations/0002_add_badges.sql`. Wrangler migrations are numbered sequentially — only one change can be 0002. Since `add-achievement-system` is mid-implementation while this change is at 0/32, achievement-system applies first as 0002. **This change uses 0003** to avoid collision.
2. **Worker code shared file**: both changes edit `cloudflare/sync-worker/src/leaderboard.ts` (achievement-system extends `UpsertBody` + cron payload for badges/subject_mastery; this change extends `FILTERS` + adds 5th filter dispatch). Different sections, but applying achievement-system first lets this change build on a known-extended baseline rather than fighting two simultaneous diffs.
3. **LeaderboardPage.tsx shared file**: same pattern — achievement-system adds badge rendering after nickname; this change adds 5th tab + 答對 column. Apply achievement-system first.
4. **sync/leaderboard.ts shared file**: same.

If the order needs to flip for any reason (e.g., achievement-system blocks indefinitely), this change MAY be renumbered back to 0002, but the Worker / Page / sync file edits SHALL still be coordinated against whatever ships first.

## 1. D1 schema migration

- [ ] 1.1 Write `cloudflare/sync-worker/migrations/0003_add_total_correct.sql` with `ALTER TABLE leaderboard_m2 ADD COLUMN total_correct INTEGER NOT NULL DEFAULT 0 CHECK (total_correct >= 0)` and `CREATE INDEX IF NOT EXISTS idx_leaderboard_m2_total_correct ON leaderboard_m2 (total_correct DESC) WHERE is_public = 1`. Filename uses 0003 to sit after `add-achievement-system`'s `0002_add_badges.sql` (see §0).
- [ ] 1.2 Apply migration locally: `wrangler d1 migrations apply study-rpg-leaderboard --local` from `cloudflare/sync-worker/` and verify with `wrangler d1 execute study-rpg-leaderboard --local --command "PRAGMA table_info(leaderboard_m2)"`

## 2. Worker dispatch + upsert

- [ ] 2.1 In `cloudflare/sync-worker/src/leaderboard.ts`: extend `FILTERS` const to `["composite", "reputation", "doctor", "study", "correct"] as const` (route regex + KV keys auto-derived)
- [ ] 2.2 Extend `ORDER_BY` map with `correct: "total_correct DESC"`
- [ ] 2.3 Extend `SNAPSHOT_COLUMNS` string to include `total_correct`
- [ ] 2.4 Extend `LeaderboardRowInternal` interface with `total_correct: number`
- [ ] 2.5 Extend `UpsertBody` interface with `total_correct?: unknown`
- [ ] 2.6 In `handleUpsert`: add `const correct = Number(body.total_correct ?? 0)` to default missing field to 0 (forward-compat per design D3 migration plan option a)
- [ ] 2.7 Add sanity bound `if (!Number.isFinite(correct) || correct < 0)` → drop with `{ ok: true, dropped: "correct_oob" }` + warn log
- [ ] 2.8 Extend INSERT statement bind list + `ON CONFLICT DO UPDATE` `excluded.total_correct` line; bump positional bind count from 9 → 10
- [ ] 2.9 Sanity-test the dispatch: run worker with `wrangler dev` and curl `/leaderboard/correct` → expect 200 empty payload (KV miss → empty rows)

## 3. Client payload + push

- [ ] 3.1 In `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts`: extend `LeaderboardAttributes` interface with `total_correct: number`
- [ ] 3.2 In `buildLeaderboardAttributes()`: add `const mastery = await db.mastery.toArray()` to the parallel `Promise.all` and compute `total_correct = Math.max(0, Math.floor(mastery.reduce((acc, m) => acc + (m.correct ?? 0), 0)))`
- [ ] 3.3 Include `total_correct` in the returned object
- [ ] 3.4 In `apps/medexam2-hospital-tw/src/lib/leaderboard/api.ts`: extend `upsertLeaderboard` body shape to include `total_correct: number`

## 4. UI surface

- [ ] 4.1 In `apps/medexam2-hospital-tw/src/components/LeaderboardPage.tsx`: insert the new tab entry `{ filter: 'correct', label: '答對總題數排名' }` at **index 1** (position 2 — between 綜合 and 聲望) of the filter tab list. Final order: `[composite, correct, reputation, doctor, study]`. The Worker-side `FILTERS` const in `leaderboard.ts` does NOT need to match this order — it is independent of UI ordering.
- [ ] 4.2 Extend the row-rendering table to include a `total_correct` column; bold-style it when the active filter is `correct` (mirrors how the existing 4 tabs bold their primary stat)
- [ ] 4.3 Extend the my-rank chip logic to compute rank within the `correct` filter when that tab is active
- [ ] 4.4 Confirm mobile viewport rule (< 768px) still degrades gracefully — the new column should hide on mobile unless `correct` is the active filter, matching the existing pattern
- [ ] 4.5 If `apps/medexam2-hospital-tw/src/lib/leaderboard/types.ts` exports a `LeaderboardFilter` union, extend it with `'correct'`

## 5. Docs

- [ ] 5.1 Update `docs/LEADERBOARD.md` filter table to include 5th row `答對總題數排名 | total_correct DESC | leaderboard:m2:top100:correct`
- [ ] 5.2 Update `CLAUDE.md` (project root) hospital-leaderboard section if the filter count is mentioned anywhere (search for "4 filter tabs" / "five" / "composite|reputation|doctor|study" to surface places that need bumping to 5)

## 6. Verify before deploy

- [ ] 6.1 Typecheck: `pnpm -r typecheck` from repo root (Worker + client)
- [ ] 6.2 Spawn Chrome MCP smoke: navigate to dev `localhost:5173/study-rpg/hospital/#/leaderboard`, click new tab, confirm rows render (all-zero is expected initially)
- [ ] 6.3 Run `openspec validate --strict add-hospital-leaderboard-correct-count-filter` before any deploy
- [ ] 6.4 Run `/verify` for end-to-end check (Chrome MCP three-件套 — in-app nav + direct URL + F5 on `/leaderboard`)

## 7. Deploy

- [ ] 7.1 Apply D1 migration remote: `wrangler d1 migrations apply study-rpg-leaderboard --remote` from `cloudflare/sync-worker/`
- [ ] 7.2 Deploy Worker: confirm via `.github/workflows/deploy-worker.yml` push or local `wrangler deploy`; wait for active version flip
- [ ] 7.3 Verify new endpoint live: `curl https://study-rpg-sync-worker.tony85314.workers.dev/leaderboard/correct` → expect 200 empty payload pre-cron
- [ ] 7.4 Trigger client deploy: push to main → GH Pages action rebuilds `apps/medexam2-hospital-tw`
- [ ] 7.5 Manually trigger one own-account push (open hospital app, complete an action that hits sync) → verify D1 row's `total_correct` column updates via `wrangler d1 execute --remote --command "SELECT user_id, total_correct FROM leaderboard_m2 WHERE user_id = '<sub>'"`
- [ ] 7.6 Wait for next `:00`/`:30` cron tick → curl `/leaderboard/correct` and confirm non-empty rows when ≥ 1 player has pushed
