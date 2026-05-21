// Hospital → leaderboard payload snapshot adapter + sync-engine orchestrator.
//
// Two responsibilities:
//   1. `buildLeaderboardAttributes()` — reads the 4 leaderboard attributes
//      (tier / reputation / doctor_count / total_study_min) out of Dexie and
//      clamps to the Worker's bounds. Used by both the initial opt-in submit
//      (LeaderboardPage) and the engine push hook below.
//   2. `pushLeaderboardIfOptedIn(userId)` — the orchestrator wired into the
//      sync engine's `onPushComplete` callback. Reads the local profile and
//      decides whether to POST `/leaderboard/upsert`:
//        - no profile → skip (never consented)
//        - profile.opted_in === false → skip (consent never given; defensive)
//        - profile.opted_in === true → push with is_public from profile
//          (defaults to true; settings-panel toggle off → false; row stays
//          fresh either way per design D5 + spec task 4.3)
//
// Spec: openspec/changes/add-hospital-leaderboard/specs/hospital-leaderboard/spec.md
//       §Requirement: Four filter tabs for ranking criteria (defines the 4 attrs)
//       openspec/changes/add-hospital-leaderboard/design.md §D2 (push timing) + §D5 (opt-out)

import type { HospitalTier } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../../db/schema'
import { upsertLeaderboard } from '../leaderboard/api'
import { getLeaderboardProfile, markPushed } from '../../services/leaderboard-profile'

export interface LeaderboardAttributes {
  hospital_tier: number
  reputation: number
  doctor_count: number
  total_study_min: number
}

// Worker enforces tier ∈ [1, 3] (`TIER_MAX = 3` in cloudflare/sync-worker/
// src/leaderboard.ts). The content pack actually defines 4 tiers including
// 國家級教學醫院. We clamp tier 4 → 3 so end-game players keep updating their
// row instead of getting silently dropped server-side. Phase 4 follow-up:
// either bump Worker TIER_MAX to 4 or expose the cap in shared types.
const TIER_TO_NUMBER: Record<HospitalTier, number> = {
  診所: 1,
  區域醫院: 2,
  醫學中心: 3,
  國家級教學醫院: 3,
}

export async function buildLeaderboardAttributes(): Promise<LeaderboardAttributes> {
  const db = getHospitalDB()
  const [counters, doctorCount, monotonic] = await Promise.all([
    db.gameCounters.get('singleton'),
    db.doctors.count(),
    db.monotonicCounters.get('singleton'),
  ])

  const tierStr: HospitalTier = counters?.tier ?? '診所'
  return {
    hospital_tier: TIER_TO_NUMBER[tierStr] ?? 1,
    reputation: Math.max(0, Math.floor(counters?.reputation ?? 0)),
    doctor_count: Math.max(0, doctorCount),
    total_study_min: Math.max(0, Math.floor(monotonic?.totalStudyMinutes ?? 0)),
  }
}

/**
 * Orchestrate one leaderboard push for the given user.
 *
 * Caller is the sync engine's `onPushComplete` hook — fires after a
 * successful R2 bundle push within the same 3s debounce window. Returns
 * a tagged result so the caller / tests can observe what happened without
 * needing to inspect IDB.
 *
 * Never throws — network / Worker errors are caught here and reported via
 * the returned `{kind:'error'}` shape so a failed leaderboard push never
 * trips the sync engine's `endOp` consecutive-failure counter (leaderboard
 * is best-effort, sync engine's primary contract is R2 bundle integrity).
 */
export type LeaderboardPushResult =
  | { kind: 'skipped'; reason: 'no-profile' | 'not-opted-in' }
  | { kind: 'pushed'; is_public: 0 | 1 }
  | { kind: 'error'; message: string }

export async function pushLeaderboardIfOptedIn(
  userId: string,
): Promise<LeaderboardPushResult> {
  const profile = await getLeaderboardProfile(userId)
  if (!profile) return { kind: 'skipped', reason: 'no-profile' }
  if (!profile.opted_in) return { kind: 'skipped', reason: 'not-opted-in' }

  // Treat undefined as visible — pre-`is_public`-field rows (v14 ship before
  // 4.2) were always public by definition (no opt-out mechanism existed yet).
  const isPublic: 0 | 1 = profile.is_public === false ? 0 : 1
  const nickname = profile.nickname
  if (typeof nickname !== 'string' || nickname.length === 0) {
    return {
      kind: 'error',
      message: 'profile_missing_nickname_despite_opted_in',
    }
  }

  try {
    const attrs = await buildLeaderboardAttributes()
    await upsertLeaderboard({
      nickname,
      ...attrs,
      is_public: isPublic,
      updated_at: Date.now(),
    })
    await markPushed(userId)
    return { kind: 'pushed', is_public: isPublic }
  } catch (err) {
    return {
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
