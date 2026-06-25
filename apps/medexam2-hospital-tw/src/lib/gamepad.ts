import { useEffect, useRef, useState } from 'react'

export type GamepadAction =
  | 'optionUp'
  | 'optionDown'
  | 'selectOption'
  | 'previousQuestion'
  | 'nextQuestion'
  | 'scrollUp'
  | 'scrollDown'
  | 'toggleExplanation'
  | 'toggleFlag'
  | 'submit'
  | 'cancel'

export type GamepadBinding =
  | { kind: 'button'; index: number }
  | { kind: 'axis'; index: number; direction: -1 | 1 }

export type GamepadBindings = Record<GamepadAction, GamepadBinding>

export interface GamepadControlHandlers {
  onActivity?: () => void
  onOptionUp?: () => void
  onOptionDown?: () => void
  onSelectOption?: () => void
  onPreviousQuestion?: () => void
  onNextQuestion?: () => void
  onScrollUp?: () => void
  onScrollDown?: () => void
  onToggleExplanation?: () => void
  onToggleFlag?: () => void
  onSubmit?: () => void
  onCancel?: () => void
}

export const GAMEPAD_ACTION_LABELS: Record<GamepadAction, string> = {
  optionUp: '選項上移',
  optionDown: '選項下移',
  selectOption: '選取選項',
  previousQuestion: '上一題',
  nextQuestion: '下一題',
  scrollUp: '向上捲動',
  scrollDown: '向下捲動',
  toggleExplanation: '詳解',
  toggleFlag: '標記',
  submit: '交卷',
  cancel: '取消',
}

export const GAMEPAD_ACTIONS: GamepadAction[] = [
  'optionUp',
  'optionDown',
  'selectOption',
  'previousQuestion',
  'nextQuestion',
  'scrollUp',
  'scrollDown',
  'toggleExplanation',
  'toggleFlag',
  'submit',
  'cancel',
]

const AXIS_THRESHOLD = 0.6
const GAMEPAD_ENABLED_KEY = 'study-rpg:hospital-challenge-gamepad-enabled'
const GAMEPAD_BINDINGS_KEY = 'study-rpg:hospital-challenge-gamepad-bindings'
const BUTTON_LABELS: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'View',
  9: 'Menu',
  10: '左搖桿按下',
  11: '右搖桿按下',
  12: '方向鍵上',
  13: '方向鍵下',
  14: '方向鍵左',
  15: '方向鍵右',
  16: 'Xbox',
}
const AXIS_LABELS: Record<number, [string, string]> = {
  0: ['左搖桿左', '左搖桿右'],
  1: ['左搖桿上', '左搖桿下'],
  2: ['右搖桿左', '右搖桿右'],
  3: ['右搖桿上', '右搖桿下'],
}

export const DEFAULT_GAMEPAD_BINDINGS: GamepadBindings = {
  optionUp: { kind: 'axis', index: 1, direction: -1 },
  optionDown: { kind: 'axis', index: 1, direction: 1 },
  selectOption: { kind: 'button', index: 0 },
  previousQuestion: { kind: 'button', index: 4 },
  nextQuestion: { kind: 'button', index: 5 },
  scrollUp: { kind: 'axis', index: 3, direction: -1 },
  scrollDown: { kind: 'axis', index: 3, direction: 1 },
  toggleExplanation: { kind: 'button', index: 7 },
  toggleFlag: { kind: 'button', index: 3 },
  submit: { kind: 'button', index: 9 },
  cancel: { kind: 'button', index: 1 },
}

function readGamepadEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(GAMEPAD_ENABLED_KEY) === 'true'
}

function isGamepadAction(value: string): value is GamepadAction {
  return GAMEPAD_ACTIONS.includes(value as GamepadAction)
}

function isGamepadBinding(value: unknown): value is GamepadBinding {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (v.kind === 'button') return typeof v.index === 'number'
  return v.kind === 'axis' &&
    typeof v.index === 'number' &&
    (v.direction === -1 || v.direction === 1)
}

function readGamepadBindings(): GamepadBindings {
  if (typeof localStorage === 'undefined') return DEFAULT_GAMEPAD_BINDINGS
  try {
    const raw = localStorage.getItem(GAMEPAD_BINDINGS_KEY)
    if (!raw) return DEFAULT_GAMEPAD_BINDINGS
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const next: GamepadBindings = { ...DEFAULT_GAMEPAD_BINDINGS }
    for (const [action, binding] of Object.entries(parsed)) {
      if (isGamepadAction(action) && isGamepadBinding(binding)) next[action] = binding
    }
    return next
  } catch {
    return DEFAULT_GAMEPAD_BINDINGS
  }
}

function saveGamepadBindings(bindings: GamepadBindings): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(GAMEPAD_BINDINGS_KEY, JSON.stringify(bindings))
}

export function useGamepadPreference(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabledState] = useState(readGamepadEnabled)

  const setEnabled = (next: boolean) => {
    setEnabledState(next)
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(GAMEPAD_ENABLED_KEY, String(next))
    }
  }

  return [enabled, setEnabled]
}

