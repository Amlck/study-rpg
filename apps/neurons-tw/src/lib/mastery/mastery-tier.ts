/**
 * Mastery tier derivation — pure function.
 *
 * Spec: openspec/specs/neuron-family-mastery/spec.md
 *   "Mastery tier SHALL be derived by pure function with count + accuracy
 *    double-gate"
 */

export type MasteryTier = 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'none'

const MIN_ATTEMPTS_TO_ASSESS = 5

interface TierGate {
  tier: Exclude<MasteryTier, 'none' | 'P5'>
  minCorrect: number
  minAccuracy: number
}

const TIER_GATES: readonly TierGate[] = [
  { tier: 'P1', minCorrect: 200, minAccuracy: 0.9 },
  { tier: 'P2', minCorrect: 80, minAccuracy: 0.8 },
  { tier: 'P3', minCorrect: 30, minAccuracy: 0.7 },
  { tier: 'P4', minCorrect: 10, minAccuracy: 0.6 },
]

export function deriveMasteryTier(correct: number, total: number): MasteryTier {
  if (total < MIN_ATTEMPTS_TO_ASSESS) return 'none'
  const accuracy = total > 0 ? correct / total : 0
  for (const gate of TIER_GATES) {
    if (correct >= gate.minCorrect && accuracy >= gate.minAccuracy) {
      return gate.tier
    }
  }
  return 'P5'
}

export const TIER_LABELS: Record<MasteryTier, string> = {
  P1: 'P1 大師',
  P2: 'P2 專精',
  P3: 'P3 熟練',
  P4: 'P4 入門',
  P5: 'P5 新手',
  none: '—',
}

export const TIER_COLORS: Record<MasteryTier, string> = {
  P1: '#d4a04d', // gold (DA)
  P2: '#9b6dd9', // purple
  P3: '#6a9bc4', // blue (GABA)
  P4: '#6a8c3f', // green (Glu)
  P5: '#8c6d4a', // brown
  none: '#9b9b9b', // muted grey
}
