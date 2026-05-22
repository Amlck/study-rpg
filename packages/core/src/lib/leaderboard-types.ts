/**
 * Hospital leaderboard shared types + constants.
 *
 * Consumed by:
 *   - apps/medexam2-hospital-tw         (UI, sync adapter, settings panel)
 *   - cloudflare/sync-worker (planned)  (currently has its own local copies;
 *                                        Worker deps don't pull @study-rpg/core
 *                                        — keeping the same canonical literals
 *                                        is the contract instead of import).
 *
 * Anchor docs:
 *   openspec/changes/add-hospital-leaderboard/specs/hospital-leaderboard/spec.md
 *   openspec/changes/add-hospital-leaderboard/design.md (D6: nickname rules)
 */

// ─── Filters ─────────────────────────────────────────────────────────────────

/**
 * Four leaderboard tabs / sort keys. Order matters for default tab selection
 * — `composite` is the default per spec §Requirement: Four filter tabs.
 */
export const LEADERBOARD_FILTERS = ['composite', 'reputation', 'doctor', 'study'] as const

export type LeaderboardFilter = (typeof LEADERBOARD_FILTERS)[number]

/** Display labels (繁中) for the UI filter tab bar. */
export const LEADERBOARD_FILTER_LABELS: Record<LeaderboardFilter, string> = {
  composite: '綜合排名',
  reputation: '聲望',
  doctor: '醫師個數',
  study: '累積唸書時間',
}

// ─── Nickname rules ──────────────────────────────────────────────────────────

/** Codepoint-count bounds. `[...str].length` semantics; emoji ZWJ sequences
 *  count as multiple codepoints (accepted P4 polish for Phase 2 follow-up). */
export const LEADERBOARD_NICKNAME_MIN_CODEPOINTS = 2
export const LEADERBOARD_NICKNAME_MAX_CODEPOINTS = 12

/**
 * Normalize a nickname for case-insensitive uniqueness check.
 *
 * NFKC handles compatibility decomposition (e.g. full-width vs half-width
 * Latin); `toLowerCase()` handles ASCII case (and many Unicode cases via
 * the engine's default locale-insensitive lowercasing).
 *
 * MUST match the worker-side helper byte-for-byte — drift here causes
 * "available" client-side but "taken" server-side (or vice versa).
 */
export function normalizeNickname(raw: string): string {
  return raw.normalize('NFKC').toLowerCase()
}

/** Codepoint count, matching `[...str].length`. */
export function countNicknameCodepoints(s: string): number {
  return [...s].length
}

/** Length-only validity check. Does NOT enforce uniqueness (caller does that
 *  via the debounced /leaderboard/nickname-check Worker endpoint). */
export function isValidNicknameLength(raw: string): boolean {
  const cp = countNicknameCodepoints(raw)
  return cp >= LEADERBOARD_NICKNAME_MIN_CODEPOINTS && cp <= LEADERBOARD_NICKNAME_MAX_CODEPOINTS
}

// ─── Row + snapshot shapes ───────────────────────────────────────────────────

/**
 * Row shape returned in leaderboard snapshots (KV payload). Mirrors the
 * `SELECT user_id, nickname, hospital_tier, reputation, doctor_count,
 *  total_study_min, updated_at` projection used by `runLeaderboardCron`.
 *
 * `nickname_lower` + `is_public` are intentionally NOT exposed — those are
 * internal to the D1 schema.
 */
export interface LeaderboardRow {
  user_id: string
  nickname: string
  hospital_tier: number
  reputation: number
  doctor_count: number
  total_study_min: number
  updated_at: number
}

/**
 * Payload shape returned by `GET /leaderboard/:filter`. Hourly cron writes
 * one of these per filter to KV; client reads directly.
 *
 * `last_updated_at` is `null` when the cron has never run yet (cold start
 * after deploy); UI shows an empty state in that case.
 */
export interface LeaderboardSnapshot {
  rows: LeaderboardRow[]
  last_updated_at: number | null
  total_count: number
}

// ─── Client → Worker request bodies ──────────────────────────────────────────

/** Payload for `POST /leaderboard/upsert`. The Worker takes `user_id` from
 *  the verified JWT `sub` claim, NOT the body — fields here are gameplay
 *  attributes only. */
export interface LeaderboardUpsertPayload {
  nickname: string
  hospital_tier: number
  reputation: number
  doctor_count: number
  total_study_min: number
  is_public: 0 | 1
  updated_at: number
}

/** Response shape from `GET /leaderboard/nickname-check?n=<candidate>`. */
export interface LeaderboardNicknameCheckResponse {
  available: boolean
  /** Present when `available === false` to explain why (e.g. `invalid_length`). */
  reason?: string
}
