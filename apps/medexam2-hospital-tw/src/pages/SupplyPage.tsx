import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import type { Subject, SubjectId } from '@study-rpg/core'
import {
  HOSPITAL_CREDIT_CAP,
  HOSPITAL_CREDIT_LABEL,
  HOSPITAL_CREDIT_PARTS_BUNDLE_AMOUNT,
  HOSPITAL_CREDIT_PRICES,
  RECRUITMENT_THRESHOLDS,
  TIER_ORDER,
  type HospitalTier,
} from '@study-rpg/content-medexam2-tw'
import { getContentPack } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB, type DoctorRow } from '../db/schema'
import { EquipmentResultModal } from '../components/EquipmentResultModal'
import { EmojiIcon } from '../components/EmojiIcon'
import { RecruitmentResultModal } from '../components/RecruitmentResultModal'
import { TargetedTicketSection } from '../components/TargetedTicketSection'
import { formatMasteryPercent } from '../lib/mastery'
import { useCompletionMap } from '../lib/completion'
import { getNextDailyRefreshLabel } from '../lib/daily-ticket'
import { attemptFocusedP3Roll, attemptRoll } from '../services/recruitment'
import {
  rollEquipment,
  rollFocusedP3Equipment,
  type EquipmentRollOutcome,
} from '../services/equipment'
import {
  purchaseEquipmentPartsBundle,
  readHospitalCredits,
} from '../services/hospital-credits'
import lobbySprite from '../assets/recruitment/lobby.png'
import medicalCaseBodySprite from '../assets/equipment/medical-case-body.png'
import medicalCaseLidSprite from '../assets/equipment/medical-case-lid.png'

type Toast = { id: number; text: string; kind: 'success' | 'error' }

function isTierAtLeast(tier: HospitalTier | undefined, minTier: HospitalTier): boolean {
  if (!tier) return false
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(minTier)
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('zh-TW')
}

function makeToast(text: string, kind: Toast['kind']): Toast {
  return { id: Date.now() + Math.random(), text, kind }
}

interface DepartmentRecruitWindowProps {
  subject: Subject
  affinity: number
  threshold: number
  creditsAvailable: number
  masteryLabel: string
  completion?: { answered: number; total: number }
  busy: boolean
  onRoll: () => void
}

function DepartmentRecruitWindow({
  subject,
  affinity,
  threshold,
  creditsAvailable,
  masteryLabel,
  completion,
  busy,
  onRoll,
}: DepartmentRecruitWindowProps) {
  const unlocked = affinity >= threshold
  const missing = Math.max(0, Math.ceil(threshold - affinity))
  const progressPct = threshold > 0 ? Math.min(100, Math.round((affinity / threshold) * 100)) : 100
  const canRoll = unlocked && creditsAvailable >= HOSPITAL_CREDIT_PRICES.doctorPull && !busy
  let disabledReason = ''
  if (!unlocked) disabledReason = `再答對 ${missing} 題`
  else if (creditsAvailable < HOSPITAL_CREDIT_PRICES.doctorPull) disabledReason = `${HOSPITAL_CREDIT_LABEL}不足`

  return (
    <article
      className={`department-window ${unlocked ? 'department-window--open' : 'department-window--locked'}`}
      style={{ ['--department-color' as string]: subject.color }}
    >
      <div className="department-window__shutter" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <header className="department-window__head">
        <div>
          <h3>{subject.displayName}</h3>
          <p>{subject.group}</p>
        </div>
        <span className="supply-price-stamp">
          {HOSPITAL_CREDIT_PRICES.doctorPull} 點
        </span>
      </header>
      <div className="department-window__progress" aria-label={`${subject.displayName}招募親和值`}>
        <span style={{ width: `${progressPct}%` }} />
      </div>
      <div className="department-window__meta">
        <span>{Math.round(affinity * 10) / 10} / {threshold}</span>
        <span>{masteryLabel}</span>
        {completion && <span>{completion.answered} / {completion.total}</span>}
      </div>
      <button
        type="button"
        className="department-window__button"
        disabled={!canRoll}
        onClick={onRoll}
        title={disabledReason || `消耗 ${HOSPITAL_CREDIT_PRICES.doctorPull} ${HOSPITAL_CREDIT_LABEL}`}
      >
        {busy ? '面談中…' : unlocked ? '招募' : disabledReason}
      </button>
    </article>
  )
}

