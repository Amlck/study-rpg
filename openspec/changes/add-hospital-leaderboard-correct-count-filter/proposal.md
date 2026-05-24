## Why

The hospital leaderboard ships four filter tabs today (composite / reputation / doctor / study minutes), but "答對總題數" — total correct answers across the entire question history — is the most direct proxy for *how much exam practice a player has actually banked*. Reputation and study minutes both reward time spent in-app; doctor count rewards gacha luck. None directly surface the variable that maps to real exam preparedness: how many correct answers the player has accumulated. Adding a fifth filter closes that gap without touching the composite ranking semantics.

## What Changes

- Add new leaderboard filter `correct` (display label「答對總題數」) as the 2nd tab in `LeaderboardPage` — inserted between 綜合 (default) and 聲望. Final tab order: `綜合 → 答對 → 聲望 → 醫師個數 → 累積唸書時間`.
- Extend the D1 `leaderboard_m2` table with a new column `total_correct INTEGER NOT NULL DEFAULT 0` + `CHECK (total_correct >= 0)` + a new partial index `WHERE is_public = 1`.
- Extend the sync Worker's `/leaderboard/:filter` dispatcher, `FILTERS` const, `ORDER_BY` map, `SNAPSHOT_COLUMNS`, `UpsertBody`, upsert SQL, and sanity bound validation to handle `total_correct`.
- Extend the hourly cron `runLeaderboardCron` so it pre-computes and writes a 5th KV snapshot key `leaderboard:m2:top100:correct`.
- Extend client `buildLeaderboardAttributes()` to compute `total_correct` as the sum of `mastery.correct` across all subjects (clamped ≥ 0).
- Extend `upsertLeaderboard()` API + payload shape with the new field.
- Backfill story: existing rows get `DEFAULT 0` at migration time; next natural sync push (`onPushComplete` hook) writes the real value. KV cron picks them up on the next 30-min tick. No retroactive write needed — the leaderboard refreshes naturally.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `hospital-leaderboard`: gains a 5th filter ("correct" / 答對總題數), a 5th D1 column + index, a 5th cron snapshot, and an extra client push field. Composite ranking semantics are unchanged.

## Impact

**Backend (Cloudflare)**
- `cloudflare/sync-worker/migrations/0003_add_total_correct.sql` (new migration; 0003 not 0002 because `add-achievement-system` claims 0002 — see tasks.md §0 sequencing)
- `cloudflare/sync-worker/src/leaderboard.ts` (FILTERS / ORDER_BY / SNAPSHOT_COLUMNS / UpsertBody / upsert SQL / sanity bound / cron payload)
- D1 database `study-rpg-leaderboard` (schema change, applied via `wrangler d1 migrations apply` to both `--local` and `--remote`)
- KV namespace `LEADERBOARD_KV` (one new snapshot key; cron writes it automatically)

**Client (medexam2-hospital-tw)**
- `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` (`LeaderboardAttributes` interface + `buildLeaderboardAttributes()`)
- `apps/medexam2-hospital-tw/src/lib/leaderboard/api.ts` (`upsertLeaderboard` body shape)
- `apps/medexam2-hospital-tw/src/lib/leaderboard/types.ts` (filter type union, payload row type)
- `apps/medexam2-hospital-tw/src/components/LeaderboardPage.tsx` (5th tab + sort/display)
- `docs/LEADERBOARD.md` (updated filter table)

**Specs**
- `openspec/specs/hospital-leaderboard/spec.md` (filter list requirement bumps from 4 → 5; sanity bound list grows)

**No-op zones**
- Dexie schema (mastery already has `correct` column; no version bump)
- `add-r2-cloud-sync-migration` in-flight change (leaderboard is on independent D1, not in any R2 bundle)
- Composite ranking formula (still `tier DESC, reputation DESC, doctor_count DESC`)
- Question history rows / quiz logic (not touched — mastery aggregate is the source of truth)
