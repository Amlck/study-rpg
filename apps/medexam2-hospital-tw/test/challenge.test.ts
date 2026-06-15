import { describe, expect, it } from 'vitest'
import type { Question } from '@study-rpg/core'
import {
  SUBJECT_TO_CHALLENGE_PAPER,
  buildChallengePaperSummaries,
  challengePaperIdOf,
  decodeChallengePaperId,
  scoreChallenge,
  selectChallengePaperQuestions,
} from '../src/lib/challenge'

function question(id: string, subject: string, paper: string, qNumber: number, answer = 'A'): Question {
  return {
    id,
    subject,
    stem: id,
    options: { A: 'A', B: 'B', C: 'C', D: 'D' },
    answer,
    explanation: '',
    meta: { year: 115, sitting: 1, paper, qNumber },
  }
}

describe('challenge helpers', () => {
  it('round-trips Chinese paper ids and maps weak subjects to paper blocks', () => {
    const paperId = challengePaperIdOf(115, 1, '醫學三')

    expect(decodeChallengePaperId(paperId)).toEqual({ year: 115, session: 1, paper: '醫學三' })
    expect(SUBJECT_TO_CHALLENGE_PAPER['內科']).toBe('醫學三')
    expect(SUBJECT_TO_CHALLENGE_PAPER['麻醉科']).toBe('醫學六')
  })

  it('groups playable historical papers and excludes option-image questions', () => {
    const q1 = question('q1', '內科', '醫學三', 2)
    const q2 = question('q2', '家醫科', '醫學三', 1)
    const q3 = { ...question('q3', '內科', '醫學三', 3), hasOptionImages: true }
    const summaries = buildChallengePaperSummaries([q1, q2, q3], new Map())

    expect(summaries).toHaveLength(1)
    expect(summaries[0].paperId).toBe('115-1-醫學三')
    expect(summaries[0].questionCount).toBe(2)
    expect(summaries[0].subjects).toEqual([
      { subjectId: '內科', count: 1 },
      { subjectId: '家醫科', count: 1 },
    ])
  })

  it('selects paper questions in original qNumber order', () => {
    const questions = [
      question('q2', '內科', '醫學三', 2),
      question('other', '小兒科', '醫學四', 1),
      question('q1', '家醫科', '醫學三', 1),
    ]

    expect(selectChallengePaperQuestions(questions, '115-1-醫學三').map((q) => q.id)).toEqual(['q1', 'q2'])
  })

  it('scores unanswered as wrong and disputed selected answers as correct', () => {
    const q1 = question('q1', '內科', '醫學三', 1, 'A')
    const q2 = { ...question('q2', '內科', '醫學三', 2, 'B'), disputed: true }
    const q3 = question('q3', '內科', '醫學三', 3, 'C')

    const score = scoreChallenge([q1, q2, q3], { q1: 'A', q2: 'D' })

    expect(score.totalScore).toBe(2)
    expect(score.perQuestionAnswers).toEqual([
      { questionId: 'q1', userSelection: 'A', isCorrect: true },
      { questionId: 'q2', userSelection: 'D', isCorrect: true },
      { questionId: 'q3', userSelection: null, isCorrect: false },
    ])
  })
})
