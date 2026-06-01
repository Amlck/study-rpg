/**
 * DEV-only telemetry for SRS dogfood.
 *
 * Exposes `globalThis.__srs.getStats()` in `import.meta.env.DEV` builds so the
 * owner can inspect:
 *  - daily due queue size (snapshot)
 *  - 「太簡單」 / 「我亂猜的」 button click counts (in-memory, resets on reload)
 *  - average ease + ease histogram across all cards (detects runaway ease creep)
 *  - graduated count (cards with interval > 30)
 *
 * In production builds (`!import.meta.env.DEV`), `__srs` is not assigned to
 * `globalThis` — Vite tree-shakes the entire module if not imported anywhere
 * but main.tsx (which itself gates the import).
 *
 * Companion change: `tune-srs-binary-modifiers-and-intervals` (2026-05-25).
 */

import { getDB } from '@study-rpg/core'

interface SrsStats {
  /** Snapshot of `db.srs.where('dueAt').belowOrEqual(now).count()` at call time. */
  dailyDueQueueSize: number
  /** Total cards in `db.srs`. */
  totalCards: number
  /** Cumulative 「太簡單」 clicks since app load (in-memory, NOT persisted). */
  easyButtonClicks: number
  /** Cumulative 「我亂猜的」 clicks since app load. */
  guessedButtonClicks: number
  /** Average `ease` across all cards. */
  avgEase: number
  /** Bucketed ease distribution: { '<2.0', '2.0-2.5', '2.5-3.0', '3.0-4.0', '4.0-5.0', '>5.0' }. */
  easeHistogram: Record<string, number>
  /** Count of cards with `interval > 30` (proxy for "graduated"). */
  graduatedCount: number
}

const clicks = { easy: 0, guessed: 0 }

export function incrementEasyClick(): void {
  clicks.easy += 1
}

export function incrementGuessedClick(): void {
  clicks.guessed += 1
}

async function getStats(): Promise<SrsStats> {
  const db = getDB()
  const now = Date.now()
  const all = await db.srs.toArray()
  const totalCards = all.length
  const dailyDueQueueSize = all.filter((c) => c.dueAt <= now).length
  const graduatedCount = all.filter((c) => c.interval > 30).length
  const avgEase = totalCards === 0 ? 0 : all.reduce((s, c) => s + c.ease, 0) / totalCards
  const easeHistogram: Record<string, number> = {
    '<2.0': 0,
    '2.0-2.5': 0,
    '2.5-3.0': 0,
    '3.0-4.0': 0,
    '4.0-5.0': 0,
    '>5.0': 0,
  }
  for (const c of all) {
    if (c.ease < 2.0) easeHistogram['<2.0']++
    else if (c.ease < 2.5) easeHistogram['2.0-2.5']++
    else if (c.ease < 3.0) easeHistogram['2.5-3.0']++
    else if (c.ease < 4.0) easeHistogram['3.0-4.0']++
    else if (c.ease < 5.0) easeHistogram['4.0-5.0']++
    else easeHistogram['>5.0']++
  }
  return {
    dailyDueQueueSize,
    totalCards,
    easyButtonClicks: clicks.easy,
    guessedButtonClicks: clicks.guessed,
    avgEase: Number(avgEase.toFixed(3)),
    easeHistogram,
    graduatedCount,
  }
}

export function installSrsDevHandle(): void {
  if (!import.meta.env.DEV) return
  ;(globalThis as { __srs?: { getStats: () => Promise<SrsStats> } }).__srs = {
    getStats,
  }
}
