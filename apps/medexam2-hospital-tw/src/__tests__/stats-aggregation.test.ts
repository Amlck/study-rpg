import { describe, it, expect } from 'vitest'
import type { SubjectId } from '@study-rpg/core'
import {
  aggregateStudyMinutes,
  aggregateCorrectAnswers,
} from '../components/StatsPanel'

function bounds(startYMD: string, endYMD: string): { start: Date; end: Date } {
  const [sy, sm, sd] = startYMD.split('-').map(Number)
  const [ey, em, ed] = endYMD.split('-').map(Number)
  return {
    start: new Date(sy, sm - 1, sd, 0, 0, 0, 0),
    end: new Date(ey, em - 1, ed, 0, 0, 0, 0),
  }
}

describe('aggregateStudyMinutes', () => {
  it('empty input → zero-fills all days in range', () => {
    const result = aggregateStudyMinutes([], bounds('2026-05-24', '2026-05-26'))
    expect(result).toEqual([
      { date: '2026-05-24', value: 0 },
      { date: '2026-05-25', value: 0 },
      { date: '2026-05-26', value: 0 },
    ])
  })

  it('single matching row populates one day, others zero', () => {
    const rows = [{ date: '2026-05-25', minutesAdded: 30 }]
    const result = aggregateStudyMinutes(rows, bounds('2026-05-24', '2026-05-26'))
    expect(result).toEqual([
      { date: '2026-05-24', value: 0 },
      { date: '2026-05-25', value: 30 },
      { date: '2026-05-26', value: 0 },
    ])
  })

  it('multi-row same date sums together', () => {
    const rows = [
      { date: '2026-05-25', minutesAdded: 30 },
      { date: '2026-05-25', minutesAdded: 15 },
    ]
    const result = aggregateStudyMinutes(rows, bounds('2026-05-25', '2026-05-25'))
    expect(result).toEqual([{ date: '2026-05-25', value: 45 }])
  })

  it('rows outside range are dropped', () => {
    const rows = [
      { date: '2026-04-01', minutesAdded: 999 }, // out of range
      { date: '2026-05-26', minutesAdded: 10 },
    ]
    const result = aggregateStudyMinutes(rows, bounds('2026-05-25', '2026-05-26'))
    expect(result).toEqual([
      { date: '2026-05-25', value: 0 },
      { date: '2026-05-26', value: 10 },
    ])
  })
})

describe('aggregateCorrectAnswers', () => {
  function rowFor(date: string, hour: number, subject: SubjectId, result: 'correct' | 'wrong') {
    const [y, m, d] = date.split('-').map(Number)
    return {
      lastAnsweredAt: new Date(y, m - 1, d, hour, 0, 0, 0).getTime(),
      lastResult: result,
      subjectId: subject,
    }
  }

  it('empty input → zero-fills all days', () => {
    const result = aggregateCorrectAnswers([], bounds('2026-05-25', '2026-05-26'), null)
    expect(result).toEqual([
      { date: '2026-05-25', value: 0 },
      { date: '2026-05-26', value: 0 },
    ])
  })

  it('counts only `correct` rows', () => {
    const rows = [
      rowFor('2026-05-25', 10, '內科', 'correct'),
      rowFor('2026-05-25', 11, '內科', 'wrong'),
      rowFor('2026-05-25', 12, '內科', 'correct'),
    ]
    const result = aggregateCorrectAnswers(rows, bounds('2026-05-25', '2026-05-25'), null)
    expect(result).toEqual([{ date: '2026-05-25', value: 2 }])
  })

  it('filters by subject when filter set is non-empty', () => {
    const rows = [
      rowFor('2026-05-25', 10, '內科', 'correct'),
      rowFor('2026-05-25', 11, '外科', 'correct'),
      rowFor('2026-05-25', 12, '外科', 'correct'),
    ]
    const result = aggregateCorrectAnswers(
      rows,
      bounds('2026-05-25', '2026-05-25'),
      new Set<SubjectId>(['內科']),
    )
    expect(result).toEqual([{ date: '2026-05-25', value: 1 }])
  })

  it('empty subject filter = no-filter (counts all subjects)', () => {
    const rows = [
      rowFor('2026-05-25', 10, '內科', 'correct'),
      rowFor('2026-05-25', 11, '外科', 'correct'),
    ]
    const result = aggregateCorrectAnswers(
      rows,
      bounds('2026-05-25', '2026-05-25'),
      new Set<SubjectId>(), // empty set
    )
    expect(result).toEqual([{ date: '2026-05-25', value: 2 }])
  })

  it('null subject filter = no-filter (counts all subjects)', () => {
    const rows = [
      rowFor('2026-05-25', 10, '內科', 'correct'),
      rowFor('2026-05-25', 11, '外科', 'correct'),
    ]
    const result = aggregateCorrectAnswers(rows, bounds('2026-05-25', '2026-05-25'), null)
    expect(result).toEqual([{ date: '2026-05-25', value: 2 }])
  })

  it('rows outside range are excluded', () => {
    const rows = [
      rowFor('2026-04-01', 10, '內科', 'correct'),
      rowFor('2026-05-26', 14, '內科', 'correct'),
    ]
    const result = aggregateCorrectAnswers(rows, bounds('2026-05-25', '2026-05-26'), null)
    expect(result).toEqual([
      { date: '2026-05-25', value: 0 },
      { date: '2026-05-26', value: 1 },
    ])
  })

  it('multi-day distribution', () => {
    const rows = [
      rowFor('2026-05-25', 10, '內科', 'correct'),
      rowFor('2026-05-25', 11, '內科', 'correct'),
      rowFor('2026-05-26', 9, '外科', 'correct'),
    ]
    const result = aggregateCorrectAnswers(rows, bounds('2026-05-25', '2026-05-26'), null)
    expect(result).toEqual([
      { date: '2026-05-25', value: 2 },
      { date: '2026-05-26', value: 1 },
    ])
  })
})
