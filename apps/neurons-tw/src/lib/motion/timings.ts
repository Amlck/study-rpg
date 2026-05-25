/**
 * Per-rarity animation timing tokens (milliseconds).
 *
 * Consumers SHALL import these so batch UX (e.g., gacha 10-pull skip-all) can
 * predict animation duration without re-implementing the timing logic.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Per-rarity timing tokens SHALL be exported as public constants ..."
 */

export type Rarity = 'P1' | 'P2' | 'P3' | 'P4' | 'P5'

export interface RarityTiming {
  total: number
  envelope: number
  flip: number
  glow: number
  particle?: number
  hold: number
}

export const RARITY_TIMINGS: Record<Rarity, RarityTiming> = {
  P5: { total: 250, envelope: 100, flip: 100, glow: 0, hold: 50 },
  P4: { total: 400, envelope: 150, flip: 150, glow: 0, hold: 100 },
  P3: { total: 600, envelope: 200, flip: 200, glow: 100, hold: 100 },
  P2: { total: 1200, envelope: 300, flip: 300, glow: 300, hold: 300 },
  P1: { total: 2800, envelope: 400, flip: 600, glow: 500, particle: 800, hold: 500 },
} as const

export const SKIP_THRESHOLD_MS = 1000
export const TOAST_AUTO_DISMISS_MS = 8000
