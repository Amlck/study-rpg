/**
 * SVG edge for one synapse row. Renders as `<motion.path>` with state-driven
 * stroke styling; uses `useRespectsReducedMotion()` to short-circuit
 * `transition.duration` to 0 when the user prefers reduced motion.
 *
 * Animation contract per openspec/specs/connectome-collection/spec.md:
 *   - formation (state=weak, isNew=true): pathLength 0 → 1 over SYNAPSE_TIMINGS.formation
 *   - strengthen (weak → strong): stroke width + color + glow morph over SYNAPSE_TIMINGS.strengthen
 *   - decay (strong → weak): stroke width + color reverse morph over SYNAPSE_TIMINGS.decay
 *   - decay (weak → dormant): opacity 1 → 0 over SYNAPSE_TIMINGS.decay, then removed
 */

import { motion } from 'framer-motion'
import { SYNAPSE_TIMINGS, useRespectsReducedMotion } from '../../lib/motion'
import type { SynapseState } from '../../lib/db'

export interface SynapseEdgeProps {
  pathKey: string
  pathD: string
  state: SynapseState
  /** True for the first frame after `connectome.synapseFormed` event so the edge can draw in. */
  isFreshlyFormed: boolean
  /** Set by ConnectomeTreeSvg when this edge is decaying weak → dormant; drives fade-out then removal. */
  isFadingOut: boolean
  /** Fired by ConnectomeTreeSvg once the fade-out animation completes so the row can be removed from React state. */
  onFadeOutComplete?: () => void
}

interface StateStyle {
  strokeWidth: number
  stroke: string
  opacity: number
  drawShadow: boolean
}

const STATE_STYLE: Record<SynapseState, StateStyle> = {
  dormant: { strokeWidth: 1, stroke: '#999', opacity: 0, drawShadow: false },
  weak: { strokeWidth: 3, stroke: '#b58900', opacity: 0.95, drawShadow: false },
  strong: { strokeWidth: 5, stroke: '#268bd2', opacity: 1, drawShadow: true },
}

export function SynapseEdge({
  pathKey,
  pathD,
  state,
  isFreshlyFormed,
  isFadingOut,
  onFadeOutComplete,
}: SynapseEdgeProps): JSX.Element | null {
  const reduced = useRespectsReducedMotion()
  const style = STATE_STYLE[state]
  if (state === 'dormant' && !isFadingOut) return null

  // Target attributes depend on whether we're fading out (overrides state styling)
  // and whether reduced motion is set (zero duration).
  const targetOpacity = isFadingOut ? 0 : style.opacity

  // Determine duration in seconds based on transition kind.
  // - freshly formed: formation (initial pathLength 0 → 1)
  // - fading out: decay
  // - state change otherwise: strengthen / decay depending on direction is owned by parent;
  //   here we always apply SYNAPSE_TIMINGS.strengthen as a smooth morph cap (Framer Motion
  //   interpolates symmetrically so reuse is safe)
  const morphDurationS = reduced
    ? 0
    : isFadingOut
      ? SYNAPSE_TIMINGS.decay / 1000
      : SYNAPSE_TIMINGS.strengthen / 1000

  return (
    <motion.path
      key={pathKey}
      d={pathD}
      fill="none"
      pathLength={1}
      strokeLinecap="round"
      initial={
        isFreshlyFormed
          ? { pathLength: reduced ? 1 : 0, opacity: 1, strokeWidth: style.strokeWidth, stroke: style.stroke }
          : false
      }
      animate={{
        pathLength: 1,
        opacity: targetOpacity,
        strokeWidth: style.strokeWidth,
        stroke: style.stroke,
      }}
      transition={
        isFreshlyFormed
          ? { duration: reduced ? 0 : SYNAPSE_TIMINGS.formation / 1000, ease: 'easeOut' }
          : { duration: morphDurationS, ease: 'easeInOut' }
      }
      style={{
        filter: style.drawShadow ? 'drop-shadow(0 0 4px rgba(38, 139, 210, 0.55))' : 'none',
      }}
      onAnimationComplete={() => {
        if (isFadingOut) onFadeOutComplete?.()
      }}
    />
  )
}
