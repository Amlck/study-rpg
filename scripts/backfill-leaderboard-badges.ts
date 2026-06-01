#!/usr/bin/env tsx
/**
 * Server-side one-shot: derive `badges_csv` + `subject_mastery_count` for D1
 * leaderboard rows whose client-side backfill never wrote them.
 *
 * Why this exists: hotfix `a9006e4` (2026-05-24, harden-backfill-chain-try-catch)
 * fixes the cascade where `checkAssignmentInvariants()` throwing prevented
 * achievement-backfill from running. But fix only helps players who get the
 * post-deploy JS bundle. Players keeping their pre-deploy tab open continue
 * running the broken cascade → their D1 row stays at `badges_csv=''`.
 *
 * This script runs the same derivation logic the client SHOULD have run, but
 * from R2 bundles via wrangler. Updates D1 directly (does NOT write back to R2
 * bundle to avoid LWW collision with the user's still-open tab).
 *
 * Trade-off: 3 source tables (`eventLog` / `fateCardHistory` / `retirementLog`)
 * are NOT synced to R2 — they're local-only. So this script treats them as
 * empty, undercounting niche achievements (survive-malpractice, draw-legendary,
 * retire-P1). Most achievement categories (study / quiz / recruit / hospital
 * tier / subject mastery) derive from synced tables and ARE accurate.
 *
 * Idempotent: filters `WHERE badges_csv = '' AND is_public = 1` so re-runs
 * skip already-populated rows.
 *
 * Run:
 *   pnpm tsx scripts/backfill-leaderboard-badges.ts --dry-run   # preview only
 *   pnpm tsx scripts/backfill-leaderboard-badges.ts             # write to D1
 */

import { execSync } from 'node:child_process'
import { readFileSync, unlinkSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
// Direct relative imports — repo root has no workspace symlink to @study-rpg/*
// (published @study-rpg/core@0.2.0 on npm lacks listUnlockedAchievements; only
// local v0.4.0 has it). tsx resolves TS source on the fly.
import { listUnlockedAchievements } from '../packages/core/src/lib/achievement'
import type {
  Player,
  AchievementStats,
  AchievementCategory,
  AchievementTier,
  SubjectId,
} from '../packages/core/src/index'
import {
  ACHIEVEMENTS,
  ALL_14_SUBJECTS,
  SUBJECT_QUESTION_TOTALS,
} from '../packages/content-medexam2-tw/src/index'

const DRY_RUN = process.argv.includes('--dry-run')
const WORKER_DIR = `${process.cwd()}/cloudflare/sync-worker`

const TIER_RANK: Record<AchievementTier, number> = { P4: 1, P3: 2, P2: 3, P1: 4 }
const CATEGORY_ORDER: readonly AchievementCategory[] = [
  'study',
  'quiz',
  'recruit',
  'hospital',
  'fortune',
  'hidden',
]
const TIER_TO_UPGRADE_COUNT: Record<string, number> = {
  診所: 0,
  區域醫院: 1,
  醫學中心: 2,
  國家級教學醫院: 3,
}

interface EmptyRow {
  user_id: string
  nickname: string
}

function syntheticPlayer(): Player {
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
    lootStats: { totalRolls: 0, rollsSinceLastSR: 0, rollsSinceLastSSR: 0 },
    createdAt: 0,
    lastActiveAt: 0,
    currentStreak: 0,
    longestStreak: 0,
  }
}

interface BundleRow {
  user_id: string
  updated_at: string
  data: unknown
}

interface Bundle {
  meta: { schema_version: number; updated_at: string; client_id: string }
  data: Record<string, BundleRow[]>
}

function statsFromBundle(bundle: Bundle): AchievementStats {
  const hospitalState = bundle.data.hospital_state?.[0]?.data as
    | { gameCounters?: { tier?: string; revenue?: number } }
    | undefined
  const monotonic = bundle.data.hospital_monotonic_counters?.[0]?.data as
    | {
        totalStudyMinutes?: number
        maxDailyStreak?: number
        maxQuizCorrectStreak?: number
        totalDoctorsRecruited?: number
        totalP1DoctorsRecruited?: number
        tierUpgradeCount?: number
      }
    | undefined
  const counters = hospitalState?.gameCounters
  const questionHistory = bundle.data.hospital_question_history ?? []
  const doctors = bundle.data.hospital_doctors ?? []

  // ── questionHistory aggregates ──────────────────────────────
  let totalQuestionsAnswered = 0
  let totalQuestionsCorrect = 0
  const subjectAttemptCounts: Record<SubjectId, number> = {}
  for (const s of ALL_14_SUBJECTS) subjectAttemptCounts[s] = 0
  for (const row of questionHistory) {
    const d = row.data as
      | { subjectId?: SubjectId; attempts?: number; correctCount?: number }
      | undefined
    if (!d) continue
    totalQuestionsAnswered += d.attempts ?? 0
    totalQuestionsCorrect += d.correctCount ?? 0
    if (d.subjectId && subjectAttemptCounts[d.subjectId] !== undefined) {
      subjectAttemptCounts[d.subjectId] += 1
    }
  }
  const overallAccuracy =
    totalQuestionsAnswered > 0 ? totalQuestionsCorrect / totalQuestionsAnswered : 0

  // ── derived counters (MAX-merge with synced) ────────────────
  // synced `monotonicCounters` may pre-date the v15 schema (missing fields);
  // derive from primary tables and take MAX with whatever bundle has.
  const doctorsCount = doctors.length
  const p1Count = doctors.filter((d) => {
    const data = d.data as { rarity?: string } | undefined
    return data?.rarity === 'P1'
  }).length
  // retirementLog NOT in bundle (local-only) → treat as 0; under-counts
  // totalDoctorsRecruited / totalP1DoctorsRecruited for players who retired
  const derivedTotalDoctors = doctorsCount
  const derivedTotalP1 = p1Count
  const derivedTierUpgrades = TIER_TO_UPGRADE_COUNT[counters?.tier ?? '診所'] ?? 0

  const totalDoctorsRecruited = Math.max(
    monotonic?.totalDoctorsRecruited ?? 0,
    derivedTotalDoctors,
  )
  const totalP1DoctorsRecruited = Math.max(
    monotonic?.totalP1DoctorsRecruited ?? 0,
    derivedTotalP1,
  )
  const tierUpgradeCount = Math.max(monotonic?.tierUpgradeCount ?? 0, derivedTierUpgrades)

  return {
    totalStudyMinutes: monotonic?.totalStudyMinutes ?? 0,
    totalQuestionsAnswered,
    totalQuestionsCorrect,
    overallAccuracy,
    maxDailyStreak: monotonic?.maxDailyStreak ?? 0,
    maxQuizCorrectStreak: monotonic?.maxQuizCorrectStreak ?? 0,
    totalDoctorsRecruited,
    totalP1DoctorsRecruited,
    tierUpgradeCount,
    subjectAttemptCounts,
    subjectTotalQuestions: { ...SUBJECT_QUESTION_TOTALS },
    currentHospitalTier: counters?.tier as AchievementStats['currentHospitalTier'],
    cumulativeRevenue: counters?.revenue ?? 0,
    // local-only sources → under-count, accepted trade-off
    medicalDisputesFailed: 0,
    malpracticeEventsSurvived: 0,
    legendaryFateCardsDrawn: 0,
    epicFateCardsDrawn: 0,
    vipPatientsCured: 0,
    p1DoctorsRetired: 0,
    // requires rooms lookup + content-pack subject↔room mapping; rare hidden
    // achievement, skip for one-shot backfill
    allP1DoctorsSpecialtyMatched: false,
  }
}

