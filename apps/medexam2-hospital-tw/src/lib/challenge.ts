import type { Question, SubjectId } from '@study-rpg/core'
import {
  QUIZ_REPUTATION_PER_CORRECT_BASE,
  QUIZ_REVENUE_PER_CORRECT_BASE,
} from '@study-rpg/content-medexam2-tw'
import type {
  ChallengeAttemptRow,
  ChallengeConfidence,
  ChallengeMistakeReason,
  ChallengePerQuestionAnswer,
} from '../db/schema'

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

export interface ChallengeLearningBreakdownTopic {
  label: string
  count: number
}

export interface ChallengeLearningBreakdownSubject {
  subjectId: SubjectId
  total: number
  wrong: number
  flagged: number
  lowConfidence: number
  inferredTypes: ChallengeLearningBreakdownTopic[]
  subspecialties: ChallengeLearningBreakdownTopic[]
  topics: ChallengeLearningBreakdownTopic[]
  mistakeReasons: ChallengeLearningBreakdownTopic[]
}

export interface ChallengeEconomyReward {
  revenueDelta: number
  reputationDelta: number
  hospitalCreditDelta: number
  bestScoreDelta: number
  previousBestScore: number | null
  firstPass: boolean
  firstHonors: boolean
  pass: boolean
  honors: boolean
}

export const CHALLENGE_PAPERS: ChallengePaper[] = ['醫學三', '醫學四', '醫學五', '醫學六']

export const CHALLENGE_PASS_RATE = 0.6
export const CHALLENGE_HONORS_RATE = 0.8
export const CHALLENGE_BEST_SCORE_REWARD_MULTIPLIER = 0.5

export const CHALLENGE_CONFIDENCE_OPTIONS: Array<{
  value: ChallengeConfidence
  label: string
  shortLabel: string
}> = [
  { value: 'guess', label: '用猜的', shortLabel: '猜' },
  { value: 'unsure', label: '不太穩', shortLabel: '不穩' },
  { value: 'solid', label: '很確定', shortLabel: '穩' },
]

export const CHALLENGE_MISTAKE_REASON_OPTIONS: Array<{
  value: ChallengeMistakeReason
  label: string
}> = [
  { value: 'knowledge', label: '觀念缺口' },
  { value: 'misread', label: '題幹看錯' },
  { value: 'trap', label: '選項陷阱' },
  { value: 'memory', label: '記憶不熟' },
  { value: 'calculation', label: '計算/流程' },
]

const CHALLENGE_INFERRED_TYPE_RULES: Array<{
  label: string
  patterns: RegExp[]
}> = [
  {
    label: '診斷標準',
    patterns: [
      /diagnostic criteria|criterion|criteria|DSM|ICD|診斷標準|診斷準則|診斷要件|符合.*診斷|必備.*診斷|診斷.*需|diagnos(?:is|tic).*criteria/i,
    ],
  },
  {
    label: '診斷/鑑別',
    patterns: [
      /最可能.*診斷|可能診斷|鑑別診斷|differential|diagnos(?:is|tic)|診斷|臆斷|下列何者為.*病|最可能.*疾病|最符合|最適當.*診斷/i,
    ],
  },
  {
    label: '治療/處置',
    patterns: [
      /治療|處置|處理|手術|therapy|treatment|management|first[- ]line|首選|給予|使用.*藥|投予|indication|contraindication|禁忌|適應症|復健|rehabilitation/i,
    ],
  },
  {
    label: '檢查/影像',
    patterns: [
      /檢查|影像|超音波|X[- ]?ray|CT|MRI|PET|ECG|EKG|心電圖|腦波|biopsy|screening|篩檢|test|testing|檢驗|測定|monitoring|imaging|hysteroscopy|endoscopy|內視鏡/i,
    ],
  },
  {
    label: '藥物/副作用',
    patterns: [
      /藥物|副作用|adverse|side effect|toxicity|poisoning|intoxication|藥理|pharmacology|劑量|dose|antagonist|agonist|inhibitor|blocker|opioid|anesthetic|anesthesia|麻醉劑|拮抗劑|受器|receptor/i,
    ],
  },
  {
    label: '解剖/生理',
    patterns: [
      /解剖|anatomy|innervation|nerve|神經支配|血管|muscle|肌肉|韌帶|ligament|生理|physiology|mechanism|機轉|pathophysiology|容量|volume|hormone|荷爾蒙/i,
    ],
  },
  {
    label: '分期/風險/預後',
    patterns: [
      /分期|staging|stage|grade|grading|risk|風險|危險因子|prognosis|prognostic|預後|recurrence|復發|mortality|survival|併發症|complication/i,
    ],
  },
  {
    label: '病程/流病',
    patterns: [
      /病程|course|natural history|盛行率|prevalence|incidence|epidemiology|好發|年齡|性別|comorbidity|共病|遺傳|heritability/i,
    ],
  },
  {
    label: '預防/公衛',
    patterns: [
      /預防|疫苗|vaccine|vaccination|prophylaxis|prevention|screening|篩檢|公共衛生|通報|感染管制|隔離|消毒/i,
    ],
  },
]

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

