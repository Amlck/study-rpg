/**
 * Adapter-level tests for the questionHistory monotonic-OR merge — guards
 * against the v1↔v2 cross-version sync race documented in Decision 8 of
 * add-bookmarks-filters-and-wrong-history-medexam2.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { HOSPITAL_QUESTION_HISTORY } from '../lib/sync/tables'
import { getHospitalDB } from '../db/schema'
import type { CloudRow } from '../lib/sync/types'

beforeEach(async () => {
  const db = getHospitalDB()
  await db.delete()
  await db.open()
})

function mkRow(overrides: Partial<{
  questionId: string
  subjectId: string
  attempts: number
  correctCount: number
  lastAnsweredAt: number
  lastResult: 'correct' | 'wrong'
  everWrong: boolean | undefined
  nextDueAt: number | null
  interval: number
  easeFactor: number
}> = {}) {
  return {
    questionId: 'Q-1',
    subjectId: '內科',
    attempts: 1,
    correctCount: 0,
    lastAnsweredAt: 1_000_000,
    lastResult: 'wrong' as const,
    everWrong: true,
    nextDueAt: null,
    interval: 0,
    easeFactor: 2.5,
    ...overrides,
  }
}

function mkCloudRow(
  data: Record<string, unknown>,
  updatedAtIso: string,
): CloudRow {
  return {
    user_id: 'u1',
    updated_at: updatedAtIso,
    app_version: null,
    data,
    question_id: data.questionId as string,
  } as CloudRow
}

describe('questionHistory adapter — snapshotAll round-trip', () => {
  it('preserves everWrong=true through snapshot + apply', async () => {
    const db = getHospitalDB()
    const original = mkRow({ everWrong: true, lastResult: 'correct', correctCount: 2 })
    await db.questionHistory.put(original)
    const snap = await HOSPITAL_QUESTION_HISTORY.snapshotAll(db, 'u1', '2026-05-25T00:00:00.000Z', '0.3.0')
    expect(snap).toHaveLength(1)
    expect((snap[0].data as { everWrong?: boolean }).everWrong).toBe(true)

    await db.questionHistory.clear()
    const cloudRow = mkCloudRow(snap[0].data as Record<string, unknown>, '2026-05-25T00:00:01.000Z')
    const wrote = await HOSPITAL_QUESTION_HISTORY.applyToLocal(db, cloudRow, undefined)
    expect(wrote).toBe(true)
    const back = await db.questionHistory.get('Q-1')
    expect(back?.everWrong).toBe(true)
  })

  it('monotonic-OR: incoming missing everWrong does NOT overwrite local true (even if cloud wins LWW)', async () => {
    const db = getHospitalDB()
    const OLDER_ISO = '2026-05-24T00:00:00.000Z'
    const NEWER_ISO = '2026-05-25T00:00:00.000Z'
    // Local: everWrong=true, older updated_at
    await db.questionHistory.put({
      ...mkRow({ everWrong: true, lastResult: 'wrong' }),
      _updatedAt: Date.parse(OLDER_ISO),
    } as unknown as Parameters<typeof db.questionHistory.put>[0])

    // Incoming: NO everWrong field (simulating v1 client write), NEWER updated_at
    const cloudData = {
      questionId: 'Q-1',
      subjectId: '內科',
      attempts: 5,
      correctCount: 3,
      lastAnsweredAt: 2_000_000,
      lastResult: 'correct',
      nextDueAt: null,
      interval: 1,
      easeFactor: 2.5,
      // intentionally NO everWrong
    }
    const cloudRow = mkCloudRow(cloudData, NEWER_ISO)
    const wrote = await HOSPITAL_QUESTION_HISTORY.applyToLocal(db, cloudRow, undefined)
    expect(wrote).toBe(true)

    const merged = await db.questionHistory.get('Q-1')
    // LWW won for other fields (cloud's correctCount=3, lastResult='correct')
    expect(merged?.correctCount).toBe(3)
    expect(merged?.lastResult).toBe('correct')
    // BUT everWrong stays true (monotonic-OR with local true)
    expect(merged?.everWrong).toBe(true)
  })

  it('monotonic-OR: incoming everWrong=true promotes local even when cloud LOSES LWW for other fields', async () => {
    const db = getHospitalDB()
    const OLDER_ISO = '2026-05-24T00:00:00.000Z'
    const NEWER_ISO = '2026-05-25T00:00:00.000Z'
    // Local: NEWER updated_at, everWrong=false
    await db.questionHistory.put({
      ...mkRow({ everWrong: false, lastResult: 'correct', correctCount: 5 }),
      _updatedAt: Date.parse(NEWER_ISO),
    } as unknown as Parameters<typeof db.questionHistory.put>[0])

    // Incoming: OLDER updated_at, but everWrong=true
    const cloudData = {
      questionId: 'Q-1',
      subjectId: '內科',
      attempts: 1,
      correctCount: 0,
      lastAnsweredAt: 500_000,
      lastResult: 'wrong',
      everWrong: true,
      nextDueAt: null,
      interval: 0,
      easeFactor: 2.5,
    }
    const cloudRow = mkCloudRow(cloudData, OLDER_ISO) // older
    const wrote = await HOSPITAL_QUESTION_HISTORY.applyToLocal(db, cloudRow, undefined)
    expect(wrote).toBe(true) // promoted everWrong → still a write

    const merged = await db.questionHistory.get('Q-1')
    // Other fields keep their local LWW-winning values
    expect(merged?.correctCount).toBe(5)
    expect(merged?.lastResult).toBe('correct')
    // BUT everWrong gets promoted to true (monotonic-OR with incoming true)
    expect(merged?.everWrong).toBe(true)
  })
})
