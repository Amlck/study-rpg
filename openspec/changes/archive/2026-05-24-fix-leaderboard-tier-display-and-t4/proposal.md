## Why

The 二階 leaderboard at `https://med-study-rpg.com/2nd/#/leaderboard` has **two interacting bugs** that ship a broken end-game experience:

1. **Display layer** — the leaderboard table renders raw `T${row.hospital_tier}` (e.g. `T1` / `T2` / `T3`) instead of the canonical short labels「診所 / 區域 / 醫中 / 大廟」defined by `add-abbreviated-tier-labels-medexam2` (archived 2026-05-23). End-game players see a regression vs. every other tier surface in the app.
2. **Schema layer** — D1 `leaderboard_m2` has `CHECK (hospital_tier BETWEEN 1 AND 3)` and the client `TIER_TO_NUMBER` map clamps `國家級教學醫院 → 3`, colliding with `醫學中心`. As a result **every T4 (大廟) player is indistinguishable from T3 (醫中)** on the leaderboard. The clamp was originally documented as a「Phase 4 follow-up」but never executed.

These two bugs interact: even if we fix display first, T4 players still show as 醫中. Fixing only the schema without display still leaves users seeing `T1/T2/T3/T4`. Both waves must ship to fully resolve the user-visible regression.

## What Changes

**Wave A — Display fix** (frontend-only, ships independently):

- `apps/medexam2-hospital-tw/src/pages/LeaderboardPage.tsx` lines 364 + 494: replace `T{row.hospital_tier}` with `tierLabel(NUM_TO_TIER[row.hospital_tier])`.
- Add a numeric→canonical reverse map (`NUM_TO_TIER: { 1: '診所', 2: '區域醫院', 3: '醫學中心', 4: '國家級教學醫院' }`) to `lib/tier-labels.ts` to keep display logic centralised.
- Column header「等級」preserved (no schema-affecting change).

**Wave B — T4 schema distinction** (D1 migration + Worker + client; needs owner manual `wrangler` apply):

- New D1 migration `cloudflare/sync-worker/migrations/0004_bump_tier_to_4.sql`: drop the `CHECK (hospital_tier BETWEEN 1 AND 3)` constraint and replace with `BETWEEN 1 AND 4`. SQLite has no `ALTER TABLE DROP CONSTRAINT` so the migration uses the CREATE-NEW + INSERT-SELECT + DROP + RENAME pattern.
- `cloudflare/sync-worker/src/leaderboard.ts:39`: `TIER_MAX = 3 → 4`. Server-side sanity bound at line 209 inherits.
- `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts:109`: `國家級教學醫院: 3 → 4`; delete the「Phase 4 follow-up」clamp comment block (lines ~99–104).
- Existing 3 D1 rows are preserved untouched by the migration (CHECK constraints apply to *new* writes; existing T1/T2/T3 rows stay valid). The next push from any T4 (大廟) player auto-writes `hospital_tier = 4`.

**Apply order**: Wave A ships first via plain commit + Chrome MCP smoke (no infra change). Wave B follows once owner runs `cd cloudflare/sync-worker && wrangler d1 migrations apply study-rpg-leaderboard --remote` and the Worker re-deploys via existing `deploy-worker.yml`. Until Wave B applies, T4 players keep showing as 醫中 on the leaderboard — acceptable interim state because Wave A already fixes the much-more-visible label regression for the 99% of players currently at T1–T3.

## Capabilities

### Modified Capabilities

- `hospital-leaderboard`: tier sanity bound widens from `[1, 3]` to `[1, 4]`; leaderboard UI tier cell now renders via canonical short label (`tierLabel()`) instead of raw `T${n}`. Two existing requirements modify; no new requirement added.

### New Capabilities

(none)

## Impact

**Code touched**:
- `apps/medexam2-hospital-tw/src/pages/LeaderboardPage.tsx` (Wave A: 2 lines)
- `apps/medexam2-hospital-tw/src/lib/tier-labels.ts` (Wave A: add `NUM_TO_TIER` map)
- `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` (Wave B: 1 line + comment removal)
- `cloudflare/sync-worker/src/leaderboard.ts` (Wave B: 1 constant)
- `cloudflare/sync-worker/migrations/0004_bump_tier_to_4.sql` (Wave B: new file)

**Spec touched**:
- `openspec/specs/hospital-leaderboard/spec.md` — 2 MODIFIED requirements (tier bounds + leaderboard UI tier rendering).

**Infrastructure / external**:
- Cloudflare D1 schema migration (owner manual `wrangler d1 migrations apply --remote`, ~5 sec).
- Cloudflare Worker redeploy (auto via existing `deploy-worker.yml` on push to main once Wave B merges).

**Not touched**:
- No Supabase / R2 / IndexedDB changes (leaderboard data plane is D1-only).
- No new dependency or framework version.
- No `LEADERBOARD_KV` snapshot schema change (KV stores pre-computed sorted rows verbatim; `hospital_tier` field type unchanged at JSON-integer).

**Migration numbering**:
- 0001 (existing) → 0002_add_badges.sql (achievement-system, shipped) → 0003 (reserved by in-flight `add-hospital-leaderboard-correct-count-filter`) → 0004_bump_tier_to_4.sql (this change). No collision risk; the 0003-claiming change is at 0/32 tasks so apply order is flexible.

**Breaking changes**: None. T1–T3 rows already in D1 stay valid (CHECK applies to writes). Old Worker code with `TIER_MAX = 3` would reject new T4 writes from updated clients post-Wave-B, so Worker deploy must precede or coincide with client deploy. Standard owner workflow already deploys both from same main push.

**Risk**: Low. Wave A is pure frontend (instant rollback). Wave B is a constraint widening (not narrowing), so backward-compatible with all historical data. The SQLite recreate-table pattern is well-trodden but the migration must verify row count pre/post to catch any silent data loss.