export function computeChallengeEconomyReward(
  totalScore: number,
  totalQuestions: number,
  priorAttempts: ChallengeAttemptRow[],
): ChallengeEconomyReward {
  const previousBestScore = priorAttempts.length > 0
    ? Math.max(...priorAttempts.map((attempt) => attempt.totalScore))
    : null
  const bestScoreDelta = Math.max(0, totalScore - (previousBestScore ?? 0))
  const rate = totalQuestions > 0 ? totalScore / totalQuestions : 0
  const pass = rate >= CHALLENGE_PASS_RATE
  const honors = rate >= CHALLENGE_HONORS_RATE
  const priorPassed = priorAttempts.some((attempt) => {
    const total = attempt.perQuestionAnswers.length
    return total > 0 && attempt.totalScore / total >= CHALLENGE_PASS_RATE
  })
  const priorHonors = priorAttempts.some((attempt) => {
    const total = attempt.perQuestionAnswers.length
    return total > 0 && attempt.totalScore / total >= CHALLENGE_HONORS_RATE
  })
  const firstPass = pass && !priorPassed
  const firstHonors = honors && !priorHonors

  return {
    revenueDelta: Math.round(
      bestScoreDelta * QUIZ_REVENUE_PER_CORRECT_BASE * CHALLENGE_BEST_SCORE_REWARD_MULTIPLIER,
    ),
    reputationDelta: Math.round(
      bestScoreDelta * QUIZ_REPUTATION_PER_CORRECT_BASE * CHALLENGE_BEST_SCORE_REWARD_MULTIPLIER,
    ),
    hospitalCreditDelta: (firstPass ? 1 : 0) + (firstHonors ? 1 : 0),
    bestScoreDelta,
    previousBestScore,
    firstPass,
    firstHonors,
    pass,
    honors,
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

function readMetaLabel(
  meta: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = meta?.[key]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function incrementCount(map: Map<string, number>, label: string | null): void {
  if (!label) return
  map.set(label, (map.get(label) ?? 0) + 1)
}

function sortedTopicCounts(map: ReadonlyMap<string, number>, limit: number): ChallengeLearningBreakdownTopic[] {
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hant'))
    .slice(0, limit)
}

function compactQuestionText(question: Question): string {
  const meta = question.meta as Record<string, unknown> | undefined
  return [
    readMetaLabel(meta, 'topic'),
    readMetaLabel(meta, 'subspecialty'),
    question.stem,
    question.explanation,
  ]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join('\n')
}

export function inferChallengeQuestionType(question: Question): string {
  const text = compactQuestionText(question)
  for (const rule of CHALLENGE_INFERRED_TYPE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.label
  }
  return '其他'
}

export function buildLearningBreakdown(
  attempt: ChallengeAttemptRow,
  questionsById: ReadonlyMap<string, Question>,
): ChallengeLearningBreakdownSubject[] {
  const rows = new Map<
    SubjectId,
    {
      subjectId: SubjectId
      total: number
      wrong: number
      flagged: number
      lowConfidence: number
      inferredTypes: Map<string, number>
      subspecialties: Map<string, number>
      topics: Map<string, number>
      mistakeReasons: Map<string, number>
    }
  >()

  for (const answer of attempt.perQuestionAnswers) {
    const question = questionsById.get(answer.questionId)
    if (!question) continue
    const include =
      !answer.isCorrect ||
      answer.flagged === true ||
      answer.confidence === 'guess' ||
      answer.confidence === 'unsure'
    if (!include) continue

    const subjectId = question.subject as SubjectId
    let row = rows.get(subjectId)
    if (!row) {
      row = {
        subjectId,
        total: 0,
        wrong: 0,
        flagged: 0,
        lowConfidence: 0,
        inferredTypes: new Map(),
        subspecialties: new Map(),
        topics: new Map(),
        mistakeReasons: new Map(),
      }
      rows.set(subjectId, row)
    }

    row.total += 1
    if (!answer.isCorrect) row.wrong += 1
    if (answer.flagged === true) row.flagged += 1
    if (answer.confidence === 'guess' || answer.confidence === 'unsure') row.lowConfidence += 1

    const meta = question.meta as Record<string, unknown> | undefined
    incrementCount(row.inferredTypes, inferChallengeQuestionType(question))
    incrementCount(row.subspecialties, readMetaLabel(meta, 'subspecialty'))
    incrementCount(row.topics, readMetaLabel(meta, 'topic'))
    incrementCount(
      row.mistakeReasons,
      CHALLENGE_MISTAKE_REASON_OPTIONS.find((option) => option.value === answer.mistakeReason)?.label ?? null,
    )
  }

  return Array.from(rows.values())
    .map((row) => ({
      subjectId: row.subjectId,
      total: row.total,
      wrong: row.wrong,
      flagged: row.flagged,
      lowConfidence: row.lowConfidence,
      inferredTypes: sortedTopicCounts(row.inferredTypes, 5),
      subspecialties: sortedTopicCounts(row.subspecialties, 3),
      topics: sortedTopicCounts(row.topics, 5),
      mistakeReasons: sortedTopicCounts(row.mistakeReasons, 5),
    }))
    .sort((a, b) => b.wrong - a.wrong || b.total - a.total || a.subjectId.localeCompare(b.subjectId, 'zh-Hant'))
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
