import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ContentPack, MockAttempt, MockInProgress, Player, Question, QuestionId } from '@study-rpg/core'
import { applyMockPassReward, decodePaperId, scoreMock } from '@study-rpg/core'
import { clearInProgress, getInProgress, saveAttempt, saveInProgress } from '../db/mock-attempts'
import { useGamepadControls, useGamepadPreference } from '../lib/gamepad'

const IDLE_THRESHOLD_MS = 180_000        // 180s for mock (vs 90s for reading)
const IN_PROGRESS_SAVE_DEBOUNCE_MS = 5_000
const RANDOM_QUESTION_COUNT = 20

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

function selectPaperQuestions(content: ContentPack, paperId: string): Question[] {
  const decoded = decodePaperId(paperId)
  if (!decoded) return []
  return content.questions.filter((q) => {
    const m = q.meta as Record<string, unknown> | undefined
    if (!m) return false
    return m.year === decoded.year && m.session === decoded.session && m.paper === decoded.paper
  })
}

function isRandomPaperId(paperId: string): boolean {
  return paperId.startsWith('random-')
}

function randomPaperId(): string {
  return `random-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function pickRandomQuestionIds(questions: Question[], count: number): QuestionId[] {
  const ids = questions.map((q) => q.id)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
  }
  return ids.slice(0, Math.min(count, ids.length))
}

function selectQuestionsById(content: ContentPack, questionIds: QuestionId[]): Question[] {
  const byId = new Map(content.questions.map((q) => [q.id, q]))
  return questionIds.flatMap((id) => {
    const q = byId.get(id)
    return q ? [q] : []
  })
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function paperLabel(paperId: string): string {
  if (isRandomPaperId(paperId)) return '隨機題組'
  const d = decodePaperId(paperId)
  if (!d) return paperId
  const kind = d.paper === 'medexam-1' ? '醫一' : '醫二'
  return `${d.year} 第 ${d.session} 次 ${kind}`
}

function pickPaperPrimarySubject(questions: Question[]): string {
  // Most-represented subject by count in this paper.
  const counts = new Map<string, number>()
  for (const q of questions) counts.set(q.subject, (counts.get(q.subject) ?? 0) + 1)
  let best = ''
  let bestCount = 0
  for (const [s, c] of counts) {
    if (c > bestCount) { best = s; bestCount = c }
  }
  return best
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

interface Props {
  content: ContentPack
  mode?: 'paper' | 'random'
  player: Player
  setPlayer: (p: Player) => void
  /** Existing roll-loot hook from App.tsx so mock submit can grant guaranteed SR. */
  onGuaranteedSRRoll?: () => void
}

export function MockRunnerRoute({ content, mode = 'paper', player, setPlayer, onGuaranteedSRRoll }: Props) {
  const { paperId: routePaperId } = useParams<{ paperId: string }>()
  const navigate = useNavigate()
  const isRandomMode = mode === 'random'

  const [paperId, setPaperId] = useState<string | null>(isRandomMode ? null : routePaperId ?? null)
  const [randomQuestionIds, setRandomQuestionIds] = useState<QuestionId[] | null>(null)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selections, setSelections] = useState<Record<QuestionId, string>>({})
  const [elapsedSec, setElapsedSec] = useState(0)
  const [paused, setPaused] = useState(false)
  const [pauseReason, setPauseReason] = useState<'visibility' | 'idle' | null>(null)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [resumedToast, setResumedToast] = useState(false)
  const [gamepadEnabled, setGamepadEnabled] = useGamepadPreference()

  const startedAtRef = useRef<number>(0)
  const lastResumedAtRef = useRef<number | null>(null)
  const lastActivityRef = useRef<number>(Date.now())
  const inProgressSaveTimer = useRef<number | null>(null)
  const elapsedSecRef = useRef<number>(0)
  useEffect(() => { elapsedSecRef.current = elapsedSec }, [elapsedSec])

  const questions = useMemo(() => {
    if (isRandomMode) return randomQuestionIds ? selectQuestionsById(content, randomQuestionIds) : []
    return paperId ? selectPaperQuestions(content, paperId) : []
  }, [content, isRandomMode, paperId, randomQuestionIds])

  const current = questions[currentIdx] ?? null
  const answeredCount = Object.keys(selections).length
  const unansweredCount = Math.max(questions.length - answeredCount, 0)
  const currentOptionKeys = useMemo(
    () => (current ? Object.keys(current.options) : []),
    [current],
  )

  const registerActivity = useCallback(() => {
    lastActivityRef.current = Date.now()
    if (paused && pauseReason === 'idle') {
      setPaused(false)
      setPauseReason(null)
      lastResumedAtRef.current = Date.now()
    }
  }, [paused, pauseReason])

  // ─── Hydration: load mockInProgress on mount ────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const ip = await getInProgress()
        if (cancelled) return

        if (isRandomMode) {
          if (ip && isRandomPaperId(ip.paperId) && ip.questionIds && ip.questionIds.length > 0) {
            setPaperId(ip.paperId)
            setRandomQuestionIds(ip.questionIds)
            setCurrentIdx(ip.currentQuestionIndex)
            setSelections(ip.selections)
            setElapsedSec(ip.elapsedSecAtPause)
            startedAtRef.current = ip.startedAt
            lastResumedAtRef.current = ip.lastResumedAt
            if (ip.lastResumedAt === null) {
              setPaused(true)
              setPauseReason('visibility')
            }
            setResumedToast(true)
          } else {
            if (ip) await clearInProgress()
            setPaperId(randomPaperId())
            setRandomQuestionIds(pickRandomQuestionIds(content.questions, RANDOM_QUESTION_COUNT))
            startedAtRef.current = Date.now()
            lastResumedAtRef.current = Date.now()
          }
          return
        }

        if (ip && ip.paperId === routePaperId) {
          setPaperId(ip.paperId)
          setCurrentIdx(ip.currentQuestionIndex)
          setSelections(ip.selections)
          setElapsedSec(ip.elapsedSecAtPause)
          startedAtRef.current = ip.startedAt
          lastResumedAtRef.current = ip.lastResumedAt
          if (ip.lastResumedAt === null) {
            setPaused(true)
            setPauseReason('visibility')
          }
          setResumedToast(true)
        } else if (ip && ip.paperId !== routePaperId) {
          // Different paper in progress — clear to avoid confusion
          await clearInProgress()
          setPaperId(routePaperId ?? null)
          startedAtRef.current = Date.now()
          lastResumedAtRef.current = Date.now()
        } else {
          setPaperId(routePaperId ?? null)
          startedAtRef.current = Date.now()
          lastResumedAtRef.current = Date.now()
        }
      } catch (err) {
        console.error('[mock-runner] hydration failed:', err)
        startedAtRef.current = Date.now()
        lastResumedAtRef.current = Date.now()
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => { cancelled = true }
  }, [content.questions, isRandomMode, routePaperId])

  // ─── Stopwatch ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated || paused) return
    const interval = window.setInterval(() => {
      setElapsedSec((s) => s + 1)
    }, 1000)
    return () => window.clearInterval(interval)
  }, [hydrated, paused])

  // ─── Visibility-based pause ─────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return
    const onVisChange = () => {
      if (document.visibilityState === 'hidden') {
        setPaused(true)
        setPauseReason('visibility')
        lastResumedAtRef.current = null
      } else if (document.visibilityState === 'visible' && pauseReason === 'visibility') {
        setPaused(false)
        setPauseReason(null)
        lastResumedAtRef.current = Date.now()
        lastActivityRef.current = Date.now()
      }
    }
    document.addEventListener('visibilitychange', onVisChange)
    return () => document.removeEventListener('visibilitychange', onVisChange)
  }, [hydrated, pauseReason])

  // ─── Idle-based pause + activity tracking ───────────────────────────────────
  useEffect(() => {
    if (!hydrated) return
    window.addEventListener('pointerdown', registerActivity)
    window.addEventListener('keydown', registerActivity)
    window.addEventListener('scroll', registerActivity, { passive: true })
    const idleCheck = window.setInterval(() => {
      if (paused) return
      if (Date.now() - lastActivityRef.current > IDLE_THRESHOLD_MS) {
        setPaused(true)
        setPauseReason('idle')
        lastResumedAtRef.current = null
      }
    }, 5_000)
    return () => {
      window.removeEventListener('pointerdown', registerActivity)
      window.removeEventListener('keydown', registerActivity)
      window.removeEventListener('scroll', registerActivity)
      window.clearInterval(idleCheck)
    }
  }, [hydrated, paused, registerActivity])

  // ─── Persist in-progress ──────────────────────────────────────────────────
  // Two cadences:
  // (1) On meaningful user state changes (selection / nav / pause) — debounced 1s.
  // (2) Periodic safety tick every 5s — flush whatever's current (covers idle pause / pure stopwatch tick).
  // Note: elapsedSec lives in a ref so we never include it in deps (would reset (1) every second).
  useEffect(() => {
    if (!hydrated || !paperId) return
    if (inProgressSaveTimer.current) window.clearTimeout(inProgressSaveTimer.current)
    inProgressSaveTimer.current = window.setTimeout(() => {
      const ip: MockInProgress = {
        paperId,
        ...(isRandomMode ? { questionIds: questions.map((q) => q.id) } : {}),
        startedAt: startedAtRef.current,
        currentQuestionIndex: currentIdx,
        selections,
        elapsedSecAtPause: elapsedSecRef.current,
        lastResumedAt: paused ? null : lastResumedAtRef.current,
      }
      saveInProgress(ip).catch((err) => console.error('[mock-runner] saveInProgress failed:', err))
    }, 1_000)
    return () => {
      if (inProgressSaveTimer.current) window.clearTimeout(inProgressSaveTimer.current)
    }
  }, [hydrated, isRandomMode, paperId, currentIdx, questions, selections, paused])

  // Safety: periodic 5s save independent of state changes (catches paused / idle drift)
  useEffect(() => {
    if (!hydrated || !paperId) return
    const tick = window.setInterval(() => {
      const ip: MockInProgress = {
        paperId,
        ...(isRandomMode ? { questionIds: questions.map((q) => q.id) } : {}),
        startedAt: startedAtRef.current,
        currentQuestionIndex: currentIdx,
        selections,
        elapsedSecAtPause: elapsedSecRef.current,
        lastResumedAt: paused ? null : lastResumedAtRef.current,
      }
      saveInProgress(ip).catch((err) => console.error('[mock-runner] periodic save failed:', err))
    }, IN_PROGRESS_SAVE_DEBOUNCE_MS)
    return () => window.clearInterval(tick)
  }, [hydrated, isRandomMode, paperId, currentIdx, questions, selections, paused])

  // ─── Auto-dismiss resume toast after 4s ─────────────────────────────────────
  useEffect(() => {
    if (!resumedToast) return
    const t = window.setTimeout(() => setResumedToast(false), 4_000)
    return () => window.clearTimeout(t)
  }, [resumedToast])

  // ─── Submit ─────────────────────────────────────────────────────────────────
  const doSubmit = useCallback(async () => {
    if (!paperId) return
    const { totalScore, perQuestionAnswers } = scoreMock({ questions, selections })
    const attemptId = uuid()
    const now = Date.now()
    const attempt: MockAttempt = {
      id: attemptId,
      paperId,
      startedAt: startedAtRef.current,
      finishedAt: now,
      elapsedSec,
      totalScore,
      perQuestionAnswers,
    }
    try {
      await saveAttempt(attempt)
      await clearInProgress()
    } catch (err) {
      console.error('[mock-runner] submit persist failed:', err)
      // Still apply reward so dogfood loop doesn't get stuck; user will see result page
    }
    // Apply boss-tier burst
    const primarySubject = pickPaperPrimarySubject(questions)
    const reward = applyMockPassReward(player, primarySubject)
    setPlayer(reward.player)
    if (reward.grantGuaranteedSRLoot && onGuaranteedSRRoll) onGuaranteedSRRoll()
    navigate(`/mock/result/${attemptId}`)
  }, [paperId, questions, selections, elapsedSec, player, setPlayer, onGuaranteedSRRoll, navigate])

  const handleSubmitIntent = useCallback(() => {
    if (confirmSubmit) {
      setConfirmSubmit(false)
      void doSubmit()
      return
    }
    if (unansweredCount > 0) setConfirmSubmit(true)
    else void doSubmit()
  }, [confirmSubmit, doSubmit, unansweredCount])

  const handleNextIntent = useCallback(() => {
    setCurrentIdx((idx) => Math.min(idx + 1, Math.max(questions.length - 1, 0)))
  }, [questions.length])

  const handlePreviousIntent = useCallback(() => {
    setCurrentIdx((idx) => Math.max(idx - 1, 0))
  }, [])

  const handleOptionIntent = useCallback((optionIndex: number) => {
    if (confirmSubmit || !current) return

    const optionKey = currentOptionKeys[optionIndex]
    if (!optionKey) return

    setSelections((prev) => ({ ...prev, [current.id]: optionKey }))
  }, [confirmSubmit, current, currentOptionKeys])

  useGamepadControls(gamepadEnabled && hydrated && !!paperId && questions.length > 0, {
    onActivity: registerActivity,
    onOption: (optionIndex) => {
      if (confirmSubmit) {
        if (optionIndex === 0) {
          setConfirmSubmit(false)
          void doSubmit()
        } else if (optionIndex === 1) {
          setConfirmSubmit(false)
        }
        return
      }
      handleOptionIntent(optionIndex)
    },
    onPrevious: () => {
      if (!confirmSubmit) handlePreviousIntent()
    },
    onNext: () => {
      if (!confirmSubmit) handleNextIntent()
    },
    onSubmit: handleSubmitIntent,
    onCancel: () => {
      if (confirmSubmit) setConfirmSubmit(false)
    },
  })

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────────
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

      const optionIndex = ['1', '2', '3', '4'].indexOf(event.key)
      if (optionIndex === -1) return

      event.preventDefault()
      handleOptionIntent(optionIndex)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmSubmit, handleNextIntent, handleSubmitIntent, handleOptionIntent, hydrated, paperId, questions.length])

  if (!hydrated) {
    return <div className="mock-runner-page"><p className="mock-loading">載入中...</p></div>
  }
  if (!paperId) {
    return (
      <div className="mock-runner-page">
        <p className="mock-empty">缺少 paperId</p>
        <Link to="/mock" className="mock-back">← 回挑卷</Link>
      </div>
    )
  }
  if (questions.length === 0) {
    return (
      <div className="mock-runner-page">
        <p className="mock-empty">查無此題組 ({paperId})</p>
        <Link to="/mock" className="mock-back">← 回挑卷</Link>
      </div>
    )
  }

  return (
    <div className="mock-runner-page">
      <header className="mock-runner-header">
        <Link to="/mock" className="mock-back">← 放棄回挑卷</Link>
        <h2>{paperLabel(paperId)}</h2>
        <label className="mock-gamepad-toggle">
          <input
            type="checkbox"
            checked={gamepadEnabled}
            onChange={(event) => setGamepadEnabled(event.target.checked)}
          />
          <span>控制器</span>
        </label>
        <div className="mock-stopwatch" aria-label="elapsed time">
          ⏱ {fmtElapsed(elapsedSec)}{paused ? ' (已暫停)' : ''}
        </div>
      </header>

      {resumedToast && (
        <div className="mock-toast">已從上次中斷處恢復</div>
      )}

      {paused && pauseReason === 'idle' && (
        <div className="mock-pause-banner">已暫停（無互動）— 動一下繼續</div>
      )}

      <div className="mock-progress">
        第 {currentIdx + 1} / {questions.length} 題 · 已作答 {answeredCount}
      </div>

      <nav className="mock-nav">
        <button
          className="mock-nav-btn"
          disabled={currentIdx === 0}
          onClick={() => setCurrentIdx(currentIdx - 1)}
        >上一題</button>
        <span className="mock-nav-jump">
          <input
            type="number"
            min={1}
            max={questions.length}
            value={currentIdx + 1}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n) && n >= 1 && n <= questions.length) setCurrentIdx(n - 1)
            }}
          />
        </span>
        <button
          className="mock-nav-btn"
          disabled={currentIdx === questions.length - 1}
          onClick={() => setCurrentIdx(currentIdx + 1)}
        >下一題</button>
        <button className="mock-submit-btn" onClick={handleSubmitIntent} aria-keyshortcuts="Enter">交卷</button>
      </nav>

      <article className="mock-question-card">
        <div className="mock-question-subject">[{current.subject}]</div>
        <div className="mock-question-stem">{current.stem}</div>
        <div className="mock-question-options">
          {Object.entries(current.options).map(([key, text], optionIndex) => {
            const selected = selections[current.id] === key
            return (
              <button
                key={key}
                className={`mock-option ${selected ? 'mock-option-selected' : ''}`}
                onClick={() => setSelections({ ...selections, [current.id]: key })}
                aria-keyshortcuts={String(optionIndex + 1)}
              >
                <span className="mock-option-key">({key})</span>
                <span className="mock-option-text">{text}</span>
              </button>
            )
          })}
        </div>
      </article>

      {confirmSubmit && (
        <div className="mock-confirm-overlay" onClick={() => setConfirmSubmit(false)}>
          <div className="mock-confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p>還有 <strong>{unansweredCount}</strong> 題沒作答，確定要交卷？</p>
            <div className="mock-confirm-actions">
              <button onClick={() => setConfirmSubmit(false)}>繼續作答</button>
              <button onClick={() => { setConfirmSubmit(false); void doSubmit() }} className="mock-submit-btn">確定交卷</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
