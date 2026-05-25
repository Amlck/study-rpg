/**
 * Live `prefers-reduced-motion` hook. Returns true when user has set OS a11y
 * preference. Soft-mode degradation: consumers SHALL drop particle / shake /
 * parallax but keep fade + scale so state changes remain visible.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "useRespectsReducedMotion hook SHALL surface system a11y preference ..."
 */

import { useEffect, useState } from 'react'

export function useRespectsReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReduced(mq.matches)
    const handler = (e: MediaQueryListEvent): void => setPrefersReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return prefersReduced
}
