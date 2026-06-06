import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  FACILITY_LEVEL_TO_FACILITY,
  FACILITY_MAX_LEVEL,
  FACILITY_UPGRADE_COSTS,
  RARITY_LABELS,
  ROOM_TYPE_LABELS,
  type Room,
} from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { lookupSprite } from '../lib/sprite-lookup'
import { getHospitalDB, type DoctorRow, type EquipmentRow } from '../db/schema'
import { EmojiIcon } from './EmojiIcon'
import {
  assignDoctor,
  assignSupportDoctor,
  getAvailableSupportDoctors,
  getUnassignedDoctors,
  unassignDoctor,
  unassignSupportDoctor,
} from '../lib/assignment'
import { upgradeFacility } from '../services/facility'
import {
  ROOM_SUPPORT_ROLE_ANESTHESIA,
  ROOM_SUPPORT_ROLE_DESCRIPTIONS,
  ROOM_SUPPORT_ROLE_LABELS,
  computeRoomTeamThroughput,
  getRoomSupportMultiplier,
  isSupportRoleAvailableForRoom,
} from '../services/room-team'

interface AssignDoctorModalProps {
  room: Room
  currentDoctor: DoctorRow | null
  currentSupportDoctor?: DoctorRow | null
  /** Equipment currently equipped by each doctor, keyed by doctorId. */
  equippedItemMap?: Map<string, EquipmentRow>
  onClose: () => void
}

