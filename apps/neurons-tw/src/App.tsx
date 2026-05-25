import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import type { ContentPack } from '@study-rpg/core'
import { getContentPack } from '@study-rpg/content-neurons-tw'
import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import OverviewPage from './routes/OverviewPage'
import ConnectomePage from './routes/ConnectomePage'
import ConnectomeToastHost from './components/SynapseFormationToast'

interface AppState {
  loading: boolean
  pack?: ContentPack
  error?: string
}

export default function App(): JSX.Element {
  const [state, setState] = useState<AppState>({ loading: true })

  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(THEME_PIXEL_NEURONS.cssVars)) {
      root.style.setProperty(k, v)
    }
    getContentPack()
      .then((pack) => setState({ loading: false, pack }))
      .catch((e) => setState({ loading: false, error: String(e) }))
  }, [])

  if (state.loading) return <main style={pageStyle}><p>載入 neurons 內容中…</p></main>
  if (state.error)
    return (
      <main style={pageStyle}>
        <p style={{ color: '#c44d4d' }}>錯誤：{state.error}</p>
      </main>
    )
  const pack = state.pack!

  return (
    <BrowserRouter>
      <ConnectomeToastHost pack={pack} />
      <main style={pageStyle}>
        <nav style={navStyle}>
          <NavLink to="/" style={navLinkStyle} end>
            {({ isActive }) => <span style={isActive ? activeLinkStyle : undefined}>總覽</span>}
          </NavLink>
          <NavLink to="/connectome" style={navLinkStyle}>
            {({ isActive }) => (
              <span style={isActive ? activeLinkStyle : undefined}>Connectome 連結組</span>
            )}
          </NavLink>
        </nav>
        <Routes>
          <Route path="/" element={<OverviewPage pack={pack} />} />
          <Route path="/connectome" element={<ConnectomePage pack={pack} />} />
        </Routes>
      </main>
    </BrowserRouter>
  )
}

const pageStyle: React.CSSProperties = {
  maxWidth: 820,
  margin: '2rem auto',
  padding: '0 1.25rem',
  fontFamily: "'Cubic 11', 'Noto Sans TC', sans-serif",
}

const navStyle: React.CSSProperties = {
  display: 'flex',
  gap: '1rem',
  marginBottom: '1.25rem',
  borderBottom: '2px solid #8c6d4a',
  paddingBottom: '0.5rem',
}

const navLinkStyle: React.CSSProperties = {
  textDecoration: 'none',
  color: '#5a3f29',
  fontWeight: 600,
}

const activeLinkStyle: React.CSSProperties = {
  borderBottom: '2px solid #b58900',
  paddingBottom: '0.25rem',
  color: '#b58900',
}
