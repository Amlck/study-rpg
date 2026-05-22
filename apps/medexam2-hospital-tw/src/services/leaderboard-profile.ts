// Per-user leaderboard opt-in profile CRUD. Local-only — NOT cloud-synced.
//
// Spec: openspec/changes/add-hospital-leaderboard/specs/hospital-leaderboard/spec.md
//       §Requirement: Opt-in flow on first leaderboard visit
//
// Lifecycle (matches LeaderboardProfileRow doc in db/schema.ts):
//   - getLeaderboardProfile  — null-safe read; undefined = no row yet
//   - markOptedIn            — write nickname + opted_in=true + last_pushed_at
//   - markDismissedForever   — set dismissed_at; preserve any prior state
//   - markPushed             — refresh last_pushed_at after a successful sync push
//   - clearLeaderboardProfile — used by delete-account / delete-data flows

import { getHospitalDB, type LeaderboardProfileRow } from '../db/schema'
import { fetchLeaderboardMe } from '../lib/leaderboard/api'

export async function getLeaderboardProfile(
  userId: string,
): Promise<LeaderboardProfileRow | undefined> {
  return getHospitalDB().leaderboardProfile.get(userId)
}

export async function markOptedIn(userId: string, nickname: string): Promise<void> {
  const db = getHospitalDB()
  const now = Date.now()
  await db.leaderboardProfile.put({
    user_id: userId,
    nickname,
    opted_in: true,
    // Opt-in always starts visible on the public board; Phase 7 settings
    // toggle uses setLeaderboardPublic() below to flip without re-consent.
    is_public: true,
    // Opt-in clears any prior dismiss flag — the player explicitly chose in.
    dismissed_at: null,
    last_pushed_at: now,
  })
}

/**
 * Settings-panel toggle: flip `is_public` without touching `opted_in` (so
 * re-enabling later doesn't force a re-consent dialog per design D5). The
 * sync push hook (lib/sync/leaderboard.ts) reads this on every push and
 * sends `is_public: 1` or `0` to the Worker accordingly.
 */
export async function setLeaderboardPublic(userId: string, isPublic: boolean): Promise<void> {
  const db = getHospitalDB()
  const existing = await db.leaderboardProfile.get(userId)
  if (!existing) return
  await db.leaderboardProfile.put({ ...existing, is_public: isPublic })
}

export async function markDismissedForever(userId: string): Promise<void> {
  const db = getHospitalDB()
  const existing = await db.leaderboardProfile.get(userId)
  await db.leaderboardProfile.put({
    user_id: userId,
    nickname: existing?.nickname ?? null,
    opted_in: existing?.opted_in ?? false,
    last_pushed_at: existing?.last_pushed_at ?? null,
    // Spread existing so `is_public` (and any future fields) survive an
    // already-opted-in player picking 「不再顯示」.
    ...(existing ?? {}),
    dismissed_at: Date.now(),
  })
}

export async function markPushed(userId: string): Promise<void> {
  const db = getHospitalDB()
  const existing = await db.leaderboardProfile.get(userId)
  if (!existing) return
  await db.leaderboardProfile.put({ ...existing, last_pushed_at: Date.now() })
}

export async function clearLeaderboardProfile(userId: string): Promise<void> {
  await getHospitalDB().leaderboardProfile.delete(userId)
}

/**
 * Cross-origin seed-back: if Dexie has no `leaderboardProfile` row for this
 * user (typical state after domain migration, since IndexedDB is per-origin
 * scoped), check the leaderboard backend for an existing row and seed Dexie
 * from it. Idempotent — does nothing when:
 *   - Dexie already has a row for this user
 *   - Server returns `row: null` (user never opted in)
 *   - Worker endpoint returns 404 (old deploy without GET /leaderboard/me)
 *   - Network error (caller swallows the throw — opt-in modal will fire)
 *
 * Spec hook: openspec spec gap surfaced by `add-med-study-rpg-domain-
 * migration` bake. Without this seed, users who migrated BEFORE the m2
 * bundle adapter shipped (R2 blob predates the adapter) still see the
 * opt-in modal on the new domain even though their D1 leaderboard row
 * exists. This call recovers them.
 */
export async function seedLeaderboardProfileFromServer(userId: string): Promise<void> {
  const db = getHospitalDB()
  const existing = await db.leaderboardProfile.get(userId)
  if (existing) return
  let serverRow: Awaited<ReturnType<typeof fetchLeaderboardMe>>
  try {
    serverRow = await fetchLeaderboardMe()
  } catch {
    // Network / 5xx — silently fall through; opt-in modal will appear,
    // which is the safe default. Don't block app boot on this.
    return
  }
  if (!serverRow || serverRow.user_id !== userId) return
  await db.leaderboardProfile.put({
    user_id: serverRow.user_id,
    nickname: serverRow.nickname,
    opted_in: true,
    is_public: serverRow.is_public,
    dismissed_at: null,
    last_pushed_at: serverRow.updated_at,
  })
}
