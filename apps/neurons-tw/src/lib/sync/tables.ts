// TableAdapter — snapshot/apply per Dexie store for neurons-tw cloud sync.
//
// Each adapter encapsulates: (a) read entire store into a serializable array
// and (b) merge an incoming array back into the store with LWW semantics.
//
// Design: rather than per-row CloudRow indirection (medexam-tw pattern, which
// mirrors Supabase upsert_lww shape), neurons-tw uses direct Dexie row shapes
// in the bundle. Simpler — neurons-tw never had a Supabase data path.

import type { NeuronsDB } from '../db'

/** Result of applying a single incoming row. */
export type ApplyOutcome = 'wrote' | 'skipped' | 'merged'

export interface TableAdapter<TName extends string = string> {
  /** Stable identifier used as the JSON key in the bundle. */
  name: TName
  /** Read every row currently in the store. Returned objects must be JSON-safe. */
  snapshot(db: NeuronsDB): Promise<unknown[]>
  /** Merge the incoming rows into the store with LWW resolution. */
  apply(db: NeuronsDB, rows: unknown[]): Promise<{ applied: number; skipped: number }>
}

// ---- LWW helpers ----------------------------------------------------------

function pickUpdatedAt(row: unknown): number | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  if (typeof r.updatedAt === 'number') return r.updatedAt
  if (typeof r.updated_at === 'number') return r.updated_at
  if (typeof r.unlockedAt === 'number') return r.unlockedAt
  if (typeof r.rolledAt === 'number') return r.rolledAt
  return null
}

/**
 * LWW resolver: keep the row with the greater `updatedAt` (or equivalent
 * monotonic field). When neither side has a timestamp, prefer incoming
 * (incoming was authoritative at push time).
 */
function lwwPick<T>(local: T | undefined, incoming: T): T {
  if (local === undefined) return incoming
  const a = pickUpdatedAt(local)
  const b = pickUpdatedAt(incoming)
  if (a === null && b === null) return incoming
  if (a === null) return incoming
  if (b === null) return local
  return b >= a ? incoming : local
}

// ---- Synapses -------------------------------------------------------------

