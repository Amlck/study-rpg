import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom'
import type { ContentPack } from '@study-rpg/core'
import { getContentPack } from '@study-rpg/content-neurons-tw'
import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'
import OverviewPage from './routes/OverviewPage'
import ConnectomePage from './routes/ConnectomePage'
import MotionDemoPage from './routes/MotionDemoPage'
import LeaderboardPage from './routes/LeaderboardPage'
import ConnectomeToastHost from './components/SynapseFormationToast'
import VariantUnlockModal from './components/VariantUnlockModal'
import {
  backfillUnlockedSlots,
  registerVariantGachaSubscriber,
} from './lib/services/variant-gacha'
import { backfillAchievementsFromCurrentStats } from './lib/services/achievement'
import { initializeDmnTrigger } from './lib/services/dmn-trigger'
import AchievementsPage from './routes/AchievementsPage'
import AchievementToastHost from './components/AchievementToastHost'
import AchievementUnlockModal from './components/AchievementUnlockModal'
import DmnCollectionPage from './routes/DmnCollectionPage'
import DmnDrawButton from './components/DmnDrawButton'
import DmnQuickReviewToast from './components/DmnQuickReviewToast'
import { AuthProvider } from './lib/auth/AuthContext'
import { AuthGate } from './components/AuthGate'
import { SyncMount } from './lib/sync/SyncMount'

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
    getContentPack(`${import.meta.env.BASE_URL}content/neurons-tw`)
      .then(async (pack) => {
        const familyById = new Map(pack.subjects.map((s) => [s.id, s]))
        const resolveFamilyDisplayName = (familyId: string): string =>
          familyById.get(familyId)?.displayName ?? familyId
        registerVariantGachaSubscriber(resolveFamilyDisplayName)
        // Register DMN trigger detector — subscribes to connectome events for
        // behavior-axis bonus draws. Idempotent on StrictMode double-mount.
        // Time-axis (reading-timer) inactive until polish-neurons-pre-ship.
        initializeDmnTrigger()
        // Backfill variants for slots the player already crossed AP threshold
        // for before this change shipped. Awaited (not fire-and-forget) so
        // chips mount with the correct count on first render. Silent inside —
        // NO modal/toast for backfilled variants. Total boot cost: ~50ms for a
        // typical save (a few rows); errors logged but do not block boot.
        await backfillUnlockedSlots(resolveFamilyDisplayName)
        // Silent achievement backfill — write rows for predicates already
        // satisfied by current Dexie state (no toast / modal / reward). Safe
        // to run AFTER variant backfill so variant-derived predicates see
        // the latest variant rows. Idempotent on subsequent boots.
        await backfillAchievementsFromCurrentStats()
        setState({ loading: false, pack })
      })
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
    <AuthProvider>
      <SyncMount />
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <ConnectomeToastHost pack={pack} />
        <VariantUnlockModal />
        <AchievementToastHost />
        <AchievementUnlockModal />
        <DmnQuickReviewToast />
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
            <NavLink to="/leaderboard" style={navLinkStyle}>
              {({ isActive }) => (
                <span style={isActive ? activeLinkStyle : undefined}>排名</span>
              )}
            </NavLink>
            <NavLink to="/achievements" style={navLinkStyle}>
              {({ isActive }) => (
                <span style={isActive ? activeLinkStyle : undefined}>成就</span>
              )}
            </NavLink>
            <NavLink to="/dmn" style={navLinkStyle}>
              {({ isActive }) => (
                <span style={isActive ? activeLinkStyle : undefined}>DMN 圖鑑</span>
              )}
            </NavLink>
            <NavLink to="/motion-demo" style={navLinkStyle}>
              {({ isActive }) => (
                <span style={isActive ? activeLinkStyle : undefined}>動畫 demo</span>
              )}
            </NavLink>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <DmnDrawButton />
              <AuthGate />
            </span>
          </nav>
          <Routes>
            <Route path="/" element={<OverviewPage pack={pack} />} />
            <Route path="/connectome" element={<ConnectomePage pack={pack} />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
            <Route path="/dmn" element={<DmnCollectionPage />} />
            <Route path="/motion-demo" element={<MotionDemoPage />} />
          </Routes>
        </main>
      </BrowserRouter>
    </AuthProvider>
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