interface SupplyStationProps {
  tone: 'doctor' | 'equipment' | 'parts'
  title: string
  detail: string
  price: string
  disabled: boolean
  disabledReason: string
  busy?: boolean
  onClick: () => void
}

function SupplyStation({
  tone,
  title,
  detail,
  price,
  disabled,
  disabledReason,
  busy = false,
  onClick,
}: SupplyStationProps) {
  return (
    <article className={`supply-station supply-station--${tone}`}>
      <div className="supply-station__art" aria-hidden>
        {tone === 'doctor' ? (
          <img src={lobbySprite} alt="" draggable={false} />
        ) : (
          <span className="supply-station__case">
            <img className="supply-station__case-body" src={medicalCaseBodySprite} alt="" draggable={false} />
            <img className="supply-station__case-lid" src={medicalCaseLidSprite} alt="" draggable={false} />
          </span>
        )}
      </div>
      <div className="supply-station__body">
        <span className="supply-price-stamp">{price}</span>
        <h3>{title}</h3>
        <p>{detail}</p>
        {disabled && <small>{disabledReason}</small>}
      </div>
      <button type="button" disabled={disabled || busy} onClick={onClick}>
        {busy ? '處理中…' : '執行'}
      </button>
    </article>
  )
}

export function SupplyPage() {
  const db = getHospitalDB()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [doctorModal, setDoctorModal] = useState<{ doctor: DoctorRow; wasPity: boolean } | null>(null)
  const [equipmentModal, setEquipmentModal] = useState<Extract<EquipmentRollOutcome, { ok: true }> | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const rollInFlight = useRef(false)
  const completionMap = useCompletionMap()

  useEffect(() => {
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    getContentPack(`${base}/content/medexam2-tw`).then((pack) => setSubjects(pack.subjects))
  }, [])

  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const materials = useLiveQuery(() => db.equipmentMaterials.get('global'), [])
  const affinityRows = useLiveQuery(() => db.affinity.toArray(), []) ?? []
  const masteryRows = useLiveQuery(() => db.mastery.toArray(), []) ?? []
  const assignedTargetedTicketCount = useLiveQuery(
    () => db.targetedTickets.where('status').equals('assigned').count(),
    [],
  ) ?? 0
  const creditsAvailable = readHospitalCredits(counters)
  const refreshLabel = getNextDailyRefreshLabel(new Date(), creditsAvailable, HOSPITAL_CREDIT_CAP)
  const equipmentUnlocked = isTierAtLeast(counters?.tier, '區域醫院')
  const focusedUnlocked = isTierAtLeast(counters?.tier, '醫學中心')

  const affinityMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of affinityRows) m[r.subjectId] = r.correctCount
    return m
  }, [affinityRows])

  const masteryMap = useMemo(() => {
    const m: Record<string, { subjectId: string; correct: number; total: number }> = {}
    for (const r of masteryRows) m[r.subjectId] = r
    return m
  }, [masteryRows])

  function pushToast(text: string, kind: Toast['kind'] = 'success') {
    const toast = makeToast(text, kind)
    setToasts((prev) => [...prev, toast])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== toast.id)), 4000)
  }

  async function runExclusive(actionKey: string, fn: () => Promise<void>) {
    if (rollInFlight.current) return
    rollInFlight.current = true
    setBusyAction(actionKey)
    try {
      await fn()
    } finally {
      rollInFlight.current = false
      setBusyAction(null)
    }
  }

  async function handleDoctorRoll(subject: Subject) {
    await runExclusive(`doctor:${subject.id}`, async () => {
      const outcome = await attemptRoll(subject)
      if (outcome.ok) {
        setDoctorModal({ doctor: outcome.doctor, wasPity: outcome.wasPity })
        return
      }
      if (outcome.reason === 'no-credits') pushToast(`${HOSPITAL_CREDIT_LABEL}不足`, 'error')
      else if (outcome.reason === 'banner-locked') pushToast(`還需答對 ${outcome.missing} 題 ${subject.displayName}`, 'error')
      else pushToast(`未知科別：${subject.id}`, 'error')
    })
  }

  async function handleFocusedDoctorRoll() {
    await runExclusive('focused-doctor', async () => {
      const outcome = await attemptFocusedP3Roll(subjects)
      if (outcome.ok) {
        setDoctorModal({ doctor: outcome.doctor, wasPity: false })
        return
      }
      if (outcome.reason === 'locked-tier') pushToast('醫學中心解鎖 P3+ 重點招募', 'error')
      else if (outcome.reason === 'no-credits') pushToast(`${HOSPITAL_CREDIT_LABEL}不足`, 'error')
      else if (outcome.reason === 'no-unlocked-banners') pushToast('尚未解鎖任何科別招募', 'error')
      else pushToast('目前沒有可抽的 P3+ 醫師', 'error')
    })
  }

  async function handleEquipmentRoll(kind: 'normal' | 'focused') {
    await runExclusive(kind === 'normal' ? 'equipment' : 'focused-equipment', async () => {
      const outcome = kind === 'normal'
        ? await rollEquipment()
        : await rollFocusedP3Equipment()
      if (outcome.ok) {
        setEquipmentModal(outcome)
        return
      }
      if (outcome.reason === 'locked-tier') pushToast('區域醫院解鎖器材補給；醫學中心解鎖 P3+ 器材', 'error')
      else if (outcome.reason === 'no-credits') pushToast(`${HOSPITAL_CREDIT_LABEL}不足`, 'error')
      else pushToast('器材池目前沒有可抽項目', 'error')
    })
  }

  async function handleBuyParts() {
    await runExclusive('parts', async () => {
      const result = await purchaseEquipmentPartsBundle()
      if (result.ok) {
        pushToast(`+${fmt(result.partsGained)} 零件（-${result.creditsSpent} ${HOSPITAL_CREDIT_LABEL}）`)
      } else {
        pushToast(result.reason === 'no-credits' ? `${HOSPITAL_CREDIT_LABEL}不足` : '器材狀態尚未初始化', 'error')
      }
    })
  }

  const unlockedDepartmentCount = subjects.filter((subject) => {
    const threshold = RECRUITMENT_THRESHOLDS[subject.id] ?? Infinity
    return (affinityMap[subject.id] ?? 0) >= threshold
  }).length

  return (
    <main className="app-shell supply-page">
      <header className="app-header">
        <h1>院務補給</h1>
        <div className="app-header__meta">
          <span className="hospital-throughput">
            {counters?.tier ?? '診所'} · 科別 {unlockedDepartmentCount}/{subjects.length}
          </span>
          <Link to="/" className="nav-link">
            ← 回主畫面
          </Link>
          <Link to="/equipment" className="nav-link">
            器材庫 →
          </Link>
        </div>
      </header>

      <section className="supply-wallet" aria-label="院務資源">
        <div className="supply-wallet__cell supply-wallet__cell--credits">
          <span>{HOSPITAL_CREDIT_LABEL}</span>
          <strong><EmojiIcon char="🏥" size={22} /> {creditsAvailable} / {HOSPITAL_CREDIT_CAP}</strong>
          <small>{refreshLabel}</small>
        </div>
        <div className="supply-wallet__cell">
          <span>器材零件</span>
          <strong><EmojiIcon char="⚙" size={22} /> {fmt(materials?.parts ?? 0)}</strong>
          <small>升級器材用</small>
        </div>
        <div className="supply-wallet__cell">
          <span>補給櫃檯</span>
          <strong>{equipmentUnlocked ? '器材開放' : '區域醫院解鎖'}</strong>
          <small>{focusedUnlocked ? 'P3+ 重點補給開放' : '醫學中心解鎖 P3+'}</small>
        </div>
      </section>

      <section className="supply-lobby" aria-label="補給櫃檯">
        <div className="supply-lobby__backdrop">
          <img src={lobbySprite} alt="" draggable={false} />
        </div>
        <div className="supply-lobby__copy">
          <p className="supply-lobby__eyebrow">Hospital Procurement</p>
          <h2>招募、器材、零件都在這裡決定</h2>
          <p>院務點數是共用資源。先補醫師、補器材，還是買零件，取決於今天的醫院瓶頸。</p>
        </div>
      </section>

      <section className="supply-band supply-band--doctor" aria-label="醫師招募">
        <header className="supply-band__head">
          <div>
            <p className="supply-band__kicker">Recruitment Counter</p>
            <h2>醫師招募</h2>
          </div>
          <SupplyStation
            tone="doctor"
            title="P3+ 重點招募"
            detail="從已解鎖科別隨機搜尋，保證 P3+。"
            price={`${HOSPITAL_CREDIT_PRICES.focusedDoctorP3} 點`}
            disabled={!focusedUnlocked || creditsAvailable < HOSPITAL_CREDIT_PRICES.focusedDoctorP3 || unlockedDepartmentCount === 0}
            disabledReason={
              !focusedUnlocked
                ? '醫學中心解鎖'
                : unlockedDepartmentCount === 0
                  ? '尚未解鎖科別'
                  : `${HOSPITAL_CREDIT_LABEL}不足`
            }
            busy={busyAction === 'focused-doctor'}
            onClick={() => void handleFocusedDoctorRoll()}
          />
        </header>

        <div className="department-window-grid">
          {subjects.map((subject) => (
            <DepartmentRecruitWindow
              key={subject.id}
              subject={subject}
              affinity={affinityMap[subject.id] ?? 0}
              threshold={RECRUITMENT_THRESHOLDS[subject.id] ?? 0}
              creditsAvailable={creditsAvailable}
              masteryLabel={formatMasteryPercent(masteryMap[subject.id])}
              completion={completionMap?.get(subject.id as SubjectId)}
              busy={busyAction === `doctor:${subject.id}`}
              onRoll={() => void handleDoctorRoll(subject)}
            />
          ))}
        </div>
      </section>

      <section className="supply-band supply-band--equipment" aria-label="器材補給">
        <header className="supply-band__head">
          <div>
            <p className="supply-band__kicker">Supply Counter</p>
            <h2>器材補給</h2>
          </div>
        </header>
        <div className="supply-station-grid">
          <SupplyStation
            tone="equipment"
            title="一般器材補給"
            detail="抽取一件可裝備器材，沿用目前機率與保底。"
            price={`${HOSPITAL_CREDIT_PRICES.equipmentPull} 點`}
            disabled={!equipmentUnlocked || creditsAvailable < HOSPITAL_CREDIT_PRICES.equipmentPull}
            disabledReason={!equipmentUnlocked ? '區域醫院解鎖' : `${HOSPITAL_CREDIT_LABEL}不足`}
            busy={busyAction === 'equipment'}
            onClick={() => void handleEquipmentRoll('normal')}
          />
          <SupplyStation
            tone="equipment"
            title="P3+ 器材徵調"
            detail="保證 P3+，適合補強核心房型裝備。"
            price={`${HOSPITAL_CREDIT_PRICES.focusedEquipmentP3} 點`}
            disabled={!focusedUnlocked || creditsAvailable < HOSPITAL_CREDIT_PRICES.focusedEquipmentP3}
            disabledReason={!focusedUnlocked ? '醫學中心解鎖' : `${HOSPITAL_CREDIT_LABEL}不足`}
            busy={busyAction === 'focused-equipment'}
            onClick={() => void handleEquipmentRoll('focused')}
          />
          <SupplyStation
            tone="parts"
            title={`零件包 +${HOSPITAL_CREDIT_PARTS_BUNDLE_AMOUNT}`}
            detail="直接購買升級零件，整理庫存或推高主力器材。"
            price={`${HOSPITAL_CREDIT_PRICES.partsBundle} 點`}
            disabled={!equipmentUnlocked || creditsAvailable < HOSPITAL_CREDIT_PRICES.partsBundle}
            disabledReason={!equipmentUnlocked ? '區域醫院解鎖' : `${HOSPITAL_CREDIT_LABEL}不足`}
            busy={busyAction === 'parts'}
            onClick={() => void handleBuyParts()}
          />
        </div>
      </section>

      {assignedTargetedTicketCount > 0 && (
        <section className="supply-band supply-band--tickets" aria-label="特殊券">
          <header className="supply-band__head">
            <div>
              <p className="supply-band__kicker">Voucher Tray</p>
              <h2>特殊券</h2>
            </div>
          </header>
          <TargetedTicketSection
            subjects={subjects}
            onConsumed={(doctor) => setDoctorModal({ doctor, wasPity: false })}
            onError={(msg) => pushToast(msg, 'error')}
          />
        </section>
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.kind === 'error' ? 'error' : 'unlock'}`}>
            {toast.text}
          </div>
        ))}
      </div>

      <RecruitmentResultModal
        doctor={doctorModal?.doctor ?? null}
        wasPity={doctorModal?.wasPity ?? false}
        onClose={() => setDoctorModal(null)}
      />
      <EquipmentResultModal
        item={equipmentModal?.equipment ?? null}
        wasPity={equipmentModal?.wasPity ?? false}
        onClose={() => setEquipmentModal(null)}
      />
    </main>
  )
}
