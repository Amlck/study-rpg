import type { CSSProperties } from 'react'
import type { Rarity } from '@study-rpg/content-medexam2-tw'
import type { EquipmentCategory } from '../data/equipment'

interface EquipmentIconProps {
  category: EquipmentCategory
  rarity: Rarity
  className?: string
}

function PixelStethoscope() {
  return (
    <g className="equipment-icon__sprite">
      <rect className="equipment-icon__metal" x="14" y="11" width="6" height="15" />
      <rect className="equipment-icon__metal" x="32" y="11" width="6" height="15" />
      <rect className="equipment-icon__dark" x="16" y="26" width="4" height="6" />
      <rect className="equipment-icon__dark" x="34" y="26" width="4" height="6" />
      <rect className="equipment-icon__accent" x="20" y="30" width="14" height="5" />
      <rect className="equipment-icon__accent" x="25" y="34" width="5" height="8" />
      <rect className="equipment-icon__dark" x="29" y="39" width="10" height="5" />
      <rect className="equipment-icon__accent" x="36" y="34" width="5" height="8" />
      <rect className="equipment-icon__light" x="16" y="12" width="3" height="4" />
      <rect className="equipment-icon__light" x="34" y="12" width="3" height="4" />
    </g>
  )
}

function PixelScalpel() {
  return (
    <g className="equipment-icon__sprite">
      <rect className="equipment-icon__dark" x="11" y="35" width="8" height="5" />
      <rect className="equipment-icon__accent" x="17" y="31" width="9" height="5" />
      <rect className="equipment-icon__accent" x="24" y="27" width="9" height="5" />
      <rect className="equipment-icon__accent" x="31" y="23" width="6" height="5" />
      <rect className="equipment-icon__metal" x="34" y="13" width="8" height="13" />
      <rect className="equipment-icon__light" x="36" y="14" width="4" height="5" />
      <rect className="equipment-icon__dark" x="39" y="22" width="4" height="4" />
    </g>
  )
}

function PixelChart() {
  return (
    <g className="equipment-icon__sprite">
      <rect className="equipment-icon__dark" x="15" y="10" width="24" height="34" />
      <rect className="equipment-icon__paper" x="18" y="13" width="18" height="27" />
      <rect className="equipment-icon__accent" x="21" y="17" width="12" height="4" />
      <rect className="equipment-icon__metal" x="21" y="25" width="11" height="3" />
      <rect className="equipment-icon__metal" x="21" y="31" width="13" height="3" />
      <rect className="equipment-icon__metal" x="21" y="37" width="8" height="3" />
      <rect className="equipment-icon__light" x="22" y="8" width="10" height="5" />
    </g>
  )
}

function PixelCoat() {
  return (
    <g className="equipment-icon__sprite">
      <rect className="equipment-icon__paper" x="18" y="10" width="16" height="8" />
      <rect className="equipment-icon__paper" x="13" y="17" width="13" height="27" />
      <rect className="equipment-icon__paper" x="28" y="17" width="13" height="27" />
      <rect className="equipment-icon__dark" x="24" y="18" width="5" height="26" />
      <rect className="equipment-icon__accent" x="18" y="29" width="7" height="4" />
      <rect className="equipment-icon__accent" x="31" y="29" width="7" height="4" />
      <rect className="equipment-icon__metal" x="18" y="12" width="16" height="3" />
    </g>
  )
}

function PixelTextbook() {
  return (
    <g className="equipment-icon__sprite">
      <rect className="equipment-icon__dark" x="12" y="12" width="28" height="32" />
      <rect className="equipment-icon__accent" x="15" y="13" width="20" height="28" />
      <rect className="equipment-icon__paper" x="19" y="18" width="13" height="4" />
      <rect className="equipment-icon__paper" x="19" y="26" width="10" height="3" />
      <rect className="equipment-icon__paper" x="19" y="32" width="12" height="3" />
      <rect className="equipment-icon__metal" x="35" y="15" width="3" height="25" />
    </g>
  )
}

function PixelCoffee() {
  return (
    <g className="equipment-icon__sprite">
      <rect className="equipment-icon__paper" x="14" y="22" width="22" height="17" />
      <rect className="equipment-icon__dark" x="35" y="26" width="7" height="8" />
      <rect className="equipment-icon__paper" x="37" y="28" width="3" height="4" />
      <rect className="equipment-icon__accent" x="18" y="26" width="14" height="6" />
      <rect className="equipment-icon__dark" x="16" y="39" width="19" height="4" />
      <rect className="equipment-icon__metal" x="18" y="14" width="3" height="5" />
      <rect className="equipment-icon__metal" x="25" y="10" width="3" height="7" />
      <rect className="equipment-icon__metal" x="32" y="14" width="3" height="5" />
    </g>
  )
}

export function EquipmentIcon({ category, rarity, className }: EquipmentIconProps) {
  const style = { ['--equipment-rarity-color' as string]: `var(--rarity-${rarity.toLowerCase()})` } as CSSProperties

  return (
    <svg
      className={`equipment-icon equipment-icon--${rarity.toLowerCase()} ${className ?? ''}`}
      style={style}
      viewBox="0 0 52 52"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="4" width="44" height="44" className="equipment-icon__frame" />
      <rect x="8" y="8" width="4" height="4" className="equipment-icon__corner" />
      <rect x="40" y="8" width="4" height="4" className="equipment-icon__corner" />
      <rect x="8" y="40" width="4" height="4" className="equipment-icon__corner" />
      <rect x="40" y="40" width="4" height="4" className="equipment-icon__corner" />
      {category === 'stethoscope' && <PixelStethoscope />}
      {category === 'scalpel' && <PixelScalpel />}
      {category === 'chart' && <PixelChart />}
      {category === 'coat' && <PixelCoat />}
      {category === 'textbook' && <PixelTextbook />}
      {category === 'coffee' && <PixelCoffee />}
    </svg>
  )
}
