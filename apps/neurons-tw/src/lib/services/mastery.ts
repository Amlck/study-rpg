/**
 * Mastery service — wraps pure tier derivation + Dexie persistence + event
 * emission. Designed to be called from within an existing Dexie transaction
 * (caller passes tx scope) so writes co-commit with connectome AP writes.
 *
 * Spec: openspec/specs/neuron-family-mastery/spec.md
 */

import type { Transaction } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import { db, type FamilyMasteryRow } from '../db'
import { MasteryEventEmitter } from '../mastery'

export const masteryEvents = new MasteryEventEmitter()

/**
 * Increment mastery counters for a family within an existing tx scope.
 *
 * Caller MUST include `db.familyMastery` in tx.tables when opening the
 * transaction. Emits 'mastery.updated' event AFTER tx commits (caller is
 * responsible for emitting if they need post-commit emission semantics; this
 * helper emits synchronously since Dexie tx is awaitable).
 */
export async function recordAttemptInTx(
  _tx: Transaction,
  familyId: string,
  isCorrect: boolean,
): Promise<MasteryUpdate> {
  const existing = await db.familyMastery.get(familyId)
  if (!existing) {
    throw new Error(
      `[mastery] no familyMastery row for "${familyId}" — call initFamilyMasteryIfEmpty(pack) before recording attempts`,
    )
  }
  const next: FamilyMasteryRow = {
    familyId,
    correct: existing.correct + (isCorrect ? 1 : 0),
    total: existing.total + 1,
  }
  await db.familyMastery.put(next)
  return { prev: existing, next }
}

export interface MasteryUpdate {
  prev: FamilyMasteryRow
  next: FamilyMasteryRow
}

/**
 * Emit mastery.updated event for a completed update. Call AFTER tx commits.
 */
export function emitMasteryUpdated(update: MasteryUpdate): void {
  masteryEvents.emit('mastery.updated', {
    familyId: update.next.familyId,
    correct: update.next.correct,
    total: update.next.total,
  })
}

export async function getMastery(familyId: string): Promise<FamilyMasteryRow | undefined> {
  return db.familyMastery.get(familyId)
}

export async function listAllMastery(): Promise<FamilyMasteryRow[]> {
  return db.familyMastery.toArray()
}

export async function initFamilyMasteryIfEmpty(pack: ContentPack): Promise<void> {
  // Wrap count + bulkAdd in a Dexie tx so StrictMode double-mount race doesn't
  // produce ConstraintError.
  await db.transaction('rw', db.familyMastery, async () => {
    const existingCount = await db.familyMastery.count()
    if (existingCount === 0) {
      await db.familyMastery.bulkAdd(
        pack.subjects.map((subject) => ({
          familyId: subject.id,
          correct: 0,
          total: 0,
        })),
      )
    }
  })
  // Emit init events outside tx so any mounted MasteryChip refreshes from
  // current rows (chip's own useEffect may have run before init completed).
  const rows = await db.familyMastery.toArray()
  for (const row of rows) {
    masteryEvents.emit('mastery.updated', {
      familyId: row.familyId,
      correct: row.correct,
      total: row.total,
    })
  }
}
