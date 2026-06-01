## Why

The achievement system shipped on 2026-05-24 extended `MonotonicCountersRow` with 5 new MAX-merge fields (`totalDoctorsRecruited`, `totalP1DoctorsRecruited`, `maxDailyStreak`, `tierUpgradeCount`, `maxQuizCorrectStreak`). The Dexie v15 schema migration added the fields, but **did not backfill values** on the existing singleton row for players whose row pre-dated the migration. Reading `mono.totalDoctorsRecruited` returns `undefined → ?? 0` in `buildAchievementStats()`, so achievement predicates that depend on those counters evaluate to false for pre-existing players even when their actual game state crosses the thresholds.

Live verification 2026-05-24 (post `backfill-achievements-on-sign-in` deploy `ac6fa1a`): my Dexie shows `doctors_count: 12`, `tier: "診所"`, `monotonicCounters.totalDoctorsRecruited: undefined`. The achievement-row backfill (just shipped) correctly evaluates predicates but with bad inputs, so achievements like `recruit-first-doctor` (`totalDoctorsRecruited >= 1`) stay locked despite 12 actual doctors in the `doctors` table. This is the second layer of the same root cause that produced the empty `badges_csv` issue.

## What Changes

- Add a new client-side counter-backfill service (`services/counter-backfill.ts`) that derives the recoverable monotonic counter fields from existing Dexie tables and writes them back to the `monotonicCounters` singleton row using MAX-merge semantics (only writes if `derived > existing ?? 0`).
- 3 derivations cover the achievable subset:
  - `totalDoctorsRecruited = doctors.count() + retirementLog.count()` (current roster + ever-retired = lifetime recruitments)
  - `totalP1DoctorsRecruited = doctors.where('rarity').equals('P1').count() + retirementLog.where('rarity').equals('P1').count()`
  - `tierUpgradeCount = TIER_TO_UPGRADE_COUNT[counters.tier]` where `{診所: 0, 區域醫院: 1, 醫學中心: 2, 國家級教學醫院: 3}`
- 3 fields remain unrecoverable from existing tables (`totalStudyMinutes`, `maxDailyStreak`, `maxQuizCorrectStreak` — no historical event log to replay); they stay at their existing value (which may be `undefined` for pre-existing players, treated as `0` downstream). These fields populate naturally on subsequent gameplay events via the existing trigger hooks.
- Chain counter-backfill BEFORE achievement-backfill in the existing `onPullComplete` callback at `useSync.ts:255`, so when `buildAchievementStats()` runs inside the achievement-backfill, the counters are already correct.
- No vitest cases (二階 lacks vitest infra; same documented constraint as `backfill-achievements-on-sign-in` and `fix-r2-conditional-pull-cors`); production smoke covers via leaderboard re-query.

## Capabilities

### New Capabilities

None — this change adds a new requirement to an existing capability.

### Modified Capabilities

- `achievement-system`: adds a new requirement specifying the monotonic counter backfill pass. Existing requirements about diff-based unlock detection and silent achievement-row backfill remain unchanged; this delta adds a sibling backfill that runs immediately before achievement-row backfill in the same `onPullComplete` chain.

## Impact

- **Code**: 1 new file (`apps/medexam2-hospital-tw/src/services/counter-backfill.ts`, ~45 LOC including derivation table); 1 modified call site (extend the achievement-backfill chain in `useSync.ts` onPullComplete to call counter-backfill first, ~3 LOC).
- **APIs**: no public engine API changes. `backfillMonotonicCounters(): Promise<number>` returns the count of fields updated (0 if all already populated or all derivations <= existing values).
- **Performance**: ~50ms per pull cycle for the derivation queries (4 Dexie `count()` calls + 1 `get()`). After first successful backfill, subsequent calls short-circuit on `changed === 0` (no `put` call) — overhead bounded to the read pass.
- **Spec**: no `cloud-sync` change needed; 1 ADDED requirement to `achievement-system`.
- **No Worker / Supabase / D1 changes**. No schema migrations (uses existing `monotonicCounters` table). No new env vars.
- **User-visible effect post-deploy**: every existing player who signs in once will have their derivable counters populated → achievement-backfill (already deployed via `ac6fa1a`) will re-evaluate and unlock the recruit/tier achievements they qualified for → next leaderboard upsert pushes the expanded `badges_csv`. For my own row: gains `recruit-first-doctor` at minimum; for ㄚㄚㄚ (48 doctors, tier 3 medical center): gains ~5-7 new badges across recruit + hospital categories.
- **Out of scope**: server-side counter reconstruction from event logs; populating the 3 unrecoverable counters (`totalStudyMinutes` / `maxDailyStreak` / `maxQuizCorrectStreak`) — those simply re-accumulate from current gameplay; refactoring `buildAchievementStats` to read derived values directly (we patch the counter row instead, preserving the existing read path).
