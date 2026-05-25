/**
 * Particle burst — 16 absolutely-positioned motion.span scattered radially
 * with stagger. Returns null in reduced-motion to avoid DOM cost.
 *
 * Internal to RarityRevealModal but exported for reuse.
 *
 * Spec design rationale (`design.md` Decision 6):
 *   DOM stagger (transform / opacity only) is GPU-accelerated; canvas would
 *   add canvas-confetti dep + violate zero-new-dep policy.
 */

import { motion } from 'framer-motion'
import { useRespectsReducedMotion } from './useRespectsReducedMotion'

export interface ParticleBurstProps {
  count?: number
  color?: string
  durationMs?: number
}

export function ParticleBurst({
  count = 16,
  color = '#d4a04d',
  durationMs = 600,
}: ParticleBurstProps): JSX.Element | null {
  const reduced = useRespectsReducedMotion()
  if (reduced) return null

  const particles = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3
    const distance = 60 + Math.random() * 40
    return {
      key: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      delay: i * 0.05,
    }
  })

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 0,
        height: 0,
        pointerEvents: 'none',
      }}
    >
      {particles.map((p) => (
        <motion.span
          key={p.key}
          initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
          animate={{ x: p.x, y: p.y, scale: 1, opacity: 0 }}
          transition={{ duration: durationMs / 1000, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 4px ${color}`,
          }}
        />
      ))}
    </div>
  )
}
