import type { HospitalTier } from '@study-rpg/content-medexam2-tw'

export const TIER_DISPLAY_LABEL: Record<HospitalTier, string> = {
  診所: '診所',
  區域醫院: '區域',
  醫學中心: '醫中',
  國家級教學醫院: '大廟',
} satisfies Record<HospitalTier, string>

export function tierLabel(tier: HospitalTier): string {
  return TIER_DISPLAY_LABEL[tier]
}
