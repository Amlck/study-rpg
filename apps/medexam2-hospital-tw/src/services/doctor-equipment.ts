import { initialGachaStats, randomId, rollGacha } from '@study-rpg/core'
import type { Rarity, RoomType } from '@study-rpg/content-medexam2-tw'
import {
  DOCTOR_EQUIPMENT_PARTS_BY_RARITY,
  DOCTOR_EQUIPMENT_PITY_RULES,
  DOCTOR_EQUIPMENT_ROLL_DEFINITIONS,
  DOCTOR_EQUIPMENT_UPGRADE_COSTS,
  DOCTOR_EQUIPMENT_WEIGHTS,
  getDefinitionsByRarity,
  getDoctorEquipmentDefinition,
  getNextDoctorEquipmentDefinition,
  getNextDoctorEquipmentRarity,
  isUpgradeableDoctorEquipmentCategory,
  type DoctorEquipmentCategory,
  type DoctorEquipmentUpgradeSourceRarity,
} from '../data/doctor-equipment'
import { getHospitalDB, type DoctorEquipmentRow } from '../db/schema'

const DOCTOR_EQUIPMENT_GACHA_CONFIG = {
  tiers: DOCTOR_EQUIPMENT_WEIGHTS,
  pityRules: DOCTOR_EQUIPMENT_PITY_RULES,
}

export type DoctorEquipmentRollOutcome =
  | { ok: true; doctorEquipment: DoctorEquipmentRow; wasPity: boolean }
  | { ok: false; reason: 'no-tickets' | 'empty-pool' }

export type DoctorEquipmentUpgradeResult =
  | {
      kind: 'success'
      doctorEquipment: DoctorEquipmentRow
      fromRarity: DoctorEquipmentUpgradeSourceRarity
      toRarity: Rarity
      revenueSpent: number
      partsSpent: number
    }
  | {
      kind: 'aborted'
      reason:
        | 'not-found'
        | 'unsupported-category'
        | 'terminal-rarity'
        | 'missing-definition'
        | 'insufficient-parts'
        | 'insufficient-revenue'
      requiredParts: number
      requiredRevenue: number
    }

export type DoctorEquipmentDismantleResult =
  | {
      kind: 'success'
      itemId: string
      partsGained: number
      rarity: Rarity
    }
  | {
      kind: 'aborted'
      reason: 'not-found' | 'equipped'
      partsGained: number
    }

export async function rollDoctorEquipment(): Promise<DoctorEquipmentRollOutcome> {
  const db = getHospitalDB()
  return db.transaction(
    'rw',
    db.doctorEquipmentTickets,
    db.doctorEquipmentGachaStats,
    db.doctorEquipment,
    async () => {
      const tickets = await db.doctorEquipmentTickets.get('global')
      const availableTickets = Math.max(0, Math.floor(tickets?.available ?? 0))
      if (!tickets || availableTickets < 1) return { ok: false, reason: 'no-tickets' } as const

      const existingStats = await db.doctorEquipmentGachaStats.get('global')
      const stats = existingStats ?? initialGachaStats(DOCTOR_EQUIPMENT_GACHA_CONFIG)
      const result = rollGacha(DOCTOR_EQUIPMENT_GACHA_CONFIG, stats)
      const rarity = result.tier as Rarity
      const candidates = getDefinitionsByRarity(rarity)
      if (candidates.length === 0) return { ok: false, reason: 'empty-pool' } as const

      const definition = candidates[Math.floor(Math.random() * candidates.length)]
      const doctorEquipment: DoctorEquipmentRow = {
        id: randomId(),
        definitionId: definition.id,
        category: definition.category,
        rarity: definition.rarity,
        obtainedAt: Date.now(),
        equippedDoctorId: null,
      }

      await db.doctorEquipmentTickets.put({ ...tickets, available: availableTickets - 1 })
      await db.doctorEquipmentGachaStats.put({
        id: 'global',
        totalRolls: result.newStats.totalRolls,
        rollsSinceLast: { ...result.newStats.rollsSinceLast },
      })
      await db.doctorEquipment.put(doctorEquipment)
      return { ok: true, doctorEquipment, wasPity: result.wasPity } as const
    },
  )
}

