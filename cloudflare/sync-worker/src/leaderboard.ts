/**
 * Hospital leaderboard — endpoints + 30-min snapshot cron.
 *
 * Endpoints (all under /leaderboard/*):
 *   POST   /leaderboard/upsert           → JWT verify → sanity bounds → D1 UPSERT (LWW)
 *   GET    /leaderboard/:filter          → read KV snapshot (no D1 hit at request time)
 *                                          filter ∈ {composite, reputation, doctor, study}
 *   GET    /leaderboard/nickname-check?n=<candidate>   → JWT verify → D1 lookup
 *   POST   /leaderboard/opt-out          → JWT verify → set is_public = 0
 *   DELETE /leaderboard/me               → JWT verify → DELETE row (account deletion)
 *
 * Scheduled trigger (cron "0,30 * * * *", wired in index.ts):
 *   runLeaderboardCron(env)              → 4 D1 queries → 4 KV snapshots
 *
 * Design decisions live in:
 *   openspec/changes/add-hospital-leaderboard/design.md (D1–D7)
 *   openspec/changes/add-hospital-leaderboard/specs/hospital-leaderboard/spec.md
 *
 * Anti-cheat policy: full trust + UI footer disclosure (no HMAC, no replay
 * detection). Worker only enforces sanity bounds — out-of-bounds payloads
 * are dropped silently with a structured warn log, returning 200 OK so the
 * client doesn't retry-storm. Tampered scores are not a security concern at
 * this scale (< 1k players, no monetary reward, leaderboard footer literally
 * says "自填無驗證").
 */

import type { Env } from "./index";
import { extractBearer, verifyJWT } from "./auth";

// === Constants ===

const FILTERS = ["composite", "reputation", "doctor", "study"] as const;
type Filter = (typeof FILTERS)[number];

const NICKNAME_MIN_CODEPOINTS = 2;
const NICKNAME_MAX_CODEPOINTS = 12;

const TIER_MIN = 1;
const TIER_MAX = 4;
const DOCTOR_COUNT_MAX = 50;

// === Achievement badge constants (v15 add-achievement-system) ===
const BADGES_CSV_MAX_LEN = 60;
const BADGES_CSV_MAX_ENTRIES = 6;
const BADGES_CSV_PATTERN = /^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$/;
const SUBJECT_MASTERY_MIN = 0;
const SUBJECT_MASTERY_MAX = 14;

// === Types ===

interface LeaderboardRowInternal {
  user_id: string;
  nickname: string;
  hospital_tier: number;
  reputation: number;
  doctor_count: number;
  total_study_min: number;
  updated_at: number;
  // Achievement system (v15). Optional in interface for back-compat with
  // pre-0002 snapshots; readers fall back to '' / 0 when undefined.
  badges_csv?: string;
  subject_mastery_count?: number;
}

interface SnapshotPayload {
  rows: LeaderboardRowInternal[];
  last_updated_at: number;
  total_count: number;
}

interface UpsertBody {
  nickname?: unknown;
  hospital_tier?: unknown;
  reputation?: unknown;
  doctor_count?: unknown;
  total_study_min?: unknown;
  is_public?: unknown;
  updated_at?: unknown;
  // Achievement system (v15). Both optional — pre-update clients omit; Worker
  // treats omitted as '' / 0 (additive, doesn't clobber on partial bodies).
  badges_csv?: unknown;
  subject_mastery_count?: unknown;
}

// === Helpers ===

function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function authUser(request: Request, env: Env): Promise<string> {
  const token = extractBearer(request);
  const user = await verifyJWT(token, env.SUPABASE_JWKS_URL, env.SUPABASE_PROJECT_REF);
  return user.sub;
}

function normalizeNickname(raw: string): string {
  return raw.normalize("NFKC").toLowerCase();
}

function countCodepoints(s: string): number {
  // Unicode codepoint count, matching `[...str].length` semantics on the
  // client. Note: emoji ZWJ sequences (e.g. 👨‍👩‍👧) count as MULTIPLE
  // codepoints — this is accepted P4 polish for Phase 2 follow-up.
  return [...s].length;
}

function isValidNicknameLength(raw: string): boolean {
  const cp = countCodepoints(raw);
  return cp >= NICKNAME_MIN_CODEPOINTS && cp <= NICKNAME_MAX_CODEPOINTS;
}

function snapshotKvKey(filter: Filter): string {
  return `leaderboard:m2:top100:${filter}`;
}

// Build the filter-route regex from FILTERS so the source of truth stays
// the const array; adding a 5th tab only requires editing FILTERS.
const FILTER_ROUTE_REGEX = new RegExp(`^/leaderboard/(${FILTERS.join("|")})$`);

