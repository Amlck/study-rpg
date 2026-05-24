-- 0005_add_total_correct.sql
-- Adds a `total_correct` column to `leaderboard_m2` so the 5th leaderboard
-- filter「答對總題數排名」(add-hospital-leaderboard-correct-count-filter) can
-- rank players by SUM(mastery.correct) across all subjects.
--
-- Note: tasks.md / proposal / design originally planned 0003 because the
-- sequencing-prerequisite change `add-achievement-system` claimed 0002. By
-- the time this change applies, `0004_bump_tier_to_4.sql` (Wave B of
-- fix-leaderboard-tier-display-and-t4) has also shipped. We use 0005 to
-- avoid filename collision with both. Functionally unchanged from the
-- original 0003 plan.
--
-- ALTER TABLE ADD COLUMN with constant DEFAULT 0 is SQLite fast-path — no
-- row rewrite. Existing rows acquire `total_correct = 0`; opted-in clients'
-- next natural sync push (`onPushComplete` → `pushLeaderboardIfOptedIn`)
-- writes the real value within the existing 3-second debounce window.
--
-- Partial index mirrors the four existing `WHERE is_public = 1` indexes
-- (0001_leaderboard.sql) so the hourly cron's `correct` filter query
-- (ORDER BY total_correct DESC LIMIT 100) is an index seek, not a scan.
--
-- Apply via:
--   cd cloudflare/sync-worker
--   wrangler d1 migrations apply study-rpg-leaderboard --local   # smoke test
--   wrangler d1 migrations apply study-rpg-leaderboard --remote  # prod
--
-- Pre/post safety check (mandatory):
--   wrangler d1 execute study-rpg-leaderboard --remote \
--     --command "SELECT COUNT(*) FROM leaderboard_m2"
-- Run before AND after; counts MUST match. The new column is additive with
-- a constant default, so the count is the strongest single-line verification.
--
-- D1 wraps each migration in an implicit transaction — explicit
-- BEGIN/COMMIT is rejected with error 7500.

ALTER TABLE leaderboard_m2
  ADD COLUMN total_correct INTEGER NOT NULL DEFAULT 0 CHECK (total_correct >= 0);

CREATE INDEX IF NOT EXISTS idx_leaderboard_m2_total_correct
  ON leaderboard_m2 (total_correct DESC)
  WHERE is_public = 1;
