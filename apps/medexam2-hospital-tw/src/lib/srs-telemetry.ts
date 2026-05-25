/**
 * DEV-only telemetry for 二階 SRS dogfood.
 *
 * Exposes `globalThis.__srs.getStats()` in `import.meta.env.DEV` builds so the
 * owner can inspect:
 *  - daily due queue size (snapshot)
 *  - 「太簡單」 / 「我亂猜的」 button click counts (in-memory, resets on reload)
 *  - average easeFactor + ease histogram across all questionHistory rows
 *  - graduated count (rows with interval > 30)
 *  - everWrong count (rows with everWrong=true) — health check for 「太簡單」 clear path
 *
 * Companion change: `tune-srs-binary-modifiers-and-intervals` (2026-05-25).
 */

import { getHospitalDB } from '../db/schema'

interface SrsStats {
  dailyDueQueueSize: number
  totalRows: number
  easyButtonClicks: number
  guessedButtonClicks: number
  avgEase: number
  easeHistogram: Record<string, number>
  graduatedCount: number
  everWrongCount: number
}

const clicks = { easy: 0, guessed: 0 }

export function incrementEasyClick(): void {
  clicks.easy += 1
}

export function incrementGuessedClick(): void {
  clicks.guessed += 1
}

async function getStats(): Promise<SrsStats> {
  const db = getHospitalDB()
  const now = Date.now()
  const all = await db.questionHistory.toArray()
  const totalRows = all.length
  const dailyDueQueueSize = all.filter((r) => r.nextDueAt !== null && r.nextDueAt <= now).length
  const graduatedCount = all.filter((r) => r.interval > 30).length
  const everWrongCount = all.filter((r) => r.everWrong === true).length
  const avgEase =
    totalRows === 0 ? 0 : all.reduce((s, r) => s + r.easeFactor, 0) / totalRows
  const easeHistogram: Record<string, number> = {
    '<2.0': 0,
    '2.0-2.5': 0,
    '2.5-3.0': 0,
    '3.0-4.0': 0,
    '4.0-5.0': 0,
    '>5.0': 0,
  }
  for (const r of all) {
    const e = r.easeFactor
    if (e < 2.0) easeHistogram['<2.0']++
    else if (e < 2.5) easeHistogram['2.0-2.5']++
    else if (e < 3.0) easeHistogram['2.5-3.0']++
    else if (e < 4.0) easeHistogram['3.0-4.0']++
    else if (e < 5.0) easeHistogram['4.0-5.0']++
    else easeHistogram['>5.0']++
  }
  return {
    dailyDueQueueSize,
    totalRows,
    easyButtonClicks: clicks.easy,
    guessedButtonClicks: clicks.guessed,
    avgEase: Number(avgEase.toFixed(3)),
    easeHistogram,
    graduatedCount,
    everWrongCount,
  }
}

export function installSrsDevHandle(): void {
  if (!import.meta.env.DEV) return
  ;(globalThis as { __srs?: { getStats: () => Promise<SrsStats> } }).__srs = {
    getStats,
  }
}
