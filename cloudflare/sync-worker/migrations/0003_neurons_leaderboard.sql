-- 0003_neurons_leaderboard.sql
-- Third D1 migration for cloudflare/sync-worker.
-- Creates the M_3rd track (神經元) leaderboard table for neurons-tw global ranking.
--
-- Design references:
--   openspec/changes/add-neurons-leaderboard/proposal.md
--   openspec/changes/add-neurons-leaderboard/design.md   (Decisions D1 / D2 / D5)
--   openspec/changes/add-neurons-leaderboard/specs/neurons-leaderboard/spec.md
--
-- Mirrors the leaderboard_m2 table pattern (二階 hospital-leaderboard) but with
-- neurons-specific public fields. Lives in the SAME D1 database as
-- leaderboard_m2 (database_id 365a3809-4960-4373-8b0f-f864b2323c65) per design
-- D1 (backend reuse) — separate table, isolated KV prefix, isolated nickname
-- pool per neurons-mode Req 4.
--
-- 5 numeric public fields (variant_count / family_complete / total_AP /
-- synapse_strong / total_study_min) plus reserved badges_csv for the future
-- add-neurons-achievements change. NOT reserving variant_completion_count
-- (二階's subject_mastery_count analogue) — redundant with family_complete
-- per design D5 grill conclusion.
--
-- Composite ranking tie-break order matches the spec:
--   ORDER BY variant_count DESC, family_complete DESC, total_study_min DESC
-- Ties beyond total_study_min fall to natural row order (stable per snapshot).
--
-- Partial indexes (WHERE is_public = 1) match the leaderboard_m2 pattern so
-- opted-out rows don't bloat snapshot indexes and the cron doesn't need an
-- extra filter step beyond the index seek.

CREATE TABLE IF NOT EXISTS leaderboard_neurons (
  user_id           TEXT PRIMARY KEY,
  nickname          TEXT NOT NULL,
  nickname_lower    TEXT NOT NULL UNIQUE,
  variant_count     INTEGER NOT NULL DEFAULT 0,
  family_complete   INTEGER NOT NULL DEFAULT 0,
  total_AP          INTEGER NOT NULL DEFAULT 0,
  synapse_strong    INTEGER NOT NULL DEFAULT 0,
  total_study_min   INTEGER NOT NULL DEFAULT 0,
  badges_csv        TEXT NOT NULL DEFAULT '',
  is_public         INTEGER NOT NULL DEFAULT 1,
  updated_at        INTEGER NOT NULL,
  CHECK (variant_count BETWEEN 0 AND 55),
  CHECK (family_complete BETWEEN 0 AND 11),
  CHECK (total_AP >= 0),
  CHECK (synapse_strong >= 0),
  CHECK (total_study_min >= 0),
  CHECK (length(badges_csv) <= 60),
  CHECK (is_public IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_neurons_composite
  ON leaderboard_neurons (variant_count DESC, family_complete DESC, total_study_min DESC)
  WHERE is_public = 1;

CREATE INDEX IF NOT EXISTS idx_leaderboard_neurons_variants
  ON leaderboard_neurons (variant_count DESC)
  WHERE is_public = 1;

CREATE INDEX IF NOT EXISTS idx_leaderboard_neurons_ap
  ON leaderboard_neurons (total_AP DESC)
  WHERE is_public = 1;

CREATE INDEX IF NOT EXISTS idx_leaderboard_neurons_synapse
  ON leaderboard_neurons (synapse_strong DESC)
  WHERE is_public = 1;

CREATE INDEX IF NOT EXISTS idx_leaderboard_neurons_study
  ON leaderboard_neurons (total_study_min DESC)
  WHERE is_public = 1;
