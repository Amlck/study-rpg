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
  signal?: AbortSignal,
): Promise<LeaderboardNicknameCheckResponse> {
  const token = await getAuthToken()
  const url = `${getWorkerUrl()}/leaderboard/nickname-check?n=${encodeURIComponent(candidate)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    signal,
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
/**
 * GET /leaderboard/me
 *
 * Cross-origin seed-back: a client landing on a new origin (e.g. post-
 * domain-migration `med-study-rpg.com`) whose IndexedDB `leaderboardProfile`
 * is empty calls this to discover whether the user already has a server-
 * side row from a prior session — avoids a redundant opt-in modal.
 *
 * Returns `null` when the user has never opted in (200 + `{ row: null }`),
 * or the server row when found. Endpoint added 2026-05-22 by
 * `fix(migration-scope): include leaderboardProfile in m2 bundle` —
 * Worker code may still be 404 on older deployments; callers should
 * tolerate that and fall through to the local opt-in flow.
 */
export interface LeaderboardServerRow {
  user_id: string
  nickname: string
  hospital_tier: number
  reputation: number
  doctor_count: number
  total_study_min: number
  is_public: boolean
  updated_at: number
  /**
   * Achievement system (v15) / 5th filter (0005). Optional for back-compat
   * with pre-migration server responses; clients MUST coalesce undefined →
   * '' / 0.
   */
  badges_csv?: string
  subject_mastery_count?: number
  total_correct?: number
}

export async function fetchLeaderboardMe(): Promise<LeaderboardServerRow | null> {
  const token = await getAuthToken()
  const url = `${getWorkerUrl()}/leaderboard/me`
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 404) {
    // Endpoint not deployed yet (old Worker version) — treat same as "no row".
    return null
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`leaderboard_me_failed_${res.status}: ${body.slice(0, 200)}`)
  }
  const json = (await res.json()) as { row: LeaderboardServerRow | null }
  return json.row
}

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
