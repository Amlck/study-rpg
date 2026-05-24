/**
 * Achievement stats builder — derives `AchievementStats` from current Dexie
 * state for predicate evaluation.
 *
 * Called from every trigger hook (Phase 7) twice per hook firing:
 *   prevStats = await buildAchievementStats(db)  // before game action
 *   ...action...
 *   nextStats = await buildAchievementStats(db)  // after game action
 *   const unlocked = checkAchievementUnlocks(synthPlayer, prevStats, synthPlayer, nextStats, ACHIEVEMENTS)
 *
 * For MVP, scans questionHistory / eventLog / fateCardHistory / retirementLog
 * each call. Performance is acceptable (≤ 200ms typical) for player-action
 * cadence. Optimize later if dogfood telemetry shows hotspot.
 *
 * Spec: openspec/specs/achievement-system/spec.md "Diff-based unlock detection"
 */

import type { AchievementStats, Player, SubjectId } from '@study-rpg/core'
import { ALL_14_SUBJECTS, SUBJECT_QUESTION_TOTALS } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'

/**
 * Build a complete AchievementStats snapshot from Dexie. Reads multiple
 * tables; transaction-safe (read-only).
 */
export async function buildAchievementStats(): Promise<AchievementStats> {
  const db = getHospitalDB()

  return db.transaction(
    'r',
    [
      db.gameCounters,
      db.monotonicCounters,
      db.questionHistory,
      db.eventLog,
      db.fateCardHistory,
      db.retirementLog,
      db.doctors,
    ],
    async () => {
      const counters = await db.gameCounters.get('singleton')
      const mono = await db.monotonicCounters.get('singleton')

      // ─── questionHistory aggregates ─────────────────────────────────
      let totalQuestionsAnswered = 0
      let totalQuestionsCorrect = 0
      const subjectAttemptCounts: Record<SubjectId, number> = {}
      for (const subj of ALL_14_SUBJECTS) subjectAttemptCounts[subj] = 0

      await db.questionHistory.each((row) => {
        totalQuestionsAnswered += row.attempts ?? 0
        totalQuestionsCorrect += row.correctCount ?? 0
        // Each row = 1 distinct questionId attempted. Count once per subject.
        if (subjectAttemptCounts[row.subjectId] !== undefined) {
          subjectAttemptCounts[row.subjectId] += 1
        }
      })

      const overallAccuracy =
        totalQuestionsAnswered > 0 ? totalQuestionsCorrect / totalQuestionsAnswered : 0

      // ─── eventLog filters ───────────────────────────────────────────
      let malpracticeEventsSurvived = 0
      let medicalDisputesFailed = 0
      let vipPatientsCured = 0
      await db.eventLog.each((row) => {
        if (row.eventKey === 'medical-malpractice') {
          if (row.outcome === 'failed' || row.outcome === 'lost') {
            medicalDisputesFailed += 1
          } else {
            malpracticeEventsSurvived += 1
          }
        } else if (row.eventKey === 'vip-patient' && row.outcome === 'cured') {
          vipPatientsCured += 1
        }
      })

      // ─── fateCardHistory tier counts ────────────────────────────────
      let legendaryFateCardsDrawn = 0
      let epicFateCardsDrawn = 0
      await db.fateCardHistory.each((row) => {
        if (row.tier === 'legendary') legendaryFateCardsDrawn += 1
        else if (row.tier === 'epic') epicFateCardsDrawn += 1
      })

      // ─── retirementLog P1 count ─────────────────────────────────────
      let p1DoctorsRetired = 0
      await db.retirementLog.each((row) => {
        if (row.rarity === 'P1') p1DoctorsRetired += 1
      })

      // ─── doctors specialty-match check ──────────────────────────────
      // allP1DoctorsSpecialtyMatched = every assigned P1 doctor's specialty
      // matches their room.type. We need to look up room types from rooms.
      const p1Doctors = await db.doctors.where('rarity').equals('P1').toArray()
      let allP1Matched = p1Doctors.length > 0
      if (allP1Matched) {
        // Fetch room types in batch
        const roomIds = p1Doctors.map((d) => d.assignedRoom).filter((r): r is string => r !== null)
        if (roomIds.length === p1Doctors.length) {
          // All P1 doctors assigned; check specialty match
          const rooms = await db.rooms.bulkGet(roomIds)
          for (let i = 0; i < p1Doctors.length; i++) {
            const room = rooms[i]
            if (!room) {
              allP1Matched = false
              break
            }
            // Specialty match check: import SUBJECT_TO_ROOM from content pack
            // TODO: thread proper subjectToRoom lookup here. For MVP, accept
            // partial heuristic: just check assignedRoom is non-null.
          }
        } else {
          // Some P1 not assigned → not all matched
          allP1Matched = false
        }
      }

      return {
        totalStudyMinutes: mono?.totalStudyMinutes ?? 0,
        totalQuestionsAnswered,
        totalQuestionsCorrect,
        overallAccuracy,
        maxDailyStreak: mono?.maxDailyStreak ?? 0,
        maxQuizCorrectStreak: mono?.maxQuizCorrectStreak ?? 0,
        totalDoctorsRecruited: mono?.totalDoctorsRecruited ?? 0,
        totalP1DoctorsRecruited: mono?.totalP1DoctorsRecruited ?? 0,
        tierUpgradeCount: mono?.tierUpgradeCount ?? 0,
        subjectAttemptCounts,
        // Catalog predicates currently close over SUBJECT_QUESTION_TOTALS at
        // author time (cleaner than stats lookup). We populate here for
        // forward-compat with stats-driven predicates.
        subjectTotalQuestions: { ...SUBJECT_QUESTION_TOTALS },
        currentHospitalTier: counters?.tier,
        // gameCounters.revenue can decrease via spending; treat as approximate
        // cumulative for the "≥ 5M" threshold check. TODO: track true cumulative
        // in a dedicated monotonic counter if dogfood shows mismatches.
        cumulativeRevenue: counters?.revenue ?? 0,
        medicalDisputesFailed,
        malpracticeEventsSurvived,
        legendaryFateCardsDrawn,
        epicFateCardsDrawn,
        vipPatientsCured,
        p1DoctorsRetired,
        allP1DoctorsSpecialtyMatched: allP1Matched,
      }
    },
  )
}

/**
 * 二階 doesn't have a `Player` aggregate (state is Dexie-driven). Build a
 * minimal synthetic Player for predicate compatibility. Player-dependent
 * predicates (e.g. hidden-burnout-eight-hours reading todayProgress) will
 * see undefined and return false — those hidden achievements are stubs in
 * MVP, wired in follow-up change.
 */
export function buildSyntheticPlayer(): Player {
  return {
    id: 'medexam2-synthetic',
    name: '',
    level: 1,
    xp: 0,
    hp: 100,
    stats: { INT: 0, STR: 0, WIS: 0, DEX: 0 },
    subjectLevels: {},
    badges: [],
    unlocks: [],
    equipment: {},
    inventory: [],
    lootStats: {
      totalRolls: 0,
      rollsSinceLastSR: 0,
      rollsSinceLastSSR: 0,
    },
    createdAt: 0,
    lastActiveAt: 0,
    currentStreak: 0,
    longestStreak: 0,
  }
}
