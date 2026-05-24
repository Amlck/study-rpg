/**
 * SubjectBadgeSprite — render one of 14 medical specialty cells from the
 * subject mastery atlas (7×2 grid, all P2 GOLD base + unique icon).
 *
 * Atlas asset: `assets/achievements/subject-atlas.png` (896×256, 128px cells).
 * Mapping per achievement-system spec §"Subject mastery atlas (7×2 grid)".
 */

import subjectAtlas from '../assets/achievements/subject-atlas.png'

import type { SubjectId } from '@study-rpg/core'

/** [col, row] in 7×2 grid. */
const SUBJECT_TO_CELL: Record<SubjectId, [number, number]> = {
  內科: [0, 0],
  家醫科: [1, 0],
  小兒科: [2, 0],
  皮膚科: [3, 0],
  神經內科: [4, 0],
  精神科: [5, 0],
  麻醉科: [6, 0],
  外科: [0, 1],
  泌尿科: [1, 1],
  骨科: [2, 1],
  婦產科: [3, 1],
  復健科: [4, 1],
  眼科: [5, 1],
  耳鼻喉科: [6, 1],
}

export interface SubjectBadgeSpriteProps {
  subjectId: SubjectId
  size?: number
  className?: string
}

export function SubjectBadgeSprite({
  subjectId,
  size = 24,
  className,
}: SubjectBadgeSpriteProps) {
  const cell = SUBJECT_TO_CELL[subjectId]
  if (!cell) return null
  const [col, row] = cell
  const label = `${subjectId}達人勳章`
  return (
    <span
      className={`subject-badge-sprite ${className ?? ''}`}
      role="img"
      aria-label={label}
      title={label}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        backgroundImage: `url(${subjectAtlas})`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
        backgroundSize: `${7 * size}px ${2 * size}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
      }}
    />
  )
}
