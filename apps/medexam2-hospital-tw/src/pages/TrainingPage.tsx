/**
 * Training page — players spend revenue to attempt rarity upgrades on owned
 * doctors. Each doctor has its own pity counter (5 consecutive failures →
 * guaranteed next-attempt success). P1 doctors are terminal.
 *
 * Per design D4: failure does NOT downgrade rarity (only pity counter ticks).
 * Cost / success-rate / pity-threshold all live in content pack `training.ts`.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Question } from '@study-rpg/core'
import {
  RARITY_LABELS,
  RARITY_ORDER,
  TRAINING_BASE_SUCCESS_RATES,
  TRAINING_BATTLE_QUESTION_COUNT,
  TRAINING_BATTLE_SUCCESS_RATE_BONUS_PER_CORRECT,
  TRAINING_COSTS,
  TRAINING_NEXT_RARITY,
  TRAINING_PITY_THRESHOLD,
  type Rarity,
  type TrainableRarity,
} from '@study-rpg/content-medexam2-tw'
import { getHospitalDB, type DoctorRow } from '../db/schema'
import { trainDoctor } from '../services/training'
import { retireDoctor, type RetireResult } from '../services/retire'
import type { TrainingAttemptResult } from '@study-rpg/content-medexam2-tw'
import { SurfaceHint } from '../components/SurfaceHint'
import { pickRandomQuestion } from '../lib/quiz'
import {
  effectivePoolSize,
  effectiveYearSet,
  getYearFilter,
} from '../services/year-filter'
import { ExplanationMarkdown } from '../components/ExplanationMarkdown'

type Confirming = { doctor: DoctorRow }
type RetireConfirming = { doctor: DoctorRow }
type Outcome = {
  doctorId: string
  result: TrainingAttemptResult
  battle?: TrainingBattleSummary
}
type RetireOutcome = { result: RetireResult; doctorName: string; doctorRarity: string }
type TrainingBattleSummary = {
  correct: number
  total: number
  baseRate: number
  effectiveRate: number
  multiplier: number
}
type TrainingBattle = {
  doctor: DoctorRow
  question: Question | null
  loading: boolean
  poolEmpty: boolean
  answered: number
  correct: number
  selectedOption: string | null
  revealed: boolean
  seenIds: Set<string>
  finished: boolean
}

const RARITY_FILTER_OPTIONS: Rarity[] = [...RARITY_ORDER].reverse()
const PITY_FILTER_OPTIONS = Array.from(
  { length: TRAINING_PITY_THRESHOLD + 1 },
  (_, idx) => idx,
)
const TRAINING_BATTLE_MAX_MULTIPLIER =
  1 + TRAINING_BATTLE_QUESTION_COUNT * TRAINING_BATTLE_SUCCESS_RATE_BONUS_PER_CORRECT

function isTrainable(r: Rarity): r is TrainableRarity {
  return r !== 'P1'
}

function getTrainingBattleMultiplier(correct: number): number {
  return Math.min(
    TRAINING_BATTLE_MAX_MULTIPLIER,
    1 + correct * TRAINING_BATTLE_SUCCESS_RATE_BONUS_PER_CORRECT,
  )
}

export function TrainingPage() {
  const db = getHospitalDB()
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const doctors = useLiveQuery(() => db.doctors.toArray(), []) ?? []
  const recentHistory = useLiveQuery(
    () => db.trainingHistory.orderBy('attemptedAt').reverse().limit(10).toArray(),
    [],
  ) ?? []

  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [retireConfirming, setRetireConfirming] = useState<RetireConfirming | null>(null)
  const [retireOutcome, setRetireOutcome] = useState<RetireOutcome | null>(null)
  const [trainingBattle, setTrainingBattle] = useState<TrainingBattle | null>(null)
  const [rarityFilters, setRarityFilters] = useState<Rarity[]>([])
  const [pityFilters, setPityFilters] = useState<number[]>([])
  const [busy, setBusy] = useState(false)

  const persistedYearFilter = useLiveQuery(() => getYearFilter(), [], null) ?? null
  const yearFilter = useMemo(() => effectiveYearSet(persistedYearFilter), [persistedYearFilter])
  // Year-filtered pool size for the doctor pending confirmation (drives the
  // 「開始進修戰」 disabled gate). Recomputes when the player toggles year chips
  // on HomePage while the confirm modal is open.
  const confirmingPoolSize = useLiveQuery(async () => {
    if (!confirming) return null
    return await effectivePoolSize(confirming.doctor.subjectId, yearFilter)
  }, [confirming, yearFilter])

  const sortedDoctors = useMemo(
    () =>
      [...doctors]
        .filter((d) => {
          if (rarityFilters.length > 0 && !rarityFilters.includes(d.rarity)) return false
          if (pityFilters.length === 0) return true
          return pityFilters.some((pity) =>
            pity >= TRAINING_PITY_THRESHOLD
              ? d.pityCounter >= TRAINING_PITY_THRESHOLD
              : d.pityCounter === pity,
          )
        })
        .sort((a, b) => a.obtainedAt - b.obtainedAt),
    [doctors, pityFilters, rarityFilters],
  )

  function toggleRarityFilter(rarity: Rarity) {
    setRarityFilters((current) =>
      current.includes(rarity)
        ? current.filter((r) => r !== rarity)
        : [...current, rarity],
    )
  }

  function togglePityFilter(pity: number) {
    setPityFilters((current) =>
      current.includes(pity)
        ? current.filter((p) => p !== pity)
        : [...current, pity],
    )
  }

  async function handleConfirm() {
    if (!confirming) return
    setBusy(true)
    try {
      const seenIds = new Set<string>()
      const question = await pickRandomQuestion(confirming.doctor.subjectId, seenIds, {
        yearFilter,
      })
      setTrainingBattle({
        doctor: confirming.doctor,
        question,
        loading: false,
        poolEmpty: question === null,
        answered: 0,
        correct: 0,
        selectedOption: null,
        revealed: false,
        seenIds,
        finished: false,
      })
    } finally {
      setBusy(false)
      setConfirming(null)
    }
  }

  function dismissOutcome() {
    setOutcome(null)
  }

  async function handleRetireConfirm() {
    if (!retireConfirming) return
    setBusy(true)
    try {
      const result = await retireDoctor(retireConfirming.doctor.id)
      setRetireOutcome({
        result,
        doctorName: retireConfirming.doctor.name,
        doctorRarity: retireConfirming.doctor.rarity,
      })
    } finally {
      setBusy(false)
      setRetireConfirming(null)
    }
  }

  function handleBattlePickOption(optionKey: string): void {
    setTrainingBattle((current) => {
      if (!current?.question || current.revealed || current.finished) return current
      const wasCorrect = current.question.disputed || optionKey === current.question.answer
      const seenIds = new Set(current.seenIds)
      seenIds.add(current.question.id)
      const answered = current.answered + 1
      const correct = current.correct + (wasCorrect ? 1 : 0)
      return {
        ...current,
        answered,
        correct,
        selectedOption: optionKey,
        revealed: true,
        seenIds,
        finished: answered >= TRAINING_BATTLE_QUESTION_COUNT,
      }
    })
  }

  async function handleBattleNext(): Promise<void> {
    if (!trainingBattle || !trainingBattle.revealed || trainingBattle.finished) return
    setTrainingBattle((current) => current ? { ...current, loading: true } : current)
    const question = await pickRandomQuestion(
      trainingBattle.doctor.subjectId,
      trainingBattle.seenIds,
      { yearFilter },
    )
    setTrainingBattle((current) => {
      if (!current) return current
      return {
        ...current,
        question,
        loading: false,
        poolEmpty: question === null,
        selectedOption: null,
        revealed: false,
        finished: question === null,
      }
    })
  }

  async function handleBattleAttempt(): Promise<void> {
    if (!trainingBattle || !trainingBattle.finished || !isTrainable(trainingBattle.doctor.rarity)) return
    const baseRate = TRAINING_BASE_SUCCESS_RATES[trainingBattle.doctor.rarity]
    const multiplier = getTrainingBattleMultiplier(trainingBattle.correct)
    const effectiveRate = Math.min(1, baseRate * multiplier)
    setBusy(true)
    try {
      const result = await trainDoctor(trainingBattle.doctor.id, {
        successRateMultiplier: multiplier,
      })
      setOutcome({
        doctorId: trainingBattle.doctor.id,
        result,
        battle: {
          correct: trainingBattle.correct,
          total: TRAINING_BATTLE_QUESTION_COUNT,
          baseRate,
          effectiveRate,
          multiplier,
        },
      })
      setTrainingBattle(null)
    } finally {
      setBusy(false)
    }
  }

  const fmt = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
  const fmtPct = (n: number) => `${(n * 100).toFixed(1).replace(/\.0$/, '')}%`

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>醫師進修</h1>
        <div className="app-header__meta">
          <span className="ticket-counter">💰 {fmt(counters?.revenue ?? 0)}</span>
          <Link to="/" className="nav-link">
            ← 回首頁
          </Link>
        </div>
      </header>

      <SurfaceHint surfaceId="training" />

      <section className="training-info">
        <p className="training-info__text">
          進修前會進入同科 10 題挑戰；每答對 1 題，本次成功率增加基礎值的 5%。
          挑戰後消耗營收進行升級判定，失敗只損營收，醫師 rarity 不變。
          同一位醫師連續失敗 {TRAINING_PITY_THRESHOLD} 次後，下次必中。
        </p>
      </section>

      {doctors.length > 0 && (
        <section className="filter-bar" aria-label="進修篩選">
          <div className="filter-bar__group">
            <span className="filter-bar__label">稀有度</span>
            <span className="filter-chip-group" role="group" aria-label="進修稀有度篩選">
              <button
                type="button"
                className="filter-chip"
                aria-pressed={rarityFilters.length === 0}
                onClick={() => setRarityFilters([])}
              >
                全部
              </button>
              {RARITY_FILTER_OPTIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className="filter-chip"
                  aria-pressed={rarityFilters.includes(r)}
                  onClick={() => toggleRarityFilter(r)}
                >
                  {r} {RARITY_LABELS[r]}
                </button>
              ))}
            </span>
          </div>
          <div className="filter-bar__group">
            <span className="filter-bar__label">保底</span>
            <span className="filter-chip-group" role="group" aria-label="保底進度篩選">
              <button
                type="button"
                className="filter-chip"
                aria-pressed={pityFilters.length === 0}
                onClick={() => setPityFilters([])}
              >
                全部
              </button>
              {PITY_FILTER_OPTIONS.map((pity) => (
                <button
                  key={pity}
                  type="button"
                  className="filter-chip"
                  aria-pressed={pityFilters.includes(pity)}
                  onClick={() => togglePityFilter(pity)}
                >
                  {pity >= TRAINING_PITY_THRESHOLD ? `${pity}+ 必中` : `${pity}`}
                </button>
              ))}
            </span>
          </div>
          <span className="filter-bar__count">
            {sortedDoctors.length} / {doctors.length}
          </span>
        </section>
      )}

      <section className="training-doctor-list" aria-label="醫師清單">
        {doctors.length === 0 ? (
          <p className="study-session__empty">尚未招募任何醫師。</p>
        ) : sortedDoctors.length === 0 ? (
          <p className="study-session__empty">沒有符合目前篩選條件的醫師。</p>
        ) : (
          <ul className="training-doctor-list__items">
            {sortedDoctors.map((d) => {
              const trainable = isTrainable(d.rarity)
              const cost = trainable ? TRAINING_COSTS[d.rarity as TrainableRarity] : 0
              const rate = trainable
                ? TRAINING_BASE_SUCCESS_RATES[d.rarity as TrainableRarity]
                : 0
              const target = trainable
                ? TRAINING_NEXT_RARITY[d.rarity as TrainableRarity]
                : null
              const pityAtMax = d.pityCounter >= TRAINING_PITY_THRESHOLD
              const canAfford = (counters?.revenue ?? 0) >= cost
              return (
                <li key={d.id} className={`training-doctor-card training-doctor-card--${d.rarity}`}>
                  <div className="training-doctor-card__left">
                    <span className={`rarity-badge rarity-badge--${d.rarity}`}>{d.rarity}</span>
                    <span className="doctor-name">{d.name}</span>
                  </div>
                  <div className="training-doctor-card__mid">
                    {trainable ? (
                      <>
                        <span>
                          → <strong>{target}</strong>
                        </span>
                        <span className="training-rate">
                          基礎機率 {(rate * 100).toFixed(0)}%
                        </span>
                        <span className="training-pity">
                          {pityAtMax
                            ? '🎯 下次必中'
                            : `保底進度 ${d.pityCounter} / ${TRAINING_PITY_THRESHOLD}`}
                        </span>
                      </>
                    ) : (
                      <span className="training-terminal">已達 P1（頂級）</span>
                    )}
                  </div>
                  <div className="training-doctor-card__right">
                    {trainable && (
                      <button
                        className="primary-btn"
                        onClick={() => setConfirming({ doctor: d })}
                        disabled={!canAfford || busy}
                        title={canAfford ? '' : `需要 ${fmt(cost)} 營收`}
                      >
                        進修（{fmt(cost)} 💰）
                      </button>
                    )}
                    <button
                      className="ghost-btn training-retire-btn"
                      onClick={() => setRetireConfirming({ doctor: d })}
                      disabled={busy}
                      title={`自願離院（退休）— 退還 ${fmt(d.powerMultiplier * 1000)} 💰`}
                    >
                      AAD
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {recentHistory.length > 0 && (
        <section className="training-history" aria-label="近期進修紀錄">
          <h2 className="section-heading">近期 10 次進修</h2>
          <ul className="training-history__items">
            {recentHistory.map((row, idx) => {
              const doctor = doctors.find((d) => d.id === row.doctorId)
              return (
                <li
                  key={row.id ?? idx}
                  className={`training-history__item training-history__item--${row.success ? 'success' : 'failure'}`}
                >
                  <span className="training-history__doctor">{doctor?.name ?? row.doctorId}</span>
                  <span className="training-history__transition">
                    {row.fromRarity} → {row.toRarity}
                  </span>
                  <span className="training-history__result">
                    {row.success ? (row.pityTriggered ? '🎯 保底成功' : '✓ 成功') : '✗ 失敗'}
                  </span>
                  <span className="training-history__cost">-{fmt(row.cost)} 💰</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {confirming && (
        <div className="modal-backdrop" onClick={() => !busy && setConfirming(null)}>
          <div className="modal frame training-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">進修確認</h2>
            <p>
              <strong>{confirming.doctor.name}</strong>
              {' '}（{confirming.doctor.rarity}）
            </p>
            {isTrainable(confirming.doctor.rarity) && (
              <>
                <p>
                  目標：<strong>{TRAINING_NEXT_RARITY[confirming.doctor.rarity]}</strong>
                </p>
                <p>
                  成本：<strong>{fmt(TRAINING_COSTS[confirming.doctor.rarity])} 💰</strong>
                </p>
                <p>
                  基礎成功率：
                  <strong>
                    {(TRAINING_BASE_SUCCESS_RATES[confirming.doctor.rarity] * 100).toFixed(0)}%
                  </strong>
                </p>
                <p>
                  進修戰：<strong>{TRAINING_BATTLE_QUESTION_COUNT} 題 {confirming.doctor.subjectId}</strong>
                  {' '}（每答對 1 題，成功率 + 基礎值 5%）
                </p>
                <p>
                  保底進度：
                  <strong>
                    {confirming.doctor.pityCounter} / {TRAINING_PITY_THRESHOLD}
                  </strong>
                  {confirming.doctor.pityCounter >= TRAINING_PITY_THRESHOLD &&
                    '（本次必中）'}
                </p>
              </>
            )}
            {confirmingPoolSize === 0 && (
              <p className="banner-quiz-disabled-note">
                目前年份篩選下，{confirming.doctor.subjectId} 0 題可用，請至首頁放寬篩選。
              </p>
            )}
            <div className="modal__actions">
              <button className="ghost-btn" onClick={() => setConfirming(null)} disabled={busy}>
                取消
              </button>
              <button
                className="primary-btn"
                onClick={handleConfirm}
                disabled={busy || confirmingPoolSize === 0}
              >
                {busy ? '準備中…' : '開始進修戰'}
              </button>
            </div>
          </div>
        </div>
      )}

      {trainingBattle && (
        <div className="modal-backdrop" onClick={() => !busy && setTrainingBattle(null)}>
          <div
            className="modal frame training-battle-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="training-battle-modal__head">
              <div>
                <h2 className="modal__title">進修戰</h2>
                <p className="training-battle-modal__subtitle">
                  {trainingBattle.doctor.name} · {trainingBattle.doctor.subjectId}
                </p>
              </div>
              <span className="training-battle-modal__score">
                {trainingBattle.correct} / {trainingBattle.answered}
              </span>
            </header>

            {isTrainable(trainingBattle.doctor.rarity) && (
              <div className="training-battle-modal__rate">
                <span>基礎 {fmtPct(TRAINING_BASE_SUCCESS_RATES[trainingBattle.doctor.rarity])}</span>
                <span>
                  目前 {fmtPct(TRAINING_BASE_SUCCESS_RATES[trainingBattle.doctor.rarity] * getTrainingBattleMultiplier(trainingBattle.correct))}
                </span>
              </div>
            )}

            <div className="training-battle-modal__progress">
              第 {Math.min(trainingBattle.answered + (trainingBattle.finished ? 0 : 1), TRAINING_BATTLE_QUESTION_COUNT)} / {TRAINING_BATTLE_QUESTION_COUNT} 題
            </div>

            {trainingBattle.loading && (
              <p className="quiz-modal__loading">載入題目中…</p>
            )}

            {!trainingBattle.loading && trainingBattle.poolEmpty && (
              <p className="quiz-modal__empty">這個科別目前沒有題目可抽，無法開始進修戰。</p>
            )}

            {!trainingBattle.loading && trainingBattle.question && !trainingBattle.finished && (
              <>
                <div className="quiz-modal__question-meta">
                  <span className="quiz-modal__question-meta-id">{trainingBattle.question.id}</span>
                </div>
                <p className="quiz-modal__stem">{trainingBattle.question.stem}</p>
                {trainingBattle.question.imagePath && (
                  <div className="quiz-modal__image">
                    <img
                      src={`${import.meta.env.BASE_URL}${trainingBattle.question.imagePath}`}
                      alt="題目附圖"
                    />
                  </div>
                )}
                {trainingBattle.question.hasImage && !trainingBattle.question.imagePath && (
                  <div className="quiz-modal__image-missing">
                    📷 此題含附圖但尚未補齊（{trainingBattle.question.id}）
                  </div>
                )}
                {trainingBattle.question.disputed && trainingBattle.revealed && (
                  <p className="quiz-modal__disputed">
                    ⚖️ 送分題（考選部判定全部給分，任何選項都算對）
                  </p>
                )}
                <ul className="quiz-modal__options">
                  {Object.keys(trainingBattle.question.options).sort().map((key) => {
                    const isSelected = key === trainingBattle.selectedOption
                    const isCorrect =
                      trainingBattle.revealed &&
                      (trainingBattle.question?.disputed || key === trainingBattle.question?.answer)
                    const isWrongPick =
                      trainingBattle.revealed &&
                      isSelected &&
                      !trainingBattle.question?.disputed &&
                      key !== trainingBattle.question?.answer
                    const className = [
                      'quiz-modal__option',
                      isCorrect ? 'quiz-modal__option--correct' : '',
                      isWrongPick ? 'quiz-modal__option--wrong' : '',
                      trainingBattle.revealed && !isCorrect && !isSelected ? 'quiz-modal__option--dim' : '',
                    ].filter(Boolean).join(' ')
                    return (
                      <li key={key}>
                        <button
                          type="button"
                          className={className}
                          onClick={() => handleBattlePickOption(key)}
                          disabled={trainingBattle.revealed}
                        >
                          <span className="quiz-modal__option-key">{key}.</span>
                          <span className="quiz-modal__option-text">
                            {trainingBattle.question?.options[key]}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>

                {trainingBattle.revealed && (
                  <div className="quiz-modal__explanation">
                    <h3>解析</h3>
                    <ExplanationMarkdown text={trainingBattle.question.explanation ?? ''} />
                  </div>
                )}
              </>
            )}

            {trainingBattle.finished && (
              <section className="training-battle-modal__summary">
                <h3>進修戰完成</h3>
                <p>
                  答對 <strong>{trainingBattle.correct}</strong> / {TRAINING_BATTLE_QUESTION_COUNT} 題
                </p>
                {isTrainable(trainingBattle.doctor.rarity) && (
                  <p>
                    成功率：
                    <strong>{fmtPct(TRAINING_BASE_SUCCESS_RATES[trainingBattle.doctor.rarity])}</strong>
                    {' → '}
                    <strong className="rarity-up">
                      {fmtPct(
                        TRAINING_BASE_SUCCESS_RATES[trainingBattle.doctor.rarity] *
                          getTrainingBattleMultiplier(trainingBattle.correct),
                      )}
                    </strong>
                  </p>
                )}
              </section>
            )}

            <div className="modal__actions">
              <button
                className="ghost-btn"
                onClick={() => setTrainingBattle(null)}
                disabled={busy}
              >
                取消
              </button>
              {!trainingBattle.finished ? (
                <button
                  className="primary-btn"
                  onClick={() => void handleBattleNext()}
                  disabled={!trainingBattle.revealed || trainingBattle.loading}
                >
                  下一題
                </button>
              ) : (
                <button
                  className="primary-btn"
                  onClick={() => void handleBattleAttempt()}
                  disabled={busy || trainingBattle.poolEmpty}
                >
                  {busy ? '判定中…' : '進行升級判定'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {retireConfirming && (
        <div className="modal-backdrop" onClick={() => !busy && setRetireConfirming(null)}>
          <div className="modal frame training-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal__title">退休醫師</h2>
            <p>
              <strong>{retireConfirming.doctor.name}</strong>
              {' '}（{retireConfirming.doctor.rarity}）
            </p>
            <p>
              將返還 <strong>{fmt(retireConfirming.doctor.powerMultiplier * 1000)} 💰</strong>。
            </p>
            <p className="muted">
              此操作無法復原。該醫師會從名冊永久移除；若已指派診間，該診間會空出。
            </p>
            <p className="muted">
              升級門檻多樣性 24 小時內仍會計入此醫師（grace period）。
            </p>
            <div className="modal__actions">
              <button className="ghost-btn" onClick={() => setRetireConfirming(null)} disabled={busy}>
                取消
              </button>
              <button
                className="primary-btn"
                onClick={() => void handleRetireConfirm()}
                disabled={busy}
              >
                {busy ? '處理中…' : '確認退休'}
              </button>
            </div>
          </div>
        </div>
      )}

      {retireOutcome && (
        <div className="modal-backdrop" onClick={() => setRetireOutcome(null)}>
          <div
            className="modal frame training-outcome-modal training-outcome-modal--success"
            onClick={(e) => e.stopPropagation()}
          >
            {retireOutcome.result.kind === 'success' && (
              <>
                <h2 className="modal__title">👋 醫師已退休</h2>
                <p>
                  <strong>{retireOutcome.doctorName}</strong>（{retireOutcome.doctorRarity}）
                </p>
                <p>返還 <strong>{fmt(retireOutcome.result.refund)} 💰</strong></p>
                {retireOutcome.result.roomFreed && (
                  <p className="muted">已釋放診間 {retireOutcome.result.roomFreed}</p>
                )}
              </>
            )}
            {retireOutcome.result.kind === 'not-found' && (
              <>
                <h2 className="modal__title">醫師已不存在</h2>
                <p className="muted">該醫師可能已被另一個 tab 退休或資料已刪除。</p>
              </>
            )}
            <div className="modal__actions">
              <button className="primary-btn" onClick={() => setRetireOutcome(null)}>
                好
              </button>
            </div>
          </div>
        </div>
      )}

      {outcome && (
        <div className="modal-backdrop" onClick={dismissOutcome}>
          <div
            className={`modal frame training-outcome-modal training-outcome-modal--${outcome.result.kind}`}
            onClick={(e) => e.stopPropagation()}
          >
            {outcome.result.kind === 'success' && (
              <>
                <h2 className="modal__title">🎉 進修成功！</h2>
                <p>
                  <strong>{outcome.result.fromRarity}</strong>
                  {' → '}
                  <strong className="rarity-up">{outcome.result.toRarity}</strong>
                </p>
                {outcome.result.pityTriggered && <p>🎯 保底觸發</p>}
                {outcome.battle && (
                  <p>
                    進修戰 {outcome.battle.correct} / {outcome.battle.total}：
                    成功率 {fmtPct(outcome.battle.baseRate)} →{' '}
                    <strong>{fmtPct(outcome.battle.effectiveRate)}</strong>
                  </p>
                )}
                <p className="muted">-{fmt(outcome.result.revenueSpent)} 💰</p>
              </>
            )}
            {outcome.result.kind === 'failure' && (
              <>
                <h2 className="modal__title">😞 進修失敗</h2>
                <p>
                  Rarity 維持 <strong>{outcome.result.fromRarity}</strong>
                </p>
                <p>
                  保底進度推進至 {outcome.result.newPityCounter} / {TRAINING_PITY_THRESHOLD}
                </p>
                {outcome.battle && (
                  <p>
                    進修戰 {outcome.battle.correct} / {outcome.battle.total}：
                    成功率 {fmtPct(outcome.battle.baseRate)} →{' '}
                    <strong>{fmtPct(outcome.battle.effectiveRate)}</strong>
                  </p>
                )}
                <p className="muted">-{fmt(outcome.result.revenueSpent)} 💰</p>
              </>
            )}
            {outcome.result.kind === 'aborted' && (
              <>
                <h2 className="modal__title">無法進修</h2>
                {outcome.result.reason === 'terminal-rarity' && <p>該醫師已是 P1（頂級）。</p>}
                {outcome.result.reason === 'insufficient-revenue' && (
                  <p>營收不足。需要 {fmt(outcome.result.requiredRevenue)} 💰。</p>
                )}
              </>
            )}
            <div className="modal__actions">
              <button className="primary-btn" onClick={dismissOutcome}>
                好
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
