/**
 * Category × tier achievement badge.
 *
 * PLACEHOLDER RENDERING — currently SVG-based color+letter combo while the
 * pixel-art `badge-atlas.png` is being generated via codex CLI (per
 * `image_gen_routing.md` / `codex_image_gen.md` recipe). Once the atlas ships
 * at `apps/neurons-tw/src/assets/achievements/badge-atlas.png` (896×512, 7×4
 * grid, 128 px cells), swap the implementation to CSS background-position
 * sprite atlas (per spec atlas requirement). Keep the public API the same so
 * the swap is a one-file change.
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import type {
  NeuronsAchievementCategory,
  NeuronsAchievementTier,
} from '@study-rpg/content-neurons-tw'

export interface BadgeSpriteProps {
  category: NeuronsAchievementCategory
  tier: NeuronsAchievementTier
  size?: number
  locked?: boolean
}

// Tier ring color — matches PSN Trophy convention.
const TIER_COLOR: Record<NeuronsAchievementTier, string> = {
  P1: '#b9f2ff', // 鑽石 / diamond
  P2: '#d4a04d', // 金 / gold
  P3: '#c0c0c0', // 銀 / silver
  P4: '#cd7f32', // 銅 / bronze
}

// Category emoji glyph — placeholder identity hint until pixel atlas ships.
const CATEGORY_GLYPH: Record<NeuronsAchievementCategory, string> = {
  study: '📖',
  quiz: '✓',
  variant: '🧬',
  synapse: '⚡',
  mastery: '🎓',
  fortune: '🎲',
  hidden: '✦',
}

export function BadgeSprite({
  category,
  tier,
  size = 48,
  locked = false,
}: BadgeSpriteProps): JSX.Element {
  const ring = TIER_COLOR[tier]
  const glyph = CATEGORY_GLYPH[category]
  const fillBg = locked ? '#3a3128' : '#f4ecd8'
  const fillFg = locked ? '#6a5d4a' : '#5a3f29'

  return (
    <div
      aria-label={`${category} achievement, tier ${tier}${locked ? ', locked' : ''}`}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        border: `${Math.max(2, Math.round(size / 16))}px solid ${locked ? '#5a4d3a' : ring}`,
        background: fillBg,
        color: fillFg,
        fontSize: Math.round(size * 0.5),
        lineHeight: 1,
        fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
        filter: locked ? 'grayscale(80%) opacity(0.7)' : undefined,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      <span>{glyph}</span>
    </div>
  )
}
