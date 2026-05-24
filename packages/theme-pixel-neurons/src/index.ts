/**
 * Theme pack scaffold: pixel-art neurons-themed reskin (M_3rd track).
 *
 * Scaffold stage only — `THEME_PIXEL_NEURONS` is a minimal placeholder
 * satisfying `theme-pack-contract` minimums (meta.id / meta.displayName /
 * meta.style='pixel' + designMd stub + empty cssVars/fonts + 5 required
 * sprite keys mapped to a 1×1 transparent PNG + empty itemCatalog).
 *
 * Deferred to follow-up changes:
 * - Linnean taxonomy color palette (4 NT branch colors) → wire-neurons-content-and-theme
 * - Neuron sprite atlas (~200 PNGs, family × rarity × NT variants) → generate-neurons-sprites
 * - Cosmetic catalog (soma shape / dendrite style / myelin color) → wire-neurons-content-and-theme
 * - Item catalog (ion channels / receptors) → wire-neurons-content-and-theme
 * - Skill tree (4 NT pathway branches × 9 nodes) → wire-neurons-content-and-theme
 */

import type { ThemePack } from '@study-rpg/core'
import { SPRITE_MAP } from './sprites'

export const THEME_PIXEL_NEURONS: ThemePack = {
  meta: {
    id: 'pixel-neurons',
    displayName: '像素神經元（scaffold）',
    style: 'pixel',
  },
  designMd: '',
  cssVars: {},
  fonts: [],
  sprites: SPRITE_MAP,
  itemCatalog: [],
}

export { SPRITE_MAP } from './sprites'
