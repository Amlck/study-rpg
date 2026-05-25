/**
 * Adapter-level tests for the questionHistory merge logic.
 *
 * As of `tune-srs-binary-modifiers-and-intervals` (2026-05-25), this merge
 * uses row-level LWW with a "preserve local on cloud omission" fallback.
 * Previously (Decision 8 of add-bookmarks-filters-and-wrong-history-medexam2)
 * it was monotonic-OR — the change relaxes the invariant so that explicit
 * `everWrong = false` writes (from 「太簡單」 clicks) can propagate cross-device.
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

  it('omission-preserve: incoming missing everWrong does NOT overwrite local true (even if cloud wins LWW)', async () => {
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
    // everWrong stays true (cloud omitted the field → preserve local)
    expect(merged?.everWrong).toBe(true)
  })

  it('LWW clear propagation: newer cloud everWrong=false (explicit 「太簡單」 clear) overwrites local true', async () => {
    const db = getHospitalDB()
    const OLDER_ISO = '2026-05-24T00:00:00.000Z'
    const NEWER_ISO = '2026-05-25T00:00:00.000Z'
    // Local: everWrong=true (player got Q wrong previously)
    await db.questionHistory.put({
      ...mkRow({ everWrong: true, lastResult: 'wrong' }),
      _updatedAt: Date.parse(OLDER_ISO),
    } as unknown as Parameters<typeof db.questionHistory.put>[0])

    // Cloud: NEWER updated_at, everWrong=false (player clicked 「太簡單」 on device B)
    const cloudData = {
      questionId: 'Q-1',
      subjectId: '內科',
      attempts: 5,
      correctCount: 3,
      lastAnsweredAt: 2_000_000,
      lastResult: 'correct',
      everWrong: false, // explicit clear from 「太簡單」 click
      nextDueAt: null,
      interval: 21,
      easeFactor: 3.75,
    }
    const cloudRow = mkCloudRow(cloudData, NEWER_ISO)
    const wrote = await HOSPITAL_QUESTION_HISTORY.applyToLocal(db, cloudRow, undefined)
    expect(wrote).toBe(true)

    const merged = await db.questionHistory.get('Q-1')
    // Cloud wins LWW; explicit false propagates
    expect(merged?.lastResult).toBe('correct')
    expect(merged?.everWrong).toBe(false)
    expect(merged?.interval).toBe(21)
    expect(merged?.easeFactor).toBe(3.75)
  })

  it('LWW guard: older cloud everWrong=true loses to newer local everWrong=false', async () => {
    // Mirror of the above — confirms stale-clock device cannot revoke a fresh
    // 「太簡單」 clear via an old monotonic-OR-style write.
    const db = getHospitalDB()
    const OLDER_ISO = '2026-05-24T00:00:00.000Z'
    const NEWER_ISO = '2026-05-25T00:00:00.000Z'
    // Local: NEWER updated_at, everWrong=false (fresh 「太簡單」 click)
    await db.questionHistory.put({
      ...mkRow({ everWrong: false, lastResult: 'correct', correctCount: 5 }),
      _updatedAt: Date.parse(NEWER_ISO),
    } as unknown as Parameters<typeof db.questionHistory.put>[0])

    // Incoming: OLDER updated_at, everWrong=true (stale write)
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
    const cloudRow = mkCloudRow(cloudData, OLDER_ISO)
    const wrote = await HOSPITAL_QUESTION_HISTORY.applyToLocal(db, cloudRow, undefined)
    expect(wrote).toBe(false) // cloud loses LWW, no write

    const merged = await db.questionHistory.get('Q-1')
    // Local stays unchanged
    expect(merged?.correctCount).toBe(5)
    expect(merged?.lastResult).toBe('correct')
    expect(merged?.everWrong).toBe(false)
  })
})
