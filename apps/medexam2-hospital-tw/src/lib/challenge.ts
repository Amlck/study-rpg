import type { Question, SubjectId } from '@study-rpg/core'
import type { ChallengeAttemptRow, ChallengePerQuestionAnswer } from '../db/schema'

export type ChallengePaper = '醫學三' | '醫學四' | '醫學五' | '醫學六'

export interface ChallengePaperSummary {
  paperId: string
  year: number
  session: number
  paper: ChallengePaper
  questionCount: number
  subjects: Array<{ subjectId: SubjectId; count: number }>
  latestAttempt: ChallengeAttemptRow | null
}

export interface ChallengeScoreResult {
  totalScore: number
  perQuestionAnswers: ChallengePerQuestionAnswer[]
}

export const CHALLENGE_PAPERS: ChallengePaper[] = ['醫學三', '醫學四', '醫學五', '醫學六']

export const SUBJECT_TO_CHALLENGE_PAPER: Record<string, ChallengePaper> = {
  內科: '醫學三',
  家醫科: '醫學三',
  小兒科: '醫學四',
  皮膚科: '醫學四',
  神經內科: '醫學四',
  精神科: '醫學四',
  外科: '醫學五',
  泌尿科: '醫學五',
  骨科: '醫學五',
  婦產科: '醫學六',
  復健科: '醫學六',
  眼科: '醫學六',
  耳鼻喉科: '醫學六',
  麻醉科: '醫學六',
}

export function challengePaperIdOf(year: number, session: number, paper: string): string {
  return `${year}-${session}-${paper}`
}

export function decodeChallengePaperId(
  paperId: string,
): { year: number; session: number; paper: string } | null {
  const m = paperId.match(/^(\d+)-(\d+)-(.+)$/)
  if (!m) return null
  return { year: Number(m[1]), session: Number(m[2]), paper: m[3] }
}

export function paperLabel(paperId: string): string {
  const d = decodeChallengePaperId(paperId)
  if (!d) return paperId
  return `${d.year} 第 ${d.session} 次 ${d.paper}`
}

export function paperShortLabel(paper: string): string {
  return paper.replace('醫學', '醫')
}

function metaSitting(meta: Record<string, unknown> | undefined): number | undefined {
  const sitting = meta?.sitting ?? meta?.session
  return typeof sitting === 'number' ? sitting : undefined
}

export function selectChallengePaperQuestions(questions: Question[], paperId: string): Question[] {
  const decoded = decodeChallengePaperId(paperId)
  if (!decoded) return []
  return questions
    .filter((q) => {
      const meta = q.meta as Record<string, unknown> | undefined
      return (
        meta?.year === decoded.year &&
        metaSitting(meta) === decoded.session &&
        meta?.paper === decoded.paper &&
        q.hasOptionImages !== true
      )
    })
    .sort((a, b) => {
      const aNo = Number((a.meta as Record<string, unknown> | undefined)?.qNumber ?? 0)
      const bNo = Number((b.meta as Record<string, unknown> | undefined)?.qNumber ?? 0)
      return aNo - bNo
    })
}

export function buildChallengePaperSummaries(
  questions: Question[],
  latestMap: ReadonlyMap<string, ChallengeAttemptRow>,
): ChallengePaperSummary[] {
  const groups = new Map<
    string,
    {
      year: number
      session: number
      paper: ChallengePaper
      questions: Question[]
      subjectCounts: Map<SubjectId, number>
    }
  >()

  for (const q of questions) {
    if (q.hasOptionImages === true) continue
    const meta = q.meta as Record<string, unknown> | undefined
    const year = meta?.year
    const session = metaSitting(meta)
    const paper = meta?.paper
    if (
      typeof year !== 'number' ||
      typeof session !== 'number' ||
      typeof paper !== 'string' ||
      !CHALLENGE_PAPERS.includes(paper as ChallengePaper)
    ) continue

    const paperId = challengePaperIdOf(year, session, paper)
    let group = groups.get(paperId)
    if (!group) {
      group = {
        year,
        session,
        paper: paper as ChallengePaper,
        questions: [],
        subjectCounts: new Map(),
      }
      groups.set(paperId, group)
    }
    group.questions.push(q)
    const subjectId = q.subject as SubjectId
    group.subjectCounts.set(subjectId, (group.subjectCounts.get(subjectId) ?? 0) + 1)
  }

  const summaries = Array.from(groups.entries()).map(([paperId, group]) => ({
    paperId,
    year: group.year,
    session: group.session,
    paper: group.paper,
    questionCount: group.questions.length,
    subjects: Array.from(group.subjectCounts.entries())
      .map(([subjectId, count]) => ({ subjectId, count }))
      .sort((a, b) => b.count - a.count || a.subjectId.localeCompare(b.subjectId, 'zh-Hant')),
    latestAttempt: latestMap.get(paperId) ?? null,
  }))

  summaries.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    if (a.session !== b.session) return a.session - b.session
    return CHALLENGE_PAPERS.indexOf(a.paper) - CHALLENGE_PAPERS.indexOf(b.paper)
  })
  return summaries
}

export function scoreChallenge(
  questions: Question[],
  selections: Record<string, string>,
): ChallengeScoreResult {
  const perQuestionAnswers = questions.map((q) => {
    const userSelection = selections[q.id] ?? null
    const isCorrect = userSelection !== null && (q.disputed === true || userSelection === q.answer)
    return { questionId: q.id, userSelection, isCorrect }
  })
  return {
    totalScore: perQuestionAnswers.reduce((sum, row) => sum + (row.isCorrect ? 1 : 0), 0),
    perQuestionAnswers,
  }
}

export function buildSubjectBreakdown(
  attempt: ChallengeAttemptRow,
  questionsById: ReadonlyMap<string, Question>,
): Array<{ subjectId: SubjectId; correct: number; total: number; rate: number }> {
  const rows = new Map<SubjectId, { subjectId: SubjectId; correct: number; total: number }>()
  for (const answer of attempt.perQuestionAnswers) {
    const question = questionsById.get(answer.questionId)
    if (!question) continue
    const subjectId = question.subject as SubjectId
    const row = rows.get(subjectId) ?? { subjectId, correct: 0, total: 0 }
    row.total += 1
    if (answer.isCorrect) row.correct += 1
    rows.set(subjectId, row)
  }
  return Array.from(rows.values())
    .map((row) => ({ ...row, rate: row.total > 0 ? row.correct / row.total : 0 }))
    .sort((a, b) => a.rate - b.rate || b.total - a.total)
}

export function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export function latestAttemptByPaperMap(attempts: ChallengeAttemptRow[]): Map<string, ChallengeAttemptRow> {
  const map = new Map<string, ChallengeAttemptRow>()
  for (const attempt of attempts) {
    const existing = map.get(attempt.paperId)
    if (!existing || attempt.finishedAt > existing.finishedAt) map.set(attempt.paperId, attempt)
  }
  return map
}
