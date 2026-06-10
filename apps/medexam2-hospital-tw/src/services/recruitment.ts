import { randomId, rollGacha, type Subject } from '@study-rpg/core'
import {
  RECRUITMENT_THRESHOLDS,
  RECRUITMENT_WEIGHTS,
  RECRUITMENT_PITY_RULES,
  HOSPITAL_CREDIT_PRICES,
  RARITY_POWER_MULTIPLIER,
  DEFAULT_DOCTOR_TITLE_BY_RARITY,
  TIER_ORDER,
  rarityIsAtLeast,
  type HospitalTier,
  type Rarity,
} from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import {
  getAffinity,
  getGachaStats,
  getHospitalDB,
  type DoctorRow,
} from '../db/schema'
import { spendHospitalCredits } from './hospital-credits'

/**
 * Resolve the spriteKey for a newly rolled doctor with 50/50 male/female pick
 * when both theme variants exist. Per `expand-doctor-roster-dei-and-tier4-scene`
 * change. Caller passes the RNG so tests can seed it; production uses Math.random.
 *
 *   - 50% chance: prefer female variant `doctor-<subjectId>-<rarity>-female`
 *     IF it exists in the theme sprite registry; else fall back to legacy male
 *   - 50% chance: use the legacy male key directly
 *   - The female key existence check uses the active theme pack's `sprites` map
 */
export function resolveSpriteKey(
  subjectId: string,
  rarity: Rarity,
  themeSprites: Record<string, string>,
  rng: () => number = Math.random,
): string {
  const baseKey = `doctor-${subjectId}-${rarity}`
  const femaleKey = `${baseKey}-female`
  if (rng() < 0.5 && themeSprites[femaleKey] !== undefined) {
    return femaleKey
  }
  return baseKey
}

export type RollOutcome =
  | { ok: true; doctor: DoctorRow; wasPity: boolean }
  | { ok: false; reason: 'banner-locked'; missing: number }
  | { ok: false; reason: 'no-credits' }
  | { ok: false; reason: 'unknown-subject' }

export type FocusedDoctorRollOutcome =
  | { ok: true; doctor: DoctorRow; wasPity: false }
  | { ok: false; reason: 'locked-tier' | 'no-credits' | 'no-unlocked-banners' | 'empty-pool' }

function isTierAtLeast(tier: HospitalTier, minTier: HospitalTier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(minTier)
}

function weightedRarity(
  weights: typeof RECRUITMENT_WEIGHTS,
  rng: () => number = Math.random,
): Rarity | null {
  const total = weights.reduce((sum, row) => sum + row.weight, 0)
  if (total <= 0) return null
  let roll = rng() * total
  for (const row of weights) {
    roll -= row.weight
    if (roll < 0) return row.id as Rarity
  }
  const fallback = weights[weights.length - 1]?.id
  return fallback ? fallback as Rarity : null
}

async function createDoctor(subject: Subject, rarity: Rarity): Promise<DoctorRow> {
  const db = getHospitalDB()
  const seq = (await db.doctors.where('subjectId').equals(subject.id).count()) + 1
  return {
    id: randomId(),
    subjectId: subject.id,
    rarity,
    powerMultiplier: RARITY_POWER_MULTIPLIER[rarity],
    name: `${subject.displayName} ${DEFAULT_DOCTOR_TITLE_BY_RARITY[rarity]} #${seq}`,
    spriteKey: resolveSpriteKey(subject.id, rarity, THEME_PIXEL_HOSPITAL.sprites),
    obtainedAt: Date.now(),
    assignedRoom: null,
    pityCounter: 0,
  }
}

export async function attemptRoll(subject: Subject): Promise<RollOutcome> {
  const threshold = RECRUITMENT_THRESHOLDS[subject.id]
  if (threshold === undefined) return { ok: false, reason: 'unknown-subject' }

  const affinity = await getAffinity(subject.id)
  if (affinity < threshold) {
    return { ok: false, reason: 'banner-locked', missing: threshold - affinity }
  }

  const db = getHospitalDB()
  return db.transaction('rw', db.gameCounters, db.gachaStats, db.doctors, async () => {
    if (!(await spendHospitalCredits(HOSPITAL_CREDIT_PRICES.doctorPull))) {
      return { ok: false, reason: 'no-credits' } as const
    }

    const stats = await getGachaStats()
    const result = rollGacha(
      { tiers: RECRUITMENT_WEIGHTS, pityRules: RECRUITMENT_PITY_RULES },
      stats,
    )
    const rarity = result.tier as Rarity
    const doctor = await createDoctor(subject, rarity)

    await db.gachaStats.put({
      id: 'global',
      totalRolls: result.newStats.totalRolls,
      rollsSinceLast: { ...result.newStats.rollsSinceLast },
    })
    await db.doctors.put(doctor)
    return { ok: true, doctor, wasPity: result.wasPity } as const
  })
}

export async function attemptFocusedP3Roll(subjects: Subject[]): Promise<FocusedDoctorRollOutcome> {
  const db = getHospitalDB()
  const counters = await db.gameCounters.get('singleton')
  if (!counters || !isTierAtLeast(counters.tier, '醫學中心')) {
    return { ok: false, reason: 'locked-tier' }
  }

  const unlocked: Subject[] = []
  for (const subject of subjects) {
    const threshold = RECRUITMENT_THRESHOLDS[subject.id]
    if (threshold === undefined) continue
    const affinity = await getAffinity(subject.id)
    if (affinity >= threshold) unlocked.push(subject)
  }
  if (unlocked.length === 0) return { ok: false, reason: 'no-unlocked-banners' }

  const focusedWeights = RECRUITMENT_WEIGHTS.filter((row) =>
    rarityIsAtLeast(row.id as Rarity, 'P3'),
  )
  const rarity = weightedRarity(focusedWeights)
  if (!rarity) return { ok: false, reason: 'empty-pool' }
  const subject = unlocked[Math.floor(Math.random() * unlocked.length)]

  return db.transaction('rw', db.gameCounters, db.doctors, async () => {
    if (!(await spendHospitalCredits(HOSPITAL_CREDIT_PRICES.focusedDoctorP3))) {
      return { ok: false, reason: 'no-credits' } as const
    }
    const doctor = await createDoctor(subject, rarity)
    await db.doctors.put(doctor)
    return { ok: true, doctor, wasPity: false } as const
  })
}
