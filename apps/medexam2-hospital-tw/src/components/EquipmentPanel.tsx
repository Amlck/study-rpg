/**
 * EquipmentPanel — Hospital page section housing the 10 equipment cards.
 *
 * Added by add-hospital-equipment-medexam2 (2026-05-24).
 * - Subscribes to db.hospitalEquipment via useLiveQuery (reactive)
 * - Renders 10 EquipmentCard in a responsive grid (5-col desktop, 2-col mobile)
 * - Collapsible section; default expanded for tier ≥ 區域醫院, collapsed at 診所
 * - Owns the purchase confirmation modal state
 *
 * Spec: openspec/changes/add-hospital-equipment-medexam2/specs/hospital-equipment/spec.md
 *       Requirement "Equipment UI SHALL render as a panel on the Hospital page"
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { EQUIPMENT_CATALOG, type HospitalTier } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'
import { purchaseOrUpgrade, type PurchaseResult } from '../services/equipment-purchase'
import { EquipmentCard } from './EquipmentCard'
import { EquipmentUpgradeModal } from './EquipmentUpgradeModal'
import { EmojiIcon } from './EmojiIcon'

interface EquipmentPanelProps {
  tier: HospitalTier
}

export function EquipmentPanel({ tier }: EquipmentPanelProps) {
  const db = getHospitalDB()
  const owned = useLiveQuery(() => db.hospitalEquipment.toArray(), []) ?? []
  const counters = useLiveQuery(() => db.gameCounters.get('singleton'), [])
  const revenue = counters?.revenue ?? 0

  // Default collapsed at T1 (診所), expanded at T2+. Sync with tier prop on
  // first valid load (useLiveQuery returns undefined briefly → tier falls to
  // '診所' default → without this useEffect, T2+ saves would render collapsed
  // forever until manual toggle). Once user manually toggles, stop syncing.
  const [collapsed, setCollapsed] = useState<boolean>(true)
  const userToggledRef = useRef(false)
  useEffect(() => {
    if (!userToggledRef.current) {
      setCollapsed(tier === '診所')
    }
  }, [tier])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<PurchaseResult | null>(null)

  const ownedById = useMemo(() => {
    const map = new Map<string, (typeof owned)[number]>()
    for (const row of owned) map.set(row.equipmentId, row)
    return map
  }, [owned])

  const activeDefinition = activeId ? EQUIPMENT_CATALOG.find((d) => d.id === activeId) : null
  const activeOwned = activeId ? ownedById.get(activeId) : null
  const activeLevel = (activeOwned ? activeOwned.level : 0) as 0 | 1 | 2 | 3

  async function handleConfirm() {
    if (!activeDefinition) return
    setBusy(true)
    try {
      const result = await purchaseOrUpgrade(activeDefinition.id)
      setOutcome(result)
      if (result.kind === 'success') {
        setActiveId(null)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="hospital-equipment-section">
      <header
        className="hospital-equipment-section__header"
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        onClick={() => {
          userToggledRef.current = true
          setCollapsed((v) => !v)
        }}
      >
        <h2 style={{ margin: 0 }}>
          <EmojiIcon char="🏥" size={18} /> 設備
        </h2>
        <span className="muted" style={{ fontSize: 14 }}>
          {collapsed ? '（點擊展開）' : '（點擊收合）'} · 已擁有 {owned.length} / 10
        </span>
      </header>

      {!collapsed && (
        <div
          className="hospital-equipment-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
            marginTop: 12,
          }}
        >
          {EQUIPMENT_CATALOG.map((def) => {
            const ownedRow = ownedById.get(def.id) ?? null
            return (
              <EquipmentCard
                key={def.id}
                definition={def}
                ownedRow={ownedRow}
                busy={busy}
                onUpgradeClick={() => {
                  setActiveId(def.id)
                  setOutcome(null)
                }}
              />
            )
          })}
        </div>
      )}

      {activeDefinition && (
        <EquipmentUpgradeModal
          definition={activeDefinition}
          currentLevel={activeLevel}
          revenue={revenue}
          isOpen={true}
          busy={busy}
          onConfirm={handleConfirm}
          onClose={() => {
            setActiveId(null)
            setOutcome(null)
          }}
        />
      )}

      {outcome && outcome.kind === 'aborted' && (
        <div
          className="modal-backdrop"
          onClick={() => setOutcome(null)}
          role="presentation"
        >
          <div
            className="modal frame"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h2 className="modal__title">操作未完成</h2>
            {outcome.reason === 'insufficient-revenue' && (
              <p>
                營收不足，需要 {outcome.requiredRevenue?.toLocaleString('zh-TW')}{' '}
                <EmojiIcon char="💰" size={14} />
              </p>
            )}
            {outcome.reason === 'already-max' && <p>該設備已達最高等級 L3。</p>}
            {outcome.reason === 'unknown-equipment' && <p>未知的設備 ID。</p>}
            <div className="modal__actions">
              <button type="button" className="primary-btn" onClick={() => setOutcome(null)}>
                好
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