export async function equipDoctorEquipmentItem(itemId: string, doctorId: string): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.doctorEquipment, db.doctors, async () => {
    const [item, doctor] = await Promise.all([db.doctorEquipment.get(itemId), db.doctors.get(doctorId)])
    if (!item || !doctor) return

    const allDoctorEquipment = await db.doctorEquipment.toArray()
    await Promise.all(
      allDoctorEquipment
        .filter((row) => row.id !== item.id && row.equippedDoctorId === doctor.id)
        .map((row) => db.doctorEquipment.put({ ...row, equippedDoctorId: null })),
    )
    await db.doctorEquipment.put({ ...item, equippedDoctorId: doctor.id })
  })
}

export async function unequipDoctorEquipmentItem(itemId: string): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.doctorEquipment, async () => {
    const item = await db.doctorEquipment.get(itemId)
    if (!item) return
    await db.doctorEquipment.put({ ...item, equippedDoctorId: null })
  })
}

export async function dismantleDoctorEquipment(itemId: string): Promise<DoctorEquipmentDismantleResult> {
  const db = getHospitalDB()
  return db.transaction('rw', [db.doctorEquipment, db.doctorEquipmentMaterials], async () => {
    const item = await db.doctorEquipment.get(itemId)
    if (!item) return { kind: 'aborted', reason: 'not-found', partsGained: 0 }
    if (item.equippedDoctorId) return { kind: 'aborted', reason: 'equipped', partsGained: 0 }

    const partsGained = DOCTOR_EQUIPMENT_PARTS_BY_RARITY[item.rarity]
    const materials = (await db.doctorEquipmentMaterials.get('global')) ?? { id: 'global', parts: 0 }
    await db.doctorEquipment.delete(item.id)
    await db.doctorEquipmentMaterials.put({
      ...materials,
      parts: materials.parts + partsGained,
    })

    return {
      kind: 'success',
      itemId: item.id,
      partsGained,
      rarity: item.rarity,
    }
  })
}

export async function upgradeDoctorEquipment(itemId: string): Promise<DoctorEquipmentUpgradeResult> {
  const db = getHospitalDB()
  return db.transaction(
    'rw',
    [db.doctorEquipment, db.doctorEquipmentMaterials, db.gameCounters],
    async () => {
      const item = await db.doctorEquipment.get(itemId)
      if (!item) {
        return {
          kind: 'aborted',
          reason: 'not-found',
          requiredParts: 0,
          requiredRevenue: 0,
        }
      }

      if (!isUpgradeableDoctorEquipmentCategory(item.category)) {
        return {
          kind: 'aborted',
          reason: 'unsupported-category',
          requiredParts: 0,
          requiredRevenue: 0,
        }
      }

      const toRarity = getNextDoctorEquipmentRarity(item.rarity)
      if (!toRarity) {
        return {
          kind: 'aborted',
          reason: 'terminal-rarity',
          requiredParts: 0,
          requiredRevenue: 0,
        }
      }

      const fromRarity = item.rarity as DoctorEquipmentUpgradeSourceRarity
      const cost = DOCTOR_EQUIPMENT_UPGRADE_COSTS[fromRarity]
      const targetDefinition = getNextDoctorEquipmentDefinition(item.category, item.rarity)
      if (!targetDefinition) {
        return {
          kind: 'aborted',
          reason: 'missing-definition',
          requiredParts: cost.parts,
          requiredRevenue: cost.revenue,
        }
      }

      const materials = (await db.doctorEquipmentMaterials.get('global')) ?? { id: 'global', parts: 0 }
      if (materials.parts < cost.parts) {
        return {
          kind: 'aborted',
          reason: 'insufficient-parts',
          requiredParts: cost.parts,
          requiredRevenue: cost.revenue,
        }
      }

      const counters = await db.gameCounters.get('singleton')
      if (!counters || counters.revenue < cost.revenue) {
        return {
          kind: 'aborted',
          reason: 'insufficient-revenue',
          requiredParts: cost.parts,
          requiredRevenue: cost.revenue,
        }
      }

      const upgraded: DoctorEquipmentRow = {
        ...item,
        definitionId: targetDefinition.id,
        category: targetDefinition.category,
        rarity: targetDefinition.rarity,
      }

      await db.doctorEquipmentMaterials.put({ ...materials, parts: materials.parts - cost.parts })
      await db.gameCounters.put({ ...counters, revenue: counters.revenue - cost.revenue })
      await db.doctorEquipment.put(upgraded)

      return {
        kind: 'success',
        doctorEquipment: upgraded,
        fromRarity,
        toRarity,
        revenueSpent: cost.revenue,
        partsSpent: cost.parts,
      }
    },
  )
}

