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
import {
  getHospitalDB,
  type DoctorRow,
  type EquipmentRow,
  type RoomSupportAssignmentRow,
  type RoomSupportRoleId,
} from '../db/schema'
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
  ROOM_SUPPORT_ROLE_DESCRIPTIONS,
  ROOM_SUPPORT_ROLE_LABELS,
  SUPPORT_THROUGHPUT_SHARE,
  computeRoomTeamThroughput,
  computeSupportThroughput,
  getSupportRolesForRoom,
} from '../services/room-team'

interface AssignDoctorModalProps {
  room: Room
  currentDoctor: DoctorRow | null
  currentSupportAssignments?: ReadonlyArray<RoomSupportAssignmentRow>
  doctorsById?: Map<string, DoctorRow>
  /** Equipment currently equipped by each doctor, keyed by doctorId. */
  equippedItemMap?: Map<string, EquipmentRow>
  onClose: () => void
}

export function AssignDoctorModal({
  room: initialRoom,
  currentDoctor,
  currentSupportAssignments = [],
  doctorsById = new Map(),
  equippedItemMap,
  onClose,
}: AssignDoctorModalProps) {
  const db = getHospitalDB()
  // Live-track the room so facility upgrades reflect immediately in the modal
  const liveRoom = useLiveQuery(() => db.rooms.get(initialRoom.id), [initialRoom.id])
  const room = liveRoom ?? initialRoom
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const [candidates, setCandidates] = useState<DoctorRow[]>([])
  const [supportCandidatesByRole, setSupportCandidatesByRole] = useState<
    Partial<Record<RoomSupportRoleId, DoctorRow[]>>
  >({})
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
      const entries = await Promise.all(
        getSupportRolesForRoom(room).map(async (roleId) => {
          const available = await getAvailableSupportDoctors(room.id, roleId)
          const currentAssignment = currentSupportAssignments.find((assignment) => assignment.roleId === roleId)
          const currentSupportDoctor = currentAssignment ? doctorsById.get(currentAssignment.doctorId) ?? null : null
          const ordered =
            currentSupportDoctor && !available.some((d) => d.id === currentSupportDoctor.id)
              ? [currentSupportDoctor, ...available]
              : available
          return [roleId, ordered] as const
        }),
      )
      if (!cancelled) setSupportCandidatesByRole(Object.fromEntries(entries))
    })()
    return () => {
      cancelled = true
    }
  }, [room, currentSupportAssignments, doctorsById])

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

  async function handlePickSupport(roleId: RoomSupportRoleId, doctor: DoctorRow) {
    if (busy) return
    setBusy(true)
    setSupportError(null)
    try {
      const currentAssignment = currentSupportAssignments.find((assignment) => assignment.roleId === roleId)
      if (doctor.id !== currentAssignment?.doctorId) {
        const result = await assignSupportDoctor(room.id, roleId, doctor.id)
        if (result.kind === 'aborted') {
          const reasonLabel: Record<typeof result.reason, string> = {
            'room-not-found': '找不到房間',
            'role-not-available': '這個房間沒有支援槽',
            'doctor-not-found': '找不到醫師',
            'doctor-ineligible': '這位醫師不符合此支援槽的科別條件',
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

  async function handleUnassignSupport(roleId: RoomSupportRoleId) {
    if (busy) return
    setBusy(true)
    setSupportError(null)
    try {
      await unassignSupportDoctor(room.id, roleId)
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
  const supportRoles = getSupportRolesForRoom(room)
  const currentSupportDoctorByRole = new Map(
    currentSupportAssignments.map((assignment) => [
      assignment.roleId,
      doctorsById.get(assignment.doctorId) ?? null,
    ]),
  )
  const currentSupportDoctors = supportRoles
    .map((roleId) => currentSupportDoctorByRole.get(roleId) ?? null)
    .filter((doctor): doctor is DoctorRow => doctor !== null)
  const leadCandidateThroughput = (doctor: DoctorRow): number =>
    computeRoomTeamThroughput(
      room,
      doctor,
      currentSupportDoctors,
      equippedItemMap?.get(doctor.id),
      equippedItemMap,
    )
  const rankedCandidates = [...candidates].sort(
    (a, b) => leadCandidateThroughput(b) - leadCandidateThroughput(a) || b.obtainedAt - a.obtainedAt,
  )

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

        <section className="assign-modal__section assign-modal__lead">
          <h3 className="assign-modal__section-title">主治醫師</h3>
        {candidates.length === 0 ? (
          <p className="assign-modal__empty">
            目前沒有可指派的醫師。回主畫面累積親和值招募吧！
          </p>
        ) : (
          <ul className="assign-modal__list">
            {rankedCandidates.map((d) => {
              const isCurrent = d.id === currentDoctor?.id
              const spriteUrl = lookupSprite(d.spriteKey, THEME_PIXEL_HOSPITAL.sprites, d.rarity)
              const throughput = leadCandidateThroughput(d)
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
                      {throughput.toFixed(1)}/分
                      {isCurrent && <small>（目前）</small>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        </section>

        {supportRoles.length > 0 && (
          <div className="assign-modal__support-grid">
            {supportRoles.map((roleId) => {
              const currentSupportDoctor = currentSupportDoctorByRole.get(roleId) ?? null
              const supportCandidates = supportCandidatesByRole[roleId] ?? []
              const rankedSupportCandidates = [...supportCandidates].sort(
                (a, b) =>
                  computeSupportThroughput(room, b, equippedItemMap?.get(b.id)) -
                    computeSupportThroughput(room, a, equippedItemMap?.get(a.id)) ||
                  b.obtainedAt - a.obtainedAt,
              )
              return (
                <section key={roleId} className="assign-modal__section assign-modal__support" aria-label={ROOM_SUPPORT_ROLE_LABELS[roleId]}>
                  <h3 className="assign-modal__section-title">{ROOM_SUPPORT_ROLE_LABELS[roleId]}</h3>
                  <p className="assign-modal__support-hint">
                    {ROOM_SUPPORT_ROLE_DESCRIPTIONS[roleId]}
                  </p>

                  {supportCandidates.length === 0 ? (
                    <p className="assign-modal__empty">
                      目前沒有可支援的醫師。已擔任主治或其他支援的醫師不會出現在這裡。
                    </p>
                  ) : (
                    <ul className="assign-modal__list">
                      {rankedSupportCandidates.map((d) => {
                        const isCurrent = d.id === currentSupportDoctor?.id
                        const spriteUrl = lookupSprite(d.spriteKey, THEME_PIXEL_HOSPITAL.sprites, d.rarity)
                        const supportThroughput = computeSupportThroughput(room, d, equippedItemMap?.get(d.id))
                        const equippedItem = currentDoctor ? equippedItemMap?.get(currentDoctor.id) : undefined
                        const teamThroughput = computeRoomTeamThroughput(
                          room,
                          currentDoctor,
                          [d],
                          equippedItem,
                          equippedItemMap,
                        )
                        return (
                          <li key={d.id}>
                            <button
                              type="button"
                              className={`assign-modal__row ${isCurrent ? 'assign-modal__row--current' : ''}`}
                              onClick={() => void handlePickSupport(roleId, d)}
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
                                +{supportThroughput.toFixed(1)}/分
                                <small>（{Math.round(SUPPORT_THROUGHPUT_SHARE * 100)}% 支援）</small>
                                {currentDoctor && <small>團隊 {teamThroughput.toFixed(1)}/分</small>}
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
                      onClick={() => void handleUnassignSupport(roleId)}
                      disabled={busy}
                    >
                      取消{ROOM_SUPPORT_ROLE_LABELS[roleId]}
                    </button>
                  )}
                </section>
              )
            })}
          </div>
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
