import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Question } from '@study-rpg/core'
import { getContentPack, HOSPITAL_CREDIT_LABEL } from '@study-rpg/content-medexam2-tw'
import { EmojiIcon } from '../components/EmojiIcon'
import { ExplanationMarkdown } from '../components/ExplanationMarkdown'
import type { ChallengeAttemptRow, ChallengeMistakeReason } from '../db/schema'
import {
  CHALLENGE_CONFIDENCE_OPTIONS,
  CHALLENGE_MISTAKE_REASON_OPTIONS,
  buildLearningBreakdown,
  buildSubjectBreakdown,
  formatElapsed,
  paperLabel,
} from '../lib/challenge'
import { toggleBookmark, useAllBookmarks } from '../services/bookmarks'
import {
  getChallengeAttemptById,
  listChallengeAttemptsByPaper,
  saveChallengeAttempt,
} from '../services/challenge-attempts'

function pct(correct: number, total: number): string {
  if (total <= 0) return '-'
  return `${Math.round((correct / total) * 100)}%`
}

const confidenceLabel = new Map(
  CHALLENGE_CONFIDENCE_OPTIONS.map((option) => [option.value, option.label]),
)

const mistakeReasonLabel = new Map(
  CHALLENGE_MISTAKE_REASON_OPTIONS.map((option) => [option.value, option.label]),
)

export function ChallengeResultPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const [attempt, setAttempt] = useState<ChallengeAttemptRow | null>(null)
  const [priorAttempts, setPriorAttempts] = useState<ChallengeAttemptRow[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const bookmarks = useAllBookmarks() ?? []

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
  const learningBreakdown = useMemo(
    () => attempt ? buildLearningBreakdown(attempt, questionsById) : [],
    [attempt, questionsById],
  )
  const latestPrior = useMemo(
    () => priorAttempts.reduce<ChallengeAttemptRow | null>(
      (latest, row) => (!latest || row.finishedAt > latest.finishedAt ? row : latest),
      null,
    ),
    [priorAttempts],
  )
  const bookmarkedQuestionIds = useMemo(
    () => new Set(bookmarks.map((bookmark) => bookmark.questionId)),
    [bookmarks],
  )

  const updateMistakeReason = async (
    questionId: string,
    reason: ChallengeMistakeReason,
  ) => {
    if (!attempt) return
    const next: ChallengeAttemptRow = {
      ...attempt,
      perQuestionAnswers: attempt.perQuestionAnswers.map((answer) => (
        answer.questionId === questionId
          ? { ...answer, mistakeReason: answer.mistakeReason === reason ? undefined : reason }
          : answer
      )),
    }
    setAttempt(next)
    try {
      await saveChallengeAttempt(next)
    } catch (err) {
      console.error('[challenge-result] save mistake reason failed:', err)
    }
  }

  const handleToggleBookmark = async (questionId: string) => {
    try {
      await toggleBookmark(questionId)
    } catch (err) {
      console.error('[challenge-result] toggle bookmark failed:', err)
    }
  }

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
  const reviewRows = attempt.perQuestionAnswers.filter((row) => (
    !row.isCorrect ||
    row.flagged === true ||
    row.confidence === 'guess' ||
    row.confidence === 'unsure'
  ))
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
          <span>複習 {reviewRows.length} 題</span>
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

      {learningBreakdown.length > 0 && (
        <section className="challenge-learning" aria-label="學習診斷">
          <h2>學習診斷</h2>
          <div className="challenge-learning__grid">
            {learningBreakdown.map((row) => (
              <article key={row.subjectId} className="challenge-learning-card">
                <div className="challenge-learning-card__head">
                  <h3>{row.subjectId}</h3>
                  <span>{row.total} 題待複習</span>
                </div>
                <div className="challenge-learning-card__stats">
                  <span>錯 {row.wrong}</span>
                  <span>標記 {row.flagged}</span>
                  <span>低把握 {row.lowConfidence}</span>
                </div>
                {row.inferredTypes.length > 0 && (
                  <div className="challenge-learning-card__group">
                    <strong>推定題型</strong>
                    <div className="challenge-learning-card__chips challenge-learning-card__chips--types">
                      {row.inferredTypes.map((item) => (
                        <span key={item.label}>{item.label} ×{item.count}</span>
                      ))}
                    </div>
                  </div>
                )}
                {row.subspecialties.length > 0 && (
                  <div className="challenge-learning-card__group">
                    <strong>次專科</strong>
                    <div className="challenge-learning-card__chips">
                      {row.subspecialties.map((item) => (
                        <span key={item.label}>{item.label} ×{item.count}</span>
                      ))}
                    </div>
                  </div>
                )}
                {row.topics.length > 0 && (
                  <div className="challenge-learning-card__group">
                    <strong>題目主題</strong>
                    <div className="challenge-learning-card__chips">
                      {row.topics.map((item) => (
                        <span key={item.label}>{item.label} ×{item.count}</span>
                      ))}
                    </div>
                  </div>
                )}
                {row.mistakeReasons.length > 0 && (
                  <div className="challenge-learning-card__group">
                    <strong>錯因標籤</strong>
                    <div className="challenge-learning-card__chips challenge-learning-card__chips--reasons">
                      {row.mistakeReasons.map((item) => (
                        <span key={item.label}>{item.label} ×{item.count}</span>
                      ))}
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="challenge-review">
        <h2>複習清單</h2>
        {reviewRows.length === 0 ? (
          <p className="challenge-empty">沒有錯題、標記題或低把握題。這回漂亮收工。</p>
        ) : (
          <div className="challenge-review__list">
            {reviewRows.map((answer, idx) => {
              const question = questionsById.get(answer.questionId)
              if (!question) {
                return (
                  <article key={answer.questionId} className="challenge-review-card">
                    <h3>{idx + 1}. 找不到題目 {answer.questionId}</h3>
                  </article>
                )
              }
              const isBookmarked = bookmarkedQuestionIds.has(answer.questionId)
              return (
                <article key={answer.questionId} className="challenge-review-card">
                  <div className="challenge-review-card__head">
                    <h3>{idx + 1}. {question.subject}</h3>
                    <button
                      type="button"
                      className={`challenge-review-card__bookmark${isBookmarked ? ' challenge-review-card__bookmark--on' : ''}`}
                      onClick={() => { void handleToggleBookmark(answer.questionId) }}
                      aria-pressed={isBookmarked}
                    >
                      {isBookmarked ? '已收藏' : '加入收藏'}
                    </button>
                  </div>
                  <div className="challenge-review-card__badges" aria-label="回顧原因">
                    {!answer.isCorrect && <span>錯題</span>}
                    {answer.flagged === true && <span>已標記</span>}
                    {answer.confidence && <span>{confidenceLabel.get(answer.confidence) ?? answer.confidence}</span>}
                  </div>
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
                  {!answer.isCorrect && (
                    <div className="challenge-review-card__reasons" aria-label="錯因標籤">
                      <span>錯因</span>
                      {CHALLENGE_MISTAKE_REASON_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={answer.mistakeReason === option.value ? 'challenge-review-card__reason challenge-review-card__reason--active' : 'challenge-review-card__reason'}
                          onClick={() => { void updateMistakeReason(answer.questionId, option.value) }}
                          aria-pressed={answer.mistakeReason === option.value}
                          title={mistakeReasonLabel.get(option.value) ?? option.label}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {question.explanation && (
                    <div className="challenge-review-card__explanation">
                      <strong>詳解</strong>
                      <ExplanationMarkdown text={question.explanation} />
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
