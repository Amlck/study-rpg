import type { Rarity } from '@study-rpg/content-medexam2-tw'
import type { EquipmentCategory } from '../data/equipment'

interface EquipmentIconProps {
  category: EquipmentCategory
  rarity: Rarity
  className?: string
}

function Stethoscope() {
  return (
    <>
      <rect x="14" y="10" width="4" height="16" />
      <rect x="30" y="10" width="4" height="16" />
      <rect x="18" y="24" width="12" height="4" />
      <rect x="22" y="28" width="4" height="8" />
      <rect x="26" y="34" width="10" height="4" />
      <rect x="34" y="30" width="4" height="4" />
    </>
  )
}

function Scalpel() {
  return (
    <>
      <rect x="12" y="32" width="8" height="4" />
      <rect x="18" y="28" width="8" height="4" />
      <rect x="24" y="24" width="8" height="4" />
      <rect x="30" y="18" width="4" height="8" />
      <rect x="34" y="12" width="6" height="10" />
    </>
  )
}

function Chart() {
  return (
    <>
      <rect x="14" y="10" width="24" height="32" />
      <rect x="18" y="14" width="16" height="4" fill="var(--bg-paper)" />
      <rect x="18" y="22" width="14" height="3" fill="var(--bg-paper)" />
      <rect x="18" y="29" width="16" height="3" fill="var(--bg-paper)" />
      <rect x="18" y="36" width="10" height="3" fill="var(--bg-paper)" />
    </>
  )
}

function Coat() {
  return (
    <>
      <rect x="18" y="10" width="16" height="6" />
      <rect x="14" y="16" width="10" height="26" />
      <rect x="28" y="16" width="10" height="26" />
      <rect x="24" y="18" width="4" height="24" fill="var(--bg-paper)" />
      <rect x="18" y="28" width="6" height="3" fill="var(--bg-paper)" />
      <rect x="30" y="28" width="5" height="3" fill="var(--bg-paper)" />
    </>
  )
}

function Textbook() {
  return (
    <>
      <rect x="12" y="12" width="26" height="30" />
      <rect x="16" y="16" width="18" height="4" fill="var(--bg-paper)" />
      <rect x="16" y="24" width="14" height="3" fill="var(--bg-paper)" />
      <rect x="16" y="31" width="16" height="3" fill="var(--bg-paper)" />
      <rect x="36" y="14" width="3" height="26" fill="var(--frame-dark)" />
    </>
  )
}

function Coffee() {
  return (
    <>
      <rect x="14" y="20" width="22" height="18" />
      <rect x="36" y="24" width="6" height="8" />
      <rect x="18" y="14" width="3" height="4" />
      <rect x="25" y="10" width="3" height="6" />
      <rect x="32" y="14" width="3" height="4" />
      <rect x="17" y="38" width="16" height="3" fill="var(--frame-dark)" />
    </>
  )
}

export function EquipmentIcon({ category, rarity, className }: EquipmentIconProps) {
  return (
    <svg
      className={`equipment-icon equipment-icon--${rarity.toLowerCase()} ${className ?? ''}`}
      viewBox="0 0 52 52"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="4" width="44" height="44" className="equipment-icon__frame" />
      <g className="equipment-icon__shape">
        {category === 'stethoscope' && <Stethoscope />}
        {category === 'scalpel' && <Scalpel />}
        {category === 'chart' && <Chart />}
        {category === 'coat' && <Coat />}
        {category === 'textbook' && <Textbook />}
        {category === 'coffee' && <Coffee />}
      </g>
    </svg>
  )
}
