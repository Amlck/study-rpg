/**
 * Achievement system pure functions — milestone unlock detection.
 *
 * Mirrors the `cosmetic.ts` predicate → diff → unlock pattern. New
 * achievements = one catalog entry in `packages/content-medexam2-tw/src/
 * achievements.ts`; zero engine code changes needed.
 *
 * Spec: openspec/specs/achievement-system/spec.md
 */

import type { Achievement, AchievementStats, Player } from '../types'

/**
 * Diff-based unlock detection. Returns achievements whose predicate transitions
 * from false (prev state) → true (next state). Already-unlocked entries (both
 * prev and next satisfy predicate) MUST NOT be re-emitted.
 *
 * Caller is responsible for assembling fresh `prevStats` / `nextStats`
 * (typically from Dexie counters + question history at hook invocation time).
 *
 * Mirror of `checkMilestoneUnlocks` in cosmetic.ts.
 */
export function checkAchievementUnlocks(
  prev: Player,
  prevStats: AchievementStats,
  next: Player,
  nextStats: AchievementStats,
  catalog: readonly Achievement[],
): Achievement[] {
  const newlyUnlocked: Achievement[] = []
  for (const a of catalog) {
    const before = a.predicate(prev, prevStats)
    const after = a.predicate(next, nextStats)
    if (!before && after) newlyUnlocked.push(a)
  }
  return newlyUnlocked
}

/** Convenience: filter catalog to entries unlocked given current state. */
export function listUnlockedAchievements(
  player: Player,
  stats: AchievementStats,
  catalog: readonly Achievement[],
): Achievement[] {
  return catalog.filter((a) => a.predicate(player, stats))
}

/** Convenience: filter catalog to entries still locked. */
export function listLockedAchievements(
  player: Player,
  stats: AchievementStats,
  catalog: readonly Achievement[],
): Achievement[] {
  return catalog.filter((a) => !a.predicate(player, stats))
}

/**
 * Filter catalog visible to UI given unlock state. Hidden achievements
 * are excluded unless already unlocked. Mirror the cosmetic locked-picker
 * silhouette pattern, but stricter: hidden + locked = invisible (no
 * silhouette), per achievement-system spec "Hidden achievement strict UI
 * filtering".
 */
export function visibleAchievements(
  catalog: readonly Achievement[],
  unlockedIds: ReadonlySet<string>,
): Achievement[] {
  return catalog.filter((a) => !a.hidden || unlockedIds.has(a.id))
}
