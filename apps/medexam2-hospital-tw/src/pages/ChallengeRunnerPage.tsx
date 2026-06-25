import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Question, SubjectId } from '@study-rpg/core'
import { getContentPack } from '@study-rpg/content-medexam2-tw'
import { EmojiIcon } from '../components/EmojiIcon'
import { ExplanationMarkdown } from '../components/ExplanationMarkdown'
import { getHospitalDB, type ChallengeAttemptRow, type ChallengeConfidence } from '../db/schema'
import {
  CHALLENGE_CONFIDENCE_OPTIONS,
  computeChallengeEconomyReward,
  formatElapsed,
  isRandomChallengePaperId,
  paperLabel,
  pickRandomChallengeQuestionIds,
  randomChallengePaperId,
  scoreChallenge,
  selectChallengeQuestionsById,
  selectChallengePaperQuestions,
} from '../lib/challenge'
import { recordCorrectAnswer, recordWrongAnswer } from '../lib/mastery'
import { applyQuizReward } from '../services/quiz-rewards'
import { applyChallengeEconomyReward } from '../services/challenge-rewards'
import {
  clearChallengeInProgress,
  getChallengeInProgress,
  saveChallengeInProgress,
} from '../services/challenge-attempts'
import { addStudyTimeBuckets } from '../lib/study-time'
import { useGamepadBindings, useGamepadControls, useGamepadPreference } from '../lib/gamepad'
import { GamepadSettings } from '../components/GamepadSettings'

const STUDY_TIME_FLUSH_MS = 15_000

