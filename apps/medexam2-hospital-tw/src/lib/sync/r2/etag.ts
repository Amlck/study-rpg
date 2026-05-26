// In-memory ETag tracker for R2 blob optimistic concurrency, plus
// localStorage-persisted schema_version cache for the monotonic
// downgrade guard (fix-doctor-retire-cloud-resurrection 2026-05-26).
//
// ETags scope: process-lifetime only. Cold-start force-pull always uses
// unconditional GET (per cloud-sync spec "Cold-start force-pull bypasses
// incremental cursor"). Conditional GETs (If-None-Match) are reserved for
// visibility-change in-session refresh.
//
// schema_version cache scope: localStorage-persisted across reloads.
// Belt-and-suspenders: even though cold-start force-pull refreshes
// the cache before any push opportunity arises, persisting across
// reloads prevents a hypothetical "tab killed mid-pull → reopen →
// immediate push before pull" race from downgrading the cloud blob.
// Per cloud-sync spec "R2 bundle push SHALL refuse schema_version
// downgrade".

import type { Bundle } from './client'

const etags = new Map<Bundle, string>()

export function getEtag(bundle: Bundle): string | null {
  return etags.get(bundle) ?? null
}

export function setEtag(bundle: Bundle, etag: string | null): void {
  if (etag) etags.set(bundle, etag)
  else etags.delete(bundle)
}

export function clearAllEtags(): void {
  etags.clear()
}

// ─── Schema version cache ────────────────────────────────────────────

function schemaVersionKey(bundle: Bundle): string {
  return `study-rpg.sync.r2.${bundle}.schemaVersion`
}

/**
 * Return the cached `schema_version` from the last successful pull of
 * `bundle`. Used by `pushBundle` to refuse a downgrade overwrite
 * (local SV < cached cloud SV). Returns `null` for fresh accounts
 * (no cloud bundle observed yet) and for environments without
 * `localStorage` (e.g., test runners without jsdom).
 */
export function getSchemaVersion(bundle: Bundle): number | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const v = localStorage.getItem(schemaVersionKey(bundle))
    if (!v) return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 1 ? n : null
  } catch {
    return null
  }
}

/**
 * Persist the schema_version observed on the most recent successful
 * pull of `bundle`. Called by `pullBundle` after a successful gunzip
 * (304 short-circuit path leaves the cached value intact — same blob,
 * same schema). `blobMissing` callers SHOULD NOT clobber the cached
 * value to null; absence in cloud is observed via the missing-blob
 * branch of `pushBundle`, not via SV downgrade.
 */
export function setSchemaVersion(bundle: Bundle, sv: number): void {
  if (typeof localStorage === 'undefined') return
  if (!Number.isFinite(sv) || sv < 1) return
  try {
    localStorage.setItem(schemaVersionKey(bundle), String(sv))
  } catch {
    // ignore quota errors
  }
}

/**
 * Used by account-switch / reset paths to wipe the cache when local
 * bundles are wiped — otherwise a cached SV from the previous account
 * could erroneously block the new account's first push.
 */
export function clearSchemaVersion(bundle: Bundle): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(schemaVersionKey(bundle))
  } catch {
    // ignore
  }
}
