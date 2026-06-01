/**
 * Conditional render wrapper that swaps to a `fallback` subtree when
 * `prefers-reduced-motion: reduce` is active.
 *
 * Spec: openspec/specs/neurons-motion-library/spec.md
 *   "useRespectsReducedMotion hook SHALL surface system a11y preference ..."
 */

import type { ReactNode } from 'react'
import { useRespectsReducedMotion } from './useRespectsReducedMotion'

export interface ReducedMotionAwareProps {
  children: ReactNode
  fallback: ReactNode
}

export function ReducedMotionAware({ children, fallback }: ReducedMotionAwareProps): JSX.Element {
  const reduced = useRespectsReducedMotion()
  return <>{reduced ? fallback : children}</>
}
