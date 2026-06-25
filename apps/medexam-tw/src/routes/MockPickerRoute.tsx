import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ContentPack, MockAttempt, Question } from '@study-rpg/core'
import { paperIdOf } from '@study-rpg/core'
import { listLatestAttemptByPaperMap } from '../db/mock-attempts'
import { useGamepadBindings, useGamepadPreference } from '../lib/gamepad'
import { GamepadSettings } from '../components/GamepadSettings'

interface PaperCell {
  paperId: string
  year: number
  session: number
  paper: 'medexam-1' | 'medexam-2'
  questionCount: number
  latestAttempt: MockAttempt | null
}

interface Props {
  content: ContentPack
}

function paperLabel(p: 'medexam-1' | 'medexam-2'): string {
  return p === 'medexam-1' ? '醫一' : '醫二'
}

function buildCells(questions: Question[], latestMap: Map<string, MockAttempt>): PaperCell[] {
  const groups = new Map<string, { year: number; session: number; paper: 'medexam-1' | 'medexam-2'; count: number }>()
  for (const q of questions) {
    const meta = q.meta as Record<string, unknown> | undefined
    if (!meta) continue
    const year = meta.year as number | undefined
    const session = meta.session as number | undefined
    const paper = meta.paper as 'medexam-1' | 'medexam-2' | undefined
    if (typeof year !== 'number' || typeof session !== 'number' || !paper) continue
    const key = paperIdOf(year, session, paper)
    const existing = groups.get(key)
    if (existing) existing.count++
    else groups.set(key, { year, session, paper, count: 1 })
  }
  const cells: PaperCell[] = [...groups.entries()].map(([paperId, g]) => ({
    paperId,
    year: g.year,
    session: g.session,
    paper: g.paper,
    questionCount: g.count,
    latestAttempt: latestMap.get(paperId) ?? null,
  }))
  // Sort: year desc, session asc, paper (medexam-1 before medexam-2)
  cells.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year
    if (a.session !== b.session) return a.session - b.session
    return a.paper.localeCompare(b.paper)
  })
  return cells
}

function fmtAttempt(a: MockAttempt): string {
  const d = new Date(a.finishedAt)
  const dateStr = `${d.getMonth() + 1}/${d.getDate()}`
  return `上次 ${a.totalScore}/${a.perQuestionAnswers.length} (${dateStr})`
}

export function MockPickerRoute({ content }: Props) {
  const navigate = useNavigate()
  const [latestMap, setLatestMap] = useState<Map<string, MockAttempt>>(new Map())
  const [gamepadEnabled, setGamepadEnabled] = useGamepadPreference()
  const [gamepadBindings, setGamepadBinding, resetGamepadBindings] = useGamepadBindings()

  useEffect(() => {
    listLatestAttemptByPaperMap()
      .then(setLatestMap)
      .catch((err) => console.error('[mock-picker] failed to load attempts:', err))
  }, [])

  const cells = useMemo(() => buildCells(content.questions, latestMap), [content.questions, latestMap])

  return (
    <div className="mock-picker-page">
      <header className="mock-picker-header">
        <Link to="/" className="mock-back">← 回家</Link>
        <h2>模擬考</h2>
        <span className="mock-picker-hint">挑一份歷年原卷重做 · 一階國考每份 ≈100 題 · 共 {cells.length} 份</span>
        <label className="mock-gamepad-toggle">
          <input
            type="checkbox"
            checked={gamepadEnabled}
            onChange={(event) => setGamepadEnabled(event.target.checked)}
          />
          <span>控制器</span>
        </label>
      </header>
      {gamepadEnabled && (
        <GamepadSettings
          bindings={gamepadBindings}
          onBind={setGamepadBinding}
          onReset={resetGamepadBindings}
        />
      )}
      <div className="mock-picker-grid">
        <button
          className="mock-paper-cell mock-paper-cell-random"
          onClick={() => navigate('/mock/random')}
        >
          <div className="mock-paper-year">隨機</div>
          <div className="mock-paper-meta">
            <span className="mock-paper-session">全題庫</span>
            <span className="mock-paper-kind kind-random">20 題</span>
          </div>
          <div className="mock-paper-count">{content.questions.length} 題可抽</div>
          <div className="mock-paper-attempt mock-paper-attempt-empty">即抽即答</div>
        </button>
        {cells.map((c) => (
          <button
            key={c.paperId}
            className="mock-paper-cell"
            onClick={() => navigate(`/mock/run/${c.paperId}`)}
          >
            <div className="mock-paper-year">{c.year}</div>
            <div className="mock-paper-meta">
              <span className="mock-paper-session">第 {c.session} 次</span>
              <span className={`mock-paper-kind kind-${c.paper}`}>{paperLabel(c.paper)}</span>
            </div>
            <div className="mock-paper-count">{c.questionCount} 題</div>
            {c.latestAttempt ? (
              <div className="mock-paper-attempt">{fmtAttempt(c.latestAttempt)}</div>
            ) : (
              <div className="mock-paper-attempt mock-paper-attempt-empty">尚未挑戰</div>
            )}
          </button>
        ))}
      </div>
      {cells.length === 0 && <p className="mock-empty">尚無歷年原卷可挑選</p>}
    </div>
  )
}
