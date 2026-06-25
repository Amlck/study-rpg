import { useState } from 'react'
import {
  GAMEPAD_ACTION_LABELS,
  GAMEPAD_ACTIONS,
  formatGamepadBinding,
  useGamepadBindingCapture,
  type GamepadAction,
  type GamepadBindings,
  type GamepadBinding,
} from '../lib/gamepad'

interface Props {
  bindings: GamepadBindings
  onBind: (action: GamepadAction, binding: GamepadBinding) => void
  onReset: () => void
}

export function GamepadSettings({ bindings, onBind, onReset }: Props) {
  const [listeningFor, setListeningFor] = useState<GamepadAction | null>(null)

  useGamepadBindingCapture(listeningFor !== null, (binding) => {
    if (!listeningFor) return
    onBind(listeningFor, binding)
    setListeningFor(null)
  })

  return (
    <details className="gamepad-settings">
      <summary>控制器按鍵設定</summary>
      <div className="gamepad-settings__grid">
        {GAMEPAD_ACTIONS.map((action) => (
          <div key={action} className="gamepad-settings__row">
            <span>{GAMEPAD_ACTION_LABELS[action]}</span>
            <code>{formatGamepadBinding(bindings[action])}</code>
            <button
              type="button"
              onClick={() => setListeningFor(action)}
            >
              {listeningFor === action ? '等待輸入...' : '設定'}
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="gamepad-settings__reset" onClick={onReset}>
        還原預設
      </button>
    </details>
  )
}
