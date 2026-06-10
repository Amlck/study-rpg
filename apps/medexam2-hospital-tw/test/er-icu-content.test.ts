import { describe, expect, it } from 'vitest'
import {
  ROOM_EXTENSION_COSTS,
  ROOM_TYPE_LABELS,
  TIER_ROOMS,
  getAffinityBonus,
} from '@study-rpg/content-medexam2-tw'

describe('ER and ICU content metadata', () => {
  it('defines labels, tier rosters, and extension costs', () => {
    expect(ROOM_TYPE_LABELS.emergency).toBe('急診')
    expect(ROOM_TYPE_LABELS.icu).toBe('加護病房')

    expect(TIER_ROOMS['區域醫院'].map((room) => room.id)).toContain('emergency-1')
    expect(TIER_ROOMS['醫學中心'].map((room) => room.id)).toContain('icu-1')
    expect(TIER_ROOMS['國家級教學醫院'].map((room) => room.id)).toEqual(
      expect.arrayContaining(['emergency-2', 'icu-2']),
    )

    expect(ROOM_EXTENSION_COSTS.emergency).toEqual({ cost: 150_000, maxExtras: 2 })
    expect(ROOM_EXTENSION_COSTS.icu).toEqual({ cost: 450_000, maxExtras: 1 })
  })

  it('applies secondary affinity bonuses only to configured ER and ICU specialties', () => {
    expect(getAffinityBonus('P3', '外科', 'emergency')).toBe(1.3)
    expect(getAffinityBonus('P3', '麻醉科', 'emergency')).toBe(1.3)
    expect(getAffinityBonus('P3', '神經內科', 'emergency')).toBe(1)

    expect(getAffinityBonus('P2', '神經內科', 'icu')).toBe(1.4)
    expect(getAffinityBonus('P2', '小兒科', 'icu')).toBe(1.4)
    expect(getAffinityBonus('P2', '皮膚科', 'icu')).toBe(1)
  })
})
