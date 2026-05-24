-- 0002_add_badges.sql
-- Achievement system: add badges_csv + subject_mastery_count columns to
-- leaderboard_m2. Per add-achievement-system change, hospital-leaderboard
-- spec delta "Leaderboard row carries badges_csv and subject_mastery_count".
--
-- ALTER TABLE ADD COLUMN with DEFAULT — back-fills existing rows with safe
-- defaults atomically. No row-level update needed. Old Worker queries that
-- ignore these columns continue to function (additive change).
--
-- Apply via:
--   wrangler d1 migrations apply study-rpg-leaderboard --remote
--
-- Format references:
--   badges_csv: comma-separated `<category>:<tier>` pairs (max 6 entries,
--     max ~60 chars total). Example: "study:P1,quiz:P2,recruit:P2,hospital:P3,
--     fortune:P4,hidden:P1". Each pair = the highest tier the player has
--     unlocked in that category. Empty string when no category achievements
--     unlocked yet.
--   subject_mastery_count: integer in range [0, 14], counting unlocked
--     subject-master-* achievements (NOT including all-subjects-mastered
--     capstone, which is a separate P1 hidden-like achievement).

ALTER TABLE leaderboard_m2 ADD COLUMN badges_csv TEXT NOT NULL DEFAULT '';
ALTER TABLE leaderboard_m2 ADD COLUMN subject_mastery_count INTEGER NOT NULL DEFAULT 0;