const synapsesAdapter: TableAdapter<'synapses'> = {
  name: 'synapses',
  async snapshot(db) {
    return await db.synapses.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.synapses, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const pairKey = row.pairKey
        if (typeof pairKey !== 'string') {
          skipped++
          continue
        }
        const local = await db.synapses.get(pairKey)
        // Synapses don't carry updatedAt; use lastCoFireDate as a proxy
        // (ISO date string, lexicographic compare = chronological).
        const localDate = (local as unknown as Record<string, unknown> | undefined)?.lastCoFireDate
        const incomingDate = row.lastCoFireDate
        if (
          local !== undefined &&
          typeof localDate === 'string' &&
          typeof incomingDate === 'string' &&
          localDate > incomingDate
        ) {
          skipped++
          continue
        }
        await db.synapses.put(incoming as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Family accrual -------------------------------------------------------

const familyAccrualAdapter: TableAdapter<'familyAccrual'> = {
  name: 'familyAccrual',
  async snapshot(db) {
    return await db.familyAccrual.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.familyAccrual, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const familyId = (incoming as Record<string, unknown>).familyId
        if (typeof familyId !== 'string') {
          skipped++
          continue
        }
        const local = await db.familyAccrual.get(familyId)
        // No explicit updatedAt; AP is monotonic per family, so keep MAX(ap)
        // and prefer incoming for non-ap fields when ap ties.
        const localAp =
          typeof (local as unknown as Record<string, unknown> | undefined)?.ap === 'number'
            ? ((local as unknown as Record<string, unknown>).ap as number)
            : -1
        const incomingAp =
          typeof (incoming as Record<string, unknown>).ap === 'number'
            ? ((incoming as Record<string, unknown>).ap as number)
            : -1
        if (incomingAp < localAp) {
          skipped++
          continue
        }
        await db.familyAccrual.put(incoming as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Family mastery -------------------------------------------------------

const familyMasteryAdapter: TableAdapter<'familyMastery'> = {
  name: 'familyMastery',
  async snapshot(db) {
    return await db.familyMastery.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.familyMastery, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const familyId = (incoming as Record<string, unknown>).familyId
        if (typeof familyId !== 'string') {
          skipped++
          continue
        }
        const local = await db.familyMastery.get(familyId)
        // Counters are monotonic — MAX-merge both correct and total.
        const localCorrect = ((local as unknown as Record<string, unknown> | undefined)?.correct ?? 0) as number
        const localTotal = ((local as unknown as Record<string, unknown> | undefined)?.total ?? 0) as number
        const incCorrect = ((incoming as Record<string, unknown>).correct ?? 0) as number
        const incTotal = ((incoming as Record<string, unknown>).total ?? 0) as number
        await db.familyMastery.put({
          familyId,
          correct: Math.max(localCorrect, incCorrect),
          total: Math.max(localTotal, incTotal),
        })
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Neuron variants ------------------------------------------------------

const neuronVariantsAdapter: TableAdapter<'neuronVariants'> = {
  name: 'neuronVariants',
  async snapshot(db) {
    return await db.neuronVariants.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.neuronVariants, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const familyId = row.familyId
        const slotIndex = row.slotIndex
        if (typeof familyId !== 'string' || typeof slotIndex !== 'number') {
          skipped++
          continue
        }
        const local = await db.neuronVariants.get([familyId, slotIndex])
        // Variants are immutable once rolled — first-write wins.
        if (local) {
          skipped++
          continue
        }
        await db.neuronVariants.put(incoming as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Achievements ---------------------------------------------------------

const achievementsAdapter: TableAdapter<'achievements'> = {
  name: 'achievements',
  async snapshot(db) {
    return await db.achievements.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.achievements, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const id = (incoming as Record<string, unknown>).id
        if (typeof id !== 'string') {
          skipped++
          continue
        }
        const local = await db.achievements.get(id)
        // Achievements are first-unlock immutable — keep the EARLIER unlockedAt
        // when both sides have a row.
        if (local) {
          const localAt = local.unlockedAt
          const incomingAt = (incoming as Record<string, unknown>).unlockedAt
          if (typeof incomingAt === 'number' && incomingAt < localAt) {
            await db.achievements.put({
              id,
              unlockedAt: incomingAt,
              // Mark notificationShown=true on cross-device pull so the toast
              // never re-fires for an already-unlocked achievement.
              notificationShown: true,
            })
            applied++
          } else {
            skipped++
          }
          continue
        }
        // First time seeing — write with notificationShown=true so silent
        // backfill discipline holds for cross-device pull.
        const row = incoming as Record<string, unknown>
        await db.achievements.put({
          id,
          unlockedAt: typeof row.unlockedAt === 'number' ? row.unlockedAt : Date.now(),
          notificationShown: true,
        })
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Leaderboard profile (single row keyed by user_id) ---------------------

const leaderboardProfileAdapter: TableAdapter<'leaderboardProfile'> = {
  name: 'leaderboardProfile',
  async snapshot(db) {
    return await db.leaderboardProfile.toArray()
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.leaderboardProfile, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const userId = (incoming as Record<string, unknown>).user_id
        if (typeof userId !== 'string') {
          skipped++
          continue
        }
        const local = await db.leaderboardProfile.get(userId)
        // LWW on last_pushed_at (newest push wins).
        const localPushed = ((local as unknown as Record<string, unknown> | undefined)?.last_pushed_at ?? 0) as number
        const incomingPushed = ((incoming as Record<string, unknown>).last_pushed_at ?? 0) as number
        if (local && localPushed > incomingPushed) {
          skipped++
          continue
        }
        await db.leaderboardProfile.put(lwwPick(local, incoming) as never)
        applied++
      }
    })
    return { applied, skipped }
  },
}

// ---- Meta (key-value scratchpad) ------------------------------------------

/**
 * Allowlist of meta keys that participate in cross-device sync. Anything not
 * listed stays local-only. The list intentionally excludes ephemeral state
 * like `lastResetDate` and `currentQuizCorrectStreak` (LWW will set on push;
 * see backfill/counters.ts for MAX-merge counters that ride on this adapter).
 */
const SYNCED_META_KEYS: ReadonlySet<string> = new Set([
  'maxQuizCorrectStreak',
  'totalStudyMinutes',
  'currentQuizCorrectStreak',
])

const metaAdapter: TableAdapter<'meta'> = {
  name: 'meta',
  async snapshot(db) {
    const all = await db.meta.toArray()
    return all.filter((r) => SYNCED_META_KEYS.has(r.key))
  },
  async apply(db, rows) {
    let applied = 0
    let skipped = 0
    await db.transaction('rw', db.meta, async () => {
      for (const incoming of rows) {
        if (!incoming || typeof incoming !== 'object') {
          skipped++
          continue
        }
        const row = incoming as Record<string, unknown>
        const key = row.key
        if (typeof key !== 'string' || !SYNCED_META_KEYS.has(key)) {
          skipped++
          continue
        }
        // Counter MAX-merge is handled by backfill/counters.ts AFTER this
        // adapter runs (per design D5). Here we just write incoming if local
        // is missing; otherwise leave local alone — the backfill step will
        // resolve the final value.
        const local = await db.meta.get(key)
        if (!local) {
          await db.meta.put(incoming as never)
          applied++
        } else {
          skipped++
        }
      }
    })
    return { applied, skipped }
  },
}

// ---- Adapter registry -----------------------------------------------------

export const NEURONS_ADAPTERS: ReadonlyArray<TableAdapter> = [
  synapsesAdapter,
  familyAccrualAdapter,
  familyMasteryAdapter,
  neuronVariantsAdapter,
  achievementsAdapter,
  leaderboardProfileAdapter,
  metaAdapter,
]
