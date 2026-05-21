import type { EquipmentRow } from '../db/schema'
import { EquipmentIcon } from './EquipmentIcon'

interface EquipmentArtworkProps {
  item: EquipmentRow
  className?: string
}

// P1 hero art slots. Add generated transparent PNG imports here, then map by
// definitionId. Non-P1 items should keep using the compact sprite path.
const P1_HERO_ART: Partial<Record<string, string>> = {}

export function hasEquipmentHeroArt(item: EquipmentRow): boolean {
  return item.rarity === 'P1' && Boolean(P1_HERO_ART[item.definitionId])
}

export function EquipmentArtwork({ item, className }: EquipmentArtworkProps) {
  const heroArt = item.rarity === 'P1' ? P1_HERO_ART[item.definitionId] : undefined

  if (heroArt) {
    return (
      <img
        className={`equipment-artwork equipment-artwork--hero ${className ?? ''}`}
        src={heroArt}
        alt=""
        draggable={false}
      />
    )
  }

  return (
    <EquipmentIcon
      category={item.category}
      rarity={item.rarity}
      className={`equipment-artwork equipment-artwork--icon ${className ?? ''}`}
    />
  )
}
