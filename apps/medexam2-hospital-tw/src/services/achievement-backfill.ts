/**
 * Silent achievement backfill — covers pre-existing players whose state
 * already satisfied catalog predicates before the achievement system shipped
 * (2026-05-24, change `add-achievement-system`).
 *
 * The runtime unlock-detection flow at `services/achievement-reward.ts` only
 * writes a Dexie row on `false → true` transitions between two consecutive
 * gameplay events. Players past thresholds at deploy time never transition →
 * no rows → empty `badges_csv` on the public leaderboard. Verified live
 * 2026-05-24 (9/10 leaderboard rows had empty badges_csv).
 *
 * This service evaluates the entire catalog against current Dexie state and
 * silently writes any unlocked-but-missing rows. It does NOT dispatch rewards
 * (cosmetic / title / badge) and does NOT push to the toast queue — a long-
 * time player could be eligible for 20+ achievements simultaneously and
 * showering them with retroactive toasts would be disruptive UX for things
 * they don't remember earning. The badges show up silently on their
 * /achievements page and leaderboard row.
 *
 * Called once per successful sync pull cycle via the existing `onPullComplete`
 * engine callback (see `useSync.ts`). Idempotent — after the first pull
 * populates the missing rows, subsequent calls short-circuit on the empty
 * diff. The next debounced push picks up the bulkPut'd rows via the existing
 * ACHIEVEMENTS table adapter and updates the leaderboard via the
 * onPushComplete upsert path.
 *
 * Spec: openspec/specs/achievement-system/spec.md "Silent backfill of
 * pre-existing achievement state on every sync pull cycle".
 */

import { listUnlockedAchievements } from '@study-rpg/core'
import { ACHIEVEMENTS } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'
import { buildAchievementStats, buildSyntheticPlayer } from '../lib/achievement-stats'

/**
 * Evaluate all catalog predicates against current Dexie state and bulkPut any
 * unlocked-but-missing rows. Returns the count of rows backfilled (0 on
 * short-circuit). Errors propagate to the caller; the caller (useSync's
 * onPullComplete chain) is responsible for catch+log so a transient Dexie
 * failure does not break the pull cycle.
 */
export async function backfillAchievementsFromCurrentStats(): Promise<number> {
  const db = getHospitalDB()
  const player = buildSyntheticPlayer()
  const stats = await buildAchievementStats()

  const unlockedNow = listUnlockedAchievements(player, stats, ACHIEVEMENTS)
  if (unlockedNow.length === 0) return 0

  const existingRows = await db.achievements.toArray()
  const existingIds = new Set(existingRows.map((r) => r.id))

  const missing = unlockedNow.filter((a) => !existingIds.has(a.id))
  if (missing.length === 0) return 0

  const now = Date.now()
  await db.achievements.bulkPut(
    missing.map((a) => ({
      id: a.id,
      unlockedAt: now,
      notificationShown: true,
    })),
  )

  return missing.length
}