function deriveBadgesCsv(unlockedIds: Set<string>): {
  badges_csv: string
  subject_mastery_count: number
} {
  const highest: Partial<Record<AchievementCategory, AchievementTier>> = {}
  let subjectMastery = 0
  for (const a of ACHIEVEMENTS) {
    if (!unlockedIds.has(a.id)) continue
    if (a.id.startsWith('subject-master-')) {
      subjectMastery += 1
      continue
    }
    if (a.category === 'subject') continue
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

function d1Query<T = Record<string, unknown>>(sql: string): T[] {
  const out = execSync(
    `wrangler d1 execute study-rpg-leaderboard --remote --json --command ${JSON.stringify(sql)}`,
    { cwd: WORKER_DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  const parsed = JSON.parse(out)
  return (parsed[0]?.results ?? []) as T[]
}

function r2FetchM2Bundle(userId: string): Bundle | null {
  const tmpPath = `/tmp/m2-backfill-${userId}.json.gz`
  try {
    execSync(
      `wrangler r2 object get study-rpg-saves/users/${userId}/m2-snapshot.json.gz --file=${tmpPath} --remote`,
      { cwd: WORKER_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const gz = readFileSync(tmpPath)
    unlinkSync(tmpPath)
    const json = JSON.parse(gunzipSync(gz).toString('utf8')) as Bundle
    return json
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('NoSuchKey') || msg.includes('not found')) return null
    throw e
  }
}

async function main() {
  console.log(
    `backfill-leaderboard-badges — ${DRY_RUN ? 'DRY-RUN (no D1 writes)' : 'WRITE MODE'}`,
  )

  const emptyRows = d1Query<EmptyRow>(
    `SELECT user_id, nickname FROM leaderboard_m2 WHERE badges_csv = '' AND is_public = 1 ORDER BY updated_at DESC`,
  )
  console.log(`\nfound ${emptyRows.length} empty-badges rows\n`)

  let updated = 0
  let noopSkip = 0
  let noBundle = 0
  let errors = 0

  for (const row of emptyRows) {
    const tag = `${row.nickname.padEnd(15)} (${row.user_id.slice(0, 8)}…)`
    try {
      const bundle = r2FetchM2Bundle(row.user_id)
      if (!bundle) {
        console.log(`  ⊘  ${tag}  — no R2 bundle (never synced)`)
        noBundle++
        continue
      }
      const stats = statsFromBundle(bundle)
      const player = syntheticPlayer()
      const unlocked = listUnlockedAchievements(player, stats, ACHIEVEMENTS)
      const unlockedIds = new Set(unlocked.map((a) => a.id))
      const { badges_csv, subject_mastery_count } = deriveBadgesCsv(unlockedIds)

      if (!badges_csv && subject_mastery_count === 0) {
        console.log(`  ⊘  ${tag}  — no achievements derivable (player too early)`)
        noopSkip++
        continue
      }

      const now = Date.now()
      if (!DRY_RUN) {
        d1Query(
          `UPDATE leaderboard_m2 SET badges_csv = ${JSON.stringify(badges_csv)}, subject_mastery_count = ${subject_mastery_count}, updated_at = ${now} WHERE user_id = ${JSON.stringify(row.user_id)}`,
        )
      }
      console.log(
        `  ✓  ${tag}  → badges="${badges_csv}"  subject_mastery=${subject_mastery_count}`,
      )
      updated++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ✗  ${tag}  — error: ${msg.slice(0, 200)}`)
      errors++
    }
  }

  console.log(`\nsummary: updated=${updated} noop=${noopSkip} no-bundle=${noBundle} errors=${errors}`)
  if (DRY_RUN) {
    console.log(`\n(dry-run mode — no D1 writes performed. Re-run without --dry-run to apply.)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
