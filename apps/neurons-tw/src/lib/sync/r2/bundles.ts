// Bundle build / apply / gzip — wraps Dexie state into the R2 blob shape
// for the `neurons` bundle.
//
// Bundle name on the server: users/<sub>/neurons-snapshot.json.gz
// Schema version 1 (this change introduces it). Bumps to 2+ require a
// migration helper to upcast legacy bundles.

import type { NeuronsDB } from '../../db'
import { NEURONS_ADAPTERS } from '../tables'

export const SCHEMA_VERSION = 1
export const BUNDLE_APP_VERSION = '0.4.0'

const CLIENT_ID_KEY = 'neurons-rpg.sync.clientId'

export interface BundleMeta {
  schema_version: number
  updated_at: string  // ISO 8601
  client_id: string
  app_version: string
}

export interface BundleSnapshot {
  meta: BundleMeta
  data: Record<string, unknown[]>  // keyed by adapter.name
}

export function getClientId(): string {
  if (typeof localStorage === 'undefined') return 'no-storage'
  let id = localStorage.getItem(CLIENT_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    try {
      localStorage.setItem(CLIENT_ID_KEY, id)
    } catch {
      // quota / private mode — ephemeral id
    }
  }
  return id
}

export async function buildBundleSnapshot(db: NeuronsDB): Promise<BundleSnapshot> {
  const data: Record<string, unknown[]> = {}
  for (const adapter of NEURONS_ADAPTERS) {
    data[adapter.name] = await adapter.snapshot(db)
  }
  return {
    meta: {
      schema_version: SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
      client_id: getClientId(),
      app_version: BUNDLE_APP_VERSION,
    },
    data,
  }
}

export interface ApplyResult {
  applied: number
  skipped: number
  perTable: Record<string, { applied: number; skipped: number }>
}

export async function applyBundleSnapshot(
  db: NeuronsDB,
  snapshot: BundleSnapshot,
): Promise<ApplyResult> {
  let applied = 0
  let skipped = 0
  const perTable: Record<string, { applied: number; skipped: number }> = {}
  for (const adapter of NEURONS_ADAPTERS) {
    const rows = snapshot.data[adapter.name] ?? []
    const result = await adapter.apply(db, rows)
    perTable[adapter.name] = result
    applied += result.applied
    skipped += result.skipped
  }
  return { applied, skipped, perTable }
}

export function validateBundleMeta(
  snapshot: unknown,
): asserts snapshot is BundleSnapshot {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('invalid_bundle_root')
  const s = snapshot as Partial<BundleSnapshot>
  if (!s.meta || typeof s.meta !== 'object') throw new Error('invalid_bundle_meta')
  if (typeof s.meta.schema_version !== 'number' || s.meta.schema_version < 1) {
    throw new Error('invalid_schema_version')
  }
  if (s.meta.schema_version > SCHEMA_VERSION) {
    throw new Error(`unsupported_schema_version: ${s.meta.schema_version}`)
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
