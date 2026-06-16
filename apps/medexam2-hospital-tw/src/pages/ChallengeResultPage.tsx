import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Question } from '@study-rpg/core'
import { getContentPack, HOSPITAL_CREDIT_LABEL } from '@study-rpg/content-medexam2-tw'
import { EmojiIcon } from '../components/EmojiIcon'
import type { ChallengeAttemptRow } from '../db/schema'
import {
  buildSubjectBreakdown,
  formatElapsed,
  paperLabel,
} from '../lib/challenge'
import {
  getChallengeAttemptById,
  listChallengeAttemptsByPaper,
} from '../services/challenge-attempts'

function pct(correct: number, total: number): string {
  if (total <= 0) return '-'
  return `${Math.round((correct / total) * 100)}%`
}

export function ChallengeResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const [attempt, setAttempt] = useState<ChallengeAttemptRow | null>(null)
  const [priorAttempts, setPriorAttempts] = useState<ChallengeAttemptRow[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    getContentPack(`${base}/content/medexam2-tw`)
      .then((pack) => setQuestions(pack.questions))
      .catch((err) => console.error('[challenge-result] load content failed:', err))
  }, [])

  useEffect(() => {
    if (!attemptId) return
    let cancelled = false
    ;(async () => {
      try {
        const row = await getChallengeAttemptById(attemptId)
        if (cancelled) return
        setAttempt(row)
        if (row) {
          const rows = await listChallengeAttemptsByPaper(row.paperId)
          if (!cancelled) setPriorAttempts(rows.filter((a) => a.id !== row.id))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [attemptId])

  const questionsById = useMemo(() => {
    const map = new Map<string, Question>()
    for (const q of questions) map.set(q.id, q)
    return map
  }, [questions])

  const breakdown = useMemo(
    () => attempt ? buildSubjectBreakdown(attempt, questionsById) : [],
    [attempt, questionsById],
  )
  const latestPrior = useMemo(
    () => priorAttempts.reduce<ChallengeAttemptRow | null>(
      (latest, row) => (!latest || row.finishedAt > latest.finishedAt ? row : latest),
      null,
    ),
    [priorAttempts],
  )

  if (loading) {
    return <main className="app-shell challenge-page"><p className="challenge-empty">載入結果...</p></main>
  }

  if (!attempt) {
    return (
      <main className="app-shell challenge-page">
        <p className="challenge-empty">找不到這次整回結果。</p>
        <Link to="/challenge" className="nav-link">← 回整回挑戰</Link>
      </main>
    )
  }

  const total = attempt.perQuestionAnswers.length
  const wrongRows = attempt.perQuestionAnswers.filter((row) => !row.isCorrect)
  const delta = latestPrior ? attempt.totalScore - latestPrior.totalScore : null
  const reward = attempt.economyReward

  return (
    <main className="app-shell challenge-page challenge-result">
      <header className="challenge-page__header">
        <Link to="/challenge" className="nav-link">← 整回挑戰</Link>
        <div>
          <h1><EmojiIcon char="📊" size={28} /> 整回結果</h1>
          <p>{paperLabel(attempt.paperId)}</p>
        </div>
      </header>

      <section className="challenge-result__summary">
        <div className="challenge-result__score">
          <strong>{attempt.totalScore}</strong>
          <span>/ {total}</span>
        </div>
        <div className="challenge-result__facts">
          <span>正答率 {pct(attempt.totalScore, total)}</span>
          <span>耗時 {formatElapsed(attempt.elapsedSec)}</span>
          <span>第 {priorAttempts.length + 1} 次</span>
        </div>
        {delta === null ? (
          <p className="challenge-result__delta">首次挑戰此卷，下一次會顯示進步幅度。</p>
        ) : (
          <p className={`challenge-result__delta ${delta >= 0 ? 'challenge-result__delta--up' : 'challenge-result__delta--down'}`}>
            上次 {latestPrior?.totalScore} → 這次 {attempt.totalScore}
            {delta !== 0 && <strong>{delta > 0 ? ` +${delta}` : ` ${delta}`}</strong>}
            {delta === 0 && <strong> 持平</strong>}
          </p>
        )}
        {reward && (
          <div className="challenge-result__reward" aria-label="整回經濟獎勵">
            <h2>整回獎勵</h2>
            {reward.revenueDelta > 0 ||
            reward.reputationDelta > 0 ||
            reward.hospitalCreditDelta > 0 ? (
              <>
                <div className="challenge-result__reward-grid">
                  <span>
                    <strong>+{reward.revenueDelta.toLocaleString()}</strong>
                    收入
                  </span>
                  <span>
                    <strong>+{reward.reputationDelta.toLocaleString()}</strong>
                    聲望
                  </span>
                  <span>
                    <strong>+{reward.hospitalCreditDelta}</strong>
                    {HOSPITAL_CREDIT_LABEL}
                  </span>
                </div>
                <p>
                  {reward.bestScoreDelta > 0 && `個人最佳刷新 +${reward.bestScoreDelta} 題。`}
                  {reward.firstPass && ' 首次達到 60% 及格門檻。'}
                  {reward.firstHonors && ' 首次達到 80% 榮譽門檻。'}
                </p>
              </>
            ) : (
              <p>
                本回沒有額外整回獎勵；每題答對仍已照常給予收入與聲望。刷新個人最佳、首次達到 60% 或首次達到 80% 會再給整回 bonus。
              </p>
            )}
          </div>
        )}
        <p className="challenge-result__note">
          {wrongRows.length > 0
            ? `${wrongRows.length} 題錯題已寫入 SRS，下次複習時會優先出現；本科正答率也會反映到首頁弱科雷達。`
            : '全對！本科正答率已反映到首頁弱科雷達。'}
        </p>
      </section>

      {priorAttempts.length > 0 && (
        <section className="challenge-history" aria-label="歷次成績">
          <h2>歷次成績</h2>
          <div className="challenge-history__list">
            {[...priorAttempts]
              .sort((a, b) => a.finishedAt - b.finishedAt)
              .map((a, i) => (
                <div key={a.id} className="challenge-history__row">
                  <span className="challenge-history__nth">第 {i + 1} 次</span>
                  <span className="challenge-history__date">
                    {new Date(a.finishedAt).toLocaleDateString('zh-TW')}
                  </span>
                  <span className="challenge-history__score">
                    {a.totalScore}/{a.perQuestionAnswers.length}
                    <small>（{pct(a.totalScore, a.perQuestionAnswers.length)}）</small>
                  </span>
                  <span className="challenge-history__time">{formatElapsed(a.elapsedSec)}</span>
                </div>
              ))}
            <div className="challenge-history__row challenge-history__row--current">
              <span className="challenge-history__nth">第 {priorAttempts.length + 1} 次</span>
              <span className="challenge-history__date">
                {new Date(attempt.finishedAt).toLocaleDateString('zh-TW')}
              </span>
              <span className="challenge-history__score">
                {attempt.totalScore}/{total}
                <small>（{pct(attempt.totalScore, total)}）</small>
              </span>
              <span className="challenge-history__time">{formatElapsed(attempt.elapsedSec)}</span>
            </div>
          </div>
        </section>
      )}

      {breakdown.length > 0 && (
        <section className="challenge-breakdown" aria-label="科別正答率">
          <h2>科別拆解</h2>
          <div className="challenge-breakdown__rows">
            {breakdown.map((row) => (
              <div key={row.subjectId} className="challenge-breakdown__row">
                <span className="challenge-breakdown__label">{row.subjectId}</span>
                <span className="challenge-breakdown__track">
                  <span
                    className="challenge-breakdown__fill"
                    style={{ width: `${Math.max(4, Math.round(row.rate * 100))}%` }}
                  />
                </span>
                <span className="challenge-breakdown__value">
                  {row.correct}/{row.total}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="challenge-review">
        <h2>錯題回顧</h2>
        {wrongRows.length === 0 ? (
          <p className="challenge-empty">全對。這回漂亮收工。</p>
        ) : (
          <div className="challenge-review__list">
            {wrongRows.map((answer, idx) => {
              const question = questionsById.get(answer.questionId)
              if (!question) {
                return (
                  <article key={answer.questionId} className="challenge-review-card">
                    <h3>{idx + 1}. 找不到題目 {answer.questionId}</h3>
                  </article>
                )
              }
              return (
                <article key={answer.questionId} className="challenge-review-card">
                  <h3>{idx + 1}. {question.subject}</h3>
                  <p className="challenge-review-card__stem">{question.stem}</p>
                  {question.imagePath && (
                    <figure className="challenge-question__figure">
                      <img src={`${import.meta.env.BASE_URL}${question.imagePath}`} alt="題目圖片" />
                    </figure>
                  )}
                  <div className="challenge-review-card__options">
                    {Object.entries(question.options).map(([key, text]) => (
                      <div
                        key={key}
                        className={[
                          'challenge-review-card__option',
                          key === question.answer ? 'challenge-review-card__option--correct' : '',
                          key === answer.userSelection && key !== question.answer ? 'challenge-review-card__option--wrong' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <span>({key})</span>
                        <span>{text}</span>
                        {key === answer.userSelection && <strong>你選</strong>}
                        {key === question.answer && <strong>正解</strong>}
                      </div>
                    ))}
                  </div>
                  {answer.userSelection === null && (
                    <p className="challenge-review-card__blank">未作答</p>
                  )}
                  {question.explanation && (
                    <div className="challenge-review-card__explanation">
                      <strong>詳解</strong>
                      <p>{question.explanation}</p>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
