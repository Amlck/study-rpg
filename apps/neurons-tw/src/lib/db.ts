import Dexie, { type EntityTable, type Table } from 'dexie'
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

export interface FamilyMasteryRow {
  familyId: string
  correct: number
  total: number
}

export type VariantRarity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

export interface NeuronVariantRow {
  familyId: string
  slotIndex: number
  rarity: VariantRarity
  displayName: string
  spriteKey: string
  rolledAt: number
  wasPityFloor: boolean
}

export interface LeaderboardProfileRow {
  user_id: string
  nickname: string
  nickname_lower: string
  opted_in: boolean
  is_public: boolean
  dismissed_at: number | null
  last_pushed_at: number | null
}

export class NeuronsDB extends Dexie {
  synapses!: EntityTable<SynapseRow, 'pairKey'>
  familyAccrual!: EntityTable<FamilyAccrualRow, 'familyId'>
  meta!: EntityTable<MetaRow, 'key'>
  familyMastery!: EntityTable<FamilyMasteryRow, 'familyId'>
  neuronVariants!: Table<NeuronVariantRow, [string, number]>
  leaderboardProfile!: EntityTable<LeaderboardProfileRow, 'user_id'>

  constructor() {
    super('neurons-rpg')
    this.version(1).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
    })
    this.version(2).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
    })
    this.version(3).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
      // Composite PK [familyId+slotIndex] enforces lifetime uniqueness per
      // (family, slot). Secondary indices on familyId + rolledAt for queries.
      neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
    })
    this.version(4).stores({
      synapses: 'pairKey, lastCoFireDate, state',
      familyAccrual: 'familyId, lastFireDate, firedToday',
      meta: 'key',
      familyMastery: 'familyId',
      neuronVariants: '[familyId+slotIndex], familyId, rolledAt',
      // Per-user leaderboard profile (opt-in state + nickname + push tracking).
      // Single-row table in practice — keyed by Supabase auth user_id.
      leaderboardProfile: 'user_id, nickname_lower',
    })
  }
}

export const db = new NeuronsDB()

export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA')
}

export async function initFamilyAccrualIfEmpty(pack: ContentPack): Promise<void> {
  // Wrap count + bulkAdd in a Dexie tx so StrictMode double-mount race doesn't
  // produce ConstraintError (both effects see count=0 before either bulkAdds).
  await db.transaction('rw', db.familyAccrual, db.meta, async () => {
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
  })
}
