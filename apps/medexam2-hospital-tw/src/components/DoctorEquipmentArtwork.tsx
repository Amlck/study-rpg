import type { DoctorEquipmentRow } from '../db/schema'
import epitaphHero from '../assets/doctor-equipment/p1-epitaph-crimson-pulse.png'
import mantleHero from '../assets/doctor-equipment/p1-mantle-white-tower.png'
import severanceHero from '../assets/doctor-equipment/p1-severance-ephemeral.png'
import shacklesHero from '../assets/doctor-equipment/p1-shackles-resident.png'
import { DoctorEquipmentIcon } from './DoctorEquipmentIcon'

interface DoctorEquipmentArtworkProps {
  item: DoctorEquipmentRow
  className?: string
}

const P1_HERO_ART: Partial<Record<string, string>> = {
  'oracle-stethoscope': epitaphHero,
  'shadowless-scalpel': severanceHero,
  'chief-rounding-chart': shacklesHero,
  'founder-white-coat': mantleHero,
}

export function hasDoctorEquipmentHeroArt(item: DoctorEquipmentRow): boolean {
  return item.rarity === 'P1' && Boolean(P1_HERO_ART[item.definitionId])
}

export function DoctorEquipmentArtwork({ item, className }: DoctorEquipmentArtworkProps) {
  const heroArt = item.rarity === 'P1' ? P1_HERO_ART[item.definitionId] : undefined

  if (heroArt) {
    return (
      <img
        className={`doctor-equipment-artwork doctor-equipment-artwork--hero ${className ?? ''}`}
        src={heroArt}
        alt=""
        draggable={false}
      />
    )
  }

  return (
    <DoctorEquipmentIcon
      category={item.category}
      rarity={item.rarity}
      className={`doctor-equipment-artwork doctor-equipment-artwork--icon ${className ?? ''}`}
    />
  )
}
