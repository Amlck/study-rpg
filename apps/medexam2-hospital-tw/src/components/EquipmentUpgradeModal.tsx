/**
 * EquipmentUpgradeModal — confirmation modal for purchase / upgrade.
 *
 * Added by add-hospital-equipment-medexam2 (2026-05-24).
 * Spec: shows current → next level transition + cost + projected bonuses,
 *       then calls purchaseOrUpgrade() via parent's onConfirm callback.
 */

import { useEffect } from 'react'
import type { EquipmentDef } from '@study-rpg/core'
import { EmojiIcon } from './EmojiIcon'

interface EquipmentUpgradeModalProps {
  definition: EquipmentDef
  currentLevel: 0 | 1 | 2 | 3
  revenue: number
  isOpen: boolean
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}

function fmt(n: number): string {
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
}

export function EquipmentUpgradeModal({
  definition,
  currentLevel,
  revenue,
  isOpen,
  busy,
  onConfirm,
  onClose,
}: EquipmentUpgradeModalProps) {
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const isMax = currentLevel === 3
  const nextLevel = (isMax ? 3 : currentLevel + 1) as 1 | 2 | 3
  const cost = isMax ? 0 : definition.costByLevel[nextLevel - 1]
  const canAfford = revenue >= cost
  const newRepBonus = isMax
    ? definition.reputationBonusByLevel[2]
    : definition.reputationBonusByLevel[nextLevel - 1]
  const newTpBonus = isMax
    ? definition.throughputBonusByLevel[2]
    : definition.throughputBonusByLevel[nextLevel - 1]

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal frame"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-upgrade-modal__title"
      >
        <h2 id="equipment-upgrade-modal__title" className="modal__title">
          {currentLevel === 0 ? '購買設備' : '升級設備'}：{definition.displayName}
        </h2>

        <p>{definition.description}</p>

        {isMax ? (
          <p className="muted">已達最高等級 L3，無法再升級。</p>
        ) : (
          <>
            <p>
              <strong>L{currentLevel}</strong> → <strong>L{nextLevel}</strong>
            </p>
            <p>
              成本：<strong>{fmt(cost)}</strong> <EmojiIcon char="💰" size={14} />
              <span className="muted"> （目前營收 {fmt(revenue)}）</span>
            </p>
            <p>
              升級後加成：
              <strong>+{(newRepBonus * 100).toFixed(0)}%</strong> 聲望增益 /{' '}
              <strong>+{(newTpBonus * 100).toFixed(0)}%</strong> 病患吞吐
            </p>
            {!canAfford && (
              <p className="muted">
                營收不足，差 {fmt(cost - revenue)} <EmojiIcon char="💰" size={14} />
              </p>
            )}
          </>
        )}

        <div className="modal__actions">
          <button
            type="button"
            className="primary-btn"
            onClick={onConfirm}
            disabled={isMax || !canAfford || busy}
          >
            {busy ? '處理中…' : isMax ? '已最大' : currentLevel === 0 ? '購買' : '升級'}
          </button>
          <button type="button" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
