/**
 * Category × tier achievement badge — atlas-mode rendering.
 *
 * Atlas: `apps/neurons-tw/src/assets/achievements/badge-atlas.png`
 * Layout: 896×512 px = 7 columns × 4 rows × 128 px cells (16-color GBA palette,
 * transparent bg). Column index = category, row index = tier (P4 top → P1
 * bottom). Atlas generated via codex CLI per `generate-neurons-achievement-
 * atlases` change.
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import type {
  NeuronsAchievementCategory,
  NeuronsAchievementTier,
} from '@study-rpg/content-neurons-tw'
import badgeAtlasUrl from '../assets/achievements/badge-atlas.png'

export interface BadgeSpriteProps {
  category: NeuronsAchievementCategory
  tier: NeuronsAchievementTier
  size?: number
  locked?: boolean
}

// Column index per category (atlas left-to-right ordering).
const CATEGORY_COL: Record<NeuronsAchievementCategory, number> = {
  study: 0,
  quiz: 1,
  variant: 2,
  synapse: 3,
  mastery: 4,
  fortune: 5,
  hidden: 6,
}

// Row index per tier (atlas top-to-bottom ordering — bronze P4 first, diamond P1 last).
const TIER_ROW: Record<NeuronsAchievementTier, number> = {
  P4: 0,
  P3: 1,
  P2: 2,
  P1: 3,
}

const NUM_COLS = 7
const NUM_ROWS = 4

export function BadgeSprite({
  category,
  tier,
  size = 48,
  locked = false,
}: BadgeSpriteProps): JSX.Element {
  const col = CATEGORY_COL[category]
  const row = TIER_ROW[tier]
  // CSS background-position percentage formula for sprite atlas: when
  // background-size is N*100% (atlas spans N container widths), cell K is at
  //   bg-position-x = K / (N-1) * 100%   (positive — NOT negative).
  // For N=1 single cell, position = 0%. Guard against div-by-zero.
  const xPct = NUM_COLS > 1 ? (col * 100) / (NUM_COLS - 1) : 0
  const yPct = NUM_ROWS > 1 ? (row * 100) / (NUM_ROWS - 1) : 0

  return (
    <div
      aria-label={`${category} achievement, tier ${tier}${locked ? ', locked' : ''}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${badgeAtlasUrl})`,
        backgroundPosition: `${xPct}% ${yPct}%`,
        backgroundSize: `${NUM_COLS * 100}% ${NUM_ROWS * 100}%`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
        flexShrink: 0,
        userSelect: 'none',
        filter: locked ? 'grayscale(80%) opacity(0.6)' : undefined,
      }}
    />
  )
}