const SNAPSHOT_COLUMNS =
  "user_id, nickname, hospital_tier, reputation, doctor_count, total_study_min, updated_at, badges_csv, subject_mastery_count";

const ORDER_BY: Record<Filter, string> = {
  composite: "hospital_tier DESC, reputation DESC, doctor_count DESC",
  reputation: "reputation DESC",
  doctor: "doctor_count DESC",
  study: "total_study_min DESC",
};

// === Dispatcher ===

export async function handleLeaderboard(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/leaderboard/upsert" && method === "POST") {
    return handleUpsert(request, env, headers);
  }
  if (path === "/leaderboard/opt-out" && method === "POST") {
    return handleOptOut(request, env, headers);
  }
  if (path === "/leaderboard/me" && method === "DELETE") {
    return handleDeleteMe(request, env, headers);
  }
  if (path === "/leaderboard/me" && method === "GET") {
    return handleGetMe(request, env, headers);
  }
  // NOTE: handleGetMe added 2026-05-22 but Worker deploy currently blocked by
  // CF entitlements.not_available 10007 (account-level issue, unrelated).
  // Endpoint is dormant until deploy unblocks; client-side seed-on-sign-in
  // path is guarded by feature detection (404 → fall back to opt-in modal).
  if (path === "/leaderboard/nickname-check" && method === "GET") {
    return handleNicknameCheck(request, env, headers);
  }
  const filterMatch = path.match(FILTER_ROUTE_REGEX);
  if (filterMatch && method === "GET") {
    return handleGetFilter(filterMatch[1] as Filter, env, headers);
  }

  return new Response("Not Found", { status: 404, headers });
}

// === Endpoint handlers ===

async function handleUpsert(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  // Auth (JWT sub is the ONLY source of user_id — body ignored to prevent
  // cross-tenancy forging, same pattern as presign.ts).
  let userSub: string;
  try {
    userSub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  let body: UpsertBody;
  try {
    body = (await request.json()) as UpsertBody;
  } catch {
    return jsonResponse({ error: "invalid_body" }, 400, headers);
  }

  if (typeof body.nickname !== "string" || !isValidNicknameLength(body.nickname)) {
    return jsonResponse({ error: "invalid_nickname_length" }, 400, headers);
  }

  const tier = Number(body.hospital_tier);
  const rep = Number(body.reputation);
  const doctor = Number(body.doctor_count);
  const study = Number(body.total_study_min);
  const isPublic = body.is_public === 0 ? 0 : 1;
  const updatedAt = Number(body.updated_at);

  // Sanity bounds — out-of-bounds rows are dropped silently (warn log,
  // 200 OK) per design.md Decision D3. This avoids client retry storms
  // while still preventing JSON-injection or wild values from polluting D1.
  if (!Number.isInteger(tier) || tier < TIER_MIN || tier > TIER_MAX) {
    console.warn("[leaderboard] dropped upsert: tier oob", { user: userSub, tier });
    return jsonResponse({ ok: true, dropped: "tier_oob" }, 200, headers);
  }
  if (!Number.isFinite(rep) || rep < 0) {
    console.warn("[leaderboard] dropped upsert: reputation oob", { user: userSub, rep });
    return jsonResponse({ ok: true, dropped: "rep_oob" }, 200, headers);
  }
  if (!Number.isInteger(doctor) || doctor < 0 || doctor > DOCTOR_COUNT_MAX) {
    console.warn("[leaderboard] dropped upsert: doctor_count oob", { user: userSub, doctor });
    return jsonResponse({ ok: true, dropped: "doctor_oob" }, 200, headers);
  }
  if (!Number.isFinite(study) || study < 0) {
    console.warn("[leaderboard] dropped upsert: study_min oob", { user: userSub, study });
    return jsonResponse({ ok: true, dropped: "study_oob" }, 200, headers);
  }
  if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
    return jsonResponse({ error: "invalid_updated_at" }, 400, headers);
  }

  // === Achievement system (v15) — badges_csv + subject_mastery_count ===
  // Both optional; default to '' / 0 when missing. Invalid values rejected
  // with 400 (NOT silently dropped — these are client-derived values, not
  // user-input, so a bad value indicates a client bug worth surfacing).
  let badgesCsv = "";
  if (body.badges_csv !== undefined) {
    if (typeof body.badges_csv !== "string") {
      return jsonResponse({ error: "invalid_badges_csv_type" }, 400, headers);
    }
    if (body.badges_csv.length > BADGES_CSV_MAX_LEN) {
      return jsonResponse({ error: "badges_csv_too_long" }, 400, headers);
    }
    if (body.badges_csv !== "" && !BADGES_CSV_PATTERN.test(body.badges_csv)) {
      return jsonResponse({ error: "invalid_badges_csv_format" }, 400, headers);
    }
    // Defensive entry-count check (the regex caps at 6 but explicit is clearer)
    if (body.badges_csv !== "" && body.badges_csv.split(",").length > BADGES_CSV_MAX_ENTRIES) {
      return jsonResponse({ error: "badges_csv_too_many_entries" }, 400, headers);
    }
    badgesCsv = body.badges_csv;
  }

  let subjectMastery = 0;
  if (body.subject_mastery_count !== undefined) {
    const sm = Number(body.subject_mastery_count);
    if (!Number.isInteger(sm) || sm < SUBJECT_MASTERY_MIN || sm > SUBJECT_MASTERY_MAX) {
      return jsonResponse({ error: "invalid_subject_mastery_count" }, 400, headers);
    }
    subjectMastery = sm;
  }

  const nickname = body.nickname;
  const nicknameLower = normalizeNickname(nickname);

  try {
    // UPSERT with LWW: only update if incoming updated_at is newer. The
    // nickname_lower UNIQUE constraint handles uniqueness — we parse the
    // SQLite error message to map it back to a typed 409. (Earlier impl
    // did a separate SELECT pre-check; that doubled D1 round-trips per push
    // for no extra safety, since this query is the gate either way.)
    await env.LEADERBOARD_DB.prepare(
      `INSERT INTO leaderboard_m2
         (user_id, nickname, nickname_lower, hospital_tier, reputation, doctor_count, total_study_min, is_public, updated_at, badges_csv, subject_mastery_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         nickname              = excluded.nickname,
         nickname_lower        = excluded.nickname_lower,
         hospital_tier         = excluded.hospital_tier,
         reputation            = excluded.reputation,
         doctor_count          = excluded.doctor_count,
         total_study_min       = excluded.total_study_min,
         is_public             = excluded.is_public,
         updated_at            = excluded.updated_at,
         badges_csv            = excluded.badges_csv,
         subject_mastery_count = excluded.subject_mastery_count
       WHERE leaderboard_m2.updated_at < excluded.updated_at`,
    )
      .bind(
        userSub,
        nickname,
        nicknameLower,
        tier,
        rep,
        doctor,
        study,
        isPublic,
        updatedAt,
        badgesCsv,
        subjectMastery,
      )
      .run();

    return jsonResponse({ ok: true }, 200, headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("UNIQUE constraint failed: leaderboard_m2.nickname_lower")) {
      return jsonResponse({ error: "nickname_taken" }, 409, headers);
    }
    console.error("[leaderboard] upsert failed", { user: userSub, err: message });
    return jsonResponse({ error: "upsert_failed" }, 500, headers);
  }
}

