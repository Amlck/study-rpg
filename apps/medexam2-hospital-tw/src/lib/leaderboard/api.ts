// Hospital leaderboard Worker API client.
//
// Endpoints live in cloudflare/sync-worker/src/leaderboard.ts. All require
// a Supabase JWT in the Authorization header (verifyJWT on the worker side
// gates by `sub` claim) except `fetchLeaderboardSnapshot` (public read).

import type {
  LeaderboardFilter,
  LeaderboardNicknameCheckResponse,
  LeaderboardSnapshot,
  LeaderboardUpsertPayload,
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

/**
 * POST /leaderboard/upsert
 *
 * Worker reads `user_id` from the verified JWT `sub` claim — body never
 * carries it (cross-tenancy forging guard). Returns 409 `nickname_taken`
 * when another user already owns this nickname (case-insensitive). All
 * out-of-bounds attribute values are silently dropped server-side with a
 * 200 OK + `{dropped: <reason>}` body (see worker design D3).
 */
export async function upsertLeaderboard(
  payload: LeaderboardUpsertPayload,
): Promise<void> {
  const token = await getAuthToken()
  const url = `${getWorkerUrl()}/leaderboard/upsert`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 409) {
      throw new Error('nickname_taken')
    }
    throw new Error(`leaderboard_upsert_failed_${res.status}: ${body.slice(0, 200)}`)
  }
}

/**
 * POST /leaderboard/opt-out
 *
 * Flips `is_public = 0` on the player's row. Row is preserved so re-enabling
 * opt-in restores rank history without forcing the player to re-consent.
 */
export async function optOutLeaderboard(): Promise<void> {
  const token = await getAuthToken()
  const url = `${getWorkerUrl()}/leaderboard/opt-out`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`leaderboard_opt_out_failed_${res.status}: ${body.slice(0, 200)}`)
  }
}

/**
 * DELETE /leaderboard/me
 *
 * Hard-deletes the player's row. Called from delete-account / delete-data
 * flows (Phase 7.4 / 7.5). Frees the nickname for reuse by other players.
 */
export async function deleteLeaderboardMe(): Promise<void> {
  const token = await getAuthToken()
  const url = `${getWorkerUrl()}/leaderboard/me`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`leaderboard_delete_failed_${res.status}: ${body.slice(0, 200)}`)
  }
}
