#!/usr/bin/env tsx
/**
 * Server-side one-shot: derive `total_correct` for D1 leaderboard rows whose
 * client-side push never wrote a non-zero value.
 *
 * Why this exists: `add-hospital-leaderboard-correct-count-filter` shipped
 * 2026-05-24 added a new `total_correct` column. Stale-bundle clients
 * (browsers with cached pre-deploy JS) push payloads without the new field,
 * which the Worker treats as 0 and writes to D1. Result: high-reputation
 * end-game players (米漢堡大人 / Nigga / kkk / van / LLL) appear at the
 * bottom of the「答對總題數」leaderboard with 0 despite obvious quiz
 * activity (reputation > 30k, study minutes > 100).
 *
 * This script reads each affected player's R2 m2-snapshot bundle, computes
 * `SUM(questionHistory.correctCount)` — the same aggregate the new client
 * code now uses per `fix-hospital-leaderboard-correct-source` (commit
 * a73918f) — and UPDATEs D1 directly.
 *
 * Why direct D1 (not via Worker POST /leaderboard/upsert):
 *   - Worker upsert needs a JWT and pulls user_id from `sub` claim. Backfilling
 *     other users' rows would need JWT minting (impossible without Supabase
 *     secret).
 *   - Direct D1 UPDATE is owner-only (wrangler with d1 write scope) and
 *     surgical (touches only total_correct + updated_at).
 *
 * Race safety: UPDATE clause includes `AND total_correct = 0` so a player
 * who happens to land a fresh-bundle push between this script's SELECT and
 * UPDATE (very rare) does NOT get clobbered — Worker ratchet would also
 * preserve their value against any subsequent stale push.
 *
 * Idempotent: filter is `total_correct = 0 AND is_public = 1`. Re-runs skip
 * already-populated rows.
 *
 * Run:
 *   pnpm tsx scripts/backfill-leaderboard-total-correct.ts --dry-run
 *   pnpm tsx scripts/backfill-leaderboard-total-correct.ts --user-id <sub>  # single-player sample
 *   pnpm tsx scripts/backfill-leaderboard-total-correct.ts                  # batch write
 */

import { execSync } from 'node:child_process'
import { readFileSync, unlinkSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const DRY_RUN = process.argv.includes('--dry-run')
const SINGLE_USER_ARG_IDX = process.argv.indexOf('--user-id')
const SINGLE_USER_ID =
  SINGLE_USER_ARG_IDX >= 0 ? process.argv[SINGLE_USER_ARG_IDX + 1] : null

const WORKER_DIR = `${process.cwd()}/cloudflare/sync-worker`

interface EmptyRow {
  user_id: string
  nickname: string
  reputation: number
  total_study_min: number
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

function d1Query<T = Record<string, unknown>>(sql: string): T[] {
  const out = execSync(
    `wrangler d1 execute study-rpg-leaderboard --remote --json --command ${JSON.stringify(sql)}`,
    { cwd: WORKER_DIR, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  const parsed = JSON.parse(out)
  return (parsed[0]?.results ?? []) as T[]
}

function r2FetchM2Bundle(userId: string): Bundle | null {
  const tmpPath = `/tmp/m2-backfill-correct-${userId}.json.gz`
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

function totalCorrectFromBundle(bundle: Bundle): number {
  const questionHistory = bundle.data.hospital_question_history ?? []
  let sum = 0
  for (const row of questionHistory) {
    const d = row.data as { correctCount?: number } | undefined
    if (d) sum += d.correctCount ?? 0
  }
  return Math.max(0, Math.floor(sum))
}

async function main() {
  const mode = DRY_RUN ? 'DRY-RUN (no D1 writes)' : 'WRITE MODE'
  const scope = SINGLE_USER_ID ? `single-user (${SINGLE_USER_ID.slice(0, 8)}…)` : 'batch'
  console.log(`backfill-leaderboard-total-correct — ${mode}, ${scope}`)

  const filterClause = SINGLE_USER_ID
    ? `user_id = ${JSON.stringify(SINGLE_USER_ID)}`
    : `total_correct = 0 AND is_public = 1`

  const rows = d1Query<EmptyRow>(
    `SELECT user_id, nickname, reputation, total_study_min FROM leaderboard_m2 WHERE ${filterClause} ORDER BY reputation DESC`,
  )
  console.log(`\nfound ${rows.length} row(s) to inspect\n`)

  let updated = 0
  let alreadyOk = 0
  let zeroDerived = 0
  let noBundle = 0
  let errors = 0

  for (const row of rows) {
    const tag = `${row.nickname.padEnd(15)} (${row.user_id.slice(0, 8)}…) rep=${row.reputation.toString().padStart(7)} study=${row.total_study_min.toString().padStart(4)}m`
    try {
      const bundle = r2FetchM2Bundle(row.user_id)
      if (!bundle) {
        console.log(`  ⊘  ${tag}  — no R2 bundle (never synced)`)
        noBundle++
        continue
      }
      const derived = totalCorrectFromBundle(bundle)
      if (derived === 0) {
        console.log(`  ⊘  ${tag}  — derived=0 (no qh.correctCount in bundle)`)
        zeroDerived++
        continue
      }

      // Race-safe UPDATE: re-check total_correct = 0 at write time so a fresh
      // push that lands between this SELECT and UPDATE wins the LWW ratchet
      // (their fresh value will be ≥ what we'd write, so preserve it).
      // For --user-id mode we skip the guard (operator explicitly targeted
      // this row, intends to overwrite).
      const now = Date.now()
      const sqlGuard = SINGLE_USER_ID ? '' : ' AND total_correct = 0'
      if (!DRY_RUN) {
        d1Query(
          `UPDATE leaderboard_m2 SET total_correct = ${derived}, updated_at = ${now} WHERE user_id = ${JSON.stringify(row.user_id)}${sqlGuard}`,
        )
      }
      console.log(`  ✓  ${tag}  → total_correct = ${derived}`)
      updated++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ✗  ${tag}  — error: ${msg.slice(0, 200)}`)
      errors++
    }
  }

  console.log(
    `\nsummary: updated=${updated} already-ok=${alreadyOk} zero-derived=${zeroDerived} no-bundle=${noBundle} errors=${errors}`,
  )
  if (DRY_RUN) {
    console.log(`\n(dry-run mode — no D1 writes performed. Re-run without --dry-run to apply.)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
