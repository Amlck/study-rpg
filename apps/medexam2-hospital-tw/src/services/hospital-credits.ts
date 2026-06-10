import {
  HOSPITAL_CREDIT_PARTS_BUNDLE_AMOUNT,
  HOSPITAL_CREDIT_PRICES,
  clampHospitalCredits,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB, type GameCountersRow } from '../db/schema'

export function readHospitalCredits(counters: GameCountersRow | null | undefined): number {
  return clampHospitalCredits(counters?.hospitalCredits ?? 0)
}

export async function grantHospitalCredits(amount: number): Promise<number> {
  const db = getHospitalDB()
  const counters = await db.gameCounters.get('singleton')
  if (!counters) return 0
  const current = readHospitalCredits(counters)
  const next = clampHospitalCredits(current + amount)
  const granted = next - current
  if (granted > 0) {
    await db.gameCounters.put({ ...counters, hospitalCredits: next })
  }
  return granted
}

export async function spendHospitalCredits(cost: number): Promise<boolean> {
  const db = getHospitalDB()
  const counters = await db.gameCounters.get('singleton')
  if (!counters) return false
  const current = readHospitalCredits(counters)
  if (current < cost) return false
  await db.gameCounters.put({ ...counters, hospitalCredits: current - cost })
  return true
}

export type PartsBundlePurchaseResult =
  | {
      ok: true
      creditsSpent: number
      partsGained: number
    }
  | { ok: false; reason: 'no-credits' | 'missing-state' }

export async function purchaseEquipmentPartsBundle(): Promise<PartsBundlePurchaseResult> {
  const db = getHospitalDB()
  return db.transaction('rw', [db.gameCounters, db.equipmentMaterials], async () => {
    const counters = await db.gameCounters.get('singleton')
    if (!counters) return { ok: false, reason: 'missing-state' } as const
    const current = readHospitalCredits(counters)
    const cost = HOSPITAL_CREDIT_PRICES.partsBundle
    if (current < cost) return { ok: false, reason: 'no-credits' } as const

    const materials = (await db.equipmentMaterials.get('global')) ?? { id: 'global', parts: 0 }
    await db.gameCounters.put({ ...counters, hospitalCredits: current - cost })
    await db.equipmentMaterials.put({
      ...materials,
      parts: materials.parts + HOSPITAL_CREDIT_PARTS_BUNDLE_AMOUNT,
    })

    return {
      ok: true,
      creditsSpent: cost,
      partsGained: HOSPITAL_CREDIT_PARTS_BUNDLE_AMOUNT,
    } as const
  })
}
