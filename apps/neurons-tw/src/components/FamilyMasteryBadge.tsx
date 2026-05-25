/**
 * Subscribing wrapper around `<FamilyMasteryBadgeSprite>` — internally tracks
 * the family's current mastery state via mastery event bus and derives the
 * tier, then renders the underlying sprite.
 *
 * Consumers (e.g., ConnectomePage family cards) drop `<FamilyMasteryBadge
 * familyId={f} size={n} />` and get a live-updating tier badge for free.
 *
 * Returns null when tier is `'none'` (insufficient data) — no DOM emitted.
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import { useEffect, useState } from 'react'
import { deriveMasteryTier } from '../lib/mastery'
import { getMastery, masteryEvents } from '../lib/services/mastery'
import { FamilyMasteryBadgeSprite } from './FamilyMasteryBadgeSprite'

export interface FamilyMasteryBadgeProps {
  familyId: string
  size?: number
}

export function FamilyMasteryBadge({
  familyId,
  size = 36,
}: FamilyMasteryBadgeProps): JSX.Element | null {
  const [correct, setCorrect] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    let cancelled = false
    void getMastery(familyId).then((row) => {
      if (cancelled || !row) return
      setCorrect(row.correct)
      setTotal(row.total)
    })
    const handler = (p: { familyId: string; correct: number; total: number }): void => {
      if (p.familyId !== familyId) return
      setCorrect(p.correct)
      setTotal(p.total)
    }
    masteryEvents.on('mastery.updated', handler)
    return () => {
      cancelled = true
      masteryEvents.off('mastery.updated', handler)
    }
  }, [familyId])

  const tier = deriveMasteryTier(correct, total)
  if (tier === 'none') return null
  return <FamilyMasteryBadgeSprite familyId={familyId} masteryTier={tier} size={size} />
}
