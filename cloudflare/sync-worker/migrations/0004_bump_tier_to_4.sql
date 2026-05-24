-- 0004_bump_tier_to_4.sql
-- Widens the leaderboard_m2 hospital_tier CHECK constraint from
--   CHECK (hospital_tier BETWEEN 1 AND 3)
-- to
--   CHECK (hospital_tier BETWEEN 1 AND 4)
-- so end-game players (國家級教學醫院 / 大廟) can be stored as a distinct
-- tier 4 row instead of being clamped down to 3 (medical centre / 醫中)
-- in the existing client TIER_TO_NUMBER map.
--
-- SQLite has no ALTER TABLE DROP CONSTRAINT, so we use the canonical
--   CREATE _new -> INSERT SELECT -> DROP -> RENAME -> recreate indexes
-- pattern, wrapped in a single transaction.
--
-- Existing rows (T1 / T2 / T3) are preserved untouched — the widening is
-- forward-compatible, no historical data violates the new bound.
--
-- After this migration: Worker TIER_MAX bumps from 3 → 4 (see Worker code
-- change in same change set) and the client unclamps
-- TIER_TO_NUMBER.國家級教學醫院 from 3 → 4. The hourly KV refresh cron
-- then re-publishes the snapshot with the newly distinct tier-4 rows.
--
-- Apply via:
--   cd cloudflare/sync-worker
--   wrangler d1 migrations apply study-rpg-leaderboard --local   # smoke test
--   wrangler d1 migrations apply study-rpg-leaderboard --remote  # prod
--
-- Pre/post safety check (mandatory):
--   wrangler d1 execute study-rpg-leaderboard --remote \
--     --command "SELECT COUNT(*) FROM leaderboard_m2"
-- Run before AND after; counts MUST match. If they differ, restore from
-- the nightly R2 backup (runBackupCron) and investigate.
--
-- IMPORTANT: D1 rejects raw `BEGIN TRANSACTION` / `COMMIT` in migrations
-- (error 7500 — must use state.storage.transaction() JS API). Each
-- migration file is wrapped in an atomic transaction by D1 automatically,
-- so explicit BEGIN/COMMIT is both unnecessary and forbidden here.

CREATE TABLE leaderboard_m2_new (
  user_id           TEXT PRIMARY KEY,
  nickname          TEXT NOT NULL,
  nickname_lower    TEXT NOT NULL UNIQUE,
  hospital_tier     INTEGER NOT NULL,
  reputation        INTEGER NOT NULL,
  doctor_count      INTEGER NOT NULL,
  total_study_min   INTEGER NOT NULL,
  is_public         INTEGER NOT NULL DEFAULT 1,
  updated_at        INTEGER NOT NULL,
  badges_csv        TEXT NOT NULL DEFAULT '',
  subject_mastery_count INTEGER NOT NULL DEFAULT 0,
  CHECK (hospital_tier BETWEEN 1 AND 4),
  CHECK (reputation >= 0),
  CHECK (doctor_count BETWEEN 0 AND 50),
  CHECK (total_study_min >= 0),
  CHECK (is_public IN (0, 1))
);

INSERT INTO leaderboard_m2_new (
  user_id,
  nickname,
  nickname_lower,
  hospital_tier,
  reputation,
  doctor_count,
  total_study_min,
  is_public,
  updated_at,
  badges_csv,
  subject_mastery_count
)
SELECT
  user_id,
  nickname,
  nickname_lower,
  hospital_tier,
  reputation,
  doctor_count,
  total_study_min,
  is_public,
  updated_at,
  badges_csv,
  subject_mastery_count
FROM leaderboard_m2;

DROP TABLE leaderboard_m2;

ALTER TABLE leaderboard_m2_new RENAME TO leaderboard_m2;

-- Recreate the four partial indexes from 0001_leaderboard.sql. The
-- nickname_lower uniqueness is enforced by the inline UNIQUE column
-- constraint above, so no separate index is required (SQLite manages
-- the implicit sqlite_autoindex_* entry).

CREATE INDEX idx_leaderboard_m2_composite
  ON leaderboard_m2 (hospital_tier DESC, reputation DESC, doctor_count DESC)
  WHERE is_public = 1;

CREATE INDEX idx_leaderboard_m2_reputation
  ON leaderboard_m2 (reputation DESC)
  WHERE is_public = 1;

CREATE INDEX idx_leaderboard_m2_doctor_count
  ON leaderboard_m2 (doctor_count DESC)
  WHERE is_public = 1;

CREATE INDEX idx_leaderboard_m2_study_min
  ON leaderboard_m2 (total_study_min DESC)
  WHERE is_public = 1;
