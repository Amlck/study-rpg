/**
 * Monotonic counter backfill — covers pre-existing players whose
 * `monotonicCounters` singleton row pre-dates the Dexie v15 schema migration
 * that shipped with `add-achievement-system` (2026-05-24).
 *
 * The v15 migration added 5 new MAX-merge fields (`totalDoctorsRecruited`,
 * `totalP1DoctorsRecruited`, `tierUpgradeCount`, `maxDailyStreak`,
 * `maxQuizCorrectStreak`) but did not write default values to existing rows.
 * For pre-existing players, those fields read as `undefined → ?? 0` inside
 * `buildAchievementStats()`, so achievement predicates that depend on them
 * (e.g. `recruit-first-doctor` requiring `totalDoctorsRecruited >= 1`)
 * evaluate to false despite the player obviously having recruited doctors.
 *
 * This service derives the 3 RECOVERABLE fields from existing Dexie tables
 * and patches the singleton row using MAX-merge semantics (only patches when
 * derived value is strictly greater than existing value, so actual
 * gameplay-incremented values never get clobbered by a floor-estimate
 * derivation).
 *
 * 3 fields stay UNRECOVERABLE (no historical event log to replay):
 *   - totalStudyMinutes — re-accumulates from gameplay via lib/tick.ts
 *   - maxDailyStreak — re-accumulates from daily session events
 *   - maxQuizCorrectStreak — re-accumulates from quiz events
 *
 * Called once per successful sync pull cycle via the existing onPullComplete
 * chain in useSync.ts, immediately BEFORE achievement-backfill (so the
 * achievement evaluation sees the freshly-patched counter values on the same
 * pull cycle). Idempotent — short-circuits when no field needs updating.
 *
 * Spec: openspec/specs/achievement-system/spec.md "Monotonic counter backfill
 * for pre-existing players via derivation from existing tables".
 */

import type { MonotonicCountersRow } from '../db/schema'
import { getHospitalDB } from '../db/schema'

/**
 * Tier name → number of upgrades performed since starting at 診所.
 * Tier is strictly monotonic (no downgrade path in current gameplay), so the
 * current tier directly encodes the upgrade count.
 */
const TIER_TO_UPGRADE_COUNT: Record<string, number> = {
  診所: 0,
  區域醫院: 1,
  醫學中心: 2,
  國家級教學醫院: 3,
}

/**
 * Derive recoverable monotonic counter fields from existing Dexie tables and
 * patch the singleton row via MAX-merge. Returns the count of fields updated
 * (0 on short-circuit). Errors propagate to the caller; the caller (useSync's
 * onPullComplete chain) is responsible for catch+log.
 */
export async function backfillMonotonicCounters(): Promise<number> {
  const db = getHospitalDB()

  const mono = await db.monotonicCounters.get('singleton')
  if (!mono) return 0

  const counters = await db.gameCounters.get('singleton')

  const doctorsCount = await db.doctors.count()
  const retiredCount = await db.retirementLog.count()
  const p1Count = await db.doctors.where('rarity').equals('P1').count()
  // retirementLog schema is '++id, retiredAt, doctorId' — rarity is NOT
  // indexed. Use Collection.filter() for a full-scan predicate query (mirrors
  // the existing `db.retirementLog.each` pattern in lib/achievement-stats.ts).
  const retiredP1Count = await db.retirementLog.filter((r) => r.rarity === 'P1').count()

  const derivedTotalDoctors = doctorsCount + retiredCount
  const derivedTotalP1 = p1Count + retiredP1Count
  const derivedTierUpgrades = TIER_TO_UPGRADE_COUNT[counters?.tier ?? '診所'] ?? 0

  const patches: Partial<MonotonicCountersRow> = {}
  let changed = 0

  if ((mono.totalDoctorsRecruited ?? 0) < derivedTotalDoctors) {
    patches.totalDoctorsRecruited = derivedTotalDoctors
    changed += 1
  }
  if ((mono.totalP1DoctorsRecruited ?? 0) < derivedTotalP1) {
    patches.totalP1DoctorsRecruited = derivedTotalP1
    changed += 1
  }
  if ((mono.tierUpgradeCount ?? 0) < derivedTierUpgrades) {
    patches.tierUpgradeCount = derivedTierUpgrades
    changed += 1
  }

  if (changed === 0) return 0

  // _updatedAt is auto-stamped via Dexie hook in db/schema.ts; mirror the
  // existing convention in services/quiz-rewards.ts / training.ts / tick.ts
  // which call put({...mono, ...patches}) without explicit timestamp.
  await db.monotonicCounters.put({
    ...mono,
    ...patches,
  })

  return changed
}
