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
  latestAttemptByPaperMap,
  paperShortLabel,
} from '../lib/challenge'

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

export function ChallengePickerPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const focusSubject = searchParams.get('subject')
  const [questions, setQuestions] = useState<Question[]>([])

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    getContentPack(`${base}/content/medexam2-tw`)
      .then((pack) => setQuestions(pack.questions))
      .catch((err) => console.error('[challenge-picker] load content failed:', err))
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

  return (
    <main className="app-shell challenge-page challenge-picker">
      <header className="challenge-page__header">
        <Link to="/" className="nav-link">← 首頁</Link>
        <div>
          <h1><EmojiIcon char="📝" size={28} /> 整回挑戰</h1>
          <p>{subjectHint(focusSubject)}</p>
        </div>
      </header>

      {summaries.length === 0 ? (
        <p className="challenge-empty">正在整理歷屆卷...</p>
      ) : (
        <section className="challenge-paper-grid" aria-label="歷屆整回卷">
          {sorted.map((paper) => {
            const isFocus = focusPaper === paper.paper
            const total = paper.latestAttempt?.perQuestionAnswers.length ?? paper.questionCount
            return (
              <button
                key={paper.paperId}
                type="button"
                className={`challenge-paper-card${isFocus ? ' challenge-paper-card--focus' : ''}`}
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
                {paper.latestAttempt ? (
                  <span className="challenge-paper-card__attempt">
                    上次 {formatAttempt(paper.latestAttempt.totalScore, total, paper.latestAttempt.finishedAt)}
                  </span>
                ) : (
                  <span className="challenge-paper-card__attempt challenge-paper-card__attempt--empty">
                    尚未挑戰
                  </span>
                )}
              </button>
            )
          })}
        </section>
      )}
    </main>
  )
}
