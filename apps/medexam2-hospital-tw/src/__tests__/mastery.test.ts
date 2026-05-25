import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { recordCorrectAnswer, recordWrongAnswer } from '../lib/mastery'
import { getHospitalDB } from '../db/schema'

// Clear Dexie state between tests by deleting the DB. Module re-import re-
// initializes the singleton. fake-indexeddb is in-memory so this is cheap.
beforeEach(async () => {
  const db = getHospitalDB()
  await db.delete()
  await db.open()
})

const record = { subjectId: '內科', questionId: 'Q-T1' }

describe('recordWrongAnswer + everWrong', () => {
  it('first wrong answer sets everWrong=true', async () => {
    await recordWrongAnswer(record)
    const row = await getHospitalDB().questionHistory.get(record.questionId)
    expect(row).toBeDefined()
    expect(row?.lastResult).toBe('wrong')
    expect(row?.everWrong).toBe(true)
  })

  it('second wrong on already-wrong row is idempotent for everWrong', async () => {
    await recordWrongAnswer(record)
    await recordWrongAnswer(record)
    const row = await getHospitalDB().questionHistory.get(record.questionId)
    expect(row?.everWrong).toBe(true)
    expect(row?.attempts).toBe(2)
  })
})

describe('recordCorrectAnswer + everWrong + transition callback', () => {
  it('does NOT modify everWrong when transitioning wrong → correct', async () => {
    await recordWrongAnswer(record)
    await recordCorrectAnswer(record, null)
    const row = await getHospitalDB().questionHistory.get(record.questionId)
    expect(row?.lastResult).toBe('correct')
    expect(row?.everWrong).toBe(true) // preserved
    expect(row?.correctCount).toBe(1)
  })

  it('invokes onTransitionToCorrect callback exactly once when prev was wrong', async () => {
    await recordWrongAnswer(record)
    const cb = vi.fn()
    await recordCorrectAnswer(record, null, { onTransitionToCorrect: cb })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(record.questionId)
  })

  it('does NOT invoke onTransitionToCorrect on correct → correct (no spurious toast)', async () => {
    await recordCorrectAnswer(record, null) // first answer = correct
    const cb = vi.fn()
    await recordCorrectAnswer(record, null, { onTransitionToCorrect: cb })
    expect(cb).not.toHaveBeenCalled()
  })

  it('first answer being correct does not invoke callback (no prior wrong)', async () => {
    const cb = vi.fn()
    await recordCorrectAnswer(record, null, { onTransitionToCorrect: cb })
    expect(cb).not.toHaveBeenCalled()
    const row = await getHospitalDB().questionHistory.get(record.questionId)
    expect(row?.everWrong).toBe(false)
  })
})
