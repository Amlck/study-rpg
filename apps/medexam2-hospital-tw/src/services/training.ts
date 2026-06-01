/**
 * Training service — thin DB-write wrapper around the content-pack
 * `attemptTraining` pure function. Per `redesign-hospital-economy` §5.
 *
 * Caller passes the target doctor id; service:
 *   1. Reads current `gameCounters.revenue` + doctor row inside one txn
 *   2. Calls `attemptTraining` (pure)
 *   3. On non-aborted result: deducts revenue, updates doctor (rarity / pity /
 *      powerMultiplier), appends a `trainingHistory` row — all atomic
 *
 * Returns the `TrainingAttemptResult` for UI animation.
 */

import { attemptTraining, type TrainingAttemptResult } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB, type DoctorRow, type TrainingHistoryRow } from '../db/schema'

export async function trainDoctor(
  doctorId: string,
  opts: { successRateMultiplier?: number } = {},
): Promise<TrainingAttemptResult> {
  const db = getHospitalDB()

  // Achievement Phase 7 hook: training success can upgrade a doctor to P1,
  // which the recruit-composite-p1 + recruit-first-p1-doctor predicates
  // care about (totalP1DoctorsRecruited is recruitment-only by design, but
  // allP1DoctorsSpecialtyMatched reads live doctors table — affected).
  const { buildAchievementStats, buildSyntheticPlayer } = await import(
    '../lib/achievement-stats'
  )
  const { checkAndUnlockAchievements } = await import('./achievement-reward')
  const prevStats = await buildAchievementStats()
  const synthPlayer = buildSyntheticPlayer()

  const result: TrainingAttemptResult = await db.transaction(
    'rw',
    [db.doctors, db.gameCounters, db.trainingHistory, db.monotonicCounters],
    async (): Promise<TrainingAttemptResult> => {
      const doctor = await db.doctors.get(doctorId)
      if (!doctor) {
        return {
          kind: 'aborted',
          doctorId,
          reason: 'terminal-rarity',
          requiredRevenue: 0,
        } as TrainingAttemptResult
      }
      const counters = await db.gameCounters.get('singleton')
      const currentRevenue = counters?.revenue ?? 0

      const result = attemptTraining(
        { id: doctor.id, rarity: doctor.rarity, pityCounter: doctor.pityCounter },
        { currentRevenue, rng: Math.random, successRateMultiplier: opts.successRateMultiplier },
      )

      if (result.kind === 'aborted') return result

      // Apply changes atomically
      if (counters) {
        await db.gameCounters.put({
          ...counters,
          revenue: currentRevenue - result.revenueSpent,
        })
      }

      const updatedDoctor: DoctorRow =
        result.kind === 'success'
          ? {
              ...doctor,
              rarity: result.toRarity,
              powerMultiplier: result.newPowerMultiplier,
              pityCounter: 0,
              spriteKey: doctor.spriteKey.endsWith('-female')
                ? `doctor-${doctor.subjectId}-${result.toRarity}-female`
                : `doctor-${doctor.subjectId}-${result.toRarity}`,
            }
          : { ...doctor, pityCounter: result.newPityCounter }
      await db.doctors.put(updatedDoctor)

      const historyRow: TrainingHistoryRow = {
        doctorId: doctor.id,
        attemptedAt: Date.now(),
        fromRarity: result.fromRarity,
        toRarity: result.toRarity,
        cost: result.revenueSpent,
        success: result.kind === 'success',
        pityTriggered: result.kind === 'success' ? result.pityTriggered : false,
      }
      await db.trainingHistory.add(historyRow)

      // ─── Achievement counter (v15): bump totalP1DoctorsRecruited if
      // training success crossed into P1 rarity ──────────────────────────
      if (result.kind === 'success' && result.toRarity === 'P1') {
        const mono = await db.monotonicCounters.get('singleton')
        if (mono) {
          await db.monotonicCounters.put({
            ...mono,
            totalP1DoctorsRecruited: (mono.totalP1DoctorsRecruited ?? 0) + 1,
          })
        }
      }

      return result
    },
  )

  // Achievement check post-tx
  try {
    const nextStats = await buildAchievementStats()
    await checkAndUnlockAchievements(synthPlayer, prevStats, synthPlayer, nextStats)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[training] achievement check failed:', err)
  }

  return result
}
