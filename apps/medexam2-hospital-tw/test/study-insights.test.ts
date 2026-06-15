import { describe, expect, it } from 'vitest'
import type { Subject } from '@study-rpg/core'
import type { QuestionHistoryRow } from '../src/db/schema'
import { buildStudyInsights } from '../src/lib/study-insights'

const now = Date.UTC(2026, 5, 15)
const day = 24 * 60 * 60 * 1000

function subject(id: string, totalQuestions = 100): Subject {
  return {
    id,
    displayName: id,
    group: '醫學三',
    color: '#6a8c3f',
    totalQuestions,
  }
}

function history(
  questionId: string,
  subjectId: string,
  daysAgo: number,
  lastResult: 'correct' | 'wrong',
  attempts = 1,
  correctCount = lastResult === 'correct' ? 1 : 0,
): QuestionHistoryRow {
  return {
    questionId,
    subjectId,
    attempts,
    correctCount,
    lastAnsweredAt: now - daysAgo * day,
    lastResult,
    nextDueAt: null,
    interval: 1,
    easeFactor: 2.5,
  }
}

describe('study insights', () => {
  it('computes interval rates from latest question-history rows', () => {
    const result = buildStudyInsights({
      subjects: [subject('內科')],
      history: [
        history('q1', '內科', 1, 'correct'),
        history('q2', '內科', 2, 'wrong'),
        history('q3', '內科', 8, 'correct'),
      ],
      poolSizeBySubject: { 內科: 10 },
      dueCountBySubject: { 內科: 1 },
      now,
    })

    const insight = result.insights[0]
    expect(insight.answered).toBe(3)
    expect(insight.intervals['3d']).toMatchObject({ total: 2, correct: 1, rate: 0.5 })
    expect(insight.intervals['7d']).toMatchObject({ total: 2, correct: 1, rate: 0.5 })
    expect(insight.intervals['14d']).toMatchObject({ total: 3, correct: 2 })
  })

  it('prioritizes weak correct rates above low coverage alone', () => {
    const result = buildStudyInsights({
      subjects: [subject('內科'), subject('外科')],
      history: [
        ...Array.from({ length: 12 }, (_, idx) =>
          history(`m${idx}`, '內科', idx % 5, idx < 4 ? 'correct' : 'wrong'),
        ),
        ...Array.from({ length: 35 }, (_, idx) =>
          history(`s${idx}`, '外科', idx % 5, 'correct'),
        ),
      ],
      poolSizeBySubject: { 內科: 100, 外科: 100 },
      dueCountBySubject: { 內科: 0, 外科: 0 },
      now,
    })

    expect(result.insights[0].subjectId).toBe('內科')
    expect(result.insights[0].recommendation).toBe('弱科優先')
    expect(result.insights[1].recommendation).toBe('維持手感')
  })
})
