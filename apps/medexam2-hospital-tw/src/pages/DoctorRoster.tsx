/**
 * 醫師 page (`/roster` route) — sub-tab container hosting 醫師名冊 (roster)
 * and 進修 (training) sub-tabs. Active sub-tab is controlled by URL search
 * parameter `?tab=roster|training` (default `roster` when absent), mirroring
 * the BookmarksPage `?tab=manual|wrong` pattern.
 *
 * Switching sub-tabs unmounts the other panel (no state preservation —
 * filters / scroll position / training-battle state reset on switch). When
 * a training battle is in progress, switching away prompts a confirm dialog
 * per spec hospital-management-mode "Switching away from training during
 * an active battle SHALL prompt confirmation".
 */

import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DoctorRosterPanel } from './DoctorRosterPanel'
import { TrainingPanel } from './TrainingPanel'

type DoctorSubTab = 'roster' | 'training'

function parseSubTab(raw: string | null): DoctorSubTab {
  return raw === 'training' ? 'training' : 'roster'
}

export function DoctorRoster() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = parseSubTab(searchParams.get('tab'))
  const [battleActive, setBattleActive] = useState(false)

  const setTab = useCallback((next: DoctorSubTab) => {
    if (next === activeTab) return
    if (activeTab === 'training' && battleActive) {
      const ok = typeof window !== 'undefined'
        ? window.confirm('進修戰鬥進行中，切換會放棄當前戰鬥。確定？')
        : true
      if (!ok) return
    }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', next)
    setSearchParams(nextParams, { replace: true })
  }, [activeTab, battleActive, searchParams, setSearchParams])

  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>{activeTab === 'training' ? '醫師進修' : '醫師名冊'}</h1>
        <Link to="/" className="nav-link">
          ← 回主畫面
        </Link>
      </header>

      <nav className="doctor-tabs" role="tablist" aria-label="醫師分類">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'roster'}
          className={`doctor-tabs__tab${activeTab === 'roster' ? ' doctor-tabs__tab--active' : ''}`}
          onClick={() => setTab('roster')}
        >
          醫師名冊
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'training'}
          className={`doctor-tabs__tab${activeTab === 'training' ? ' doctor-tabs__tab--active' : ''}`}
          onClick={() => setTab('training')}
        >
          進修
        </button>
      </nav>

      {activeTab === 'roster' ? (
        <DoctorRosterPanel />
      ) : (
        <TrainingPanel onActiveBattleChange={setBattleActive} />
      )}
    </main>
  )
}
