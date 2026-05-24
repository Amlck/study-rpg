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
import { ACHIEVEMENTS } from '@study-rpg/content-medexam2-tw'
import type { AchievementCategory, AchievementTier } from '@study-rpg/core'
import { getHospitalDB } from '../../db/schema'
import { upsertLeaderboard } from '../leaderboard/api'
import { getLeaderboardProfile, markPushed } from '../../services/leaderboard-profile'

export interface LeaderboardAttributes {
  hospital_tier: number
  reputation: number
  doctor_count: number
  total_study_min: number
  /** Achievement system (v15): derived from local achievements table. */
  badges_csv: string
  subject_mastery_count: number
  /**
   * 5th leaderboard filter (add-hospital-leaderboard-correct-count-filter).
   * Sum of `mastery.correct` across all subjects (clamped ≥ 0).
   */
  total_correct: number
}

// Tier sort order (P4 < P3 < P2 < P1). Used for per-category max-tier picker.
const TIER_RANK: Record<AchievementTier, number> = {
  P4: 1,
  P3: 2,
  P2: 3,
  P1: 4,
}

// Fixed display order of categories in badges_csv (mirrors LeaderboardPage
// render order; spec hospital-leaderboard §"LeaderboardPage renders 6
// category badges").
const CATEGORY_ORDER: readonly AchievementCategory[] = [
  'study',
  'quiz',
  'recruit',
  'hospital',
  'fortune',
  'hidden',
]

/**
 * Derive `badges_csv` + `subject_mastery_count` from Dexie achievements table.
 * Per-category badges_csv: take the highest tier unlocked per category.
 * subject_mastery_count: count `subject-master-*` unlocks (excludes capstone).
 */
async function deriveAchievementSnapshot(): Promise<{
  badges_csv: string
  subject_mastery_count: number
}> {
  const db = getHospitalDB()
  const unlockedRows = await db.achievements.toArray()
  if (unlockedRows.length === 0) {
    return { badges_csv: '', subject_mastery_count: 0 }
  }
  const unlockedIds = new Set(unlockedRows.map((r) => r.id))

  // Per-category highest tier
  const highest: Partial<Record<AchievementCategory, AchievementTier>> = {}
  let subjectMastery = 0
  for (const a of ACHIEVEMENTS) {
    if (!unlockedIds.has(a.id)) continue
    if (a.id.startsWith('subject-master-')) {
      // Counts toward subject_mastery_count, NOT badges_csv (subject category
      // doesn't appear in the 6-category badges_csv per spec)
      subjectMastery += 1
      continue
    }
    if (a.category === 'subject') continue // all-subjects-mastered capstone: not counted in subjectMastery, also not in badges_csv
    const current = highest[a.category]
    if (!current || TIER_RANK[a.tier] > TIER_RANK[current]) {
      highest[a.category] = a.tier
    }
  }

  const pairs: string[] = []
  for (const cat of CATEGORY_ORDER) {
    const tier = highest[cat]
    if (tier) pairs.push(`${cat}:${tier}`)
  }
  return { badges_csv: pairs.join(','), subject_mastery_count: subjectMastery }
}

const TIER_TO_NUMBER: Record<HospitalTier, number> = {
  診所: 1,
  區域醫院: 2,
  醫學中心: 3,
  國家級教學醫院: 4,
}

export async function buildLeaderboardAttributes(): Promise<LeaderboardAttributes> {
  const db = getHospitalDB()
  const [counters, doctorCount, monotonic, achievementSnapshot, masteryRows] = await Promise.all([
    db.gameCounters.get('singleton'),
    db.doctors.count(),
    db.monotonicCounters.get('singleton'),
    deriveAchievementSnapshot(),
    db.mastery.toArray(),
  ])

  // mastery.ts is the only writer of `correct` and bumps it within the same
  // Dexie transaction that updates questionHistory, so SUM(mastery.correct)
  // matches what the existing「答對 X 題 / Y 題」UI shows. See design.md D1.
  const totalCorrect = Math.max(
    0,
    Math.floor(masteryRows.reduce((acc, m) => acc + (m.correct ?? 0), 0)),
  )

  const tierStr: HospitalTier = counters?.tier ?? '診所'
  return {
    hospital_tier: TIER_TO_NUMBER[tierStr] ?? 1,
    reputation: Math.max(0, Math.floor(counters?.reputation ?? 0)),
    doctor_count: Math.max(0, doctorCount),
    total_study_min: Math.max(0, Math.floor(monotonic?.totalStudyMinutes ?? 0)),
    badges_csv: achievementSnapshot.badges_csv,
    subject_mastery_count: achievementSnapshot.subject_mastery_count,
    total_correct: totalCorrect,
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
  // `opted_in === true` invariant from markOptedIn() guarantees nickname is
  // a non-empty string; defensive check removed (truly impossible state).
  const nickname = profile.nickname ?? ''

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
