import { useMemo, useRef, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { RARITY_LABELS, RARITY_ORDER, type Rarity } from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import {
  DOCTOR_EQUIPMENT_CATEGORY_LABELS,
  DOCTOR_EQUIPMENT_PARTS_BY_RARITY,
  DOCTOR_EQUIPMENT_RARITY_LABELS,
  DOCTOR_EQUIPMENT_TICKET_CAP,
  DOCTOR_EQUIPMENT_UPGRADE_COSTS,
  getNextDoctorEquipmentDefinition,
  getNextDoctorEquipmentRarity,
  isUpgradeableDoctorEquipmentCategory,
  type DoctorEquipmentCategory,
  type DoctorEquipmentUpgradeSourceRarity,
} from '../data/doctor-equipment'
import {
  DEFAULT_STETHOSCOPE_SPRITE_LAYOUT,
  DOCTOR_EQUIPMENT_SPRITE_TUNING_ENABLED_KEY,
  DoctorEquipmentIcon,
  getDoctorEquipmentSpriteLayout,
  readDoctorEquipmentSpriteLayouts,
  writeDoctorEquipmentSpriteLayouts,
  type SpriteLayout,
} from '../components/DoctorEquipmentIcon'
import { DoctorEquipmentResultModal } from '../components/DoctorEquipmentResultModal'
import { DoctorEquipmentArtwork, hasDoctorEquipmentHeroArt } from '../components/DoctorEquipmentArtwork'
import { getHospitalDB, type DoctorRow, type DoctorEquipmentRow } from '../db/schema'
import { lookupSprite } from '../lib/sprite-lookup'
import {
  dismantleDoctorEquipment,
  describeDoctorEquipment,
  equipDoctorEquipmentItem,
  rollDoctorEquipment,
  unequipDoctorEquipmentItem,
  upgradeDoctorEquipment,
  type DoctorEquipmentDismantleResult,
  type DoctorEquipmentRollOutcome,
  type DoctorEquipmentUpgradeResult,
} from '../services/doctor-equipment'

type SortMode = 'newest' | 'rarity' | 'category' | 'equipped'
type EquipFilter = 'all' | 'available' | 'equipped'

const CATEGORY_ORDER: DoctorEquipmentCategory[] = [
  'stethoscope',
  'scalpel',
  'chart',
  'coat',
  'textbook',
  'coffee',
]
const RARITY_FILTER_OPTIONS: Rarity[] = [...RARITY_ORDER].reverse()
const RARITY_RANK = new Map<Rarity, number>(RARITY_ORDER.map((r, index) => [r, index]))
const DOCTOR_EQUIPMENT_DRAG_TYPE = 'application/x-study-rpg-doctorEquipment'
const DOCTOR_EQUIPMENT_SLOTS = [{ id: 'main', label: '主要器材' }] as const
const SPRITE_TUNER_CATEGORIES: DoctorEquipmentCategory[] = ['stethoscope', 'scalpel', 'chart', 'coat']

function fmt(n: number): string {
  return Math.round(n).toLocaleString('zh-TW')
}

function isSpriteTunerEnabled() {
  return import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    window.localStorage.getItem(DOCTOR_EQUIPMENT_SPRITE_TUNING_ENABLED_KEY) === '1'
}

function sortDoctorEquipment(items: DoctorEquipmentRow[], sortMode: SortMode): DoctorEquipmentRow[] {
  return [...items].sort((a, b) => {
    if (sortMode === 'newest') return b.obtainedAt - a.obtainedAt
    if (sortMode === 'rarity') {
      return (RARITY_RANK.get(b.rarity) ?? 0) - (RARITY_RANK.get(a.rarity) ?? 0)
    }
    if (sortMode === 'category') {
      return CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category)
    }
    if (sortMode === 'equipped') {
      return Number(!!b.equippedDoctorId) - Number(!!a.equippedDoctorId)
    }
    return 0
  })
}

