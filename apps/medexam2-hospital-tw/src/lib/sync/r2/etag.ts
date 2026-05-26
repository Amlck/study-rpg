// In-memory ETag tracker for R2 blob optimistic concurrency, plus persistent
// per-bundle schema_version cache (localStorage) for the monotonic downgrade
// guard added by fix-doctor-retire-cloud-resurrection-v2.
//
// ETags scope: process-lifetime only. Cold-start force-pull always uses
// unconditional GET (per cloud-sync spec "Cold-start force-pull bypasses
// incremental cursor"). Conditional GETs (If-None-Match) are reserved for
// visibility-change in-session refresh.
//
// schema_version scope: persisted across page reloads via localStorage. The
// monotonic guard needs to survive page reload — otherwise a v3 client could
// reload to clear in-memory state, pull v4 bundle (refreshing the cached SV),
// then push back a v3 snapshot. localStorage persistence is the cheap fix.

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

// ─── Schema version cache (per-bundle, localStorage) ─────────────────────

function svKey(bundle: Bundle): string {
  return `study-rpg.sync.r2.${bundle}.schemaVersion`
}

/**
 * Cache the most-recently-pulled schema_version for this bundle. Called from
 * pullBundle after every successful gunzip + ETag stash. Persistent across
 * page reload to defeat reload-based bypass of the downgrade guard.
 */
export function setSchemaVersion(bundle: Bundle, sv: number): void {
  if (typeof localStorage === 'undefined') return
  if (!Number.isFinite(sv)) return // defensive: never persist NaN / Infinity
  try {
    localStorage.setItem(svKey(bundle), String(sv))
  } catch {
    // quota / private mode — silent fall-through (degenerate to in-memory only)
  }
}

/**
 * Read the cached cloud schema_version for this bundle, or null if never
 * pulled / parse failed / localStorage unavailable. pushBundle uses this to
 * refuse downgrades (throws `r2_schema_downgrade_refused` when local SV <
 * cached cloud SV).
 */
export function getSchemaVersion(bundle: Bundle): number | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(svKey(bundle))
    if (raw == null) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

/**
 * Drop the cached schema_version for this bundle. Called from
 * account-switch.ts `clearLocalSyncTables` and migration.ts
 * `wipeLocalSyncedTables` so the next user's first push isn't blocked by
 * the previous user's cached cloud SV.
 */
export function clearSchemaVersion(bundle: Bundle): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(svKey(bundle))
  } catch {
    // ignore
  }
}
