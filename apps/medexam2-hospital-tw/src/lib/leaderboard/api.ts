// Hospital leaderboard Worker API client.
//
// Endpoints live in cloudflare/sync-worker/src/leaderboard.ts. All require
// a Supabase JWT in the Authorization header (verifyJWT on the worker side
// gates by `sub` claim).
//
// Phase 5 implements only nickname-check (used by NicknameField).
// Phase 4 will expand this file with upsert / opt-out / delete / fetch
// alongside the sync engine adapter.

import type {
  LeaderboardFilter,
  LeaderboardNicknameCheckResponse,
  LeaderboardSnapshot,
} from '@study-rpg/core'
import { getSupabase } from '../auth/client'
import { getWorkerUrl } from '../sync/r2/client'

async function getAuthToken(): Promise<string> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('leaderboard_no_supabase_client')
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession()
  if (error) throw new Error(`leaderboard_no_session: ${error.message}`)
  if (!session?.access_token) throw new Error('leaderboard_no_session')
  return session.access_token
}

/**
 * GET /leaderboard/nickname-check?n=<candidate>
 *
 * Worker is JWT-gated (prevents unauthenticated dictionary enumeration of
 * nicknames). Returns `{available: false, reason: 'invalid_length'}` for
 * lengths outside 2–12 codepoints; callers should still pre-validate length
 * client-side to avoid wasting a round-trip on obviously invalid input.
 */
export async function checkNicknameAvailability(
  candidate: string,
): Promise<LeaderboardNicknameCheckResponse> {
  const token = await getAuthToken()
  const url = `${getWorkerUrl()}/leaderboard/nickname-check?n=${encodeURIComponent(candidate)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`nickname_check_failed_${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as LeaderboardNicknameCheckResponse
}

/**
 * GET /leaderboard/:filter
 *
 * Public read — no JWT required. Worker reads from a KV snapshot written
 * hourly by the cron handler; client never touches D1 on the read path.
 *
 * Returns `{rows: [], last_updated_at: null, total_count: 0}` if the cron
 * has not yet run for the first time (cold-start after deploy). UI surfaces
 * the empty state when `total_count === 0`.
 */
export async function fetchLeaderboardSnapshot(
  filter: LeaderboardFilter,
): Promise<LeaderboardSnapshot> {
  const url = `${getWorkerUrl()}/leaderboard/${filter}`
  const res = await fetch(url, { method: 'GET' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`leaderboard_fetch_failed_${res.status}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as LeaderboardSnapshot
}
