import { useEffect, useState } from 'react'
import type { ContentPack } from '@study-rpg/core'
import {
  decodePairKey,
  subscribeConnectomeEvents,
} from '../lib/services/connectome'
import type { SynapseState } from '../lib/db'

const STATE_LABEL: Record<SynapseState, string> = {
  dormant: '休眠 dormant',
  weak: '弱 weak',
  strong: '強 strong',
}

interface ToastEntry {
  id: number
  message: string
  emoji: string
}

interface Props {
  pack: ContentPack
}

const TOAST_DURATION_MS = 8000
let nextId = 0

export default function ConnectomeToastHost({ pack }: Props): JSX.Element {
  const [toasts, setToasts] = useState<ToastEntry[]>([])

  useEffect(() => {
    const familyById = new Map(pack.subjects.map((s) => [s.id, s]))
    const labelFor = (id: string): string => familyById.get(id)?.displayName ?? id

    const push = (emoji: string, message: string): void => {
      const id = nextId++
      setToasts((prev) => [...prev, { id, message, emoji }])
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
      }, TOAST_DURATION_MS)
    }

    const sub = subscribeConnectomeEvents({
      'connectome.synapseFormed': (p) => {
        const [a, b] = decodePairKey(p.pairKey)
        push('✨', `新連線形成：「${labelFor(a)}」⇌「${labelFor(b)}」— 兩個 neuron family 在今天同時 fire，wire together`)
      },
      'connectome.synapseStrengthened': (p) => {
        const [a, b] = decodePairKey(p.pairKey)
        push('⚡', `連線強化：「${labelFor(a)}」⇌「${labelFor(b)}」現為「${STATE_LABEL[p.toState]}」狀態`)
      },
    })

    return () => sub.dispose()
  }, [pack])

  if (toasts.length === 0) return <></>

  return (
    <div style={hostStyle}>
      {toasts.map((t) => (
        <div key={t.id} style={toastStyle}>
          <span style={emojiStyle}>{t.emoji}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

const hostStyle: React.CSSProperties = {
  position: 'fixed',
  top: '1rem',
  right: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  zIndex: 1000,
  maxWidth: 'min(420px, 90vw)',
}

const toastStyle: React.CSSProperties = {
  background: '#fdf6e3',
  border: '2px solid #b58900',
  borderRadius: '4px',
  padding: '0.6rem 0.85rem',
  boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
  fontSize: '0.85rem',
  display: 'flex',
  gap: '0.5rem',
  alignItems: 'flex-start',
  animation: 'connectomeToastIn 0.3s ease-out',
}

const emojiStyle: React.CSSProperties = {
  fontSize: '1.2rem',
  flexShrink: 0,
}
