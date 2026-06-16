import type { ChallengeEconomyReward } from '../lib/challenge'
import { getHospitalDB, grantTicketsForCorrect } from '../db/schema'

export async function applyChallengeEconomyReward(reward: ChallengeEconomyReward): Promise<number> {
  const db = getHospitalDB()
  const counters = await db.gameCounters.get('singleton')
  if (!counters) return 0

  if (reward.revenueDelta > 0 || reward.reputationDelta > 0) {
    await db.gameCounters.put({
      ...counters,
      revenue: counters.revenue + reward.revenueDelta,
      reputation: counters.reputation + reward.reputationDelta,
    })
  }

  return reward.hospitalCreditDelta > 0
    ? grantTicketsForCorrect(reward.hospitalCreditDelta)
    : 0
}
