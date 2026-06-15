import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Question, SubjectId } from '@study-rpg/core'
import { getContentPack } from '@study-rpg/content-medexam2-tw'
import { EmojiIcon } from '../components/EmojiIcon'
import { getHospitalDB, type ChallengeAttemptRow } from '../db/schema'
import {
  formatElapsed,
  paperLabel,
  scoreChallenge,
  selectChallengePaperQuestions,
} from '../lib/challenge'
import { recordCorrectAnswer, recordWrongAnswer } from '../lib/mastery'
import { applyQuizReward } from '../services/quiz-rewards'
import {
  clearChallengeInProgress,
  getChallengeInProgress,
  saveChallengeInProgress,
} from '../services/challenge-attempts'

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function ChallengeRunnerPage() {
  const { paperId: rawPaperId } = useParams<{ paperId: string }>()
  const paperId = rawPaperId ? decodeURIComponent(rawPaperId) : ''
  const navigate = useNavigate()
  const db = getHospitalDB()

  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState<Set<string>>(new Set())
  const [elapsedSec, setElapsedSec] = useState(0)
  const [paused, setPaused] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [resumeNotice, setResumeNotice] = useState(false)
  const startedAtRef = useRef(Date.now())
  const elapsedSecRef = useRef(0)
  /** Tracks whether the player manually paused — prevents auto-resume on tab-return. */
  const manuallyPausedRef = useRef(false)

  useEffect(() => { elapsedSecRef.current = elapsedSec }, [elapsedSec])

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    getContentPack(`${base}/content/medexam2-tw`)
      .then((pack) => setAllQuestions(pack.questions))
      .catch((err) => console.error('[challenge-runner] load content failed:', err))
  }, [])

  const questions = useMemo(
    () => selectChallengePaperQuestions(allQuestions, paperId),
    [allQuestions, paperId],
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const inProgress = await getChallengeInProgress()
        if (cancelled) return
        if (inProgress && inProgress.paperId === paperId) {
          setCurrentIdx(inProgress.currentQuestionIndex)
          setSelections(inProgress.selections)
          setElapsedSec(inProgress.elapsedSecAtPause)
          startedAtRef.current = inProgress.startedAt
          setPaused(inProgress.lastResumedAt === null)
          setResumeNotice(true)
        } else {
          if (inProgress) await clearChallengeInProgress()
          startedAtRef.current = Date.now()
          setPaused(false)
        }
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => { cancelled = true }
  }, [paperId])

  useEffect(() => {
    if (!hydrated || paused) return
    const timer = window.setInterval(() => setElapsedSec((sec) => sec + 1), 1000)
    return () => window.clearInterval(timer)
  }, [hydrated, paused])

  useEffect(() => {
    if (!hydrated || !paperId) return
    const save = () => {
      void saveChallengeInProgress({
        paperId,
        startedAt: startedAtRef.current,
        currentQuestionIndex: currentIdx,
        selections,
        elapsedSecAtPause: elapsedSecRef.current,
        lastResumedAt: paused ? null : Date.now(),
      })
    }
    const timer = window.setInterval(save, 5000)
    save()
    return () => window.clearInterval(timer)
  }, [hydrated, paperId, currentIdx, selections, paused])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setPaused(true)
      } else if (!manuallyPausedRef.current) {
        setPaused(false)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const toggleManualPause = useCallback(() => {
    const next = !manuallyPausedRef.current
    manuallyPausedRef.current = next
    setPaused(next)
  }, [])

  useEffect(() => {
    if (!resumeNotice) return
    const t = window.setTimeout(() => setResumeNotice(false), 3500)
    return () => window.clearTimeout(t)
  }, [resumeNotice])

  const submit = useCallback(async () => {
    if (!paperId || questions.length === 0) return
    const now = Date.now()
    const score = scoreChallenge(questions, selections)
    const attempt: ChallengeAttemptRow = {
      id: uuid(),
      paperId,
      startedAt: startedAtRef.current,
      finishedAt: now,
      elapsedSec,
      totalScore: score.totalScore,
      perQuestionAnswers: score.perQuestionAnswers,
    }
    const byId = new Map(questions.map((q) => [q.id, q]))

    await db.transaction(
      'rw',
      [
        db.challengeAttempts,
        db.challengeInProgress,
        db.mastery,
        db.questionHistory,
        db.affinity,
        db.gameCounters,
        db.monotonicCounters,
        db.bannerUnlockBonusLog,
      ],
      async () => {
        await db.challengeAttempts.put(attempt)
        for (const answer of score.perQuestionAnswers) {
          const question = byId.get(answer.questionId)
          if (!question) continue
          const subjectId = question.subject as SubjectId
          const priorHistory = await db.questionHistory.get(question.id)
          const payload = { subjectId, questionId: question.id }
          if (answer.isCorrect) await recordCorrectAnswer(payload, null)
          else await recordWrongAnswer(payload)
          await applyQuizReward({
            subjectId,
            boundDoctor: null,
            questionId: question.id,
            isCorrect: answer.isCorrect,
            isDisputed: answer.userSelection !== null && question.disputed === true,
            isFresh: priorHistory === undefined,
          })
        }
        await db.challengeInProgress.delete('challengeInProgress')
      },
    )

    navigate(`/challenge/result/${attempt.id}`)
  }, [db, elapsedSec, navigate, paperId, questions, selections])

  if (!paperId) {
    return (
      <main className="app-shell challenge-page">
        <p className="challenge-empty">缺少整回卷 ID</p>
        <Link to="/challenge" className="nav-link">← 回整回挑戰</Link>
      </main>
    )
  }

  if (!hydrated || allQuestions.length === 0) {
    return <main className="app-shell challenge-page"><p className="challenge-empty">載入整回卷...</p></main>
  }

  if (questions.length === 0) {
    return (
      <main className="app-shell challenge-page">
        <p className="challenge-empty">查無此整回卷：{paperId}</p>
        <Link to="/challenge" className="nav-link">← 回整回挑戰</Link>
      </main>
    )
  }

  const current = questions[Math.min(currentIdx, questions.length - 1)]
  const answeredCount = Object.keys(selections).length
  const unansweredCount = questions.length - answeredCount

  return (
    <main className="app-shell challenge-page challenge-runner">
      <header className="challenge-runner__header">
        <Link to="/challenge" className="nav-link">← 挑卷</Link>
        <div>
          <h1><EmojiIcon char="📝" size={28} /> {paperLabel(paperId)}</h1>
          <p>{answeredCount}/{questions.length} 題 · {formatElapsed(elapsedSec)}{paused ? ' · 已暫停' : ''}</p>
        </div>
        <div className="challenge-runner__actions">
          <button
            type="button"
            className="challenge-pause-btn"
            onClick={toggleManualPause}
            aria-label={paused ? '繼續計時' : '暫停計時'}
          >
            {paused ? '▶ 繼續' : '⏸ 暫停'}
          </button>
          <button
            type="button"
            className="challenge-submit"
            onClick={() => unansweredCount > 0 ? setConfirmSubmit(true) : void submit()}
          >
            交卷
          </button>
        </div>
      </header>

      {resumeNotice && <div className="challenge-toast">已從上次中斷處恢復</div>}

      <section className="challenge-runner__layout">
        <aside className="challenge-jump-grid" aria-label="題號">
          {questions.map((q, idx) => (
            <button
              key={q.id}
              type="button"
              className={[
                'challenge-jump',
                idx === currentIdx ? 'challenge-jump--current' : '',
                flags.has(q.id) ? 'challenge-jump--flagged' : '',
                selections[q.id] ? 'challenge-jump--answered' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setCurrentIdx(idx)}
              aria-label={`第 ${idx + 1} 題${selections[q.id] ? ' 已作答' : ''}${flags.has(q.id) ? ' 已標記' : ''}`}
            >
              {idx + 1}
            </button>
          ))}
        </aside>

        <article className="challenge-question">
          <div className="challenge-question__meta">
            <span>第 {currentIdx + 1} 題</span>
            <span>{current.subject}</span>
            <button
              type="button"
              className={`challenge-flag-btn${flags.has(current.id) ? ' challenge-flag-btn--active' : ''}`}
              onClick={() => setFlags((prev) => {
                const next = new Set(prev)
                next.has(current.id) ? next.delete(current.id) : next.add(current.id)
                return next
              })}
              aria-label={flags.has(current.id) ? '取消標記' : '標記此題'}
            >
              {flags.has(current.id) ? '🚩 已標記' : '⚑ 標記'}
            </button>
          </div>
          <p className="challenge-question__stem">{current.stem}</p>
          {current.imagePath && (
            <figure className="challenge-question__figure">
              <img src={`${import.meta.env.BASE_URL}${current.imagePath}`} alt="題目圖片" />
            </figure>
          )}
          {current.hasImage && !current.imagePath && (
            <p className="challenge-question__missing-image">此題原始題本含圖片，目前題庫尚未提供圖檔。</p>
          )}
          <div className="challenge-options">
            {Object.entries(current.options).map(([key, text]) => (
              <button
                key={key}
                type="button"
                className={`challenge-option${selections[current.id] === key ? ' challenge-option--selected' : ''}`}
                onClick={() => setSelections((prev) => ({ ...prev, [current.id]: key }))}
              >
                <span className="challenge-option__key">({key})</span>
                <span>{text}</span>
              </button>
            ))}
          </div>
          <footer className="challenge-question__nav">
            <button type="button" disabled={currentIdx === 0} onClick={() => setCurrentIdx((idx) => idx - 1)}>
              上一題
            </button>
            <button
              type="button"
              disabled={currentIdx >= questions.length - 1}
              onClick={() => setCurrentIdx((idx) => idx + 1)}
            >
              下一題
            </button>
          </footer>
        </article>
      </section>

      {confirmSubmit && (
        <div className="challenge-confirm" onClick={() => setConfirmSubmit(false)}>
          <div className="challenge-confirm__dialog" onClick={(e) => e.stopPropagation()}>
            <h2>還有 {unansweredCount} 題未作答</h2>
            <p>未作答會算錯，交卷後會把本回結果寫入弱科雷達與 SRS。</p>
            <div className="challenge-confirm__actions">
              <button type="button" onClick={() => setConfirmSubmit(false)}>繼續作答</button>
              <button type="button" className="challenge-submit" onClick={() => { setConfirmSubmit(false); void submit() }}>
                確定交卷
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
