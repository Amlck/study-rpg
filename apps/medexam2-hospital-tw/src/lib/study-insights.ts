import type { Subject, SubjectId } from '@study-rpg/core'
import type { QuestionHistoryRow } from '../db/schema'

const DAY_MS = 24 * 60 * 60 * 1000

export type IntervalKey = '3d' | '7d' | '14d'

export interface IntervalPerformance {
  total: number
  correct: number
  rate: number | null
}

export interface SubjectInsight {
  subjectId: SubjectId
  displayName: string
  totalPlayable: number
  answered: number
  unanswered: number
  coverageRate: number
  attempts: number
  allTimeCorrect: number
  allTimeRate: number | null
  wrongLastCount: number
  dueCount: number
  intervals: Record<IntervalKey, IntervalPerformance>
  priorityScore: number
  recommendation: string
}

export interface StudyInsightsSummary {
  totalPlayable: number
  answered: number
  coverageRate: number
  dueCount: number
  weakCount: number
}

export interface BuildStudyInsightsInput {
  subjects: Subject[]
  history: QuestionHistoryRow[]
  poolSizeBySubject: Record<string, number>
  dueCountBySubject: Record<string, number>
  now?: number
}

export interface StudyInsightsResult {
  insights: SubjectInsight[]
  summary: StudyInsightsSummary
}

export function buildStudyInsights(input: BuildStudyInsightsInput): StudyInsightsResult {
  const now = input.now ?? Date.now()
  const historyBySubject = new Map<string, QuestionHistoryRow[]>()
  for (const row of input.history) {
    const list = historyBySubject.get(row.subjectId) ?? []
    list.push(row)
    historyBySubject.set(row.subjectId, list)
  }

  const insights = input.subjects.map((subject) => {
    const rows = historyBySubject.get(subject.id) ?? []
    const totalPlayable = input.poolSizeBySubject[subject.id] ?? subject.totalQuestions ?? 0
    const answered = rows.length
    const unanswered = Math.max(0, totalPlayable - answered)
    const attempts = rows.reduce((sum, row) => sum + row.attempts, 0)
    const allTimeCorrect = rows.reduce((sum, row) => sum + row.correctCount, 0)
    const wrongLastCount = rows.filter((row) => row.lastResult === 'wrong').length
    const dueCount = input.dueCountBySubject[subject.id] ?? 0
    const intervals = {
      '3d': intervalPerformance(rows, now - 3 * DAY_MS),
      '7d': intervalPerformance(rows, now - 7 * DAY_MS),
      '14d': intervalPerformance(rows, now - 14 * DAY_MS),
    }

    const coverageRate = totalPlayable > 0 ? answered / totalPlayable : 0
    const allTimeRate = attempts > 0 ? allTimeCorrect / attempts : null
    const recent = intervals['7d']
    const signal = chooseCorrectRateSignal(intervals, allTimeRate, attempts)
    const correctRateGap = signal.rate === null ? 0.45 : 1 - signal.rate
    const recentSampleGap = Math.max(0, 10 - recent.total) / 10
    const wrongPressure = answered > 0 ? wrongLastCount / answered : 0
    const duePressure = Math.min(1, dueCount / 12)

    const priorityScore = clamp(
      correctRateGap * 58 +
        wrongPressure * 18 +
        duePressure * 12 +
        recentSampleGap * 8 +
        (1 - coverageRate) * 4,
      0,
      100,
    )

    return {
      subjectId: subject.id as SubjectId,
      displayName: subject.displayName,
      totalPlayable,
      answered,
      unanswered,
      coverageRate,
      attempts,
      allTimeCorrect,
      allTimeRate,
      wrongLastCount,
      dueCount,
      intervals,
      priorityScore,
      recommendation: recommend({
        answered,
        coverageRate,
        recent,
        signal,
        wrongLastCount,
        dueCount,
      }),
    }
  })

  insights.sort((a, b) => b.priorityScore - a.priorityScore)

  const totalPlayable = insights.reduce((sum, row) => sum + row.totalPlayable, 0)
  const answered = insights.reduce((sum, row) => sum + row.answered, 0)
  const dueCount = insights.reduce((sum, row) => sum + row.dueCount, 0)
  const weakCount = insights.filter((row) => row.priorityScore >= 55).length

  return {
    insights,
    summary: {
      totalPlayable,
      answered,
      coverageRate: totalPlayable > 0 ? answered / totalPlayable : 0,
      dueCount,
      weakCount,
    },
  }
}

function intervalPerformance(rows: QuestionHistoryRow[], cutoff: number): IntervalPerformance {
  let total = 0
  let correct = 0
  for (const row of rows) {
    if (row.lastAnsweredAt < cutoff) continue
    total += 1
    if (row.lastResult === 'correct') correct += 1
  }
  return {
    total,
    correct,
    rate: total > 0 ? correct / total : null,
  }
}

function chooseCorrectRateSignal(
  intervals: Record<IntervalKey, IntervalPerformance>,
  allTimeRate: number | null,
  attempts: number,
): { rate: number | null; source: '7d' | '14d' | 'all-time' | 'none' } {
  if (intervals['7d'].total >= 5) return { rate: intervals['7d'].rate, source: '7d' }
  if (intervals['14d'].total >= 8) return { rate: intervals['14d'].rate, source: '14d' }
  if (attempts >= 10) return { rate: allTimeRate, source: 'all-time' }
  return { rate: null, source: 'none' }
}

function recommend(input: {
  answered: number
  coverageRate: number
  recent: IntervalPerformance
  signal: ReturnType<typeof chooseCorrectRateSignal>
  wrongLastCount: number
  dueCount: number
}): string {
  if (input.answered === 0) return '先做 20 題'
  if (input.signal.source === 'none') return '補近期樣本'
  if ((input.signal.rate ?? 1) < 0.65) return '弱科優先'
  if (input.wrongLastCount >= 10) return '錯題回收'
  if (input.dueCount > 0) return 'SRS 回收'
  if (input.coverageRate < 0.3) return '補題量'
  return '維持手感'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
