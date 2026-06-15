import { describe, expect, it } from 'vitest'
import type { Question } from '@study-rpg/core'
import { pickQuestionFromPool } from '../src/lib/quiz'

function question(id: string): Question {
  return {
    id,
    subject: '內科',
    stem: id,
    options: { A: 'A', B: 'B' },
    answer: 'A',
    explanation: '',
    meta: { year: 115 },
  }
}

describe('quiz picker', () => {
  it('prefers globally unanswered questions that were not seen in this session', () => {
    const pool = [question('q1'), question('q2'), question('q3')]
    const picked = pickQuestionFromPool(
      pool,
      new Set(['q1']),
      { answeredIds: new Set(['q1', 'q2']), rng: () => 0 },
    )

    expect(picked?.id).toBe('q3')
  })

  it('recycles answered questions only after unseen questions are exhausted', () => {
    const pool = [question('q1'), question('q2'), question('q3')]
    const picked = pickQuestionFromPool(
      pool,
      new Set(['q1']),
      { answeredIds: new Set(['q1', 'q2', 'q3']), rng: () => 0 },
    )

    expect(picked?.id).toBe('q2')
  })

  it('falls back to the full pool after the current session has exhausted it', () => {
    const pool = [question('q1'), question('q2')]
    const picked = pickQuestionFromPool(
      pool,
      new Set(['q1', 'q2']),
      { answeredIds: new Set(['q1', 'q2']), rng: () => 0.75 },
    )

    expect(picked?.id).toBe('q2')
  })
})
