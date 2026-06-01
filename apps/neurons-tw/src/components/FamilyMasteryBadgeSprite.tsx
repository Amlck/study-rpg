/**
 * Per-family per-mastery-tier badge — atlas-mode rendering.
 *
 * Atlas: `apps/neurons-tw/src/assets/achievements/family-mastery-atlas.png`
 * Layout: 1408×640 px = 11 columns × 5 rows × 128 px cells. Column index =
 * family id (alphabetical zh-TW sort), row index = mastery tier (P5 top fade
 * → P1 bottom diamond glow).
 *
 * Returns `null` when `masteryTier === 'none'` (insufficient attempts — no
 * tier badge applicable; consumer should not render a placeholder).
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import type { MasteryTier } from '../lib/mastery'
import familyMasteryAtlasUrl from '../assets/achievements/family-mastery-atlas.png'

export interface FamilyMasteryBadgeSpriteProps {
  familyId: string
  masteryTier: MasteryTier
  size?: number
}

/**
 * Alphabetical zh-TW family id → atlas column index. Locked per
 * `generate-neurons-achievement-atlases` Decision 4.
 * Future renames of a family id require atlas regen + this constant update.
 */
export const FAMILY_INDEX_BY_ID: Readonly<Record<string, number>> = Object.freeze({
  公共衛生學: 0,
  免疫學: 1,
  寄生蟲學: 2,
  微生物學: 3,
  病理學: 4,
  生物化學: 5,
  生理學: 6,
  組織學: 7,
  胚胎學: 8,
  解剖學: 9,
  藥理學: 10,
})

const TIER_ROW: Record<Exclude<MasteryTier, 'none'>, number> = {
  P5: 0,
  P4: 1,
  P3: 2,
  P2: 3,
  P1: 4,
}

const NUM_COLS = 11
const NUM_ROWS = 5

export function FamilyMasteryBadgeSprite({
  familyId,
  masteryTier,
  size = 40,
}: FamilyMasteryBadgeSpriteProps): JSX.Element | null {
  if (masteryTier === 'none') return null
  const col = FAMILY_INDEX_BY_ID[familyId]
  if (col === undefined) return null

  const row = TIER_ROW[masteryTier]
  // CSS background-position percentage formula for atlas with size=N*100%:
  // cell K → bg-position = K / (N-1) * 100% (positive). See BadgeSprite for
  // derivation comment.
  const xPct = NUM_COLS > 1 ? (col * 100) / (NUM_COLS - 1) : 0
  const yPct = NUM_ROWS > 1 ? (row * 100) / (NUM_ROWS - 1) : 0

  return (
    <div
      aria-label={`${familyId} mastery ${masteryTier}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${familyMasteryAtlasUrl})`,
        backgroundPosition: `${xPct}% ${yPct}%`,
        backgroundSize: `${NUM_COLS * 100}% ${NUM_ROWS * 100}%`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        flexShrink: 0,
        userSelect: 'none',
      }}
    />
  )
}
