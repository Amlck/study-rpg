import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Question } from '@study-rpg/core'
import { recordCorrectAnswer, recordIncorrectAnswer } from '../lib/services/connectome'

interface Props {
  pool: Question[]
  onClose: () => void
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function QuizModal({ pool, onClose }: Props): JSX.Element {
  // Build session pool once: exclude image-option questions + shuffle.
  const sessionPool = useMemo(
    () => shuffle(pool.filter((q) => !q.hasOptionImages)),
    [pool],
  )

  const [idx, setIdx] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const q: Question | undefined = sessionPool[idx]
  const exhausted = idx >= sessionPool.length

  const handlePick = useCallback(
    async (optionKey: string) => {
      if (picked !== null || busy || !q) return
      setBusy(true)
      try {
        setPicked(optionKey)
        const isCorrect = q.disputed === true || optionKey === q.answer
        if (isCorrect) {
          await recordCorrectAnswer(q.subject)
        } else {
          await recordIncorrectAnswer(q.subject)
        }
      } finally {
        setBusy(false)
      }
    },
    [picked, busy, q],
  )

  const handleNext = useCallback(() => {
    setPicked(null)
    setIdx((i) => i + 1)
  }, [])

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (exhausted) {
    return (
      <div
        style={backdropStyle}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="答題完成"
      >
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          <header style={headerStyle}>
            <span>題庫已答完</span>
            <button style={closeBtnStyle} onClick={onClose} aria-label="關閉">
              ✕
            </button>
          </header>
          <div style={bodyStyle}>
            <p style={{ textAlign: 'center', color: '#5a3f29', margin: '2rem 0' }}>
              🎉 你已經答完本次 session 的所有題目（{sessionPool.length} 題）。<br />
              關閉後重新開啟可以再來一輪。
            </p>
          </div>
          <footer style={footerStyle}>
            <button style={primaryBtnStyle} onClick={onClose}>
              結束
            </button>
          </footer>
        </div>
      </div>
    )
  }

  if (!q) {
    // sessionPool empty (entire corpus was image-option questions, unlikely but defensive)
    return (
      <div
        style={backdropStyle}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label="題庫空"
      >
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          <header style={headerStyle}>
            <span>題庫空</span>
            <button style={closeBtnStyle} onClick={onClose}>
              ✕
            </button>
          </header>
          <div style={bodyStyle}>
            <p style={{ textAlign: 'center', color: '#c44d4d' }}>
              沒有可用的文字選項題目。
            </p>
          </div>
          <footer style={footerStyle}>
            <button style={primaryBtnStyle} onClick={onClose}>
              結束
            </button>
          </footer>
        </div>
      </div>
    )
  }

  const optionKeys = Object.keys(q.options)
  const correctKey = q.answer
  const isCorrect = picked !== null && (q.disputed === true || picked === correctKey)
  const revealed = picked !== null

  return (
    <div
      style={backdropStyle}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="答題中"
    >
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <span>
            第 {idx + 1} / {sessionPool.length} 題 · {q.subject}
          </span>
          <button style={closeBtnStyle} onClick={onClose} aria-label="關閉">
            ✕
          </button>
        </header>

        <div style={bodyStyle}>
          <p style={stemStyle}>{q.stem}</p>

          <div style={optionsGridStyle}>
            {optionKeys.map((key) => {
              const optText = q.options[key]
              let border = '2px solid #d4c4a0'
              let bg = '#fdf8ee'
              if (revealed) {
                if (key === correctKey && !q.disputed) {
                  border = '2px solid #4d8c4d' // green = correct answer
                  bg = '#e8f5e8'
                }
                if (key === picked) {
                  if (isCorrect) {
                    border = '2px solid #4d6dc4' // blue = selected & correct
                    bg = '#e8eef8'
                  } else {
                    border = '2px solid #c44d4d' // red = selected & wrong
                    bg = '#f8e8e8'
                  }
                }
              }
              const style: React.CSSProperties = {
                ...optionCardStyle,
                border,
                background: bg,
                cursor: picked !== null ? 'default' : 'pointer',
                opacity: picked !== null && key !== picked && key !== correctKey ? 0.65 : 1,
              }
              return (
                <button
                  key={key}
                  style={style}
                  onClick={() => handlePick(key)}
                  disabled={picked !== null}
                >
                  <span style={optionKeyStyle}>{key}</span>
                  <span>{optText}</span>
                </button>
              )
            })}
          </div>

          {revealed && (
            <div style={revealStyle}>
              {q.disputed && (
                <p style={disputedBannerStyle}>⚠️ 此題為送分題，任何選項皆計為答對。</p>
              )}
              <p style={resultLineStyle}>
                {isCorrect ? '✅ 答對' : '❌ 答錯'}
                {!q.disputed && ` · 正解：${correctKey}`}
              </p>
              {q.explanation && (
                <details style={explanationStyle} open>
                  <summary style={explanationSummaryStyle}>📖 詳解</summary>
                  <div style={explanationBodyStyle}>{q.explanation}</div>
                </details>
              )}
            </div>
          )}
        </div>

        <footer style={footerStyle}>
          {revealed ? (
            <>
              <button style={secondaryBtnStyle} onClick={onClose}>
                結束
              </button>
              <button style={primaryBtnStyle} onClick={handleNext} autoFocus>
                下一題 →
              </button>
            </>
          ) : (
            <button style={secondaryBtnStyle} onClick={onClose}>
              結束
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(20, 12, 30, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: '1rem',
}

const modalStyle: React.CSSProperties = {
  background: '#fdf8ee',
  border: '2px solid #d4a04d',
  borderRadius: '10px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
  width: '100%',
  maxWidth: '720px',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
}

const headerStyle: React.CSSProperties = {
  padding: '0.75rem 1rem',
  borderBottom: '1px solid #d4c4a0',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: '#f5e6d3',
  fontWeight: 600,
  color: '#5a3f29',
}

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: '1.2rem',
  cursor: 'pointer',
  color: '#8c6d4a',
  padding: '0.25rem 0.5rem',
}

const bodyStyle: React.CSSProperties = {
  padding: '1.25rem',
  overflowY: 'auto',
  flex: 1,
}

const stemStyle: React.CSSProperties = {
  fontSize: '1.05rem',
  lineHeight: 1.6,
  color: '#3a2a1a',
  marginTop: 0,
  marginBottom: '1.25rem',
  whiteSpace: 'pre-wrap',
}

const optionsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))',
  gap: '0.6rem',
}

const optionCardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '0.6rem',
  padding: '0.75rem 0.9rem',
  borderRadius: '6px',
  textAlign: 'left',
  fontSize: '0.95rem',
  lineHeight: 1.5,
  color: '#3a2a1a',
  fontFamily: 'inherit',
  transition: 'background 0.15s, border-color 0.15s',
}

const optionKeyStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: '50%',
  background: '#d4a04d',
  color: '#fff',
  fontSize: '0.85rem',
  fontWeight: 700,
  flexShrink: 0,
}

const revealStyle: React.CSSProperties = {
  marginTop: '1.25rem',
  padding: '0.9rem 1rem',
  background: '#fff',
  border: '1px dashed #c4a04d',
  borderRadius: '6px',
}

const disputedBannerStyle: React.CSSProperties = {
  margin: '0 0 0.5rem',
  padding: '0.4rem 0.6rem',
  background: '#fff8e0',
  border: '1px solid #d4a04d',
  borderRadius: '4px',
  fontSize: '0.88rem',
  color: '#5a3f29',
}

const resultLineStyle: React.CSSProperties = {
  margin: '0 0 0.6rem',
  fontSize: '1rem',
  fontWeight: 600,
  color: '#3a2a1a',
}

const explanationStyle: React.CSSProperties = {
  marginTop: '0.5rem',
}

const explanationSummaryStyle: React.CSSProperties = {
  cursor: 'pointer',
  fontSize: '0.9rem',
  color: '#5a3f29',
  fontWeight: 600,
  marginBottom: '0.4rem',
}

const explanationBodyStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  lineHeight: 1.6,
  color: '#3a2a1a',
  whiteSpace: 'pre-wrap',
}

const footerStyle: React.CSSProperties = {
  padding: '0.85rem 1rem',
  borderTop: '1px solid #d4c4a0',
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.6rem',
  background: '#fdf8ee',
}

const baseBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1.1rem',
  borderRadius: '6px',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  fontWeight: 600,
  cursor: 'pointer',
  border: '1px solid #d4a04d',
}

const primaryBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  background: '#d4a04d',
  color: '#fff',
}

const secondaryBtnStyle: React.CSSProperties = {
  ...baseBtnStyle,
  background: 'transparent',
  color: '#5a3f29',
}