export function useGamepadBindings(): [
  GamepadBindings,
  (action: GamepadAction, binding: GamepadBinding) => void,
  () => void,
] {
  const [bindings, setBindings] = useState(readGamepadBindings)

  const setBinding = (action: GamepadAction, binding: GamepadBinding) => {
    setBindings((prev) => {
      const next = { ...prev, [action]: binding }
      saveGamepadBindings(next)
      return next
    })
  }

  const resetBindings = () => {
    setBindings(DEFAULT_GAMEPAD_BINDINGS)
    saveGamepadBindings(DEFAULT_GAMEPAD_BINDINGS)
  }

  return [bindings, setBinding, resetBindings]
}

function firstConnectedGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected) return pad
  }
  return null
}

function bindingEquals(a: GamepadBinding, b: GamepadBinding): boolean {
  if (a.kind !== b.kind || a.index !== b.index) return false
  if (a.kind === 'button') return true
  return a.direction === (b as Extract<GamepadBinding, { kind: 'axis' }>).direction
}

function actionForBinding(binding: GamepadBinding, bindings: GamepadBindings): GamepadAction | undefined {
  return GAMEPAD_ACTIONS.find((candidate) => bindingEquals(bindings[candidate], binding))
}

function isRepeatingAction(action: GamepadAction): boolean {
  return action === 'scrollUp' || action === 'scrollDown'
}

function dispatchAction(
  action: GamepadAction,
  handlers: GamepadControlHandlers,
): void {
  handlers.onActivity?.()
  if (action === 'optionUp') handlers.onOptionUp?.()
  else if (action === 'optionDown') handlers.onOptionDown?.()
  else if (action === 'selectOption') handlers.onSelectOption?.()
  else if (action === 'previousQuestion') handlers.onPreviousQuestion?.()
  else if (action === 'nextQuestion') handlers.onNextQuestion?.()
  else if (action === 'scrollUp') handlers.onScrollUp?.()
  else if (action === 'scrollDown') handlers.onScrollDown?.()
  else if (action === 'toggleExplanation') handlers.onToggleExplanation?.()
  else if (action === 'toggleFlag') handlers.onToggleFlag?.()
  else if (action === 'submit') handlers.onSubmit?.()
  else if (action === 'cancel') handlers.onCancel?.()
}

export function formatGamepadBinding(binding: GamepadBinding): string {
  if (binding.kind === 'button') return BUTTON_LABELS[binding.index] ?? `按鈕 ${binding.index}`
  const labels = AXIS_LABELS[binding.index]
  if (labels) return binding.direction < 0 ? labels[0] : labels[1]
  return `軸 ${binding.index} ${binding.direction < 0 ? '-' : '+'}`
}

export function useGamepadBindingCapture(
  listening: boolean,
  onCapture: (binding: GamepadBinding) => void,
): void {
  const onCaptureRef = useRef(onCapture)
  useEffect(() => { onCaptureRef.current = onCapture }, [onCapture])

  useEffect(() => {
    if (!listening) return
    let frame = 0
    let captured = false

    const poll = () => {
      if (captured) return
      const pad = firstConnectedGamepad()
      if (pad) {
        const buttonIndex = pad.buttons.findIndex((button) => button.pressed || button.value > 0.5)
        if (buttonIndex >= 0) {
          captured = true
          onCaptureRef.current({ kind: 'button', index: buttonIndex })
          return
        }
        for (let index = 0; index < pad.axes.length; index++) {
          const value = pad.axes[index] ?? 0
          if (Math.abs(value) >= AXIS_THRESHOLD) {
            captured = true
            onCaptureRef.current({ kind: 'axis', index, direction: value < 0 ? -1 : 1 })
            return
          }
        }
      }
      frame = window.requestAnimationFrame(poll)
    }

    frame = window.requestAnimationFrame(poll)
    return () => window.cancelAnimationFrame(frame)
  }, [listening])
}

export function useGamepadControls(
  enabled: boolean,
  bindings: GamepadBindings,
  handlers: GamepadControlHandlers,
): void {
  const handlersRef = useRef(handlers)
  const bindingsRef = useRef(bindings)
  useEffect(() => { handlersRef.current = handlers }, [handlers])
  useEffect(() => { bindingsRef.current = bindings }, [bindings])

  useEffect(() => {
    if (!enabled) return

    let frame = 0
    let previousButtons: boolean[] = []
    let previousAxisDirections: number[] = []

    const poll = () => {
      const pad = firstConnectedGamepad()
      if (pad) {
        pad.buttons.forEach((button, index) => {
          const pressed = button.pressed || button.value > 0.5
          if (pressed) {
            const binding: GamepadBinding = { kind: 'button', index }
            const action = actionForBinding(binding, bindingsRef.current)
            if (action && (!previousButtons[index] || isRepeatingAction(action))) {
              dispatchAction(action, handlersRef.current)
            }
          }
          previousButtons[index] = pressed
        })

        pad.axes.forEach((value, index) => {
          const direction = value < -AXIS_THRESHOLD ? -1 : value > AXIS_THRESHOLD ? 1 : 0
          if (direction !== 0) {
            const binding: GamepadBinding = { kind: 'axis', index, direction: direction as -1 | 1 }
            const action = actionForBinding(binding, bindingsRef.current)
            if (action && (direction !== previousAxisDirections[index] || isRepeatingAction(action))) {
              dispatchAction(action, handlersRef.current)
            }
          }
          previousAxisDirections[index] = direction
        })
      }
      frame = window.requestAnimationFrame(poll)
    }

    frame = window.requestAnimationFrame(poll)
    return () => window.cancelAnimationFrame(frame)
  }, [enabled])
}
