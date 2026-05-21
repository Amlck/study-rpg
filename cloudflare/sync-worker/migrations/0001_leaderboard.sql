-- 0001_leaderboard.sql
-- First D1 migration for cloudflare/sync-worker.
-- Creates the hospital leaderboard table for 二階 (M_2nd) global ranking.
--
-- Design references:
--   openspec/changes/add-hospital-leaderboard/proposal.md
--   openspec/changes/add-hospital-leaderboard/design.md   (Decisions D1 / D6 / D7)
--   openspec/changes/add-hospital-leaderboard/specs/hospital-leaderboard/spec.md
--
-- Indexes use partial WHERE is_public = 1 so opted-out rows do not bloat
-- the snapshot indexes and the hourly cron does not need an extra filter
-- step beyond the index seek.
--
-- Tie-breaker behavior (composite ranking) matches the spec:
--   ORDER BY hospital_tier DESC, reputation DESC, doctor_count DESC
-- Ties beyond doctor_count fall back to natural row order, which is stable
-- within a single snapshot.

CREATE TABLE IF NOT EXISTS leaderboard_m2 (
  user_id           TEXT PRIMARY KEY,
  nickname          TEXT NOT NULL,
  nickname_lower    TEXT NOT NULL UNIQUE,
  hospital_tier     INTEGER NOT NULL,
  reputation        INTEGER NOT NULL,
  doctor_count      INTEGER NOT NULL,
  total_study_min   INTEGER NOT NULL,
  is_public         INTEGER NOT NULL DEFAULT 1,
  updated_at        INTEGER NOT NULL,
  CHECK (hospital_tier BETWEEN 1 AND 3),
  CHECK (reputation >= 0),
  CHECK (doctor_count BETWEEN 0 AND 50),
  CHECK (total_study_min >= 0),
  CHECK (is_public IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_m2_composite
  ON leaderboard_m2 (hospital_tier DESC, reputation DESC, doctor_count DESC)
  WHERE is_public = 1;

CREATE INDEX IF NOT EXISTS idx_leaderboard_m2_reputation
  ON leaderboard_m2 (reputation DESC)
  WHERE is_public = 1;

CREATE INDEX IF NOT EXISTS idx_leaderboard_m2_doctor_count
  ON leaderboard_m2 (doctor_count DESC)
  WHERE is_public = 1;

CREATE INDEX IF NOT EXISTS idx_leaderboard_m2_study_min
  ON leaderboard_m2 (total_study_min DESC)
  WHERE is_public = 1;