export function AssignDoctorModal({
  room: initialRoom,
  currentDoctor,
  currentSupportDoctor = null,
  equippedItemMap,
  onClose,
}: AssignDoctorModalProps) {
  const db = getHospitalDB()
  // Live-track the room so facility upgrades reflect immediately in the modal
  const liveRoom = useLiveQuery(() => db.rooms.get(initialRoom.id), [initialRoom.id])
  const room = liveRoom ?? initialRoom
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const [candidates, setCandidates] = useState<DoctorRow[]>([])
  const [supportCandidates, setSupportCandidates] = useState<DoctorRow[]>([])
  const [busy, setBusy] = useState(false)
  const [facilityError, setFacilityError] = useState<string | null>(null)
  const [supportError, setSupportError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const unassigned = await getUnassignedDoctors()
      // Include the room's current doctor at the top so swap UX is one click
      const ordered = currentDoctor ? [currentDoctor, ...unassigned] : unassigned
      if (!cancelled) setCandidates(ordered)
    })()
    return () => {
      cancelled = true
    }
  }, [currentDoctor])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isSupportRoleAvailableForRoom(room, ROOM_SUPPORT_ROLE_ANESTHESIA)) {
        if (!cancelled) setSupportCandidates([])
        return
      }
      const available = await getAvailableSupportDoctors(room.id, ROOM_SUPPORT_ROLE_ANESTHESIA)
      const ordered =
        currentSupportDoctor && !available.some((d) => d.id === currentSupportDoctor.id)
          ? [currentSupportDoctor, ...available]
          : available
      if (!cancelled) setSupportCandidates(ordered)
    })()
    return () => {
      cancelled = true
    }
  }, [room, currentSupportDoctor])

  async function handlePick(doctor: DoctorRow) {
    if (busy) return
    setBusy(true)
    try {
      if (doctor.id === currentDoctor?.id) {
        // No-op: re-selecting the already-assigned doctor; just close
      } else {
        await assignDoctor(room.id, doctor.id)
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function handleUnassign() {
    if (busy) return
    setBusy(true)
    try {
      await unassignDoctor(room.id)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function handlePickSupport(doctor: DoctorRow) {
    if (busy) return
    setBusy(true)
    setSupportError(null)
    try {
      if (doctor.id !== currentSupportDoctor?.id) {
        const result = await assignSupportDoctor(room.id, ROOM_SUPPORT_ROLE_ANESTHESIA, doctor.id)
        if (result.kind === 'aborted') {
          const reasonLabel: Record<typeof result.reason, string> = {
            'room-not-found': '找不到房間',
            'role-not-available': '這個房間沒有支援槽',
            'doctor-not-found': '找不到醫師',
            'doctor-ineligible': '麻醉支援需要麻醉科醫師',
            'doctor-leading': '這位醫師已經是主治，不能同時支援',
          }
          setSupportError(reasonLabel[result.reason])
          return
        }
      }
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function handleUnassignSupport() {
    if (busy) return
    setBusy(true)
    setSupportError(null)
    try {
      await unassignSupportDoctor(room.id, ROOM_SUPPORT_ROLE_ANESTHESIA)
      onClose()
    } finally {
      setBusy(false)
    }
  }

  async function handleUpgradeFacility() {
    if (busy) return
    setBusy(true)
    setFacilityError(null)
    try {
      const result = await upgradeFacility(room.id)
      if (result.kind === 'aborted') {
        setFacilityError(
          result.reason === 'max-level'
            ? '已達最高等級'
            : `營收不足（需要 ${result.requiredRevenue.toLocaleString('zh-TW')} 💰）`,
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const currentLevel = room.facilityLevel ?? 1
  const nextLevel = currentLevel + 1
  const isMaxed = currentLevel >= FACILITY_MAX_LEVEL
  const upgradeCost = isMaxed ? 0 : FACILITY_UPGRADE_COSTS[nextLevel]
  const nextMultiplier = isMaxed ? room.roomFacility : FACILITY_LEVEL_TO_FACILITY[nextLevel]
  const canAffordUpgrade = (counters?.revenue ?? 0) >= upgradeCost
  const fmt = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--assign" onClick={(e) => e.stopPropagation()}>
        <header className="assign-modal__head">
          <h2 className="assign-modal__title">
            {ROOM_TYPE_LABELS[room.type]} #{room.slot}
          </h2>
          <p className="assign-modal__subtitle">
            選擇醫師指派（基礎產能 {room.baseRate}/分，設施 ×{room.roomFacility.toFixed(1)}）
          </p>
        </header>

        <section className="assign-modal__section">
          <h3 className="assign-modal__section-title">主治醫師</h3>
        {candidates.length === 0 ? (
          <p className="assign-modal__empty">
            目前沒有可指派的醫師。回主畫面累積親和值招募吧！
          </p>
        ) : (
          <ul className="assign-modal__list">
            {candidates.map((d) => {
              const isCurrent = d.id === currentDoctor?.id
              const equippedItem = equippedItemMap?.get(d.id)
              const spriteUrl = lookupSprite(d.spriteKey, THEME_PIXEL_HOSPITAL.sprites, d.rarity)
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    className={`assign-modal__row ${isCurrent ? 'assign-modal__row--current' : ''}`}
                    onClick={() => void handlePick(d)}
                    disabled={busy}
                    style={{ ['--rarity-color' as string]: `var(--rarity-${d.rarity.toLowerCase()})` } as React.CSSProperties}
                  >
                    <span className="assign-modal__sprite">
                      {spriteUrl ? <img src={spriteUrl} alt="" /> : <EmojiIcon char="🩺" size={32} />}
                    </span>
                    <span className="assign-modal__info">
                      <span className="assign-modal__name">{d.name}</span>
                      <span className="assign-modal__meta">
                        {d.rarity} {RARITY_LABELS[d.rarity]} · ×{d.powerMultiplier.toFixed(1)}
                      </span>
                    </span>
                    <span className="assign-modal__throughput">
                      {computeRoomTeamThroughput(room, d, currentSupportDoctor, equippedItem).toFixed(1)}/分
                      {isCurrent && <small>（目前）</small>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        </section>

        {isSupportRoleAvailableForRoom(room, ROOM_SUPPORT_ROLE_ANESTHESIA) && (
          <section className="assign-modal__section assign-modal__support" aria-label={ROOM_SUPPORT_ROLE_LABELS.anesthesia}>
            <h3 className="assign-modal__section-title">{ROOM_SUPPORT_ROLE_LABELS.anesthesia}</h3>
            <p className="assign-modal__support-hint">
              {ROOM_SUPPORT_ROLE_DESCRIPTIONS.anesthesia}
            </p>

            {supportCandidates.length === 0 ? (
              <p className="assign-modal__empty">
                目前沒有可支援的麻醉科醫師。已擔任主治或其他支援的醫師不會出現在這裡。
              </p>
            ) : (
              <ul className="assign-modal__list">
                {supportCandidates.map((d) => {
                  const isCurrent = d.id === currentSupportDoctor?.id
                  const spriteUrl = lookupSprite(d.spriteKey, THEME_PIXEL_HOSPITAL.sprites, d.rarity)
                  const teamMultiplier = getRoomSupportMultiplier(room, currentDoctor, d, ROOM_SUPPORT_ROLE_ANESTHESIA)
                  const equippedItem = currentDoctor ? equippedItemMap?.get(currentDoctor.id) : undefined
                  const teamThroughput = computeRoomTeamThroughput(room, currentDoctor, d, equippedItem)
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        className={`assign-modal__row ${isCurrent ? 'assign-modal__row--current' : ''}`}
                        onClick={() => void handlePickSupport(d)}
                        disabled={busy}
                        style={{ ['--rarity-color' as string]: `var(--rarity-${d.rarity.toLowerCase()})` } as React.CSSProperties}
                      >
                        <span className="assign-modal__sprite">
                          {spriteUrl ? <img src={spriteUrl} alt="" /> : <EmojiIcon char="⚕" size={32} />}
                        </span>
                        <span className="assign-modal__info">
                          <span className="assign-modal__name">{d.name}</span>
                          <span className="assign-modal__meta">
                            {d.rarity} {RARITY_LABELS[d.rarity]} · {d.subjectId}
                          </span>
                        </span>
                        <span className="assign-modal__throughput">
                          團隊 ×{teamMultiplier.toFixed(2).replace(/\.?0+$/, '')}
                          {currentDoctor && <small>{teamThroughput.toFixed(1)}/分</small>}
                          {isCurrent && <small>（目前）</small>}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {supportError && <p className="assign-modal__facility-error">{supportError}</p>}
            {currentSupportDoctor && (
              <button
                type="button"
                className="assign-modal__unassign assign-modal__support-unassign"
                onClick={() => void handleUnassignSupport()}
                disabled={busy}
              >
                取消{ROOM_SUPPORT_ROLE_LABELS.anesthesia}
              </button>
            )}
          </section>
        )}

        <section className="assign-modal__facility" aria-label="設施升級">
          <h3 className="assign-modal__facility-title">設施升級</h3>
          <p className="assign-modal__facility-current">
            目前等級：<strong>Lv.{currentLevel}</strong>（×{room.roomFacility.toFixed(1)}）
            {isMaxed && <span className="muted">{' '}— 已達 Lv.{FACILITY_MAX_LEVEL} 上限</span>}
          </p>
          {!isMaxed && (
            <>
              <p className="assign-modal__facility-next">
                升級至 <strong>Lv.{nextLevel}</strong>（×{nextMultiplier.toFixed(1)}）
                {'　成本 '}
                <strong>{fmt(upgradeCost)} <EmojiIcon char="💰" size={14} /></strong>
              </p>
              <button
                type="button"
                className="primary-btn assign-modal__facility-btn"
                onClick={() => void handleUpgradeFacility()}
                disabled={busy || !canAffordUpgrade}
                title={canAffordUpgrade ? '' : `營收不足（需要 ${fmt(upgradeCost)} 💰）`}
              >
                {canAffordUpgrade ? (
                  '升級設施'
                ) : (
                  <>需要 {fmt(upgradeCost)} <EmojiIcon char="💰" size={14} /></>
                )}
              </button>
              {facilityError && <p className="assign-modal__facility-error">{facilityError}</p>}
            </>
          )}
        </section>

        <div className="assign-modal__actions">
          {currentDoctor && (
            <button
              type="button"
              className="assign-modal__unassign"
              onClick={() => void handleUnassign()}
              disabled={busy}
            >
              取消指派
            </button>
          )}
          <button type="button" className="modal-card__close" onClick={onClose} disabled={busy}>
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
