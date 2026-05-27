/**
 * QuizModal keyboard hotkey hook.
 *
 * Two-phase contract (per add-quiz-number-hotkeys-medexam2):
 * - Question phase: 1/2/3/4 highlight A/B/C/D; Enter submits highlighted choice.
 * - Answered phase: 1=⭐ bookmark, 2=✨ 太簡單, 3=🤔 我亂猜的, Enter=下一題.
 * - Both phases share scroll keys: Space / Shift+Space / ↓↑ / Home / End.
 *
 * Decision logic lives in `dispatchKey` (pure function, fully unit-testable
 * under the node vitest env). The hook itself only manages refs + the document
 * listener + action execution.
 */

import { useEffect, useRef, type RefObject } from 'react'

export type QuizPhase = 'asking' | 'answered'

export type HotkeyAction =
  | { kind: 'highlight'; key: string }
  | { kind: 'submit'; key: string }
  | { kind: 'toggle-bookmark' }
  | { kind: 'toggle-easy' }
  | { kind: 'toggle-guessed' }
  | { kind: 'advance' }
  | {
      kind: 'scroll'
      direction: 'up' | 'down'
      amount: 'page' | 'step' | 'edge-top' | 'edge-bottom'
    }
  | { kind: 'skip' }
  | { kind: 'noop' }

export interface DispatchContext {
  phase: QuizPhase
  optionKeys: string[]
  highlightedKey: string | null
  qualityAvailable: boolean
  isInputFocused: boolean
  msSincePhaseChange: number
}

export const PHASE_COOLDOWN_MS = 150
export const ARROW_STEP_PX = 40
export const PAGE_FRACTION = 0.8

/**
 * Pure dispatcher. Maps a keypress + context to an intended action.
 * No DOM access, no React state mutation — caller executes the returned action.
 */
export function dispatchKey(
  key: string,
  shift: boolean,
  ctx: DispatchContext,
): HotkeyAction {
  // Hard guard: focused input/textarea passes keys through to native handling.
  if (ctx.isInputFocused) return { kind: 'skip' }

  // Scroll bindings (both phases).
  if (key === ' ') {
    return shift
      ? { kind: 'scroll', direction: 'up', amount: 'page' }
      : { kind: 'scroll', direction: 'down', amount: 'page' }
  }
  if (key === 'ArrowDown') return { kind: 'scroll', direction: 'down', amount: 'step' }
  if (key === 'ArrowUp') return { kind: 'scroll', direction: 'up', amount: 'step' }
  if (key === 'Home') return { kind: 'scroll', direction: 'up', amount: 'edge-top' }
  if (key === 'End') return { kind: 'scroll', direction: 'down', amount: 'edge-bottom' }

  if (ctx.phase === 'asking') {
    if (key === '1' || key === '2' || key === '3' || key === '4') {
      const idx = Number(key) - 1
      if (idx < ctx.optionKeys.length) {
        return { kind: 'highlight', key: ctx.optionKeys[idx]! }
      }
      return { kind: 'noop' }
    }
    if (key === '0' || key === '5' || key === '6' || key === '7' || key === '8' || key === '9') {
      return { kind: 'noop' }
    }
    if (key === 'Enter') {
      if (ctx.highlightedKey !== null) {
        return { kind: 'submit', key: ctx.highlightedKey }
      }
      return { kind: 'noop' }
    }
    return { kind: 'noop' }
  }

  // Answered phase.
  if (key === '1') return { kind: 'toggle-bookmark' }
  if (key === '2') return ctx.qualityAvailable ? { kind: 'toggle-easy' } : { kind: 'noop' }
  if (key === '3') return ctx.qualityAvailable ? { kind: 'toggle-guessed' } : { kind: 'noop' }
  if (key === 'Enter') {
    if (ctx.msSincePhaseChange < PHASE_COOLDOWN_MS) return { kind: 'noop' }
    return { kind: 'advance' }
  }
  return { kind: 'noop' }
}

export interface UseQuizHotkeysOptions {
  isOpen: boolean
  phase: QuizPhase
  optionKeys: string[]
  highlightedKey: string | null
  qualityAvailable: boolean
  scrollContainerRef: RefObject<HTMLElement | null>
  setHighlightedKey: (key: string | null) => void
  onSubmit: (key: string) => void
  onToggleBookmark: () => void
  onToggleEasy: () => void
  onToggleGuessed: () => void
  onAdvance: () => void
}

export function useQuizHotkeys(options: UseQuizHotkeysOptions): void {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const phaseChangedAtRef = useRef<number>(Date.now())
  const prevPhaseRef = useRef<QuizPhase>(options.phase)
  if (prevPhaseRef.current !== options.phase) {
    phaseChangedAtRef.current = Date.now()
    prevPhaseRef.current = options.phase
  }

  useEffect(() => {
    if (!options.isOpen) return

    function handler(event: KeyboardEvent): void {
      const opts = optionsRef.current
      if (!opts.isOpen) return

      const isInputFocused =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement

      const action = dispatchKey(event.key, event.shiftKey, {
        phase: opts.phase,
        optionKeys: opts.optionKeys,
        highlightedKey: opts.highlightedKey,
        qualityAvailable: opts.qualityAvailable,
        isInputFocused,
        msSincePhaseChange: Date.now() - phaseChangedAtRef.current,
      })

      switch (action.kind) {
        case 'skip':
        case 'noop':
          return
        case 'highlight':
          opts.setHighlightedKey(action.key)
          return
        case 'submit':
          event.preventDefault()
          opts.onSubmit(action.key)
          return
        case 'toggle-bookmark':
          event.preventDefault()
          opts.onToggleBookmark()
          return
        case 'toggle-easy':
          event.preventDefault()
          opts.onToggleEasy()
          return
        case 'toggle-guessed':
          event.preventDefault()
          opts.onToggleGuessed()
          return
        case 'advance':
          event.preventDefault()
          opts.onAdvance()
          return
        case 'scroll': {
          event.preventDefault()
          const container = opts.scrollContainerRef.current
          if (!container) return
          if (action.amount === 'page') {
            const delta = container.clientHeight * PAGE_FRACTION
            container.scrollBy({
              top: action.direction === 'down' ? delta : -delta,
              behavior: 'smooth',
            })
          } else if (action.amount === 'step') {
            container.scrollBy({
              top: action.direction === 'down' ? ARROW_STEP_PX : -ARROW_STEP_PX,
              behavior: 'auto',
            })
          } else if (action.amount === 'edge-top') {
            container.scrollTo({ top: 0, behavior: 'smooth' })
          } else {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' })
          }
          return
        }
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [options.isOpen])
}
