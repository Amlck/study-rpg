import { describe, it, expect } from 'vitest'
import type { Question } from '@study-rpg/core'
import { matchesFilter, type BookmarkFilterState } from '../lib/bookmarks-filter'

function mkQ(id: string, year: number, subject: string): Question {
  return {
    id,
    subject: subject as Question['subject'],
    stem: '',
    options: { A: '', B: '', C: '', D: '' },
    answer: 'A',
    explanation: '',
    meta: { year },
  } as Question
}

const corpus: ReadonlyMap<string, Question> = new Map([
  ['108-內-Q1', mkQ('108-內-Q1', 108, '內科')],
  ['109-內-Q1', mkQ('109-內-Q1', 109, '內科')],
  ['109-外-Q1', mkQ('109-外-Q1', 109, '外科')],
  ['110-內-Q1', mkQ('110-內-Q1', 110, '內科')],
])

const empty: BookmarkFilterState = { years: new Set(), subjects: new Set() }

describe('matchesFilter', () => {
  it('empty filter sets — every row passes', () => {
    for (const id of corpus.keys()) {
      expect(matchesFilter(id, empty, corpus)).toBe(true)
    }
  })

  it('both filters active — AND combination', () => {
    const filter: BookmarkFilterState = {
      years: new Set([109]),
      subjects: new Set(['內科'] as const) as ReadonlySet<Question['subject']>,
    }
    expect(matchesFilter('109-內-Q1', filter, corpus)).toBe(true)
    expect(matchesFilter('109-外-Q1', filter, corpus)).toBe(false) // wrong subject
    expect(matchesFilter('110-內-Q1', filter, corpus)).toBe(false) // wrong year
    expect(matchesFilter('108-內-Q1', filter, corpus)).toBe(false) // wrong year
  })

  it('orphan row (not in questionsById) always passes regardless of filter', () => {
    const filter: BookmarkFilterState = {
      years: new Set([999]),
      subjects: new Set(['unknown'] as const) as ReadonlySet<Question['subject']>,
    }
    expect(matchesFilter('orphan-id-xyz', filter, corpus)).toBe(true)
  })

  it('null questionsById (pre-load) — every id passes (no filtering yet)', () => {
    const filter: BookmarkFilterState = {
      years: new Set([109]),
      subjects: new Set(),
    }
    expect(matchesFilter('109-內-Q1', filter, null)).toBe(true)
  })
})
