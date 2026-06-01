import type { HospitalTier } from '@study-rpg/content-medexam2-tw'

export const TIER_DISPLAY_LABEL: Record<HospitalTier, string> = {
  診所: '診所',
  區域醫院: '區域',
  醫學中心: '醫中',
  國家級教學醫院: '大廟',
} satisfies Record<HospitalTier, string>

export const NUM_TO_TIER: Record<number, HospitalTier> = {
  1: '診所',
  2: '區域醫院',
  3: '醫學中心',
  4: '國家級教學醫院',
}

export function tierLabel(tier: HospitalTier): string {
  return TIER_DISPLAY_LABEL[tier]
}

export function tierLabelFromNumber(n: number): string {
  const tier = NUM_TO_TIER[n]
  if (!tier) {
    console.warn('[leaderboard] unexpected hospital_tier', n)
    return TIER_DISPLAY_LABEL['診所']
  }
  return TIER_DISPLAY_LABEL[tier]
}
