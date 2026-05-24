/**
 * Achievement reward dispatcher + unlock orchestrator.
 *
 * Called by each trigger hook (Phase 7) AFTER the game action's primary
 * write has committed. Orchestrator:
 *   1. Runs `checkAchievementUnlocks` over the catalog
 *   2. For each newly-unlocked entry:
 *      - Persist `AchievementRow` to Dexie (idempotent — skip if already present)
 *      - Dispatch reward (cosmetic → instanceFromCosmetic; title → profile;
 *        badge → no-op)
 *      - Push to `achievementToastQueue` for UI consumption
 *
 * The dispatcher branches on `reward.kind` (discriminated union with exactly
 * three variants by TypeScript). `equipment` / `ticket` / `pity` are absent
 * from the union — TypeScript rejects them at author time.
 *
 * Spec: openspec/specs/achievement-system/spec.md "Reward dispatcher — three
 * channels, no new currency"
 */

import type {
  Achievement,
  AchievementReward,
  AchievementStats,
  Player,
} from '@study-rpg/core'
import { checkAchievementUnlocks } from '@study-rpg/core'
import { ACHIEVEMENTS } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'
import { achievementToastQueue } from '../lib/achievement-toast-queue'

/**
 * Dispatch a single achievement reward to the appropriate channel.
 * Caller is responsible for persisting the `AchievementRow` first.
 */
export async function dispatchReward(
  reward: AchievementReward,
  achievementId: string,
): Promise<void> {
  switch (reward.kind) {
    case 'cosmetic': {
      // MVP: cosmetic catalog integration is Phase 8+ (cosmetic-system spec
      // delta requires `achievement-*` catalog entries that don't exist yet).
      // For now, log the intent; future wiring calls instanceFromCosmetic.
      // eslint-disable-next-line no-console
      console.info(
        `[achievement-reward] cosmetic grant intent for ${achievementId}: ${reward.cosmeticId}`,
      )
      return
    }
    case 'title': {
      // Title channel: append to leaderboardProfile selectable titles list
      // (player picks display via SettingsPanel — Phase 8). For MVP we just
      // mark the title as available in a Dexie meta entry so SettingsPanel
      // can read.
      const db = getHospitalDB()
      const key = 'achievement-titles-unlocked'
      const meta = await db.meta.get(key)
      const existing: string[] = Array.isArray(meta?.value) ? (meta.value as string[]) : []
      if (!existing.includes(reward.title)) {
        existing.push(reward.title)
        await db.meta.put({ key, value: existing })
      }
      return
    }
    case 'badge': {
      // Badge channel: no extra payload — the unlock itself is the reward.
      // LeaderboardPage derives `badges_csv` from achievements table directly
      // (Phase 10).
      return
    }
  }
}

/**
 * Orchestrator: check for new unlocks, persist, dispatch rewards, queue toasts.
 * Idempotent — already-unlocked achievements are skipped (defensive against
 * predicate flapping or hook race).
 */
export async function checkAndUnlockAchievements(
  prevPlayer: Player,
  prevStats: AchievementStats,
  nextPlayer: Player,
  nextStats: AchievementStats,
): Promise<Achievement[]> {
  const candidates = checkAchievementUnlocks(
    prevPlayer,
    prevStats,
    nextPlayer,
    nextStats,
    ACHIEVEMENTS,
  )
  if (!candidates.length) return []

  const db = getHospitalDB()
  const now = Date.now()
  const actuallyUnlocked: Achievement[] = []

  for (const a of candidates) {
    // Idempotent guard: if already in DB, skip (defensive).
    const existing = await db.achievements.get(a.id)
    if (existing) continue

    await db.achievements.put({
      id: a.id,
      unlockedAt: now,
      notificationShown: false,
    })

    try {
      await dispatchReward(a.reward, a.id)
    } catch (err) {
      // Don't swallow — surface to caller via console; the achievement row
      // is already persisted so the player still has the unlock.
      // eslint-disable-next-line no-console
      console.error(`[achievement-reward] reward dispatch failed for ${a.id}:`, err)
    }

    achievementToastQueue.push(a)
    actuallyUnlocked.push(a)
  }

  return actuallyUnlocked
}
