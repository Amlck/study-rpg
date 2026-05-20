import { initialGachaStats, randomId, rollGacha } from '@study-rpg/core'
import type { Rarity } from '@study-rpg/content-medexam2-tw'
import {
  EQUIPMENT_DEFINITIONS,
  EQUIPMENT_PITY_RULES,
  EQUIPMENT_WEIGHTS,
  getDefinitionsByRarity,
  getEquipmentDefinition,
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
  return EQUIPMENT_DEFINITIONS.length
}
