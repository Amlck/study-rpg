import { useEffect, useState } from 'react'
import type { ContentPack } from '@study-rpg/core'
import { getContentPack } from '@study-rpg/content-neurons-tw'
import { THEME_PIXEL_NEURONS, COSMETIC_CATALOG_SIZE } from '@study-rpg/theme-pixel-neurons'

interface AppState {
  loading: boolean
  pack?: ContentPack
  error?: string
}

export default function App() {
  const [state, setState] = useState<AppState>({ loading: true })

  useEffect(() => {
    // Inject theme CSS vars at boot
    const root = document.documentElement
    for (const [k, v] of Object.entries(THEME_PIXEL_NEURONS.cssVars)) {
      root.style.setProperty(k, v)
    }

    getContentPack()
      .then((pack) => setState({ loading: false, pack }))
      .catch((e) => setState({ loading: false, error: String(e) }))
  }, [])

  if (state.loading) return <main style={pageStyle}><p>Loading neurons content…</p></main>
  if (state.error) return <main style={pageStyle}><p style={{ color: '#c44d4d' }}>Error: {state.error}</p></main>
  const pack = state.pack!

  const ntCount = (br: string) => pack.subjects.filter((s) => s.group === br).length

  return (
    <main style={pageStyle}>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>
          {pack.meta.displayName}
        </h1>
        <p style={{ margin: 0, color: '#5a3f29', fontStyle: 'italic' }}>
          "Neurons that fire together, wire together." — Donald Hebb
        </p>
      </header>

      <section style={sectionStyle}>
        <h2 style={h2Style}>📊 Content overview</h2>
        <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
          <li>Total questions: <strong>{pack.questions.length}</strong></li>
          <li>Subjects (neuron families): <strong>{pack.subjects.length}</strong></li>
          <li>NT branch distribution: DA {ntCount('DA')} / 5-HT {ntCount('5HT')} / GABA {ntCount('GABA')} / Glu {ntCount('Glu')}</li>
          <li>Theme: {THEME_PIXEL_NEURONS.meta.displayName} ({THEME_PIXEL_NEURONS.itemCatalog.length} items, {COSMETIC_CATALOG_SIZE} cosmetics)</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>🧠 4 Neurotransmitter Stats</h2>
        {pack.meta.statSchema && (
          <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
            {pack.meta.statSchema.order.map((key) => (
              <li key={key} style={{ borderLeft: `4px solid ${pack.meta.statSchema!.colors[key]}`, paddingLeft: '0.6rem', margin: '0.35rem 0' }}>
                <strong>{pack.meta.statSchema!.labels[key]}</strong>
                <span style={{ color: '#5a3f29', marginLeft: '0.5rem', fontSize: '0.85em' }}>
                  (key: <code>{key}</code>)
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>🧬 11 Neuron Family Subjects</h2>
        {(['DA', '5HT', 'GABA', 'Glu'] as const).map((branch) => {
          const familiesInBranch = pack.subjects.filter((s) => s.group === branch)
          if (familiesInBranch.length === 0) return null
          return (
            <div key={branch} style={{ marginBottom: '0.8rem' }}>
              <h3 style={{ fontSize: '0.95rem', margin: '0.4rem 0 0.25rem', color: familiesInBranch[0]?.color ?? '#000' }}>
                {branch} branch ({familiesInBranch.length})
              </h3>
              <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
                {familiesInBranch.map((s) => (
                  <li key={s.id} style={{ margin: '0.25rem 0' }}>
                    <strong style={{ color: s.color }}>{s.displayName}</strong>
                    <span style={{ color: '#5a3f29', marginLeft: '0.4rem', fontSize: '0.85em' }}>
                      ({s.totalQuestions} Q, id: <code>{s.id}</code>)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </section>

      <footer style={{ marginTop: '2rem', fontSize: '0.8em', color: '#5a3f29' }}>
        <p style={{ margin: '0.25rem 0' }}>
          Credits: {pack.meta.credits.map((c, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.name}</a> : c.name} ({c.license})
            </span>
          ))}
        </p>
        <p style={{ margin: '0.25rem 0' }}>
          Scaffold + content + theme wired. Next: sprites + connectome viz + gacha + leaderboard + achievements + deploy.
        </p>
      </footer>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  maxWidth: 820,
  margin: '2rem auto',
  padding: '0 1.25rem',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
}

const sectionStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  padding: '0.85rem 1rem',
  marginBottom: '1rem',
  borderRadius: '4px',
}

const h2Style: React.CSSProperties = {
  fontSize: '1rem',
  margin: '0 0 0.5rem',
  borderBottom: '1px solid #c4a878',
  paddingBottom: '0.25rem',
}