export function describeDoctorEquipment(item: DoctorEquipmentRow): {
  name: string
  effectText: string
} {
  const definition = getDoctorEquipmentDefinition(item.definitionId)
  return {
    name: definition?.name ?? item.definitionId,
    effectText: definition?.effectText ?? '未知裝備效果。',
  }
}

export function countDoctorEquipmentDefinitions(): number {
  return DOCTOR_EQUIPMENT_ROLL_DEFINITIONS.length
}

// ─── DoctorEquipment throughput bonus ───────────────────────────────────────────────

/** Which room type each targeted category boosts (coat/consumables not listed). */
const CATEGORY_ROOM_TARGET: Partial<Record<DoctorEquipmentCategory, RoomType>> = {
  stethoscope: 'outpatient',
  scalpel: 'surgery',
  chart: 'ward',
}

/** Rarity string → 0-based index (P5=0 … P1=4). */
const RARITY_INDEX: Partial<Record<Rarity, number>> = {
  P5: 0,
  P4: 1,
  P3: 2,
  P2: 3,
  P1: 4,
}

/**
 * Room-specific (stethoscope/scalpel/chart) throughput multipliers per rarity.
 * P5 +5 % → P4 +10 % → P3 +20 % → P2 +35 % → P1 +55 %
 */
const SPECIFIC_BONUS = [1.05, 1.10, 1.20, 1.35, 1.55] as const

/**
 * Universal (coat) throughput multipliers per rarity — lower than specific gear.
 * P5 +3 % → P4 +6 % → P3 +12 % → P2 +20 % → P1 +30 %
 */
const COAT_BONUS = [1.03, 1.06, 1.12, 1.20, 1.30] as const

/**
 * Returns the multiplicative throughput bonus for a single equipped item in the
 * given room type. Returns 1 (no bonus) when the item category doesn't match
 * the room, or when the item is a consumable (coffee / textbook).
 */
export function getDoctorEquipmentBonus(
  item: DoctorEquipmentRow | null | undefined,
  roomType: RoomType,
): number {
  if (!item) return 1
  const idx = RARITY_INDEX[item.rarity]
  if (idx === undefined) return 1

  if (item.category === 'coat') return COAT_BONUS[idx]

  const target = CATEGORY_ROOM_TARGET[item.category]
  if (!target) return 1 // consumables (coffee / textbook) — passive bonus not yet implemented
  if (target !== roomType) return 1 // wrong room type for this piece of doctorEquipment

  return SPECIFIC_BONUS[idx]
}

/**
 * Builds a Map<doctorId, DoctorEquipmentRow> from the full doctorEquipment table, containing
 * only rows that are currently equipped (equippedDoctorId !== null).
 * Cheap O(n) scan intended for use in the tick loop and live-query derivations.
 */
export function buildEquippedDoctorEquipmentMap(allDoctorEquipment: DoctorEquipmentRow[]): Map<string, DoctorEquipmentRow> {
  const map = new Map<string, DoctorEquipmentRow>()
  for (const row of allDoctorEquipment) {
    if (row.equippedDoctorId !== null) {
      map.set(row.equippedDoctorId, row)
    }
  }
  return map
}
