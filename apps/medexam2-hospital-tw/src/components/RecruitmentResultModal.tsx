import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, useState } from 'react'
import { RARITY_LABELS, getRoomHintForSubject } from '@study-rpg/content-medexam2-tw'
import { THEME_PIXEL_HOSPITAL } from '@study-rpg/theme-pixel-hospital'
import { lookupSprite } from '../lib/sprite-lookup'
import type { DoctorRow } from '../db/schema'
import { EmojiIcon } from './EmojiIcon'

// entry → (swipe) → rarity-flash → (900ms) → silhouette → (1100ms) → revealed → (tap) → close
type RevealStep = 'entry' | 'rarity-flash' | 'silhouette' | 'revealed'

interface Props {
  doctor: DoctorRow | null
  wasPity: boolean
  onClose: () => void
}

const STEP_AUTO_ADVANCE_MS: Partial<Record<RevealStep, number>> = {
  'rarity-flash': 900,
  'silhouette': 1100,
}

function nextStep(current: RevealStep): RevealStep | null {
  if (current === 'entry') return 'rarity-flash'
  if (current === 'rarity-flash') return 'silhouette'
  if (current === 'silhouette') return 'revealed'
  return null
}

// ── Swipe-to-answer track ────────────────────────────────────────────────────
// The handle slides right; crossing 65% of the available drag range triggers
// onAnswer. On release below threshold the handle springs back.

const TRACK_INNER_W = 200 // px — must match CSS .swipe-track width
const HANDLE_W      =  48 // px — must match CSS .swipe-handle size
const MAX_DRAG      = TRACK_INNER_W - HANDLE_W - 8 // right boundary
const THRESHOLD     = MAX_DRAG * 0.65

interface SwipeProps { onAnswer: () => void }

function SwipeToAnswer({ onAnswer }: SwipeProps) {
  const x = useMotionValue(0)
  // Label fades out as handle moves toward threshold
  const labelOpacity = useTransform(x, [0, THRESHOLD * 0.8], [1, 0])

  function handleDragEnd() {
    if (x.get() >= THRESHOLD) {
      // Snap to end, then fire
      animate(x, MAX_DRAG, { duration: 0.12, onComplete: onAnswer })
    } else {
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 30 })
    }
  }

  return (
    <div className="swipe-track" aria-label="滑動接聽">
      <motion.span className="swipe-track__label" style={{ opacity: labelOpacity }} aria-hidden>
        滑動接聽 →
      </motion.span>
      <motion.button
        type="button"
        className="swipe-handle"
        style={{ x }}
        drag="x"
        dragConstraints={{ left: 0, right: MAX_DRAG }}
        dragElastic={0.04}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        aria-label="接聽"
        /* Keyboard fallback: Enter/Space answers immediately */
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onAnswer()
          }
        }}
      >
        <EmojiIcon char="📞" size={48} />
      </motion.button>
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────────────

