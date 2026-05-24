/**
 * EquipmentCard — single equipment row in the Hospital page equipment grid.
 *
 * Added by add-hospital-equipment-medexam2 (2026-05-24).
 * Spec: openspec/changes/add-hospital-equipment-medexam2/specs/hospital-equipment/spec.md
 *       Requirement "Equipment UI SHALL render as a panel on the Hospital page"
 */

import type { EquipmentDef, OwnedEquipmentRow } from '@study-rpg/core'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { EmojiIcon } from './EmojiIcon'

interface EquipmentCardProps {
  definition: EquipmentDef
  ownedRow: OwnedEquipmentRow | null
  onUpgradeClick: () => void
  busy?: boolean
}

const PLACEHOLDER_EMOJI: Record<string, string> = {
  ct: '🏥',
  mri: '🧲',
  endoscopy: '🔬',
  davinci: '🤖',
  cathlab: '❤️',
  petct: '☢️',
  linac: '⚡',
  ecmo: '🫁',
  hybridor: '🏗️',
  ngs: '🧬',
}

function fmt(n: number): string {
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
}

export function EquipmentCard({ definition, ownedRow, onUpgradeClick, busy }: EquipmentCardProps) {
  const level = ownedRow ? ownedRow.level : 0
  const isMax = level === 3
  const nextLevel = isMax ? 3 : (level + 1) as 1 | 2 | 3
  const nextCost = isMax ? null : definition.costByLevel[nextLevel - 1]

  // Current bonus values (0% when level 0)
  const repBonus = level === 0 ? 0 : definition.reputationBonusByLevel[level - 1]
  const tpBonus = level === 0 ? 0 : definition.throughputBonusByLevel[level - 1]

  const spriteUrl = THEME_PIXEL_HOSPITAL.sprites[definition.spriteKey]
  const placeholderEmoji = PLACEHOLDER_EMOJI[definition.id] ?? '🔧'

  return (
    <div className="equipment-card frame" data-equipment-id={definition.id}>
      <div className="equipment-card__sprite" aria-hidden="true">
        {spriteUrl ? (
          <img
            src={spriteUrl}
            alt=""
            width={48}
            height={48}
            style={{ imageRendering: 'pixelated', display: 'block' }}
          />
        ) : (
          <span style={{ fontSize: 32, display: 'inline-block', lineHeight: 1 }}>
            {placeholderEmoji}
          </span>
        )}
      </div>
      <div className="equipment-card__body">
        <div className="equipment-card__header">
          <span className="equipment-card__name">{definition.displayName}</span>
          <span
            className={`equipment-card__level-chip equipment-card__level-chip--L${level}`}
            aria-label={`目前等級 L${level}`}
          >
            L{level}
          </span>
        </div>
        <p className="equipment-card__bonus muted">
          +{(repBonus * 100).toFixed(0)}% 聲望增益 / +{(tpBonus * 100).toFixed(0)}% 病患吞吐
        </p>
        <button
          type="button"
          className="primary-btn equipment-card__cta"
          onClick={onUpgradeClick}
          disabled={isMax || busy}
          title={isMax ? '已達最高等級 L3' : `升級到 L${nextLevel}，需要 ${fmt(nextCost!)} 💰`}
        >
          {isMax ? (
            '已達最高等級'
          ) : level === 0 ? (
            <>購買 ({fmt(nextCost!)} <EmojiIcon char="💰" size={12} />)</>
          ) : (
            <>升級 L{level} → L{nextLevel} ({fmt(nextCost!)} <EmojiIcon char="💰" size={12} />)</>
          )}
        </button>
      </div>
    </div>
  )
}
