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

export async function getLeaderboardProfile(
  userId: string,
): Promise<LeaderboardProfileRow | undefined> {
  return getHospitalDB().leaderboardProfile.get(userId)
}

export async function markOptedIn(userId: string, nickname: string): Promise<void> {
  const db = getHospitalDB()
  const now = Date.now()
  const existing = await db.leaderboardProfile.get(userId)
  await db.leaderboardProfile.put({
    user_id: userId,
    nickname,
    opted_in: true,
    // Opt-in clears any prior dismiss flag — the player explicitly chose in.
    dismissed_at: null,
    last_pushed_at: now,
    // Preserve any other fields if the row already exists (none currently,
    // but future-proofing against additive schema changes).
    ...(existing ? {} : {}),
  })
}

export async function markDismissedForever(userId: string): Promise<void> {
  const db = getHospitalDB()
  const existing = await db.leaderboardProfile.get(userId)
  await db.leaderboardProfile.put({
    user_id: userId,
    nickname: existing?.nickname ?? null,
    opted_in: existing?.opted_in ?? false,
    dismissed_at: Date.now(),
    last_pushed_at: existing?.last_pushed_at ?? null,
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
