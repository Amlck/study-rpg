/**
 * Equipment purchase / upgrade service — 二階 hospital mode.
 *
 * Added by add-hospital-equipment-medexam2 (2026-05-24).
 *
 * Atomic Dexie transaction: read current level, look up next-level cost from
 * EQUIPMENT_CATALOG, verify gameCounters.revenue >= cost, deduct revenue,
 * upsert hospitalEquipment row with bumped level + timestamps.
 *
 * Discriminated-union result mirrors facility.ts upgradeFacility pattern.
 *
 * L0 → L1: first purchase, sets purchasedAt + upgradedAt + updatedAt to now
 * L1 → L2 / L2 → L3: upgrade, preserves purchasedAt, bumps upgradedAt + updatedAt
 * L3: max, aborts with 'already-max'
 *
 * Spec references:
 *   openspec/changes/add-hospital-equipment-medexam2/specs/hospital-equipment/spec.md
 *     — "Equipment SHALL be purchasable at any hospital tier, gated only by revenue"
 *     — "Already-max L3 equipment shows disabled upgrade button"
 */

import type { EquipmentId, OwnedEquipmentRow } from '@study-rpg/core'
import { EQUIPMENT_CATALOG } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

export type PurchaseResult =
  | {
      kind: 'success'
      equipmentId: EquipmentId
      newLevel: 1 | 2 | 3
      revenueSpent: number
    }
  | {
      kind: 'aborted'
      equipmentId: EquipmentId
      reason: 'already-max' | 'insufficient-revenue' | 'unknown-equipment'
      requiredRevenue?: number
    }

export async function purchaseOrUpgrade(equipmentId: EquipmentId): Promise<PurchaseResult> {
  const def = EQUIPMENT_CATALOG.find((d) => d.id === equipmentId)
  if (!def) {
    return { kind: 'aborted', equipmentId, reason: 'unknown-equipment' }
  }

  const db = getHospitalDB()
  return db.transaction('rw', [db.hospitalEquipment, db.gameCounters], async () => {
    const existing = await db.hospitalEquipment.get(equipmentId)
    const currentLevel: 0 | 1 | 2 | 3 = existing ? existing.level : 0

    if (currentLevel === 3) {
      return { kind: 'aborted', equipmentId, reason: 'already-max' }
    }

    const nextLevel = (currentLevel + 1) as 1 | 2 | 3
    const cost = def.costByLevel[nextLevel - 1]

    const counters = await db.gameCounters.get('singleton')
    if (!counters || counters.revenue < cost) {
      return {
        kind: 'aborted',
        equipmentId,
        reason: 'insufficient-revenue',
        requiredRevenue: cost,
      }
    }

    const now = Date.now()
    const row: OwnedEquipmentRow = {
      equipmentId,
      level: nextLevel,
      purchasedAt: existing ? existing.purchasedAt : now,
      upgradedAt: now,
      updatedAt: now,
    }
    await db.hospitalEquipment.put(row)
    await db.gameCounters.put({ ...counters, revenue: counters.revenue - cost })

    return { kind: 'success', equipmentId, newLevel: nextLevel, revenueSpent: cost }
  })
}
