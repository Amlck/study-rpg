/**
 * Count-up animation for stat increments (e.g., AP +N, reputation +X).
 * Reduced-motion: snap to final value within 1 frame.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "Reduced-motion preserves visual state-change cues" scenario —
 *   "<NumberTickUp> SHALL display the final value within 1 frame
 *    (no animated count, but value still updates)"
 */

import { useEffect, useState } from 'react'
import { animate as motionAnimate } from 'framer-motion'
import { useRespectsReducedMotion } from './useRespectsReducedMotion'

export interface NumberTickUpProps {
  from: number
  to: number
  durationMs?: number
}

export function NumberTickUp({ from, to, durationMs = 600 }: NumberTickUpProps): JSX.Element {
  const reduced = useRespectsReducedMotion()
  const [display, setDisplay] = useState(from)

  useEffect(() => {
    if (reduced) {
      setDisplay(to)
      return
    }
    const controls = motionAnimate(from, to, {
      duration: durationMs / 1000,
      ease: 'easeOut',
      onUpdate: (v) => setDisplay(Math.round(v)),
    })
    return () => controls.stop()
  }, [from, to, durationMs, reduced])

  return <span>{display}</span>
}