export function RecruitmentResultModal({ doctor, wasPity, onClose }: Props) {
  const [step, setStep] = useState<RevealStep>('entry')

  // Reset to entry step whenever a new doctor is shown
  useEffect(() => {
    if (doctor) setStep('entry')
  }, [doctor?.id])

  // Auto-advance timed steps
  useEffect(() => {
    if (!doctor) return
    const delay = STEP_AUTO_ADVANCE_MS[step]
    if (delay === undefined) return
    const timer = setTimeout(() => {
      const next = nextStep(step)
      if (next) setStep(next)
    }, delay)
    return () => clearTimeout(timer)
  }, [doctor, step])

  function advance() {
    const next = nextStep(step)
    if (next) setStep(next)
    else onClose()
  }

  const rarityVar = `var(--rarity-${doctor?.rarity.toLowerCase()})`

  return (
    <AnimatePresence>
      {doctor && (
        <motion.div
          className="modal-backdrop recruit-ceremony"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          // Tapping the backdrop advances steps 1-3; entry requires explicit swipe
          onClick={step !== 'entry' ? advance : undefined}
        >

          {/* ── Step 0: Phone sprite + swipe-to-answer ── */}
          <AnimatePresence>
            {step === 'entry' && (
              <motion.div
                className="phone-sprite"
                initial={{ opacity: 0, y: 32, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.88, y: -16 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Physical phone chrome */}
                <div className="phone-sprite__notch" aria-hidden />

                {/* Screen area */}
                <div className="phone-sprite__screen">
                  {/* Pulsing ring halo behind caller icon */}
                  <div className="phone-sprite__rings" aria-hidden>
                    <span className="phone-sprite__ring" />
                    <span className="phone-sprite__ring" />
                    <span className="phone-sprite__ring" />
                    <span className="phone-sprite__caller-icon"><EmojiIcon char="👤" size={24} /></span>
                  </div>

                  <p className="phone-sprite__caller-name">招募部門</p>
                  <p className="phone-sprite__caller-sub">住院醫師申請</p>

                  <SwipeToAnswer onAnswer={advance} />
                </div>

                {/* Home button */}
                <div className="phone-sprite__home" aria-hidden />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Step 1: Rarity colour flash ── */}
          <AnimatePresence>
            {step === 'rarity-flash' && (
              <motion.div
                className="recruit-ceremony__flash"
                style={{ background: rarityVar }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                <motion.span
                  className="recruit-ceremony__rarity-text"
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: [0.4, 1.25, 1], opacity: 1 }}
                  transition={{ duration: 0.55, times: [0, 0.6, 1] }}
                >
                  {doctor.rarity}
                </motion.span>
                <motion.span
                  className="recruit-ceremony__rarity-label"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                >
                  {RARITY_LABELS[doctor.rarity]}
                  {wasPity && ' · 保底'}
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Steps 2 & 3: Doctor card ── */}
          <AnimatePresence>
            {(step === 'silhouette' || step === 'revealed') && (
              <motion.div
                className="modal-card"
                style={{ ['--rarity-color' as string]: rarityVar }}
                initial={{ scale: 0.75, opacity: 0, y: 32 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                onClick={(e) => {
                  e.stopPropagation()
                  if (step === 'silhouette') advance()
                }}
              >
                <div className="modal-card__rarity">
                  <span className="modal-card__rarity-tier">{doctor.rarity}</span>
                  <span className="modal-card__rarity-label">{RARITY_LABELS[doctor.rarity]}</span>
                  {wasPity && <span className="modal-card__pity">保底</span>}
                </div>

                <div className="modal-card__sprite">
                  {(() => {
                    const spriteUrl = lookupSprite(
                      doctor.spriteKey,
                      THEME_PIXEL_HOSPITAL.sprites,
                      doctor.rarity,
                    )
                    return spriteUrl ? (
                      <img
                        src={spriteUrl}
                        alt=""
                        className={`modal-card__sprite-img${step === 'silhouette' ? ' recruit-ceremony__sprite--silhouette' : ''}`}
                      />
                    ) : (
                      <span
                        className={`modal-card__sprite-emoji${step === 'silhouette' ? ' recruit-ceremony__sprite--silhouette' : ''}`}
                        aria-hidden
                      >
                        <EmojiIcon char="🩺" size={64} />
                      </span>
                    )
                  })()}
                </div>

                {/* Specialty tease visible from step 2 onward */}
                <p className="recruit-ceremony__specialty">{doctor.subjectId}</p>

                {/* Full reveal: name, stats, close button */}
                <AnimatePresence>
                  {step === 'revealed' && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <h2 className="modal-card__name">{doctor.name}</h2>
                      <dl className="modal-card__meta">
                        <div>
                          <dt>科別</dt>
                          <dd>{doctor.subjectId}</dd>
                        </div>
                        <div>
                          <dt>×力</dt>
                          <dd>{doctor.powerMultiplier.toFixed(1)}</dd>
                        </div>
                        <div>
                          <dt>適合</dt>
                          <dd>{getRoomHintForSubject(doctor.subjectId)}</dd>
                        </div>
                      </dl>
                      <button type="button" className="modal-card__close" onClick={onClose}>
                        收下
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {step !== 'revealed' && (
                  <p className="recruit-ceremony__tap-hint" aria-hidden>
                    點擊繼續
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

        </motion.div>
      )}
    </AnimatePresence>
  )
}
