import Dexie, { type EntityTable } from 'dexie'
import type { ContentPack } from '@study-rpg/core'

export type SynapseState = 'dormant' | 'weak' | 'strong'

export interface SynapseRow {
  pairKey: string
  state: SynapseState
  lastCoFireDate: string
  createdAt: string
}

export interface FamilyAccrualRow {
  familyId: string
  ap: number
  firedToday: boolean
  lastFireDate: string | null
  unlockedSlots: number[]
  sameDayCorrect: number
}

export interface MetaRow {
  key: string
  value: string
}

export class NeuronsDB extends Dexie {
  synapses!: EntityTable<SynapseRow, 'pairKey'>
  familyAccrual!: EntityTable<FamilyAccrualRow, 'familyId'>
  meta!: EntityTable<MetaRow, 'key'>

  constructor() {
    super('neurons-rpg')
    this.version(1).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
    })
  }
}

export const db = new NeuronsDB()

export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

export async function initFamilyAccrualIfEmpty(pack: ContentPack): Promise<void> {
  const existingCount = await db.familyAccrual.count()
  if (existingCount === 0) {
    const today = todayISO()
    await db.familyAccrual.bulkAdd(
      pack.subjects.map((subject) => ({
        familyId: subject.id,
        ap: 0,
        firedToday: false,
        lastFireDate: null,
        unlockedSlots: [],
        sameDayCorrect: 0,
      })),
    )
    const existingMeta = await db.meta.get('lastResetDate')
    if (!existingMeta) {
      await db.meta.put({ key: 'lastResetDate', value: today })
    }
  }
}
