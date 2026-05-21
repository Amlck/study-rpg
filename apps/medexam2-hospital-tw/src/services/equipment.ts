import { initialGachaStats, randomId, rollGacha } from '@study-rpg/core'
import type { Rarity, RoomType } from '@study-rpg/content-medexam2-tw'
import {
  EQUIPMENT_PITY_RULES,
  EQUIPMENT_ROLL_DEFINITIONS,
  EQUIPMENT_WEIGHTS,
  getDefinitionsByRarity,
  getEquipmentDefinition,
  type EquipmentCategory,
} from '../data/equipment'
import { getHospitalDB, type EquipmentRow } from '../db/schema'

const EQUIPMENT_GACHA_CONFIG = {
  tiers: EQUIPMENT_WEIGHTS,
  pityRules: EQUIPMENT_PITY_RULES,
}

export type EquipmentRollOutcome =
  | { ok: true; equipment: EquipmentRow; wasPity: boolean }
  | { ok: false; reason: 'no-tickets' | 'empty-pool' }

export async function rollEquipment(): Promise<EquipmentRollOutcome> {
  const db = getHospitalDB()
  return db.transaction(
    'rw',
    db.equipmentTickets,
    db.equipmentGachaStats,
    db.equipment,
    async () => {
      const tickets = await db.equipmentTickets.get('global')
      const availableTickets = Math.max(0, Math.floor(tickets?.available ?? 0))
      if (!tickets || availableTickets < 1) return { ok: false, reason: 'no-tickets' } as const

      const existingStats = await db.equipmentGachaStats.get('global')
      const stats = existingStats ?? initialGachaStats(EQUIPMENT_GACHA_CONFIG)
      const result = rollGacha(EQUIPMENT_GACHA_CONFIG, stats)
      const rarity = result.tier as Rarity
      const candidates = getDefinitionsByRarity(rarity)
      if (candidates.length === 0) return { ok: false, reason: 'empty-pool' } as const

      const definition = candidates[Math.floor(Math.random() * candidates.length)]
      const equipment: EquipmentRow = {
        id: randomId(),
        definitionId: definition.id,
        category: definition.category,
        rarity: definition.rarity,
        obtainedAt: Date.now(),
        equippedDoctorId: null,
      }

      await db.equipmentTickets.put({ ...tickets, available: availableTickets - 1 })
      await db.equipmentGachaStats.put({
        id: 'global',
        totalRolls: result.newStats.totalRolls,
        rollsSinceLast: { ...result.newStats.rollsSinceLast },
      })
      await db.equipment.put(equipment)
      return { ok: true, equipment, wasPity: result.wasPity } as const
    },
  )
}

export async function equipItem(itemId: string, doctorId: string): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.equipment, db.doctors, async () => {
    const [item, doctor] = await Promise.all([db.equipment.get(itemId), db.doctors.get(doctorId)])
    if (!item || !doctor) return

    const allEquipment = await db.equipment.toArray()
    await Promise.all(
      allEquipment
        .filter((row) => row.id !== item.id && row.equippedDoctorId === doctor.id)
        .map((row) => db.equipment.put({ ...row, equippedDoctorId: null })),
    )
    await db.equipment.put({ ...item, equippedDoctorId: doctor.id })
  })
}

export async function unequipItem(itemId: string): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.equipment, async () => {
    const item = await db.equipment.get(itemId)
    if (!item) return
    await db.equipment.put({ ...item, equippedDoctorId: null })
  })
}

export function describeEquipment(item: EquipmentRow): {
  name: string
  effectText: string
} {
  const definition = getEquipmentDefinition(item.definitionId)
  return {
    name: definition?.name ?? item.definitionId,
    effectText: definition?.effectText ?? '未知裝備效果。',
  }
}

export function countEquipmentDefinitions(): number {
  return EQUIPMENT_ROLL_DEFINITIONS.length
}

// ─── Equipment throughput bonus ───────────────────────────────────────────────

/** Which room type each targeted category boosts (coat/consumables not listed). */
const CATEGORY_ROOM_TARGET: Partial<Record<EquipmentCategory, RoomType>> = {
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
export function getEquipmentBonus(
  item: EquipmentRow | null | undefined,
  roomType: RoomType,
): number {
  if (!item) return 1
  const idx = RARITY_INDEX[item.rarity]
  if (idx === undefined) return 1

  if (item.category === 'coat') return COAT_BONUS[idx]

  const target = CATEGORY_ROOM_TARGET[item.category]
  if (!target) return 1 // consumables (coffee / textbook) — passive bonus not yet implemented
  if (target !== roomType) return 1 // wrong room type for this piece of equipment

  return SPECIFIC_BONUS[idx]
}

/**
 * Builds a Map<doctorId, EquipmentRow> from the full equipment table, containing
 * only rows that are currently equipped (equippedDoctorId !== null).
 * Cheap O(n) scan intended for use in the tick loop and live-query derivations.
 */
export function buildEquippedItemMap(allEquipment: EquipmentRow[]): Map<string, EquipmentRow> {
  const map = new Map<string, EquipmentRow>()
  for (const row of allEquipment) {
    if (row.equippedDoctorId !== null) {
      map.set(row.equippedDoctorId, row)
    }
  }
  return map
}
