import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Question } from '@study-rpg/core'
import { getContentPack } from '@study-rpg/content-medexam2-tw'
import { EmojiIcon } from '../components/EmojiIcon'
import { getHospitalDB } from '../db/schema'
import {
  SUBJECT_TO_CHALLENGE_PAPER,
  buildChallengePaperSummaries,
  isRandomChallengePaperId,
  latestAttemptByPaperMap,
  paperShortLabel,
} from '../lib/challenge'
import { getChallengeInProgress } from '../services/challenge-attempts'
import { useGamepadPreference } from '../lib/gamepad'

function formatAttempt(score: number, total: number, finishedAt: number): string {
  const d = new Date(finishedAt)
  return `${score}/${total} · ${d.getMonth() + 1}/${d.getDate()}`
}

function subjectHint(subjectId: string | null): string {
  if (!subjectId) return '挑一份歷屆完整卷，交卷後正答率會回寫到弱科雷達。'
  const paper = SUBJECT_TO_CHALLENGE_PAPER[subjectId]
  if (!paper) return `${subjectId}：目前沒有對應整回卷別。`
  return `${subjectId} 主要在 ${paper}，已先把相關卷別排到前面。`
}

function pct(correct: number, total: number): string {
  if (total <= 0) return '-'
  return `${Math.round((correct / total) * 100)}%`
}

type PaperSummary = ReturnType<typeof buildChallengePaperSummaries>[number]

interface Sitting {
  key: string
  year: number
  session: number
  papers: PaperSummary[]
}

