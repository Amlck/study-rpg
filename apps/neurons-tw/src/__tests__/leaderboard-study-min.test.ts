import { describe, it, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { db } from '../lib/db'
import { buildLeaderboardPayload } from '../lib/services/neurons-leaderboard'

/**
 * Spec Req (neurons-mode → "Leaderboard push SHALL include real reading
 * minutes from totalStudyMinutes counter"): buildLeaderboardPayload reads
 * meta['totalStudyMinutes'] via readTotalStudyMinutes() instead of hardcoding 0.
 *
 * Pre-fix: payload.total_study_min was always 0.
 * Post-fix: payload.total_study_min reflects real Dexie meta key.
 */

beforeEach(async () => {
  await db.delete()
  await db.open()
})

describe('buildLeaderboardPayload — total_study_min wiring', () => {
  it('reflects meta["totalStudyMinutes"] when accrued', async () => {
    await db.meta.put({ key: 'totalStudyMinutes', value: '42' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_study_min).toBe(42)
  })

  it('returns 0 when meta key is missing (fresh user)', async () => {
    // No meta seed — user never started reading-timer
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_study_min).toBe(0)
  })

  it('returns 0 when meta key value is undefined or malformed', async () => {
    await db.meta.put({ key: 'totalStudyMinutes', value: 'not-a-number' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_study_min).toBe(0)
  })

  it('reflects 0 explicitly stored', async () => {
    await db.meta.put({ key: 'totalStudyMinutes', value: '0' })
    const payload = await buildLeaderboardPayload('TestNick', false)
    expect(payload.total_study_min).toBe(0)
  })

  it('handles large accrual values (no overflow)', async () => {
    await db.meta.put({ key: 'totalStudyMinutes', value: '999999' })
    const payload = await buildLeaderboardPayload('TestNick', true)
    expect(payload.total_study_min).toBe(999999)
  })
})
