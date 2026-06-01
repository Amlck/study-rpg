/**
 * Equipment helpers — 二階 hospital mode.
 *
 * Added by add-hospital-equipment-medexam2 (2026-05-24).
 *
 * Two sets of helpers:
 *   (1) Async Dexie reads — getOwnedEquipment / getEquipmentLevel
 *   (2) Pure multiplier computation — computeReputation/Throughput/UniqueCount
 *
 * Multiplier formula (design D2): additive across owned items, level value
 * REPLACES (not stacks with) lower-level values. Final multiplier returned as
 * `1 + Σ bonusByLevel[level - 1]`. Owning 5 L3 + 5 L1 gives 1.40 reputation
 * multiplier and 1.70 throughput multiplier; zero owned gives 1.0 / 1.0.
 *
 * Spec references:
 *   openspec/changes/add-hospital-equipment-medexam2/specs/hospital-equipment/spec.md
 *     — "Each equipment level SHALL grant additive reputation and throughput bonuses"
 *   design.md D2 multiplier formula
 */

import type { EquipmentId, OwnedEquipmentRow } from '@study-rpg/core'
import { EQUIPMENT_CATALOG } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

const CATALOG_BY_ID: Map<EquipmentId, (typeof EQUIPMENT_CATALOG)[number]> = new Map(
  EQUIPMENT_CATALOG.map((def) => [def.id, def]),
)

/** Read all owned equipment rows from Dexie. Returns empty array when nothing owned. */
export async function getOwnedEquipment(): Promise<OwnedEquipmentRow[]> {
  return getHospitalDB().hospitalEquipment.toArray()
}

/** Return current level for a single equipment id; 0 means not owned. */
export async function getEquipmentLevel(equipmentId: EquipmentId): Promise<0 | 1 | 2 | 3> {
  const row = await getHospitalDB().hospitalEquipment.get(equipmentId)
  return row ? row.level : 0
}

/**
 * Compute final reputation multiplier (1 + Σ bonusByLevel[level - 1]).
 * Pure function — feed it the result of `getOwnedEquipment()`.
 * Returns 1.0 when no equipment owned.
 */
export function computeReputationMultiplier(owned: readonly OwnedEquipmentRow[]): number {
  let sum = 0
  for (const row of owned) {
    const def = CATALOG_BY_ID.get(row.equipmentId)
    if (!def) continue // unknown id — silently skip (shouldn't happen with type guard)
    sum += def.reputationBonusByLevel[row.level - 1]
  }
  return 1 + sum
}

/**
 * Compute final throughput multiplier (1 + Σ bonusByLevel[level - 1]).
 * Pure function — feed it the result of `getOwnedEquipment()`.
 * Returns 1.0 when no equipment owned.
 */
export function computeThroughputMultiplier(owned: readonly OwnedEquipmentRow[]): number {
  let sum = 0
  for (const row of owned) {
    const def = CATALOG_BY_ID.get(row.equipmentId)
    if (!def) continue
    sum += def.throughputBonusByLevel[row.level - 1]
  }
  return 1 + sum
}

/**
 * Count unique equipment ids at level ≥ 1. For T4 upgrade gate per
 * `clinic-level-up` Requirement "Tier upgrade SHALL fire when reputation
 * AND diversification dual-gate both satisfied".
 */
export function computeUniqueEquipmentCount(owned: readonly OwnedEquipmentRow[]): number {
  return owned.filter((row) => row.level >= 1).length
}
