/**
 * Achievement reward dispatcher.
 *
 * Two channels only (per spec Req「Reward dispatcher SHALL support exactly
 * 2 channels」):
 * - `leaderboard` — no immediate action; badges_csv derivation runs on next
 *   leaderboard push via `deriveAchievementSnapshot`
 * - `title` — append to `leaderboardProfile.unlockedTitles`; surfaces in
 *   `LeaderboardSettingsControls` selectable list
 *
 * Equipment / cosmetic / ticket / currency rewards are TypeScript-rejected
 * at the catalog declaration site (NeuronsAchievementReward union is closed).
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import type { NeuronsAchievement } from '@study-rpg/content-neurons-tw'
import { db } from '../db'

export async function dispatchReward(achievement: NeuronsAchievement): Promise<void> {
  const r = achievement.reward
  switch (r.kind) {
    case 'leaderboard':
      // Implicit — every unlock contributes to badges_csv via deriveAchievementSnapshot
      // on the next leaderboard push. No immediate action.
      return

    case 'title': {
      // Append to unlockedTitles (idempotent — Set semantics). Find the single
      // leaderboard profile row (keyed by user_id). If no profile exists yet
      // (player has not opted into leaderboard), buffer the title — it will
      // surface once they sign in and the profile row materializes. For the
      // dogfood-only phase, we conservatively skip when no profile exists; a
      // future change can add a "pending titles" Dexie row.
      const profiles = await db.leaderboardProfile.toArray()
      if (profiles.length === 0) {
        // No profile yet — skip silently. Player will get this title via
        // backfill / future re-check after they opt in.
        return
      }
      const profile = profiles[0]!
      const titles = new Set(profile.unlockedTitles ?? [])
      titles.add(r.title)
      await db.leaderboardProfile.update(profile.user_id, {
        unlockedTitles: Array.from(titles).sort(),
      })
      return
    }
  }
}
