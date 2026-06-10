import { useState } from 'react'
import {
  getAffinityBonus,
  ROOM_TYPE_LABELS,
  SUBJECT_TO_ROOM,
  type Room,
} from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { lookupSprite } from '../lib/sprite-lookup'
import type { DoctorRow, EquipmentRow } from '../db/schema'
import { describeEquipment, getEquipmentBonus } from '../services/equipment'
import {
  ROOM_SUPPORT_ROLE_LABELS,
  SUPPORT_THROUGHPUT_SHARE,
  computeRoomTeamThroughput,
  computeSupportThroughput,
  getSupportRolesForRoom,
} from '../services/room-team'
import { EmojiIcon } from './EmojiIcon'

interface RoomCardProps {
  room: Room
  doctor: DoctorRow | null
  onClick: () => void
  /** Equipment currently worn by the assigned doctor, if any. */
  equipment?: EquipmentRow
  supportDoctors?: DoctorRow[]
  supportEquipmentMap?: Map<string, EquipmentRow>
}

function fmtMultiplier(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, '')
}

function buildThroughputBreakdownParts(
  room: Room,
  doctor: DoctorRow | null,
  equipment: EquipmentRow | undefined,
  supportDoctors: ReadonlyArray<DoctorRow>,
  supportEquipmentMap: Map<string, EquipmentRow> | undefined,
): string[] {
  if (!doctor) return ['尚未指派醫師。']

  const doctorMultiplier = doctor.powerMultiplier
  const facilityMultiplier = room.roomFacility
  const affinityMultiplier = getAffinityBonus(doctor.rarity, doctor.subjectId, room.type)
  const equipmentMultiplier = getEquipmentBonus(equipment, room.type)
  const parts = [
    `基礎 ${room.baseRate.toFixed(1)}`,
    `醫師 ×${fmtMultiplier(doctorMultiplier)}（${doctor.rarity}）`,
    `設施 ×${fmtMultiplier(facilityMultiplier)}（Lv.${room.facilityLevel ?? 1}）`,
  ]

  if (affinityMultiplier > 1) {
    parts.push(`科別適性 ×${fmtMultiplier(affinityMultiplier)}（${doctor.subjectId} → ${ROOM_TYPE_LABELS[room.type]}）`)
  }

  if (equipmentMultiplier > 1 && equipment) {
    parts.push(`器材 ×${fmtMultiplier(equipmentMultiplier)}（${describeEquipment(equipment).name}）`)
  }

  for (const supportDoctor of supportDoctors) {
    parts.push(
      `支援 ${supportDoctor.name} +${computeSupportThroughput(
        room,
        supportDoctor,
        supportEquipmentMap?.get(supportDoctor.id),
      ).toFixed(1)}（${Math.round(SUPPORT_THROUGHPUT_SHARE * 100)}%）`,
    )
  }

  return [
    ...parts,
    `= ${computeRoomTeamThroughput(room, doctor, supportDoctors, equipment, supportEquipmentMap).toFixed(1)} 患者/分`,
  ]
}

export function RoomCard({
  room,
  doctor,
  onClick,
  equipment,
  supportDoctors = [],
  supportEquipmentMap,
}: RoomCardProps) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const equipmentBonus = getEquipmentBonus(equipment, room.type)
  const throughput = computeRoomTeamThroughput(room, doctor, supportDoctors, equipment, supportEquipmentMap)
  const isAffinityMatch = doctor !== null && SUBJECT_TO_ROOM[doctor.subjectId] === room.type
  const affinityBonus = isAffinityMatch && doctor ? getAffinityBonus(doctor.rarity, doctor.subjectId, room.type) : null
  const supportRoles = getSupportRolesForRoom(room)
  const supportCapacity = supportRoles.length
  const supportCount = supportDoctors.length
  const throughputBreakdownParts = buildThroughputBreakdownParts(
    room,
    doctor,
    equipment,
    supportDoctors,
    supportEquipmentMap,
  )
  const throughputBreakdown = throughputBreakdownParts.join(' × ')
  const spriteUrl = doctor
    ? lookupSprite(doctor.spriteKey, THEME_PIXEL_HOSPITAL.sprites, doctor.rarity)
    : undefined

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        }
      }}
      className={`room-card ${doctor ? 'room-card--assigned' : 'room-card--empty'}`}
      style={
        doctor
          ? ({ ['--rarity-color' as string]: `var(--rarity-${doctor.rarity.toLowerCase()})` } as React.CSSProperties)
          : undefined
      }
      aria-label={doctor ? `${ROOM_TYPE_LABELS[room.type]} #${room.slot}，已指派 ${doctor.name}` : `${ROOM_TYPE_LABELS[room.type]} #${room.slot}，空著`}
    >
      <header className="room-card__head">
        <span className="room-card__type">{ROOM_TYPE_LABELS[room.type]}</span>
        <span className="room-card__slot">#{room.slot}</span>
      </header>

      <div className="room-card__sprite">
        {doctor && spriteUrl ? (
          <img src={spriteUrl} alt="" className="room-card__sprite-img" />
        ) : doctor ? (
          <EmojiIcon char="🩺" size={28} />
        ) : (
          <span className="room-card__empty-icon" aria-hidden>＋</span>
        )}
      </div>

      <div className="room-card__name">
        {doctor ? doctor.name : '指派醫師'}
      </div>

      {supportCapacity > 0 && (
        <div className={`room-card__support ${supportCount > 0 ? 'room-card__support--filled' : ''}`}>
          <span>
            {supportCapacity === 1 ? ROOM_SUPPORT_ROLE_LABELS[supportRoles[0]] : `支援 ${supportCount}/${supportCapacity}`}
          </span>
          <strong>{supportCount > 0 ? supportDoctors.map((supportDoctor) => supportDoctor.name).join('、') : '空缺'}</strong>
        </div>
      )}

      <button
        type="button"
        className="room-card__throughput"
        title={throughputBreakdown}
        aria-label={throughputBreakdown}
        aria-expanded={showBreakdown}
        onClick={(event) => {
          event.stopPropagation()
          setShowBreakdown((current) => !current)
        }}
      >
        <span className="room-card__throughput-value">{throughput.toFixed(1)}</span> 患者/分
        {affinityBonus !== null && (
          <span className="room-card__affinity" aria-label={`適性加成 ${affinityBonus} 倍`}>
            <EmojiIcon char="✨" size={14} />{affinityBonus.toFixed(1)}×
          </span>
        )}
        {equipmentBonus > 1 && equipment && (
          <span className="room-card__equipment-bonus" aria-label={`器材加成 ${equipmentBonus} 倍`}>
            <span aria-hidden>🧰</span>{fmtMultiplier(equipmentBonus)}×
          </span>
        )}
        {supportCount > 0 && (
          <span className="room-card__team-bonus" aria-label={`支援醫師 ${supportCount} 位`}>
            <span aria-hidden>⚕</span>+{supportCount}
          </span>
        )}
      </button>
      {showBreakdown && (
        <div className="room-card__breakdown" role="note">
          {throughputBreakdownParts.map((part, index) => (
            <span key={`${part}-${index}`}>{part}</span>
          ))}
        </div>
      )}
    </div>
  )
}
