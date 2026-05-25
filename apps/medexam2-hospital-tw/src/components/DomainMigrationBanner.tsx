// DomainMigrationBanner (二階 hospital) — bake-period banner shown only on
// the GitHub Pages deploy. Points users at https://med-study-rpg.com/2nd/ and
// offers a one-click local Dexie snapshot JSON export.
//
// Distinct from the existing `MigrationBanner` (R2 backend migration).
//
// Spec: openspec/changes/add-med-study-rpg-domain-migration/specs/deploy-pipeline/spec.md
//       — "Migration banner on GitHub Pages during bake"

import { useEffect, useState } from 'react'
import { getHospitalDB } from '../db/schema'

const STORAGE_KEY = 'domain-migration-banner-dismissed-v1'
const NEW_DOMAIN_URL = 'https://med-study-rpg.com/2nd/'

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // localStorage unavailable — banner re-renders next load, acceptable.
  }
}

async function exportLocalSnapshot(): Promise<void> {
  const db = getHospitalDB()
  const [
    affinity,
    doctors,
    gachaStats,
    tickets,
    rooms,
    gameCounters,
    mastery,
    questionHistory,
    bookmarks,
    monotonicCounters,
    trainingHistory,
    eventLog,
    fateCardHistory,
    retirementLog,
    targetedTickets,
    targetedTicketHistory,
    erConsultLog,
    leaderboardProfile,
    bannerUnlockBonusLog,
  ] = await Promise.all([
    db.affinity.toArray(),
    db.doctors.toArray(),
    db.gachaStats.toArray(),
    db.tickets.toArray(),
    db.rooms.toArray(),
    db.gameCounters.toArray(),
    db.mastery.toArray(),
    db.questionHistory.toArray(),
    db.bookmarks.toArray(),
    db.monotonicCounters.toArray(),
    db.trainingHistory.toArray(),
    db.eventLog.toArray(),
    db.fateCardHistory.toArray(),
    db.retirementLog.toArray(),
    db.targetedTickets.toArray(),
    db.targetedTicketHistory.toArray(),
    db.erConsultLog.toArray(),
    db.leaderboardProfile.toArray(),
    db.bannerUnlockBonusLog.toArray(),
  ])
  const payload = {
    schema_version: 'local-bake-export-v1',
    exported_at: new Date().toISOString(),
    origin: window.location.origin,
    app: 'medexam2-hospital-tw',
    affinity,
    doctors,
    gachaStats,
    tickets,
    rooms,
    gameCounters,
    mastery,
    questionHistory,
    bookmarks,
    monotonicCounters,
    trainingHistory,
    eventLog,
    fateCardHistory,
    retirementLog,
    targetedTickets,
    targetedTicketHistory,
    erConsultLog,
    leaderboardProfile,
    bannerUnlockBonusLog,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `study-rpg-hospital-local-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function DomainMigrationBanner(): JSX.Element | null {
  const enabled = import.meta.env.VITE_DEPLOY_TARGET === 'gh-pages'
  const [hidden, setHidden] = useState<boolean>(() => isDismissed())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    setHidden(isDismissed())
  }, [enabled])

  if (!enabled || hidden) return null

  async function handleExport(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await exportLocalSnapshot()
    } catch (e) {
      setError(e instanceof Error ? e.message : '匯出失敗')
    } finally {
      setBusy(false)
    }
  }

  function handleDismiss(): void {
    markDismissed()
    setHidden(true)
  }

  return (
    <div className="domain-migration-banner" role="region" aria-label="搬遷公告">
      <span className="domain-migration-banner__msg">
        本站即將搬遷至新網址 <strong>med-study-rpg.com</strong>。建議先匯出本機資料，再到新網址匯入或登入雲端同步。
      </span>
      <a className="domain-migration-banner__cta" href={NEW_DOMAIN_URL}>
        前往新網址 →
      </a>
      <button
        type="button"
        className="domain-migration-banner__export"
        onClick={handleExport}
        disabled={busy}
      >
        {busy ? '匯出中…' : '匯出本機 JSON'}
      </button>
      <button
        type="button"
        className="domain-migration-banner__dismiss"
        onClick={handleDismiss}
        aria-label="關閉公告"
      >
        ✕
      </button>
      {error && <span className="domain-migration-banner__error">{error}</span>}
    </div>
  )
}
