// Hospital → leaderboard payload snapshot adapter.
//
// Reads the 4 leaderboard attributes (tier / reputation / doctor_count /
// total_study_min) out of Dexie and shapes them into the Worker's expected
// upsert payload. Phase 4.2 will wire this into the sync engine push pipeline
// (debounced); Phase 5.4 invokes it once on first opt-in to seed the D1 row.
//
// Spec: openspec/changes/add-hospital-leaderboard/specs/hospital-leaderboard/spec.md
//       §Requirement: Four filter tabs for ranking criteria (defines the 4 attrs)

import type { HospitalTier } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../../db/schema'

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
