/**
 * BadgeSprite — render one cell from the main 6×4 achievement badge atlas.
 *
 * Atlas layout (per achievement-system spec §"Main badge atlas (6×4 grid)"):
 *   - Rows (top→bottom, 6 categories): study / quiz / recruit / hospital
 *     / fortune / hidden
 *   - Cols (left→right, 4 tiers): P4 銅 / P3 銀 / P2 金 / P1 鑽石
 *
 * Atlas asset: `assets/achievements/badge-atlas.png` (512×768, 128px cells).
 * CSS background-position + background-size scale to caller's `size` prop.
 *
 * Tier P1 (鑽石) gets a subtle drop-shadow glow via `badge-sprite--P1` class
 * (styles.css to add). Sub-pixel scaling preserved via `image-rendering:
 * pixelated`.
 */

import badgeAtlas from '../assets/achievements/badge-atlas.png'

import type { AchievementCategory, AchievementTier } from '@study-rpg/core'

const CATEGORY_TO_ROW: Record<AchievementCategory, number> = {
  study: 0,
  quiz: 1,
  recruit: 2,
  hospital: 3,
  fortune: 4,
  hidden: 5,
  // `subject` doesn't appear in the main atlas — caller should route to
  // SubjectBadgeSprite instead. Falling back to 0 is a safety net.
  subject: 0,
}

const TIER_TO_COL: Record<AchievementTier, number> = {
  P4: 0,
  P3: 1,
  P2: 2,
  P1: 3,
}

export interface BadgeSpriteProps {
  category: AchievementCategory
  tier: AchievementTier
  /** Rendered side length in CSS pixels. Default 24 (leaderboard inline). */
  size?: number
  /** Optional accessible label override. Default: `<TIER> 級<CATEGORY>成就`. */
  ariaLabel?: string
  className?: string
}

const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  study: '學習',
  quiz: '答題',
  recruit: '招募',
  hospital: '經營',
  fortune: '時運',
  hidden: '隱藏',
  subject: '科別',
}

export function BadgeSprite({
  category,
  tier,
  size = 24,
  ariaLabel,
  className,
}: BadgeSpriteProps) {
  const row = CATEGORY_TO_ROW[category]
  const col = TIER_TO_COL[tier]
  const label = ariaLabel ?? `${tier} 級${CATEGORY_LABEL[category]}成就`
  return (
    <span
      className={`badge-sprite badge-sprite--${tier} ${className ?? ''}`}
      role="img"
      aria-label={label}
      title={label}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        backgroundImage: `url(${badgeAtlas})`,
        backgroundPosition: `-${col * size}px -${row * size}px`,
        backgroundSize: `${4 * size}px ${6 * size}px`,
        backgroundRepeat: 'no-repeat',
        imageRendering: 'pixelated',
      }}
    />
  )
}