export function ChallengePickerPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const focusSubject = searchParams.get('subject')
  const [questions, setQuestions] = useState<Question[]>([])
  const [inProgressPaperId, setInProgressPaperId] = useState<string | null>(null)
  const [inProgressAnswered, setInProgressAnswered] = useState(0)
  const [inProgressTotal, setInProgressTotal] = useState(0)
  const [gamepadEnabled, setGamepadEnabled] = useGamepadPreference()

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    getContentPack(`${base}/content/medexam2-tw`)
      .then((pack) => setQuestions(pack.questions))
      .catch((err) => console.error('[challenge-picker] load content failed:', err))
  }, [])

  useEffect(() => {
    getChallengeInProgress()
      .then((row) => {
        if (row) {
          setInProgressPaperId(row.paperId)
          setInProgressAnswered(Object.keys(row.selections).length)
          setInProgressTotal(row.questionIds?.length ?? 0)
        }
      })
      .catch(() => { /* ignore */ })
  }, [])

  const attempts = useLiveQuery(() => getHospitalDB().challengeAttempts.toArray(), []) ?? []
  const latestMap = useMemo(() => latestAttemptByPaperMap(attempts), [attempts])
  const summaries = useMemo(
    () => buildChallengePaperSummaries(questions, latestMap),
    [questions, latestMap],
  )
  const focusPaper = focusSubject ? SUBJECT_TO_CHALLENGE_PAPER[focusSubject] : undefined
  const sorted = useMemo(() => {
    if (!focusPaper) return summaries
    return [...summaries].sort((a, b) => {
      const aMatch = a.paper === focusPaper ? 0 : 1
      const bMatch = b.paper === focusPaper ? 0 : 1
      return aMatch - bMatch || b.year - a.year || a.session - b.session
    })
  }, [summaries, focusPaper])

  const sittings = useMemo<Sitting[]>(() => {
    const map = new Map<string, PaperSummary[]>()
    for (const p of sorted) {
      const key = `${p.year}-${p.session}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return [...map.entries()].map(([key, papers]) => ({
      key,
      year: papers[0].year,
      session: papers[0].session,
      papers,
    }))
  }, [sorted])
  const hasRandomInProgress = inProgressPaperId !== null && isRandomChallengePaperId(inProgressPaperId)

  return (
    <main className="app-shell challenge-page challenge-picker">
      <header className="challenge-page__header">
        <Link to="/" className="nav-link">← 首頁</Link>
        <div>
          <h1><EmojiIcon char="📝" size={28} /> 整回挑戰</h1>
          <p>{subjectHint(focusSubject)}</p>
        </div>
        <label className="challenge-gamepad-toggle">
          <input
            type="checkbox"
            checked={gamepadEnabled}
            onChange={(event) => setGamepadEnabled(event.target.checked)}
          />
          <span>控制器</span>
        </label>
      </header>

      <section className="challenge-random-panel" aria-label="隨機題組">
        <button
          type="button"
          className={[
            'challenge-paper-card',
            'challenge-paper-card--random',
            hasRandomInProgress ? 'challenge-paper-card--inprogress' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => navigate('/challenge/random')}
        >
          <span className="challenge-paper-card__year">隨機</span>
          <span className="challenge-paper-card__meta">全題庫 · 20 題</span>
          <span className="challenge-paper-card__count">{questions.filter((q) => q.hasOptionImages !== true).length} 題可抽</span>
          <span className="challenge-paper-card__subjects">跨科混合，即抽即答</span>
          {hasRandomInProgress ? (
            <span className="challenge-paper-card__attempt challenge-paper-card__attempt--inprogress">
              繼續（已答 {inProgressAnswered}/{inProgressTotal || 20} 題）
            </span>
          ) : (
            <span className="challenge-paper-card__attempt challenge-paper-card__attempt--empty">
              新隨機題組
            </span>
          )}
        </button>
      </section>

      {summaries.length === 0 ? (
        <p className="challenge-empty">正在整理歷屆卷...</p>
      ) : (
        <div className="challenge-sittings" aria-label="歷屆整回卷">
          {sittings.map(({ key, year, session, papers }) => {
            const attempted = papers.filter((p) => p.latestAttempt)
            const aggScore = attempted.reduce((s, p) => s + p.latestAttempt!.totalScore, 0)
            const aggTotal = attempted.reduce(
              (s, p) => s + p.latestAttempt!.perQuestionAnswers.length, 0,
            )
            return (
              <section key={key} className="challenge-sitting">
                <header className="challenge-sitting__header">
                  <span className="challenge-sitting__title">
                    {year} 年第 {session} 次
                  </span>
                  {attempted.length > 0 ? (
                    <span className="challenge-sitting__agg">
                      合計 {aggScore}/{aggTotal}
                      <small>（{pct(aggScore, aggTotal)}）</small>
                      {attempted.length < papers.length && (
                        <small> · {papers.length - attempted.length} 份未挑戰</small>
                      )}
                    </span>
                  ) : (
                    <span className="challenge-sitting__agg challenge-sitting__agg--empty">
                      尚未挑戰
                    </span>
                  )}
                </header>
                <div className="challenge-paper-grid">
                  {papers.map((paper) => {
                    const isFocus = focusPaper === paper.paper
                    const isInProgress = paper.paperId === inProgressPaperId
                    const total = paper.latestAttempt?.perQuestionAnswers.length ?? paper.questionCount
                    return (
                      <button
                        key={paper.paperId}
                        type="button"
                        className={[
                          'challenge-paper-card',
                          isFocus ? 'challenge-paper-card--focus' : '',
                          isInProgress ? 'challenge-paper-card--inprogress' : '',
                        ].filter(Boolean).join(' ')}
                        onClick={() => navigate(`/challenge/run/${encodeURIComponent(paper.paperId)}`)}
                      >
                        <span className="challenge-paper-card__year">{paper.year}</span>
                        <span className="challenge-paper-card__meta">
                          第 {paper.session} 次 · {paperShortLabel(paper.paper)}
                        </span>
                        <span className="challenge-paper-card__count">{paper.questionCount} 題</span>
                        <span className="challenge-paper-card__subjects">
                          {paper.subjects.slice(0, 3).map((s) => s.subjectId).join(' / ')}
                        </span>
                        {isInProgress && (
                          <span className="challenge-paper-card__attempt challenge-paper-card__attempt--inprogress">
                            繼續（已答 {inProgressAnswered} 題）
                          </span>
                        )}
                        {!isInProgress && paper.latestAttempt ? (
                          <span className="challenge-paper-card__attempt">
                            上次 {formatAttempt(paper.latestAttempt.totalScore, total, paper.latestAttempt.finishedAt)}
                          </span>
                        ) : !isInProgress ? (
                          <span className="challenge-paper-card__attempt challenge-paper-card__attempt--empty">
                            尚未挑戰
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </main>
  )
}
