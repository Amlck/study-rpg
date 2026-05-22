#!/usr/bin/env tsx
/**
 * Bulk-migrate users' Supabase sync rows → R2 blobs.
 *
 * Why this exists: the client-side migrate-from-supabase.ts path needs the
 * user to return, see the migration banner, and click 「立即遷移」. After
 * Phase 3 cutover (2026-05-22) we discovered 29 users in auth.users but only
 * 2 R2 blobs — 27 active dogfooders had Supabase rows but no R2 blob. Without
 * this tool, Phase 5 (drop Supabase sync tables, ~1 month away) would
 * permanently lose their saves.
 *
 * Authoritative bundle specs come from
 * apps/medexam-tw/src/lib/sync/r2/migrate-from-supabase.ts — keep both in
 * sync if schema changes (sync-tables migrations + this file).
 *
 * Auth path differs from the client: uses Supabase service-role key (bypasses
 * RLS) instead of the user's JWT, and writes directly to R2 via S3 sigv4
 * instead of through the Worker /presign endpoint (Worker can only sign for
 * the JWT's `sub`).
 *
 * Idempotent: PUT with `If-None-Match: *` → 412 means a blob already exists;
 * we treat that as success. Re-running after a partial failure is safe.
 *
 * Run:
 *   pnpm bulk-migrate --dry-run           # list what would be migrated
 *   pnpm bulk-migrate --user <uuid>       # migrate one user only
 *   pnpm bulk-migrate                     # migrate all auth.users
 *
 * Env (.env.local at repo root):
 *   SUPABASE_URL                  https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY     <service_role JWT — gives RLS bypass; NEVER commit>
 *   R2_S3_ENDPOINT                https://<account>.r2.cloudflarestorage.com
 *   R2_S3_ACCESS_KEY_ID           <R2 S3 access key>
 *   R2_S3_SECRET_ACCESS_KEY       <R2 S3 secret>
 *   R2_BUCKET                     study-rpg-saves
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AwsClient } from 'aws4fetch'
import { gzipSync } from 'node:zlib'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

// ---- Env loading ----

function loadEnv(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[m[1]] = v
  }
  return out
}

const envFile = loadEnv()
const env = { ...envFile, ...process.env } as Record<string, string | undefined>

function require_(key: string): string {
  const v = env[key]
  if (!v) {
    console.error(`Missing required env var: ${key}`)
    console.error(`Set it in .env.local at repo root or export it before running.`)
    process.exit(1)
  }
  return v
}

// ---- Bundle specs (mirror migrate-from-supabase.ts) ----

interface BundleSpec {
  bundle: 'm1' | 'm2' | 'bookmarks'
  postgresTables: ReadonlyArray<{ table: string; pkColumns: ReadonlyArray<string> }>
}

const ALL_BUNDLE_SPECS: ReadonlyArray<BundleSpec> = [
  {
    bundle: 'm1',
    postgresTables: [
      { table: 'player_state', pkColumns: [] },
      { table: 'srs_cards', pkColumns: ['question_id'] },
      { table: 'item_instances', pkColumns: ['id'] },
      { table: 'mentor_backlog', pkColumns: [] },
    ],
  },
  {
    bundle: 'm2',
    postgresTables: [
      { table: 'hospital_state', pkColumns: [] },
      { table: 'hospital_doctors', pkColumns: ['id'] },
      { table: 'hospital_mastery', pkColumns: ['subject_id'] },
      { table: 'hospital_question_history', pkColumns: ['question_id'] },
      { table: 'targeted_tickets', pkColumns: ['id'] },
      { table: 'targeted_ticket_history', pkColumns: ['ticket_id', 'event'] },
      { table: 'hospital_monotonic_counters', pkColumns: [] },
    ],
  },
  {
    bundle: 'bookmarks',
    postgresTables: [
      { table: 'question_bookmarks', pkColumns: ['question_id'] },
    ],
  },
]

const SCHEMA_VERSION = 1
const PAGE_SIZE = 1000

// ---- Supabase helpers ----

async function paginatedSelect(
  supabase: SupabaseClient,
  table: string,
  userId: string,
  pkColumns: ReadonlyArray<string>,
): Promise<unknown[]> {
  const all: unknown[] = []
  let from = 0
  const orderColumns = pkColumns.length ? pkColumns : ['user_id']
  while (true) {
    let q = supabase.from(table).select('*').eq('user_id', userId).range(from, from + PAGE_SIZE - 1)
    for (const col of orderColumns) q = q.order(col, { ascending: true })
    const { data, error } = await q
    if (error) throw new Error(`select_${table}: ${error.message}`)
    if (!data || !data.length) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

// ---- R2 helpers ----

function makeR2Client() {
  return new AwsClient({
    accessKeyId: require_('R2_S3_ACCESS_KEY_ID'),
    secretAccessKey: require_('R2_S3_SECRET_ACCESS_KEY'),
    service: 's3',
    region: 'auto',
  })
}

// Canonical R2 key per bundle. Must match the client engine + design.md
// blob layout. bookmarks is plain `bookmarks.json.gz`, the snapshots are
// `<bundle>-snapshot.json.gz` for parity with m1 / m2.
const R2_KEY_BY_BUNDLE: Record<BundleSpec['bundle'], string> = {
  m1: 'm1-snapshot.json.gz',
  m2: 'm2-snapshot.json.gz',
  bookmarks: 'bookmarks.json.gz',
}

function r2Url(userId: string, bundle: BundleSpec['bundle']): string {
  const bucket = require_('R2_BUCKET')
  const endpoint = require_('R2_S3_ENDPOINT').replace(/\/$/, '')
  return `${endpoint}/${bucket}/users/${userId}/${R2_KEY_BY_BUNDLE[bundle]}`
}

async function r2BlobExists(r2: AwsClient, userId: string, bundle: BundleSpec['bundle']): Promise<boolean> {
  const url = r2Url(userId, bundle)
  const res = await r2.fetch(url, { method: 'HEAD' })
  if (res.status === 200) return true
  if (res.status === 404) return false
  if (res.status === 403) return false
  throw new Error(`r2_head_${res.status}: ${await res.text().catch(() => '')}`)
}

interface BundleResult {
  bundle: BundleSpec['bundle']
  status: 'uploaded' | 'already-present' | 'no-rows' | 'failed'
  rowsByTable: Record<string, number>
  bytes?: number
  error?: string
}

async function migrateBundle(
  supabase: SupabaseClient,
  r2: AwsClient,
  userId: string,
  spec: BundleSpec,
  clientId: string,
  dryRun: boolean,
): Promise<BundleResult> {
  const rowsByTable: Record<string, number> = {}
  try {
    if (!dryRun) {
      const exists = await r2BlobExists(r2, userId, spec.bundle)
      if (exists) return { bundle: spec.bundle, status: 'already-present', rowsByTable }
    }
    const data: Record<string, unknown[]> = {}
    let maxUpdatedAt = new Date(0).toISOString()
    let totalRows = 0
    for (const { table, pkColumns } of spec.postgresTables) {
      const rows = await paginatedSelect(supabase, table, userId, pkColumns)
      data[table] = rows
      rowsByTable[table] = rows.length
      totalRows += rows.length
      for (const row of rows) {
        const ts = (row as { updated_at?: string }).updated_at
        if (typeof ts === 'string' && ts > maxUpdatedAt) maxUpdatedAt = ts
      }
    }
    if (totalRows === 0) {
      return { bundle: spec.bundle, status: 'no-rows', rowsByTable }
    }
    const snapshot = {
      meta: { schema_version: SCHEMA_VERSION, updated_at: maxUpdatedAt, client_id: clientId },
      data,
    }
    const json = JSON.stringify(snapshot)
    const gz = gzipSync(Buffer.from(json, 'utf8'))
    if (dryRun) {
      return { bundle: spec.bundle, status: 'uploaded', rowsByTable, bytes: gz.byteLength }
    }
    const url = r2Url(userId, spec.bundle)
    const res = await r2.fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/gzip',
        'If-None-Match': '*',
      },
      body: gz,
    })
    if (!res.ok) {
      if (res.status === 412 || res.status === 428) {
        return { bundle: spec.bundle, status: 'already-present', rowsByTable, bytes: gz.byteLength }
      }
      const body = await res.text().catch(() => '')
      throw new Error(`r2_put_${res.status}: ${body.slice(0, 200)}`)
    }
    return { bundle: spec.bundle, status: 'uploaded', rowsByTable, bytes: gz.byteLength }
  } catch (err) {
    return {
      bundle: spec.bundle,
      status: 'failed',
      rowsByTable,
      error: (err as { message?: string })?.message ?? String(err),
    }
  }
}

// ---- Main ----

interface CliOpts {
  dryRun: boolean
  userId?: string
  bundleFilter?: BundleSpec['bundle']
}

function parseArgs(): CliOpts {
  const args = process.argv.slice(2)
  const opts: CliOpts = { dryRun: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--dry-run') opts.dryRun = true
    else if (a === '--user') {
      opts.userId = args[++i]
    } else if (a === '--bundle') {
      const b = args[++i]
      if (b !== 'm1' && b !== 'm2' && b !== 'bookmarks') {
        console.error(`Invalid --bundle: ${b} (expected m1 | m2 | bookmarks)`)
        process.exit(1)
      }
      opts.bundleFilter = b
    } else if (a === '--help' || a === '-h') {
      console.log(`pnpm bulk-migrate [--dry-run] [--user <uuid>] [--bundle m1|m2|bookmarks]`)
      process.exit(0)
    } else {
      console.error(`Unknown arg: ${a}`)
      process.exit(1)
    }
  }
  return opts
}

async function main() {
  const opts = parseArgs()
  const supabaseUrl = require_('SUPABASE_URL')
  const serviceRoleKey = require_('SUPABASE_SERVICE_ROLE_KEY')
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const r2 = makeR2Client()
  const clientId = `bulk-migrate-${randomUUID()}`

  // Resolve user list
  let userIds: string[]
  if (opts.userId) {
    userIds = [opts.userId]
  } else {
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (error) {
      console.error(`auth.admin.listUsers failed: ${error.message}`)
      process.exit(1)
    }
    userIds = data.users.map((u) => u.id)
  }

  console.log(`mode: ${opts.dryRun ? 'DRY-RUN' : 'LIVE'} | users: ${userIds.length} | client_id: ${clientId}`)
  console.log('='.repeat(60))

  const specs = opts.bundleFilter
    ? ALL_BUNDLE_SPECS.filter((s) => s.bundle === opts.bundleFilter)
    : ALL_BUNDLE_SPECS

  const totals: Record<BundleResult['status'], number> = {
    uploaded: 0,
    'already-present': 0,
    'no-rows': 0,
    failed: 0,
  }

  for (const userId of userIds) {
    console.log(`\nuser ${userId}`)
    for (const spec of specs) {
      const r = await migrateBundle(supabase, r2, userId, spec, clientId, opts.dryRun)
      totals[r.status]++
      const rowSummary = Object.entries(r.rowsByTable)
        .map(([t, n]) => `${t}=${n}`)
        .join(' ')
      const bytes = r.bytes !== undefined ? ` ${r.bytes}B` : ''
      const err = r.error ? ` ERR=${r.error}` : ''
      console.log(`  ${spec.bundle.padEnd(10)} ${r.status.padEnd(16)} ${rowSummary}${bytes}${err}`)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(
    `summary: uploaded=${totals.uploaded} already-present=${totals['already-present']} no-rows=${totals['no-rows']} failed=${totals.failed}`,
  )
  if (totals.failed > 0) process.exit(2)
}

main().catch((err) => {
  console.error('fatal:', err)
  process.exit(1)
})
