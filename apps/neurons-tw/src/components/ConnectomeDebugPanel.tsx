import { useState } from 'react'
import type { ContentPack } from '@study-rpg/core'
import {
  advanceDayForDebug,
  dumpStateForDebug,
  recordCorrectAnswer,
  recordIncorrectAnswer,
  resetConnectomeForDebug,
} from '../lib/services/connectome'
import MasteryChip from './MasteryChip'

interface Props {
  pack: ContentPack
  onMutation?: () => void
}

export default function ConnectomeDebugPanel({ pack, onMutation }: Props): JSX.Element {
  const [selectedFamily, setSelectedFamily] = useState<string>(pack.subjects[0]?.id ?? '')
  const [busy, setBusy] = useState(false)
  const [lastAction, setLastAction] = useState<string>('—')

  async function withBusy(label: string, fn: () => Promise<void>): Promise<void> {
    setBusy(true)
    try {
      await fn()
      setLastAction(`✓ ${label} @ ${new Date().toLocaleTimeString()}`)
      onMutation?.()
    } catch (err) {
      console.error('[debug-panel]', err)
      setLastAction(`✗ ${label}: ${String(err)}`)
    } finally {
      setBusy(false)
    }
  }

  const onPlusOneCorrect = (): Promise<void> =>
    withBusy(`+1 答對 → ${selectedFamily}`, () => recordCorrectAnswer(selectedFamily))

  const onPlusFiveCorrect = (): Promise<void> =>
    withBusy(`+5 答對 → ${selectedFamily}`, async () => {
      for (let i = 0; i < 5; i++) await recordCorrectAnswer(selectedFamily)
    })

  const onPlusOneIncorrect = (): Promise<void> =>
    withBusy(`+1 答錯 → ${selectedFamily}`, () => recordIncorrectAnswer(selectedFamily))

  const onAdvanceDay = (): Promise<void> =>
    withBusy('時間 +1 天', () => advanceDayForDebug(1))

  const onReset = (): Promise<void> => {
    if (!window.confirm('要重設所有 connectome 存檔資料嗎？（synapse 列表 + AP 計數會全部清空）')) {
      return Promise.resolve()
    }
    return withBusy('重設存檔', () => resetConnectomeForDebug())
  }

  const onDump = (): Promise<void> => withBusy('傾印狀態', () => dumpStateForDebug())

  return (
    <section style={panelStyle}>
      <header style={headerStyle}>
        <h3 style={titleStyle}>🚧 除錯面板 — 真正 quiz loop 上線前的臨時工具</h3>
        <small style={hintStyle}>
          本面板由後續 change `wire-neurons-quiz-loop` 移除；目前用於手動觸發 engine 以驗證 connectome 行為。
        </small>
      </header>

      <div style={rowStyle}>
        <label style={labelStyle}>
          Family：
          <select
            value={selectedFamily}
            onChange={(e) => setSelectedFamily(e.target.value)}
            style={selectStyle}
            disabled={busy}
          >
            {pack.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}（{s.id}）
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={rowStyle}>
        <button onClick={onPlusOneCorrect} disabled={busy || !selectedFamily} style={btnStyle}>
          +1 答對
        </button>
        <button onClick={onPlusFiveCorrect} disabled={busy || !selectedFamily} style={btnStyle}>
          +5 答對（一鍵 fire）
        </button>
        <button onClick={onPlusOneIncorrect} disabled={busy || !selectedFamily} style={btnStyle}>
          +1 答錯（驗 no-op）
        </button>
      </div>

      <div style={rowStyle}>
        <button onClick={onAdvanceDay} disabled={busy} style={btnStyle}>
          時間 +1 天
        </button>
        <button onClick={onDump} disabled={busy} style={btnStyle}>
          傾印狀態到 console
        </button>
        <button onClick={onReset} disabled={busy} style={{ ...btnStyle, ...dangerBtnStyle }}>
          重設存檔（不可復原）
        </button>
      </div>

      <div style={{ ...rowStyle, fontSize: '0.85em', color: '#5a3f29' }}>
        最後動作：<code>{lastAction}</code>
      </div>

      <div style={rowStyle}>
        <span style={{ fontSize: '0.85em', color: '#5a3f29' }}>選定家族熟練度：</span>
        {selectedFamily && (
          <MasteryChip
            familyId={selectedFamily}
            displayName={pack.subjects.find((s) => s.id === selectedFamily)?.displayName}
          />
        )}
      </div>
    </section>
  )
}

const panelStyle: React.CSSProperties = {
  background: '#fdf6e3',
  border: '2px dashed #b58900',
  padding: '0.85rem 1rem',
  marginTop: '1.5rem',
  borderRadius: '4px',
}

const headerStyle: React.CSSProperties = {
  marginBottom: '0.6rem',
}

const titleStyle: React.CSSProperties = {
  margin: '0 0 0.2rem',
  fontSize: '0.95rem',
  color: '#b58900',
}

const hintStyle: React.CSSProperties = {
  color: '#5a3f29',
  fontStyle: 'italic',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  alignItems: 'center',
  margin: '0.4rem 0',
}

const labelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
}

const selectStyle: React.CSSProperties = {
  padding: '0.25rem 0.4rem',
  border: '1px solid #8c6d4a',
  borderRadius: '3px',
  background: '#fff',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
}

const btnStyle: React.CSSProperties = {
  padding: '0.35rem 0.7rem',
  border: '1px solid #8c6d4a',
  background: '#f4ecd8',
  borderRadius: '3px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '0.85rem',
}

const dangerBtnStyle: React.CSSProperties = {
  borderColor: '#c44d4d',
  color: '#c44d4d',
}
