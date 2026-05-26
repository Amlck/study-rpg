// Bundle builders + appliers — wrap Dexie state in the R2 blob shape
// described by openspec/specs/cloud-sync/spec.md "R2 blob layout — three
// bundles per user".
//
// Design intent: reuse the existing `TableAdapter` API (snapshotAll +
// applyToLocal) so the M1 bundle format mirrors what already lands in
// Supabase via `upsert_lww`. This keeps Supabase ↔ R2 bundle reconciliation
// (Phase 1.D) a deterministic row-by-row diff instead of a schema rewrite.

import type Dexie from 'dexie'
import type { TableAdapter } from '../tables'
import type { CloudRow, RowPayload } from '../types'

// v2 (add-bookmarks-filters-and-wrong-history-medexam2): m2 bundle now
// carries `everWrong: boolean` on questionHistory rows. v2-aware clients
// pulling v1 bundles treat missing field as undefined → false. v1 clients
// pulling v2 bundles drop the unknown field harmlessly.
//
// Merge semantics for `everWrong` (revised 2026-05-25 by
// tune-srs-binary-modifiers-and-intervals): row-level LWW with a
// "preserve local on cloud omission" fallback. The 「太簡單」 opt-in button
// explicitly writes `everWrong = false` AND bumps `lastAnsweredAt`, so an
// explicit clear propagates cross-device. Older clients that omit the field
// no longer overwrite a local true (preserving prior protection against
// silent revocation). See tables.ts applyToLocal for the canonical impl.
//
// v3 (tidy-tabs-add-study-stats-medexam2, 2026-05-26): m2 bundle now carries
// a new top-level data key for `daily_study_log` (one row per calendar day
// of active study). v3 client reading v2 bundle defaults the table to []
// (the data dict simply lacks the key). v2 client reading v3 bundle ignores
// the unknown key. Row-level LWW on `updatedAt` — no monotonic-OR carve-out
// (cumulative-per-day counter, no cross-version contamination risk).
//
// v4 (fix-doctor-retire-cloud-resurrection, 2026-05-26): m2 bundle now
// carries a new top-level data key for `retirement_log` (one row per
// retired doctor; pk = `doctor_id`). v4-aware clients use these rows
// as authoritative tombstones for the paired `hospital_doctors`
// entries. v3 client reading v4 bundle ignores the unknown key (no
// adapter registered for retirement_log) and still resurrects deleted
// doctors locally — known regression for the mid-version coexistence
// window. v4 client reading v3 bundle defaults the table to [].
//
// CRITICAL: pushBundle now refuses to overwrite a cloud bundle whose
// cached schema_version is greater than the local SCHEMA_VERSION
// (see r2/engine-r2.ts and r2/etag.ts setSchemaVersion). This guard
// protects v4 clouds from a v3 client downgrade overwrite that would
// silently strip the retirement_log key.
const SCHEMA_VERSION = 4
const CLIENT_ID_KEY = 'study-rpg.sync.clientId'
const BUNDLE_APP_VERSION = '0.3.0'

export interface BundleMeta {
  schema_version: number
  updated_at: string  // ISO 8601, max(rows.updated_at)
  client_id: string
}

export interface BundleSnapshot {
  meta: BundleMeta
  data: Record<string, RowPayload[]>  // keyed by adapter.postgresTable
}

export function getClientId(): string {
  if (typeof localStorage === 'undefined') return 'no-storage'
  let id = localStorage.getItem(CLIENT_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    try {
      localStorage.setItem(CLIENT_ID_KEY, id)
    } catch {
      // quota / private mode — fall back to ephemeral id
    }
  }
  return id
}

export async function buildBundleSnapshot(
  db: Dexie,
  adapters: ReadonlyArray<TableAdapter>,
  userId: string,
): Promise<BundleSnapshot> {
  const updatedAt = new Date().toISOString()
  const data: Record<string, RowPayload[]> = {}
  let maxUpdatedAt = updatedAt

  for (const adapter of adapters) {
    const rows = await adapter.snapshotAll(db, userId, updatedAt, BUNDLE_APP_VERSION)
    data[adapter.postgresTable] = rows
    for (const row of rows) {
      if (row.updated_at > maxUpdatedAt) maxUpdatedAt = row.updated_at
    }
  }

  return {
    meta: {
      schema_version: SCHEMA_VERSION,
      updated_at: maxUpdatedAt,
      client_id: getClientId(),
    },
    data,
  }
}

export interface ApplyResult {
  applied: number
  skipped: number
}

export async function applyBundleSnapshot(
  db: Dexie,
  adapters: ReadonlyArray<TableAdapter>,
  snapshot: BundleSnapshot,
  opts?: { force?: boolean },
): Promise<ApplyResult> {
  let applied = 0
  let skipped = 0
  for (const adapter of adapters) {
    const rows = snapshot.data[adapter.postgresTable] ?? []
    for (const row of rows) {
      // RowPayload → CloudRow (shape is compatible)
      const cloudRow: CloudRow = {
        user_id: row.user_id,
        updated_at: row.updated_at,
        app_version: row.app_version ?? null,
        data: row.data,
        question_id: row.question_id,
        id: row.id,
        subject_id: row.subject_id,
        correct: row.correct,
        total: row.total,
      }
      const wrote = await adapter.applyToLocal(db, cloudRow, opts)
      if (wrote) applied++
      else skipped++
    }
  }
  return { applied, skipped }
}

export function validateBundleMeta(snapshot: unknown): asserts snapshot is BundleSnapshot {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('invalid_bundle_root')
  const s = snapshot as Partial<BundleSnapshot>
  if (!s.meta || typeof s.meta !== 'object') throw new Error('invalid_bundle_meta')
  if (typeof s.meta.schema_version !== 'number' || s.meta.schema_version < 1) {
    throw new Error('invalid_schema_version')
  }
  if (typeof s.meta.updated_at !== 'string') throw new Error('invalid_meta_updated_at')
  if (typeof s.meta.client_id !== 'string') throw new Error('invalid_meta_client_id')
  if (!s.data || typeof s.data !== 'object') throw new Error('invalid_bundle_data')
}

export async function gzipBundle(snapshot: BundleSnapshot): Promise<Blob> {
  const json = JSON.stringify(snapshot)
  const stream = new Blob([json], { type: 'application/json' }).stream()
  const compressed = stream.pipeThrough(new CompressionStream('gzip'))
  return new Response(compressed).blob()
}

export async function gunzipBundle(blob: Blob): Promise<BundleSnapshot> {
  const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(stream).text()
  const parsed = JSON.parse(text)
  validateBundleMeta(parsed)
  return parsed
}
