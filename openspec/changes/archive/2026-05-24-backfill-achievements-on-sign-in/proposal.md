## Why

When the achievement system shipped on 2026-05-24 (change `add-achievement-system`, archived commit `820a95e`), the unlock-detection flow at `services/achievement-reward.ts:104` only writes a Dexie `achievements` row when `checkAchievementUnlocks` detects a transition from `false → true` between **two consecutive game events** (`prevStats` snapshot → action → `nextStats` snapshot). Players who already met catalog thresholds **before** the system shipped (e.g., already past 5 hours of reading or 50 quiz answers correct) never experience that transition — both `prevStats` and `nextStats` evaluate the predicate to `true` — so no row is ever written to Dexie, no badges populate `badges_csv`, and the public leaderboard at `med-study-rpg.com/2nd/` shows blank-badge rows for those players.

Verified live 2026-05-24 against `https://api.med-study-rpg.com/leaderboard/composite` snapshot: 9 of 10 rows have `badges_csv: ""` despite players clearly past multiple thresholds (e.g., ㄚㄚㄚ — tier 3 hospital, 48 doctors, 1004 study minutes — should have at least `study:P3`, `study:P4`, `recruit:P4`, `hospital:P3`, `hospital:P4`). The single row with badges (`康勞德 = quiz:P4`) reflects the only threshold I happened to cross **after** the deploy in a fresh quiz event.

## What Changes

- Add a new client-side backfill service (`services/achievement-backfill.ts`) that, on every successful pull cycle, evaluates the entire `ACHIEVEMENTS` catalog against the current Dexie state via the existing `listUnlockedAchievements(player, stats, catalog)` helper (already exported from `@study-rpg/core`), diffs the result against rows currently in the `achievements` table, and `bulkPut()`s any unlocked-but-missing rows silently (`notificationShown: true` — no toast, no full-screen modal, no reward dispatch beyond DB persistence).
- Wire the backfill into the existing `onPullComplete` engine callback at `useSync.ts:253` (currently runs `checkAssignmentInvariants`); extend that callback to also `await backfillAchievementsFromCurrentStats()` after invariant repair completes.
- The dirty-tracking pipeline already handles the rest: `bulkPut()` to `db.achievements` marks the table dirty → next debounced push includes the new rows → `onPushComplete` fires the leaderboard upsert → server-side `badges_csv` updates → next leaderboard render shows the correct badges.
- Add vitest unit coverage for the backfill service (3 cases: empty Dexie + non-empty stats backfills correctly; nothing missing → no-op; mixed Dexie state diffs correctly).

## Capabilities

### New Capabilities

None — this change adds a new requirement to an existing capability.

### Modified Capabilities

- `achievement-system`: adds a new requirement specifying that, on every successful sync pull, the client SHALL evaluate all catalog predicates against current Dexie state and silently persist any unlocked-but-missing achievement rows. The existing diff-based unlock detection requirement (for runtime transitions during gameplay) remains unchanged; this backfill complements it by covering pre-existing players and self-heals against any future predicate flapping.

## Impact

- **Code**: 1 new file (`apps/medexam2-hospital-tw/src/services/achievement-backfill.ts`, ~30 LOC); 1 modified call site (extend existing `onPullComplete` callback at `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts:253`, ~3 LOC); 1 new test file (`apps/medexam2-hospital-tw/src/services/__tests__/achievement-backfill.test.ts`).
- **APIs**: no public engine API changes — reuses existing `onPullComplete` callback that already gates on cycle completion. `backfillAchievementsFromCurrentStats(): Promise<number>` returns the count of rows backfilled (for telemetry / future tests; ignored in the current call site).
- **Performance**: ~200ms per pull cycle (one transactional Dexie read via existing `buildAchievementStats()`, one `listUnlockedAchievements` evaluation over 49 catalog entries, one Set membership check, one optional `bulkPut`). After the first successful backfill, subsequent calls short-circuit with `missing.length === 0` and skip the `bulkPut`. Acceptable at the engine's pull cadence (cold-start + visibility-change).
- **Spec**: no `cloud-sync` change needed (reuses existing `onPullComplete` hook); 1 ADDED requirement to `achievement-system`.
- **No Worker / Supabase / D1 changes**. No new env vars. No schema migrations.
- **User-visible effect post-deploy**: every existing player who signs in once will have their full badge set computed locally and pushed to the leaderboard on the next debounced sync; the public leaderboard will start rendering the correct `badges_csv` for those players (replacing the current all-empty state) within minutes of their next visit. No user action required.
- **Out of scope**: server-side backfill from Worker (client-side is simpler and self-healing); changing the existing diff-based unlock-detection trigger logic; firing reward dispatch (cosmetic intent log / title append) for backfilled achievements (silent backfill intentionally skips the dispatch + toast flow to avoid spamming players retroactively).