interface Props {
  mode?: 'paper' | 'random'
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function ChallengeRunnerPage({ mode = 'paper' }: Props) {
  const { paperId: rawPaperId } = useParams<{ paperId: string }>()
  const routePaperId = rawPaperId ? decodeURIComponent(rawPaperId) : ''
  const isRandomMode = mode === 'random'
  const navigate = useNavigate()
  const db = getHospitalDB()

  const [allQuestions, setAllQuestions] = useState<Question[]>([])
  const [paperId, setPaperId] = useState(isRandomMode ? '' : routePaperId)
  const [randomQuestionIds, setRandomQuestionIds] = useState<string[] | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState<Set<string>>(new Set())
  const [confidenceByQuestion, setConfidenceByQuestion] = useState<Record<string, ChallengeConfidence>>({})
  const [elapsedSec, setElapsedSec] = useState(0)
  const [paused, setPaused] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [resumeNotice, setResumeNotice] = useState(false)
  const [shownExplanations, setShownExplanations] = useState<Set<string>>(new Set())
  const [gamepadEnabled, setGamepadEnabled] = useGamepadPreference()
  const [gamepadBindings, setGamepadBinding, resetGamepadBindings] = useGamepadBindings()
  const [focusedOptionIdx, setFocusedOptionIdx] = useState(0)
  const startedAtRef = useRef(Date.now())
  const elapsedSecRef = useRef(0)
  const studyTimeRecordedAtRef = useRef<number | null>(null)
  /** Tracks whether the player manually paused — prevents auto-resume on tab-return. */
  const manuallyPausedRef = useRef(false)

  useEffect(() => { elapsedSecRef.current = elapsedSec }, [elapsedSec])

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    getContentPack(`${base}/content/medexam2-tw`)
      .then((pack) => setAllQuestions(pack.questions))
      .catch((err) => console.error('[challenge-runner] load content failed:', err))
  }, [])

  const questions = useMemo(() => {
    if (isRandomMode) {
      return randomQuestionIds ? selectChallengeQuestionsById(allQuestions, randomQuestionIds) : []
    }
    return selectChallengePaperQuestions(allQuestions, paperId)
  }, [allQuestions, isRandomMode, paperId, randomQuestionIds])
  const current = questions.length > 0 ? questions[Math.min(currentIdx, questions.length - 1)] : null
  const currentOptionKeys = useMemo(
    () => (current ? Object.keys(current.options) : []),
    [current],
  )

  useEffect(() => {
    if (!current) return
    const selectedKey = selections[current.id]
    const selectedIdx = selectedKey ? currentOptionKeys.indexOf(selectedKey) : -1
    setFocusedOptionIdx(selectedIdx >= 0 ? selectedIdx : 0)
  }, [current, currentOptionKeys, selections])

  useEffect(() => {
    if (isRandomMode && allQuestions.length === 0) return
    let cancelled = false
    ;(async () => {
      try {
        const inProgress = await getChallengeInProgress()
        if (cancelled) return

        if (isRandomMode) {
          if (
            inProgress &&
            isRandomChallengePaperId(inProgress.paperId) &&
            inProgress.questionIds &&
            inProgress.questionIds.length > 0
          ) {
            setPaperId(inProgress.paperId)
            setRandomQuestionIds(inProgress.questionIds)
            setCurrentIdx(inProgress.currentQuestionIndex)
            setSelections(inProgress.selections)
            setFlags(new Set(inProgress.flags ?? []))
            setConfidenceByQuestion(inProgress.confidenceByQuestion ?? {})
            setElapsedSec(inProgress.elapsedSecAtPause)
            startedAtRef.current = inProgress.startedAt
            setPaused(inProgress.lastResumedAt === null)
            setResumeNotice(true)
          } else {
            if (inProgress) await clearChallengeInProgress()
            const historyRows = await db.questionHistory.toArray()
            const seenQuestionIds = new Set(historyRows.map((row) => row.questionId))
            setPaperId(randomChallengePaperId())
            setRandomQuestionIds(pickRandomChallengeQuestionIds(allQuestions, undefined, seenQuestionIds))
            startedAtRef.current = Date.now()
            setPaused(false)
          }
          return
        }

        if (inProgress && inProgress.paperId === routePaperId) {
          setPaperId(inProgress.paperId)
          setCurrentIdx(inProgress.currentQuestionIndex)
          setSelections(inProgress.selections)
          setFlags(new Set(inProgress.flags ?? []))
          setConfidenceByQuestion(inProgress.confidenceByQuestion ?? {})
          setElapsedSec(inProgress.elapsedSecAtPause)
          startedAtRef.current = inProgress.startedAt
          setPaused(inProgress.lastResumedAt === null)
          setResumeNotice(true)
        } else {
          if (inProgress) await clearChallengeInProgress()
          setPaperId(routePaperId)
          startedAtRef.current = Date.now()
          setPaused(false)
        }
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => { cancelled = true }
  }, [allQuestions, db, isRandomMode, routePaperId])

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
        ...(isRandomMode ? { questionIds: questions.map((q) => q.id) } : {}),
        startedAt: startedAtRef.current,
        currentQuestionIndex: currentIdx,
        selections,
        flags: Array.from(flags),
        confidenceByQuestion,
        elapsedSecAtPause: elapsedSecRef.current,
        lastResumedAt: paused ? null : Date.now(),
      })
    }
    const timer = window.setInterval(save, 5000)
    save()
    return () => window.clearInterval(timer)
  }, [confidenceByQuestion, flags, hydrated, isRandomMode, paperId, questions, currentIdx, selections, paused])

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

  useEffect(() => {
    if (!hydrated || !paperId || paused || questions.length === 0) {
      studyTimeRecordedAtRef.current = null
      return
    }

    studyTimeRecordedAtRef.current = Date.now()
    const flush = () => {
      const now = Date.now()
      const last = studyTimeRecordedAtRef.current
      studyTimeRecordedAtRef.current = now
      if (!last || now <= last) return
      void addStudyTimeBuckets(db, now, now - last).catch((err) => {
        console.error('[challenge-runner] addStudyTimeBuckets failed:', err)
      })
    }

    const timer = window.setInterval(flush, STUDY_TIME_FLUSH_MS)
    return () => {
      window.clearInterval(timer)
      flush()
    }
  }, [db, hydrated, paperId, paused, questions.length])

  const submit = useCallback(async () => {
    if (!paperId || questions.length === 0) return
    const now = Date.now()
    const isRandomAttempt = isRandomChallengePaperId(paperId)
    const score = scoreChallenge(questions, selections)
    const perQuestionAnswers = score.perQuestionAnswers.map((answer) => ({
      ...answer,
      confidence: confidenceByQuestion[answer.questionId],
      flagged: flags.has(answer.questionId) || undefined,
    }))
    let attempt: ChallengeAttemptRow = {
      id: uuid(),
      paperId,
      startedAt: startedAtRef.current,
      finishedAt: now,
      elapsedSec,
      totalScore: score.totalScore,
      perQuestionAnswers,
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
        const economyReward = isRandomAttempt
          ? undefined
          : computeChallengeEconomyReward(
            score.totalScore,
            perQuestionAnswers.length,
            await db.challengeAttempts.where('paperId').equals(paperId).toArray(),
          )
        if (economyReward) attempt = { ...attempt, economyReward }
        await db.challengeAttempts.put(attempt)
        for (const answer of perQuestionAnswers) {
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
        if (economyReward) {
          const grantedChallengeCredits = await applyChallengeEconomyReward(economyReward)
          if (grantedChallengeCredits !== economyReward.hospitalCreditDelta) {
            attempt = {
              ...attempt,
              economyReward: { ...economyReward, hospitalCreditDelta: grantedChallengeCredits },
            }
            await db.challengeAttempts.put(attempt)
          }
        }
        await db.challengeInProgress.delete('challengeInProgress')
      },
    )

    navigate(`/challenge/result/${attempt.id}`)
  }, [confidenceByQuestion, db, elapsedSec, flags, navigate, paperId, questions, selections])

  const answeredCount = Object.keys(selections).length
  const unansweredCount = questions.length - answeredCount

  const handleSubmitIntent = useCallback(() => {
    if (confirmSubmit) {
      setConfirmSubmit(false)
      void submit()
      return
    }
    if (unansweredCount > 0) setConfirmSubmit(true)
    else void submit()
  }, [confirmSubmit, submit, unansweredCount])

  const handleNextIntent = useCallback(() => {
    setCurrentIdx((idx) => Math.min(idx + 1, Math.max(questions.length - 1, 0)))
  }, [questions.length])

  const toggleCurrentFlag = useCallback(() => {
    if (!current) return
    setFlags((prev) => {
      const next = new Set(prev)
      next.has(current.id) ? next.delete(current.id) : next.add(current.id)
      return next
    })
  }, [current])

  const toggleCurrentExplanation = useCallback(() => {
    if (!current) return
    setShownExplanations((prev) => {
      const next = new Set(prev)
      next.has(current.id) ? next.delete(current.id) : next.add(current.id)
      return next
    })
  }, [current])

  const setCurrentConfidence = useCallback((value: ChallengeConfidence) => {
    if (!current) return
    setConfidenceByQuestion((prev) => ({ ...prev, [current.id]: value }))
  }, [current])

  const handlePreviousIntent = useCallback(() => {
    setCurrentIdx((idx) => Math.max(idx - 1, 0))
  }, [])

  const handleOptionIntent = useCallback((optionIndex: number) => {
    if (confirmSubmit || !current) return
    const optionKey = currentOptionKeys[optionIndex]
    if (!optionKey) return
    setSelections((prev) => ({ ...prev, [current.id]: optionKey }))
  }, [confirmSubmit, current, currentOptionKeys])

  const moveFocusedOption = useCallback((delta: -1 | 1) => {
    setFocusedOptionIdx((idx) => {
      const count = currentOptionKeys.length
      if (count === 0) return 0
      return (idx + delta + count) % count
    })
  }, [currentOptionKeys.length])

  const scrollWithGamepad = useCallback((direction: -1 | 1) => {
    window.scrollBy({ top: direction * 22, behavior: 'auto' })
  }, [])

  useGamepadControls(gamepadEnabled && hydrated && !!paperId && questions.length > 0, gamepadBindings, {
    onOptionUp: () => {
      if (!confirmSubmit) moveFocusedOption(-1)
    },
    onOptionDown: () => {
      if (!confirmSubmit) moveFocusedOption(1)
    },
    onSelectOption: () => {
      if (confirmSubmit) {
        setConfirmSubmit(false)
        void submit()
        return
      }
      handleOptionIntent(focusedOptionIdx)
    },
    onPreviousQuestion: () => {
      if (!confirmSubmit) handlePreviousIntent()
    },
    onNextQuestion: () => {
      if (!confirmSubmit) handleNextIntent()
    },
    onScrollUp: () => scrollWithGamepad(-1),
    onScrollDown: () => scrollWithGamepad(1),
    onToggleExplanation: () => {
      if (!confirmSubmit) toggleCurrentExplanation()
    },
    onToggleFlag: () => {
      if (!confirmSubmit) toggleCurrentFlag()
    },
    onSubmit: handleSubmitIntent,
    onCancel: () => {
      if (confirmSubmit) setConfirmSubmit(false)
    },
  })

  useEffect(() => {
    if (!hydrated || !paperId || questions.length === 0) return

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.isComposing ||
        isTextEntryTarget(event.target)
      ) {
        return
      }

      if (event.key === 'Enter') {
        event.preventDefault()
        if (confirmSubmit) handleSubmitIntent()
        else handleNextIntent()
        return
      }

      const shortcut = event.key.toLowerCase()
      if (!confirmSubmit && current && shortcut === 'f') {
        event.preventDefault()
        toggleCurrentFlag()
        return
      }

      if (!confirmSubmit && current && shortcut === 'e') {
        event.preventDefault()
        toggleCurrentExplanation()
        return
      }

      const optionIndex = ['1', '2', '3', '4'].indexOf(event.key)
      if (optionIndex === -1) return

      event.preventDefault()
      handleOptionIntent(optionIndex)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    confirmSubmit,
    handleNextIntent,
    handleOptionIntent,
    handleSubmitIntent,
    hydrated,
    paperId,
    questions.length,
    toggleCurrentExplanation,
    toggleCurrentFlag,
  ])

  if (!hydrated || allQuestions.length === 0) {
    return <main className="app-shell challenge-page"><p className="challenge-empty">載入整回卷...</p></main>
  }

  if (!paperId) {
    return (
      <main className="app-shell challenge-page">
        <p className="challenge-empty">缺少整回卷 ID</p>
        <Link to="/challenge" className="nav-link">← 回整回挑戰</Link>
      </main>
    )
  }

  if (questions.length === 0) {
    return (
      <main className="app-shell challenge-page">
        <p className="challenge-empty">
          {isRandomMode ? '目前沒有未看過的隨機題可抽。' : `查無此整回卷：${paperId}`}
        </p>
        <Link to="/challenge" className="nav-link">← 回整回挑戰</Link>
      </main>
    )
  }
  if (!current) {
    return <main className="app-shell challenge-page"><p className="challenge-empty">載入題目...</p></main>
  }

  return (
    <main className="app-shell challenge-page challenge-runner">
      <header className="challenge-runner__header">
        <Link to="/challenge" className="nav-link">← 挑卷</Link>
        <div>
          <h1><EmojiIcon char="📝" size={28} /> {paperLabel(paperId)}</h1>
          <p>{answeredCount}/{questions.length} 題 · {formatElapsed(elapsedSec)}{paused ? ' · 已暫停' : ''}</p>
        </div>
        <div className="challenge-runner__actions">
          <label className="challenge-gamepad-toggle">
            <input
              type="checkbox"
              checked={gamepadEnabled}
              onChange={(event) => setGamepadEnabled(event.target.checked)}
            />
            <span>控制器</span>
          </label>
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
            onClick={handleSubmitIntent}
            aria-keyshortcuts="Enter"
          >
            交卷
          </button>
        </div>
      </header>

      {gamepadEnabled && (
        <GamepadSettings
          bindings={gamepadBindings}
          onBind={setGamepadBinding}
          onReset={resetGamepadBindings}
        />
      )}

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
            <div className="challenge-question__tools">
              <button
                type="button"
                className={`challenge-explanation-btn${shownExplanations.has(current.id) ? ' challenge-explanation-btn--active' : ''}`}
                onClick={toggleCurrentExplanation}
                aria-expanded={shownExplanations.has(current.id)}
                aria-keyshortcuts="E"
              >
                {shownExplanations.has(current.id) ? '隱藏詳解' : '詳解'}
              </button>
              <button
                type="button"
                className={`challenge-flag-btn${flags.has(current.id) ? ' challenge-flag-btn--active' : ''}`}
                onClick={toggleCurrentFlag}
                aria-label={flags.has(current.id) ? '取消標記' : '標記此題'}
                aria-keyshortcuts="F"
              >
                {flags.has(current.id) ? '🚩 已標記' : '⚑ 標記'}
              </button>
            </div>
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
            {Object.entries(current.options).map(([key, text], optionIndex) => {
              const focused = gamepadEnabled && focusedOptionIdx === optionIndex
              return (
                <button
                  key={key}
                  type="button"
                  className={`challenge-option${selections[current.id] === key ? ' challenge-option--selected' : ''}${focused ? ' challenge-option--focused' : ''}`}
                  onClick={() => {
                    setFocusedOptionIdx(optionIndex)
                    setSelections((prev) => ({ ...prev, [current.id]: key }))
                  }}
                  aria-keyshortcuts={String(optionIndex + 1)}
                >
                  <span className="challenge-option__key">({key})</span>
                  <span>{text}</span>
                </button>
              )
            })}
          </div>
          <div className="challenge-confidence" aria-label="本題把握度">
            <span>把握度</span>
            <div className="challenge-confidence__buttons">
              {CHALLENGE_CONFIDENCE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={confidenceByQuestion[current.id] === option.value ? 'challenge-confidence__btn challenge-confidence__btn--active' : 'challenge-confidence__btn'}
                  onClick={() => setCurrentConfidence(option.value)}
                  aria-pressed={confidenceByQuestion[current.id] === option.value}
                  title={option.label}
                >
                  {option.shortLabel}
                </button>
              ))}
            </div>
          </div>
          {shownExplanations.has(current.id) && (
            <section className="challenge-question__explanation">
              <h2>詳解</h2>
              <ExplanationMarkdown text={current.explanation ?? ''} />
            </section>
          )}
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
