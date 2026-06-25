import { useEffect, useRef, useState } from 'react'

interface GamepadControlHandlers {
  onActivity?: () => void
  onOption?: (index: number) => void
  onPrevious?: () => void
  onNext?: () => void
  onSubmit?: () => void
  onCancel?: () => void
}

const AXIS_THRESHOLD = 0.6
const BUTTON_A = 0
const BUTTON_B = 1
const BUTTON_X = 2
const BUTTON_Y = 3
const BUTTON_LB = 4
const BUTTON_RB = 5
const BUTTON_VIEW = 8
const BUTTON_MENU = 9
const BUTTON_DPAD_LEFT = 14
const BUTTON_DPAD_RIGHT = 15
const GAMEPAD_ENABLED_KEY = 'study-rpg:mock-gamepad-enabled'

function readGamepadEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(GAMEPAD_ENABLED_KEY) === 'true'
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

function firstConnectedGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.connected) return pad
  }
  return null
}

export function useGamepadControls(enabled: boolean, handlers: GamepadControlHandlers): void {
  const handlersRef = useRef(handlers)
  useEffect(() => { handlersRef.current = handlers }, [handlers])

  useEffect(() => {
    if (!enabled) return

    let frame = 0
    let previousButtons: boolean[] = []
    let previousAxisDirection = 0

    const emitActivity = () => handlersRef.current.onActivity?.()
    const emitPressed = (buttonIndex: number) => {
      emitActivity()
      if (buttonIndex === BUTTON_A) handlersRef.current.onOption?.(0)
      else if (buttonIndex === BUTTON_B) handlersRef.current.onOption?.(1)
      else if (buttonIndex === BUTTON_X) handlersRef.current.onOption?.(2)
      else if (buttonIndex === BUTTON_Y) handlersRef.current.onOption?.(3)
      else if (buttonIndex === BUTTON_LB || buttonIndex === BUTTON_DPAD_LEFT) handlersRef.current.onPrevious?.()
      else if (buttonIndex === BUTTON_RB || buttonIndex === BUTTON_DPAD_RIGHT) handlersRef.current.onNext?.()
      else if (buttonIndex === BUTTON_MENU) handlersRef.current.onSubmit?.()
      else if (buttonIndex === BUTTON_VIEW) handlersRef.current.onCancel?.()
    }

    const poll = () => {
      const pad = firstConnectedGamepad()
      if (pad) {
        pad.buttons.forEach((button, index) => {
          const pressed = button.pressed || button.value > 0.5
          if (pressed && !previousButtons[index]) emitPressed(index)
          previousButtons[index] = pressed
        })

        const xAxis = pad.axes[0] ?? 0
        const axisDirection = xAxis < -AXIS_THRESHOLD ? -1 : xAxis > AXIS_THRESHOLD ? 1 : 0
        if (axisDirection !== 0 && axisDirection !== previousAxisDirection) {
          emitActivity()
          if (axisDirection < 0) handlersRef.current.onPrevious?.()
          else handlersRef.current.onNext?.()
        }
        previousAxisDirection = axisDirection
      }
      frame = window.requestAnimationFrame(poll)
    }

    frame = window.requestAnimationFrame(poll)
    return () => window.cancelAnimationFrame(frame)
  }, [enabled])
}