export function DoctorEquipmentPage() {
  const db = getHospitalDB()
  const doctorEquipment = useLiveQuery(() => db.doctorEquipment.toArray(), []) ?? []
  const doctors = useLiveQuery(() => db.doctors.orderBy('obtainedAt').reverse().toArray(), []) ?? []
  const tickets = useLiveQuery(() => db.doctorEquipmentTickets.get('global'), [])
  const materials = useLiveQuery(() => db.doctorEquipmentMaterials.get('global'), [])
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const rollInFlight = useRef(false)
  const [rolling, setRolling] = useState(false)
  const [rollOutcome, setRollOutcome] = useState<Extract<DoctorEquipmentRollOutcome, { ok: true }> | null>(null)
  const [showCeremony, setShowCeremony] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<DoctorEquipmentRow | null>(null)
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [doctorSubjectFilter, setDoctorSubjectFilter] = useState<string>('all')
  const [doctorRarityFilters, setDoctorRarityFilters] = useState<Rarity[]>([])
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const [rarityFilter, setRarityFilter] = useState<Rarity | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<DoctorEquipmentCategory | 'all'>('all')
  const [equipFilter, setEquipFilter] = useState<EquipFilter>('all')
  const [spriteLayoutOverrides, setSpriteLayoutOverrides] = useState<Partial<Record<DoctorEquipmentCategory, SpriteLayout>>>(readDoctorEquipmentSpriteLayouts)
  const [spriteTunerCategory, setSpriteTunerCategory] = useState<DoctorEquipmentCategory>('stethoscope')
  const [showSpriteTuner] = useState(isSpriteTunerEnabled)

  const doctorById = useMemo(() => new Map(doctors.map((doctor) => [doctor.id, doctor])), [doctors])
  const doctorEquipmentByDoctorId = useMemo(() => {
    const map = new Map<string, DoctorEquipmentRow>()
    for (const item of sortDoctorEquipment(doctorEquipment, 'newest')) {
      if (item.equippedDoctorId && !map.has(item.equippedDoctorId)) {
        map.set(item.equippedDoctorId, item)
      }
    }
    return map
  }, [doctorEquipment])
  const selectedDoctor = useMemo(() => {
    if (!selectedDoctorId) return null
    return doctors.find((doctor) => doctor.id === selectedDoctorId) ?? null
  }, [doctors, selectedDoctorId])
  const selectedDoctorDoctorEquipment = selectedDoctor ? doctorEquipmentByDoctorId.get(selectedDoctor.id) ?? null : null

  const doctorSubjects = useMemo(() => {
    const set = new Set<string>()
    for (const doctor of doctors) set.add(doctor.subjectId)
    return ['all', ...Array.from(set)]
  }, [doctors])
  const filteredDoctors = useMemo(() => {
    return doctors.filter((doctor) => {
      if (doctorSubjectFilter !== 'all' && doctor.subjectId !== doctorSubjectFilter) return false
      if (doctorRarityFilters.length > 0 && !doctorRarityFilters.includes(doctor.rarity)) return false
      return true
    })
  }, [doctorRarityFilters, doctorSubjectFilter, doctors])

  const visibleDoctorEquipment = useMemo(() => {
    const rows = doctorEquipment.filter((item) => {
      if (rarityFilter !== 'all' && item.rarity !== rarityFilter) return false
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      if (equipFilter === 'available' && item.equippedDoctorId) return false
      if (equipFilter === 'equipped' && !item.equippedDoctorId) return false
      return true
    })
    return sortDoctorEquipment(rows, sortMode)
  }, [categoryFilter, equipFilter, doctorEquipment, rarityFilter, sortMode])

  async function handleRoll() {
    if (rollInFlight.current) return
    rollInFlight.current = true
    setRolling(true)
    setToast(null)
    try {
      const outcome = await rollDoctorEquipment()
      if (outcome.ok) {
        setRollOutcome(outcome)
        setShowCeremony(true)
        return
      }
      setToast(outcome.reason === 'no-tickets' ? '器材券不足' : '器材池目前沒有可抽項目')
    } finally {
      rollInFlight.current = false
      setRolling(false)
    }
  }

  function toggleDoctorRarityFilter(rarity: Rarity) {
    setDoctorRarityFilters((current) =>
      current.includes(rarity)
        ? current.filter((r) => r !== rarity)
        : [...current, rarity],
    )
  }

  function handleDragStart(event: DragEvent<HTMLElement>, item: DoctorEquipmentRow) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(DOCTOR_EQUIPMENT_DRAG_TYPE, item.id)
    setDraggedItemId(item.id)
  }

  function getDraggedDoctorEquipmentId(event: DragEvent<HTMLElement>): string | null {
    return event.dataTransfer.getData(DOCTOR_EQUIPMENT_DRAG_TYPE) || draggedItemId
  }

  function allowDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  async function equipDraggedItem(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const itemId = getDraggedDoctorEquipmentId(event)
    if (!itemId || !selectedDoctor || actionBusy) return
    setActionBusy(true)
    try {
      await equipDoctorEquipmentItem(itemId, selectedDoctor.id)
    } finally {
      setActionBusy(false)
      setDraggedItemId(null)
    }
  }

  async function unequipDraggedItem(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    const itemId = getDraggedDoctorEquipmentId(event)
    const item = itemId ? doctorEquipment.find((row) => row.id === itemId) : null
    if (!item || !item.equippedDoctorId || actionBusy) return
    setActionBusy(true)
    try {
      await unequipDoctorEquipmentItem(item.id)
    } finally {
      setActionBusy(false)
      setDraggedItemId(null)
    }
  }

  async function unequipSelectedSlot() {
    if (!selectedDoctorDoctorEquipment || actionBusy) return
    setActionBusy(true)
    try {
      await unequipDoctorEquipmentItem(selectedDoctorDoctorEquipment.id)
    } finally {
      setActionBusy(false)
    }
  }

  function resolveSelectedItem(): DoctorEquipmentRow | null {
    if (!selectedItem) return null
    return doctorEquipment.find((item) => item.id === selectedItem.id) ?? selectedItem
  }

  const currentSelectedItem = resolveSelectedItem()
  const selectedEquippedDoctor =
    currentSelectedItem?.equippedDoctorId
      ? doctorById.get(currentSelectedItem.equippedDoctorId) ?? null
      : null
  const selectedWasPity =
    rollOutcome !== null &&
    currentSelectedItem !== null &&
    rollOutcome.doctorEquipment.id === currentSelectedItem.id
      ? rollOutcome.wasPity
      : false

  return (
    <main className="app-shell doctor-equipment-page">
      <header className="app-header">
        <h1>器材庫</h1>
        <div className="app-header__meta">
          <span className="hospital-throughput">
            裝備 {doctorEquipment.filter((item) => item.equippedDoctorId).length}/{doctors.length} · 庫存 {doctorEquipment.length}
          </span>
          <Link to="/" className="nav-link">
            ← 回主畫面
          </Link>
        </div>
      </header>

      <section className="doctor-equipment-draw-panel" aria-label="器材補給">
        <div>
          <p className="doctor-equipment-draw-panel__label">器材券</p>
          <p className="doctor-equipment-draw-panel__tickets">
            🧰 {tickets?.available ?? 0} / {DOCTOR_EQUIPMENT_TICKET_CAP}
          </p>
        </div>
        <div>
          <p className="doctor-equipment-draw-panel__label">器材零件</p>
          <p className="doctor-equipment-draw-panel__tickets">
            ⚙ {fmt(materials?.parts ?? 0)}
          </p>
        </div>
        <button
          type="button"
          className="primary-btn doctor-equipment-draw-panel__button"
          onClick={() => void handleRoll()}
          disabled={rolling || (tickets?.available ?? 0) < 1}
        >
          {rolling ? '補給中…' : '器材補給'}
        </button>
      </section>

      {toast && <p className="doctor-equipment-page__toast" role="status">{toast}</p>}
      {showSpriteTuner && (
        <DoctorEquipmentSpriteTuner
          category={spriteTunerCategory}
          layout={getDoctorEquipmentSpriteLayout(spriteTunerCategory, spriteLayoutOverrides)}
          onCategoryChange={setSpriteTunerCategory}
          onChange={(next) => {
            const layouts = { ...spriteLayoutOverrides, [spriteTunerCategory]: next }
            setSpriteLayoutOverrides(layouts)
            writeDoctorEquipmentSpriteLayouts(layouts)
          }}
        />
      )}

      <section className="doctor-equipment-workbench" aria-label="器材配置工作台">
        <aside className="doctor-equipment-roster-pane" aria-label="醫師名冊">
          <div className="doctor-equipment-section-header">
            <h2>醫師</h2>
            <span>{filteredDoctors.length} / {doctors.length}</span>
          </div>

          <section className="filter-bar doctor-equipment-roster-filter" aria-label="醫師篩選">
            <label>
              科別
              <select value={doctorSubjectFilter} onChange={(event) => setDoctorSubjectFilter(event.target.value)}>
                {doctorSubjects.map((subject) => (
                  <option key={subject} value={subject}>
                    {subject === 'all' ? '全部' : subject}
                  </option>
                ))}
              </select>
            </label>
            <div className="filter-bar__group">
              <span className="filter-bar__label">稀有度</span>
              <span className="filter-chip-group" role="group" aria-label="醫師稀有度篩選">
                <button
                  type="button"
                  className="filter-chip"
                  aria-pressed={doctorRarityFilters.length === 0}
                  onClick={() => setDoctorRarityFilters([])}
                >
                  全部
                </button>
                {RARITY_FILTER_OPTIONS.map((rarity) => (
                  <button
                    key={rarity}
                    type="button"
                    className="filter-chip"
                    aria-pressed={doctorRarityFilters.includes(rarity)}
                    onClick={() => toggleDoctorRarityFilter(rarity)}
                  >
                    {rarity}
                  </button>
                ))}
              </span>
            </div>
          </section>

          <div className="doctor-equipment-roster-list">
            {filteredDoctors.length === 0 ? (
              <p className="doctor-equipment-page__empty">沒有符合條件的醫師。</p>
            ) : (
              filteredDoctors.map((doctor) => (
                <DoctorRosterButton
                  key={doctor.id}
                  doctor={doctor}
                  doctorEquipment={doctorEquipmentByDoctorId.get(doctor.id) ?? null}
                  selected={selectedDoctor?.id === doctor.id}
                  onClick={() => setSelectedDoctorId(doctor.id)}
                />
              ))
            )}
          </div>
        </aside>

        <section className="doctor-equipment-loadout-pane" aria-label="醫師器材欄">
          {selectedDoctor ? (
            <SelectedDoctorPanel
              doctor={selectedDoctor}
              doctorEquipment={selectedDoctorDoctorEquipment}
              actionBusy={actionBusy}
              onDropDoctorEquipment={(event) => void equipDraggedItem(event)}
              onAllowDrop={allowDrop}
              onDragStart={handleDragStart}
              onDragEnd={() => setDraggedItemId(null)}
              onUnequip={() => void unequipSelectedSlot()}
            />
          ) : (
            <div className="doctor-equipment-loadout-empty">
              <span className="doctor-equipment-loadout-empty__icon">＋</span>
              <p>選擇醫師</p>
            </div>
          )}
        </section>

        <section
          className="doctor-equipment-storage-pane"
          aria-label="器材庫"
          onDragOver={allowDrop}
          onDrop={(event) => void unequipDraggedItem(event)}
        >
          <div className="doctor-equipment-section-header">
            <h2>器材庫</h2>
            <span>{visibleDoctorEquipment.length} / {doctorEquipment.length}</span>
          </div>
          <section className="filter-bar doctor-equipment-filter-bar" aria-label="器材篩選">
            <label>
              排序
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
                <option value="newest">最新</option>
                <option value="rarity">稀有度</option>
                <option value="category">類型</option>
                <option value="equipped">裝備狀態</option>
              </select>
            </label>
            <label>
              稀有度
              <select value={rarityFilter} onChange={(event) => setRarityFilter(event.target.value as Rarity | 'all')}>
                <option value="all">全部</option>
                {RARITY_ORDER.map((rarity) => (
                  <option key={rarity} value={rarity}>
                    {rarity} {DOCTOR_EQUIPMENT_RARITY_LABELS[rarity]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              類型
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as DoctorEquipmentCategory | 'all')}
              >
                <option value="all">全部</option>
                {CATEGORY_ORDER.map((category) => (
                  <option key={category} value={category}>
                    {DOCTOR_EQUIPMENT_CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              狀態
              <select value={equipFilter} onChange={(event) => setEquipFilter(event.target.value as EquipFilter)}>
                <option value="all">全部</option>
                <option value="available">未裝備</option>
                <option value="equipped">已裝備</option>
              </select>
            </label>
          </section>
          <div className="doctor-equipment-storage-grid">
            {visibleDoctorEquipment.length === 0 ? (
              <p className="doctor-equipment-page__empty">沒有符合條件的器材。</p>
            ) : (
              visibleDoctorEquipment.map((item) => {
                const doctor = item.equippedDoctorId ? doctorById.get(item.equippedDoctorId) : null
                return (
                  <DoctorEquipmentStorageCard
                    key={item.id}
                    item={item}
                    doctor={doctor ?? null}
                    disabled={actionBusy}
                    onClick={() => setSelectedItem(item)}
                    onDragStart={(event) => handleDragStart(event, item)}
                    onDragEnd={() => setDraggedItemId(null)}
                  />
                )
              })
            )}
          </div>
        </section>
      </section>

      {/* Supply box ceremony — shown immediately after a roll */}
      <DoctorEquipmentResultModal
        item={showCeremony && rollOutcome ? rollOutcome.doctorEquipment : null}
        wasPity={rollOutcome?.wasPity ?? false}
        onClose={() => {
          setShowCeremony(false)
          // Hand off to detail modal after ceremony
          if (rollOutcome) setSelectedItem(rollOutcome.doctorEquipment)
        }}
      />

      {currentSelectedItem && !showCeremony && (
        <DoctorEquipmentDetailModal
          item={currentSelectedItem}
          doctors={doctors}
          equippedDoctor={selectedEquippedDoctor}
          wasPity={selectedWasPity}
          availableParts={materials?.parts ?? 0}
          availableRevenue={counters?.revenue ?? 0}
          onAfterUpgrade={(doctorEquipmentItem, message) => {
            setSelectedItem(doctorEquipmentItem)
            setToast(message)
          }}
          onAfterDismantle={(message) => {
            setSelectedItem(null)
            setRollOutcome(null)
            setToast(message)
          }}
          onClose={() => {
            setSelectedItem(null)
            setRollOutcome(null)
          }}
        />
      )}
    </main>
  )
}

interface DoctorRosterButtonProps {
  doctor: DoctorRow
  doctorEquipment: DoctorEquipmentRow | null
  selected: boolean
  onClick: () => void
}

function DoctorRosterButton({ doctor, doctorEquipment, selected, onClick }: DoctorRosterButtonProps) {
  const spriteUrl = lookupSprite(doctor.spriteKey, THEME_PIXEL_HOSPITAL.sprites, doctor.rarity)
  const meta = doctorEquipment ? describeDoctorEquipment(doctorEquipment) : null

  return (
    <button
      type="button"
      className="doctor-equipment-roster-row"
      aria-pressed={selected}
      style={{ ['--rarity-color' as string]: `var(--rarity-${doctor.rarity.toLowerCase()})` }}
      onClick={onClick}
    >
      <span className="doctor-equipment-roster-row__sprite">
        {spriteUrl ? <img src={spriteUrl} alt="" /> : <span aria-hidden>🩺</span>}
      </span>
      <span className="doctor-equipment-roster-row__body">
        <strong>{doctor.name}</strong>
        <small>{doctor.rarity} {RARITY_LABELS[doctor.rarity]} · {doctor.subjectId}</small>
      </span>
      <span className="doctor-equipment-roster-row__gear">
        {doctorEquipment && meta ? (
          <DoctorEquipmentIcon category={doctorEquipment.category} rarity={doctorEquipment.rarity} />
        ) : (
          <span aria-hidden>＋</span>
        )}
      </span>
    </button>
  )
}

interface SelectedDoctorPanelProps {
  doctor: DoctorRow
  doctorEquipment: DoctorEquipmentRow | null
  actionBusy: boolean
  onDropDoctorEquipment: (event: DragEvent<HTMLElement>) => void
  onAllowDrop: (event: DragEvent<HTMLElement>) => void
  onDragStart: (event: DragEvent<HTMLElement>, item: DoctorEquipmentRow) => void
  onDragEnd: () => void
  onUnequip: () => void
}

function SelectedDoctorPanel({
  doctor,
  doctorEquipment,
  actionBusy,
  onDropDoctorEquipment,
  onAllowDrop,
  onDragStart,
  onDragEnd,
  onUnequip,
}: SelectedDoctorPanelProps) {
  const spriteUrl = lookupSprite(doctor.spriteKey, THEME_PIXEL_HOSPITAL.sprites, doctor.rarity)

  return (
    <>
      <div
        className="doctor-equipment-selected-doctor"
        style={{ ['--rarity-color' as string]: `var(--rarity-${doctor.rarity.toLowerCase()})` }}
      >
        <div className="doctor-equipment-selected-doctor__sprite">
          {spriteUrl ? <img src={spriteUrl} alt="" /> : <span aria-hidden>🩺</span>}
        </div>
        <div>
          <h2>{doctor.name}</h2>
          <p>{doctor.rarity} {RARITY_LABELS[doctor.rarity]} · {doctor.subjectId}</p>
        </div>
      </div>

      <div className="doctor-equipment-slot-board">
        {DOCTOR_EQUIPMENT_SLOTS.map((slot) => (
          <DoctorEquipmentSlot
            key={slot.id}
            label={slot.label}
            doctorEquipment={doctorEquipment}
            disabled={actionBusy}
            onDropDoctorEquipment={onDropDoctorEquipment}
            onAllowDrop={onAllowDrop}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onUnequip={onUnequip}
          />
        ))}
      </div>
    </>
  )
}

interface DoctorEquipmentSlotProps {
  label: string
  doctorEquipment: DoctorEquipmentRow | null
  disabled: boolean
  onDropDoctorEquipment: (event: DragEvent<HTMLElement>) => void
  onAllowDrop: (event: DragEvent<HTMLElement>) => void
  onDragStart: (event: DragEvent<HTMLElement>, item: DoctorEquipmentRow) => void
  onDragEnd: () => void
  onUnequip: () => void
}

function DoctorEquipmentSlot({
  label,
  doctorEquipment,
  disabled,
  onDropDoctorEquipment,
  onAllowDrop,
  onDragStart,
  onDragEnd,
  onUnequip,
}: DoctorEquipmentSlotProps) {
  const meta = doctorEquipment ? describeDoctorEquipment(doctorEquipment) : null

  return (
    <section
      className={`doctor-equipment-slot-dropzone${doctorEquipment ? ' doctor-equipment-slot-dropzone--filled' : ''}`}
      aria-label={label}
      onDragOver={onAllowDrop}
      onDrop={onDropDoctorEquipment}
      style={doctorEquipment ? { ['--rarity-color' as string]: `var(--rarity-${doctorEquipment.rarity.toLowerCase()})` } : undefined}
    >
      <span className="doctor-equipment-slot-dropzone__label">{label}</span>
      {doctorEquipment && meta ? (
        <button
          type="button"
          className="doctor-equipment-slot-item"
          draggable={!disabled}
          disabled={disabled}
          onClick={onUnequip}
          onDragStart={(event) => onDragStart(event, doctorEquipment)}
          onDragEnd={onDragEnd}
          style={{ ['--rarity-color' as string]: `var(--rarity-${doctorEquipment.rarity.toLowerCase()})` }}
        >
          <DoctorEquipmentIcon category={doctorEquipment.category} rarity={doctorEquipment.rarity} />
          <span>
            <strong>{doctorEquipment.rarity} {meta.name}</strong>
            <small>{DOCTOR_EQUIPMENT_CATEGORY_LABELS[doctorEquipment.category]}</small>
          </span>
        </button>
      ) : (
        <span className="doctor-equipment-slot-dropzone__empty">空欄位</span>
      )}
    </section>
  )
}

interface DoctorEquipmentStorageCardProps {
  item: DoctorEquipmentRow
  doctor: DoctorRow | null
  disabled: boolean
  onClick: () => void
  onDragStart: (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
}

function DoctorEquipmentStorageCard({
  item,
  doctor,
  disabled,
  onClick,
  onDragStart,
  onDragEnd,
}: DoctorEquipmentStorageCardProps) {
  const meta = describeDoctorEquipment(item)
  const hasHeroArt = hasDoctorEquipmentHeroArt(item)

  return (
    <button
      type="button"
      className={`doctor-equipment-storage-card${item.rarity === 'P1' ? ' doctor-equipment-storage-card--p1' : ''}${hasHeroArt ? ' doctor-equipment-storage-card--hero' : ''}`}
      draggable={!disabled}
      disabled={disabled}
      onClick={onClick}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{ ['--rarity-color' as string]: `var(--rarity-${item.rarity.toLowerCase()})` }}
    >
      <DoctorEquipmentArtwork item={item} />
      <span className="doctor-equipment-storage-card__body">
        <strong>{item.rarity} {meta.name}</strong>
        <small>{DOCTOR_EQUIPMENT_CATEGORY_LABELS[item.category]} · {DOCTOR_EQUIPMENT_RARITY_LABELS[item.rarity]}</small>
        <span>{doctor ? doctor.name : '未裝備'}</span>
      </span>
    </button>
  )
}

interface DoctorEquipmentSpriteTunerProps {
  category: DoctorEquipmentCategory
  layout: SpriteLayout
  onCategoryChange: (category: DoctorEquipmentCategory) => void
  onChange: (layout: SpriteLayout) => void
}

function DoctorEquipmentSpriteTuner({ category, layout, onCategoryChange, onChange }: DoctorEquipmentSpriteTunerProps) {
  function updateField(field: keyof SpriteLayout, value: number) {
    onChange({ ...layout, [field]: value })
  }

  return (
    <section className="doctor-equipment-sprite-tuner" aria-label="器材圖示位置調整">
      <div className="doctor-equipment-sprite-tuner__preview">
        <DoctorEquipmentIcon category={category} rarity="P3" />
      </div>
      <div className="doctor-equipment-sprite-tuner__controls">
        <div className="doctor-equipment-sprite-tuner__header">
          <strong>Dev: 器材圖示位置</strong>
          <code>x={layout.x} y={layout.y} size={layout.size}</code>
        </div>
        <label>
          類型
          <select value={category} onChange={(event) => onCategoryChange(event.target.value as DoctorEquipmentCategory)}>
            {SPRITE_TUNER_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {DOCTOR_EQUIPMENT_CATEGORY_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <label>
          X
          <input
            type="range"
            min="0"
            max="16"
            step="0.5"
            value={layout.x}
            onChange={(event) => updateField('x', Number(event.target.value))}
          />
        </label>
        <label>
          Y
          <input
            type="range"
            min="0"
            max="12"
            step="0.5"
            value={layout.y}
            onChange={(event) => updateField('y', Number(event.target.value))}
          />
        </label>
        <label>
          Size
          <input
            type="range"
            min="34"
            max="52"
            step="0.5"
            value={layout.size}
            onChange={(event) => updateField('size', Number(event.target.value))}
          />
        </label>
        <button
          type="button"
          className="ghost-btn"
          onClick={() => onChange(category === 'stethoscope' ? DEFAULT_STETHOSCOPE_SPRITE_LAYOUT : getDoctorEquipmentSpriteLayout(category, {}))}
        >
          Reset
        </button>
      </div>
    </section>
  )
}

function describeUpgradeAbort(result: Extract<DoctorEquipmentUpgradeResult, { kind: 'aborted' }>): string {
  switch (result.reason) {
    case 'not-found':
      return '找不到這件器材'
    case 'unsupported-category':
      return '此類器材尚未開放升級'
    case 'terminal-rarity':
      return '已達 P1 傳說級'
    case 'missing-definition':
      return '缺少下一階器材定義'
    case 'insufficient-parts':
      return `零件不足（需要 ${fmt(result.requiredParts)}）`
    case 'insufficient-revenue':
      return `營收不足（需要 ${fmt(result.requiredRevenue)} 💰）`
  }
}

function describeDismantleAbort(result: Extract<DoctorEquipmentDismantleResult, { kind: 'aborted' }>): string {
  switch (result.reason) {
    case 'not-found':
      return '找不到這件器材'
    case 'equipped':
      return '已裝備的器材需先卸下才能拆解'
  }
}

interface DoctorEquipmentDetailModalProps {
  item: DoctorEquipmentRow
  doctors: DoctorRow[]
  equippedDoctor: DoctorRow | null
  wasPity: boolean
  availableParts: number
  availableRevenue: number
  onAfterUpgrade: (item: DoctorEquipmentRow, message: string) => void
  onAfterDismantle: (message: string) => void
  onClose: () => void
}

function DoctorEquipmentDetailModal({
  item,
  doctors,
  equippedDoctor,
  wasPity,
  availableParts,
  availableRevenue,
  onAfterUpgrade,
  onAfterDismantle,
  onClose,
}: DoctorEquipmentDetailModalProps) {
  const meta = describeDoctorEquipment(item)
  const [pendingDoctorId, setPendingDoctorId] = useState<string | null>(null)
  const [isUnequipping, setIsUnequipping] = useState(false)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [isDismantling, setIsDismantling] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const nextRarity = getNextDoctorEquipmentRarity(item.rarity)
  const nextDefinition = getNextDoctorEquipmentDefinition(item.category, item.rarity)
  const upgradeCost =
    item.rarity === 'P1' ? null : DOCTOR_EQUIPMENT_UPGRADE_COSTS[item.rarity as DoctorEquipmentUpgradeSourceRarity]
  const canShowUpgrade = isUpgradeableDoctorEquipmentCategory(item.category)
  const upgradeDisabledReason =
    !canShowUpgrade
      ? '此類器材尚未開放升級'
      : item.rarity === 'P1'
        ? '已達 P1 傳說級'
        : !nextDefinition
          ? '缺少下一階器材定義'
          : upgradeCost && availableParts < upgradeCost.parts
            ? `零件不足（需要 ${fmt(upgradeCost.parts)}）`
            : upgradeCost && availableRevenue < upgradeCost.revenue
              ? `營收不足（需要 ${fmt(upgradeCost.revenue)} 💰）`
              : null
  const partsFromDismantle = DOCTOR_EQUIPMENT_PARTS_BY_RARITY[item.rarity]
  const busy = pendingDoctorId !== null || isUnequipping || isUpgrading || isDismantling

  async function handleEquip(doctorId: string) {
    if (busy) return
    setPendingDoctorId(doctorId)
    setActionMessage(null)
    try {
      await equipDoctorEquipmentItem(item.id, doctorId)
    } finally {
      setPendingDoctorId(null)
    }
  }

  async function handleUnequip() {
    if (busy) return
    setIsUnequipping(true)
    setActionMessage(null)
    try {
      await unequipDoctorEquipmentItem(item.id)
    } finally {
      setIsUnequipping(false)
    }
  }

  async function handleUpgrade() {
    if (busy || upgradeDisabledReason) return
    setIsUpgrading(true)
    setActionMessage(null)
    try {
      const result = await upgradeDoctorEquipment(item.id)
      if (result.kind === 'success') {
        const upgradedMeta = describeDoctorEquipment(result.doctorEquipment)
        onAfterUpgrade(
          result.doctorEquipment,
          `${upgradedMeta.name} 已升級為 ${result.toRarity}（-${fmt(result.partsSpent)} 零件 / -${fmt(result.revenueSpent)} 💰）`,
        )
        return
      }
      setActionMessage(describeUpgradeAbort(result))
    } finally {
      setIsUpgrading(false)
    }
  }

  async function handleDismantle() {
    if (busy || equippedDoctor) return
    const isHighRarity = item.rarity === 'P1' || item.rarity === 'P2'
    const message = isHighRarity
      ? `確定要拆解 ${item.rarity} ${meta.name}？高稀有度器材很難再取得，拆解後無法復原。`
      : `確定要拆解 ${item.rarity} ${meta.name}？拆解後無法復原。`
    if (typeof window !== 'undefined' && !window.confirm(message)) return

    setIsDismantling(true)
    setActionMessage(null)
    try {
      const result = await dismantleDoctorEquipment(item.id)
      if (result.kind === 'success') {
        onAfterDismantle(`${meta.name} 已拆解，獲得 ${fmt(result.partsGained)} 零件`)
        return
      }
      setActionMessage(describeDismantleAbort(result))
    } finally {
      setIsDismantling(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card doctor-equipment-detail"
        style={{ ['--rarity-color' as string]: `var(--rarity-${item.rarity.toLowerCase()})` }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__rarity">
          <span className="modal-card__rarity-tier">{item.rarity}</span>
          <span className="modal-card__rarity-label">{DOCTOR_EQUIPMENT_RARITY_LABELS[item.rarity]}</span>
          {wasPity && <span className="modal-card__pity">保底</span>}
        </div>
        <DoctorEquipmentArtwork item={item} className="doctor-equipment-detail__icon" />
        <h2 className="modal-card__name">{meta.name}</h2>
        <p className="doctor-equipment-detail__category">
          {DOCTOR_EQUIPMENT_CATEGORY_LABELS[item.category]} · {RARITY_LABELS[item.rarity]}
        </p>
        <p className="doctor-equipment-detail__effect">{meta.effectText}</p>

        <section className="doctor-equipment-detail__upgrade" aria-label="器材升級">
          <h3>器材升級</h3>
          {canShowUpgrade && nextRarity && nextDefinition && upgradeCost ? (
            <>
              <div className="doctor-equipment-upgrade-preview">
                <span>
                  目前 <strong>{item.rarity}</strong>
                </span>
                <span aria-hidden>→</span>
                <span>
                  下一階 <strong>{nextRarity}</strong> {nextDefinition.name}
                </span>
              </div>
              <p className="doctor-equipment-detail__effect">{nextDefinition.effectText}</p>
              <div className="doctor-equipment-upgrade-costs" aria-label="升級成本">
                <span>⚙ {fmt(availableParts)} / {fmt(upgradeCost.parts)}</span>
                <span>💰 {fmt(availableRevenue)} / {fmt(upgradeCost.revenue)}</span>
              </div>
              <button
                type="button"
                className="primary-btn doctor-equipment-upgrade-btn"
                disabled={busy || upgradeDisabledReason !== null}
                onClick={() => void handleUpgrade()}
              >
                {isUpgrading ? '升級中...' : `升級到 ${nextRarity}`}
              </button>
            </>
          ) : (
            <p className="doctor-equipment-upgrade-terminal">{upgradeDisabledReason}</p>
          )}
          {upgradeDisabledReason && canShowUpgrade && item.rarity !== 'P1' && (
            <p className="doctor-equipment-detail__status" role="status">{upgradeDisabledReason}</p>
          )}
        </section>

        <section className="doctor-equipment-detail__equip-list" aria-label="裝備給醫師">
          <h3>裝備對象</h3>
          {doctors.length === 0 ? (
            <p className="doctor-equipment-page__empty">尚未招募醫師。</p>
          ) : (
            doctors.map((doctor) => (
              <button
                key={doctor.id}
                type="button"
                className="doctor-equipment-detail__doctor-btn"
                aria-pressed={equippedDoctor?.id === doctor.id}
                disabled={busy}
                onClick={() => void handleEquip(doctor.id)}
              >
                <span>{doctor.name}</span>
                <span>
                  {pendingDoctorId === doctor.id ? '裝備中...' : `${doctor.rarity} · ${doctor.subjectId}`}
                </span>
              </button>
            ))
          )}
        </section>

        {actionMessage && <p className="doctor-equipment-detail__status" role="alert">{actionMessage}</p>}

        <div className="doctor-equipment-detail__actions">
          {equippedDoctor && (
            <button
              type="button"
              className="ghost-btn"
              disabled={busy}
              onClick={() => void handleUnequip()}
            >
              {isUnequipping ? '卸下中...' : '卸下'}
            </button>
          )}
          <button
            type="button"
            className="ghost-btn doctor-equipment-dismantle-btn"
            disabled={busy || equippedDoctor !== null}
            title={equippedDoctor ? '已裝備的器材需先卸下才能拆解' : `拆解取得 ${fmt(partsFromDismantle)} 零件`}
            onClick={() => void handleDismantle()}
          >
            {isDismantling ? '拆解中...' : `拆解 +${fmt(partsFromDismantle)} ⚙`}
          </button>
          <button type="button" className="modal-card__close" onClick={onClose}>
            收下
          </button>
        </div>
      </div>
    </div>
  )
}