async function handleGetFilter(
  filter: Filter,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  // Read from KV snapshot — cron writes it every hour. Client never hits D1
  // on read path. If cron has never run yet, return empty payload (the UI
  // surfaces "未加入排行" empty state for that case).
  const cached = await env.LEADERBOARD_KV.get<SnapshotPayload>(snapshotKvKey(filter), {
    type: "json",
  });

  if (!cached) {
    return jsonResponse(
      { rows: [], last_updated_at: null, total_count: 0 },
      200,
      headers,
    );
  }

  return jsonResponse(cached, 200, headers);
}

async function handleNicknameCheck(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  // JWT-gate this endpoint to prevent unauthenticated enumeration of
  // nicknames (privacy concern — anyone could otherwise scrape via
  // dictionary attack).
  try {
    await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  const url = new URL(request.url);
  const candidate = url.searchParams.get("n");

  if (typeof candidate !== "string" || candidate.length === 0) {
    return jsonResponse({ error: "missing_n" }, 400, headers);
  }
  if (!isValidNicknameLength(candidate)) {
    return jsonResponse({ available: false, reason: "invalid_length" }, 200, headers);
  }

  const nickLower = normalizeNickname(candidate);
  const row = await env.LEADERBOARD_DB
    .prepare("SELECT 1 FROM leaderboard_m2 WHERE nickname_lower = ? LIMIT 1")
    .bind(nickLower)
    .first();

  return jsonResponse({ available: row === null }, 200, headers);
}

async function handleOptOut(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  let userSub: string;
  try {
    userSub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  // Row is preserved (per D5 — re-enabling opt-in restores rank history).
  // Just flip is_public to 0 and bump updated_at so the next sync's LWW
  // doesn't accidentally restore is_public = 1 from a stale client cache.
  await env.LEADERBOARD_DB
    .prepare("UPDATE leaderboard_m2 SET is_public = 0, updated_at = ? WHERE user_id = ?")
    .bind(Date.now(), userSub)
    .run();

  return jsonResponse({ ok: true }, 200, headers);
}

async function handleGetMe(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  // Cross-origin seed-back: a client on a new origin (e.g. post-domain-
  // migration `med-study-rpg.com`) whose IndexedDB has no `leaderboardProfile`
  // row can call this to discover whether the user already has a server-
  // side row from a prior session and rehydrate their local opted_in /
  // nickname / is_public state — avoiding a redundant opt-in modal.
  //
  // Returns 200 + { row: null } when the user has never opted in (this is
  // an expected state, not an error — clients should treat it as "show
  // opt-in modal on first visit"). Returns 200 + row when found.
  let userSub: string;
  try {
    userSub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  const row = await env.LEADERBOARD_DB
    .prepare(
      "SELECT user_id, nickname, hospital_tier, reputation, doctor_count, total_study_min, is_public, updated_at, badges_csv, subject_mastery_count FROM leaderboard_m2 WHERE user_id = ?",
    )
    .bind(userSub)
    .first<{
      user_id: string;
      nickname: string;
      hospital_tier: number;
      reputation: number;
      doctor_count: number;
      total_study_min: number;
      is_public: number;
      updated_at: number;
      badges_csv: string | null;
      subject_mastery_count: number | null;
    }>();

  if (!row) {
    return jsonResponse({ row: null }, 200, headers);
  }

  return jsonResponse(
    {
      row: {
        user_id: row.user_id,
        nickname: row.nickname,
        hospital_tier: row.hospital_tier,
        reputation: row.reputation,
        doctor_count: row.doctor_count,
        total_study_min: row.total_study_min,
        is_public: row.is_public === 1,
        updated_at: row.updated_at,
        badges_csv: row.badges_csv ?? "",
        subject_mastery_count: row.subject_mastery_count ?? 0,
      },
    },
    200,
    headers,
  );
}

async function handleDeleteMe(
  request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  let userSub: string;
  try {
    userSub = await authUser(request, env);
  } catch {
    return jsonResponse({ error: "unauthenticated" }, 401, headers);
  }

  // Hard delete — invoked from the existing delete-account flow. Frees up
  // the nickname for reuse (case-insensitive UNIQUE constraint).
  const result = await env.LEADERBOARD_DB
    .prepare("DELETE FROM leaderboard_m2 WHERE user_id = ?")
    .bind(userSub)
    .run();

  return jsonResponse(
    { ok: true, deleted: result.meta?.changes ?? 0 },
    200,
    headers,
  );
}

// === Scheduled cron ===

export async function runLeaderboardCron(env: Env): Promise<void> {
  // 4 D1 queries → 4 KV snapshots, all parallel. Each snapshot is the
  // top-100 rows for the corresponding filter; client GETs read these
  // directly. Partial indexes (WHERE is_public = 1) make these queries
  // cheap even as the table grows — index seek + LIMIT 100 ≈ < 5 ms each
  // at < 1k rows. Parallelising COUNT + 4 SELECTs cuts wall time ~3×.
  const buildQuery = (filter: Filter) =>
    `SELECT ${SNAPSHOT_COLUMNS}
     FROM leaderboard_m2
     WHERE is_public = 1
     ORDER BY ${ORDER_BY[filter]}
     LIMIT 100`;

  const [totalRow, ...queryResults] = await Promise.all([
    env.LEADERBOARD_DB
      .prepare("SELECT COUNT(*) AS c FROM leaderboard_m2 WHERE is_public = 1")
      .first<{ c: number }>(),
    ...FILTERS.map((filter) =>
      env.LEADERBOARD_DB
        .prepare(buildQuery(filter))
        .all<LeaderboardRowInternal>(),
    ),
  ]);

  const totalCount = totalRow?.c ?? 0;
  const now = Date.now();

  await Promise.all(
    FILTERS.map((filter, i) => {
      const payload: SnapshotPayload = {
        rows: queryResults[i]?.results ?? [],
        last_updated_at: now,
        total_count: totalCount,
      };
      return env.LEADERBOARD_KV.put(snapshotKvKey(filter), JSON.stringify(payload));
    }),
  );

  // Single structured log line — easy to grep in Cloudflare Workers Logs
  // dashboard. If cron starts failing this line goes missing → owner notices
  // via UI "上次更新" timestamp drift.
  console.log("[leaderboard cron] computed snapshots", {
    total_count: totalCount,
    at: now,
  });
}
