// DomainMigrationBanner — bake-period banner shown only on the GitHub Pages
// deploy. Points users at the new home (med-study-rpg.com/1st) and offers a
// one-click local-data JSON export so anonymous users can carry their save
// across the origin change (IndexedDB is per-origin and does NOT follow).
//
// Distinct from the existing `MigrationBanner` component, which orchestrates
// the Supabase → R2 backend cutover (add-r2-cloud-sync-migration). Two banners
// can coexist; both render top-of-viewport.
//
// Gate: only renders when `import.meta.env.VITE_DEPLOY_TARGET === 'gh-pages'`.
// Cloudflare Pages build does not set this var, so the banner never appears
// on the new domain.
//
// Spec: openspec/changes/add-med-study-rpg-domain-migration/specs/deploy-pipeline/spec.md
//       — "Migration banner on GitHub Pages during bake"

import { useEffect, useState } from 'react'
import { getDB } from '@study-rpg/core'

const STORAGE_KEY = 'domain-migration-banner-dismissed-v1'
const NEW_DOMAIN_URL = 'https://med-study-rpg.com/1st/'

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
    // localStorage unavailable (private mode / quota) — banner re-renders next load, acceptable.
  }
}

async function exportLocalSnapshot(): Promise<void> {
  const db = getDB()
  const [player, itemInstances, srsCards, mentorBacklog] = await Promise.all([
    db.players.get('p1').then((p) => p ?? null),
    db.itemInstances.toArray(),
    db.srs.toArray(),
    db.mentorBacklog.get('mentorBacklog').then((m) => m ?? null),
  ])
  const payload = {
    schema_version: 'local-bake-export-v1',
    exported_at: new Date().toISOString(),
    origin: window.location.origin,
    app: 'medexam-tw',
    player,
    itemInstances,
    srsCards,
    mentorBacklog,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `study-rpg-local-${new Date().toISOString().slice(0, 10)}.json`
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
    // Refresh dismissed state in case another tab toggled it.
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
