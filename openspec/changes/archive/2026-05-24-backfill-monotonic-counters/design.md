## Context

The achievement system shipped on 2026-05-24 (change `add-achievement-system`, archived commit `820a95e`) extended `MonotonicCountersRow` with 5 new MAX-merge fields. The Dexie v15 schema migration declared the fields but did not write default values to the existing singleton row — Dexie's standard migration behavior. New trigger hooks at `services/{quiz-rewards,recruitment,training,retire,fate-card,tick}.ts` write to these fields on each fresh gameplay event, but for players already past thresholds before the migration, the fields stay `undefined`.

The first backfill change (`backfill-achievements-on-sign-in`, archived `ac6fa1a` on 2026-05-24) evaluates achievement predicates against current Dexie state on every pull cycle and silently writes unlocked-but-missing achievement rows. It works correctly for predicates that read state derived from other tables (`questionHistory` → `totalQuestionsCorrect`, `eventLog` → `medicalDisputesFailed`, `gameCounters.tier` → `currentHospitalTier`, etc.) but fails for predicates that read the un-backfilled monotonic counters. Result: partial badge backfill; recruit / tier-upgrade achievements stay locked.

Live verification (own state, 2026-05-24): `doctors.count() = 12` but `mono.totalDoctorsRecruited = undefined`, so `recruit-first-doctor` predicate (`stats.totalDoctorsRecruited >= 1`) evaluates to false despite obvious recruitment history.

## Goals / Non-Goals

**Goals:**
- Populate the 3 derivable monotonic counter fields for pre-existing players so the achievement-backfill predicates have correct inputs on the same pull cycle.
- Use MAX-merge semantics — only overwrite if derived value is greater than existing — so future actual gameplay never gets clobbered by an under-counting derivation.
- Run before achievement-backfill within the same `onPullComplete` chain, so a single pull cycle does both passes and the user sees correct badges on the next leaderboard upsert.
- Idempotent: after the first successful backfill writes the derived values, subsequent calls short-circuit on `changed === 0`.

**Non-Goals:**
- Reconstructing the 3 unrecoverable counters (`totalStudyMinutes`, `maxDailyStreak`, `maxQuizCorrectStreak`). These require historical event timelines we don't keep; accepting they re-accumulate from current gameplay.
- Refactoring `buildAchievementStats` to read derived values directly. The existing code path (reading from `monotonicCounters`) is correct; we just need to populate the row.
- Worker-side enforcement (e.g. server cross-checking client's submitted counters against R2 snapshot). Out of scope.
- Migrating away from MAX-merge semantics on monotonic counters. The semantic is correct; the bug was specifically the migration-time backfill omission.

## Decisions

### D1: Derive `totalDoctorsRecruited` as `doctors.count() + retirementLog.count()`

**Decision**: Cumulative recruitments = current doctors + ever-retired doctors. Both tables are append-only (retirementLog) or only-removed-via-retirement (doctors). No path removes a doctor without writing to retirementLog.

**Alternatives considered**:

| Option | Risk |
|---|---|
| `doctors.count()` alone (current roster) | Undercounts — retired doctors not in `doctors` table |
| Count distinct `obtainedAt` timestamps across both tables | Same numeric result; more expensive |
| Query Worker for server-side count | Network round-trip; complexity; out of scope |

Chosen: `doctors.count() + retirementLog.count()` — accurate, cheap, no network.

### D2: Derive `totalP1DoctorsRecruited` similarly with rarity filter

**Decision**: `doctors.where('rarity').equals('P1').count() + retirementLog.where('rarity').equals('P1').count()`.

Same rationale as D1. Both tables have a `rarity` field indexable in Dexie (already indexed per existing schema).

### D3: Derive `tierUpgradeCount` from current tier via a static map

**Decision**: `tierUpgradeCount = TIER_TO_UPGRADE_COUNT[counters.tier ?? '診所']` where the map is `{診所: 0, 區域醫院: 1, 醫學中心: 2, 國家級教學醫院: 3}`.

**Rationale**: Tier is strictly monotonic — players can only upgrade, never downgrade in the current gameplay model. The current tier directly encodes the number of upgrades performed since starting from 診所. No need for an event log.

**Trade-off**: If a future gameplay change introduces tier downgrades (e.g., a malpractice event that demotes the hospital), this derivation would over-count. Documented as a future-concern; not blocking current backfill.

### D4: MAX-merge: only patch when derived value is strictly greater than existing

**Decision**: For each derivable field, check `if ((mono[field] ?? 0) < derivedValue) patches[field] = derivedValue`. Skip the field if already equal or greater.

**Rationale**: MAX-merge is the existing semantic of these monotonic counters (per project CLAUDE.md "5 new MAX-merge counters"). The derivation is a floor estimate — actual lifetime counter might be higher if the trigger hooks fired post-deploy and incremented past the derived value. Don't regress in that case.

**Idempotency**: If first call writes `totalDoctorsRecruited = 12`, subsequent calls see `mono.totalDoctorsRecruited = 12` and derived = 12, so `12 < 12` is false → no write. Short-circuit.

### D5: Run counter-backfill BEFORE achievement-backfill in onPullComplete

**Decision**: Modify the onPullComplete callback in `useSync.ts` to: `await checkAssignmentInvariants()` → `await backfillMonotonicCounters()` → `await backfillAchievementsFromCurrentStats()`. All three inside the existing try/catch that wraps the achievement-backfill call.

**Rationale**: Achievement-backfill calls `buildAchievementStats()` which reads from monotonicCounters. Running counter-backfill first means the achievement evaluation sees the patched values immediately, so a single pull cycle does both passes. Without this ordering, achievement-backfill would need two pull cycles (first to backfill counters via the patch trigger via some mechanism, second to use them).

Extending the existing try/catch (which currently only covers `backfillAchievementsFromCurrentStats`) to also cover counter-backfill is correct: a counter-backfill failure should not break the pull cycle either, and it should still be retried on the next cycle.

### D6: Accept that 3 fields stay unrecoverable

**Decision**: `totalStudyMinutes` / `maxDailyStreak` / `maxQuizCorrectStreak` are NOT derived. They remain at their existing value (often `undefined` for pre-existing players, treated as `0` downstream by the `?? 0` guards in `buildAchievementStats`).

**Trade-off**: Achievements gated by these counters (`study-hours-5`, streak-related, daily streak ones) stay locked for pre-existing players. Trade-off is accepted: those counters re-accumulate from current gameplay, so a player who continues playing will eventually cross the thresholds via the normal trigger-hook path.

**Future option**: A separate change could record session start/end events to a new Dexie table, then derive `totalStudyMinutes` from sum-of-deltas. Deferred until user feedback indicates it matters.

## Risks / Trade-offs

- **[Risk] Off-by-N derivation of `totalDoctorsRecruited`**: if any code path ever removed a doctor without writing to `retirementLog`, the derived count under-counts. → **Mitigation**: code review of doctor-removal paths shows retirement is the only such path. Future paths must respect this contract.
- **[Risk] Tier downgrade introduces over-count in `tierUpgradeCount`**: see D3 trade-off. → **Mitigation**: no gameplay path currently demotes tier; flagged in design.
- **[Risk] Race between counter-backfill and a concurrent recruitment trigger**: player signs in, pull cycle starts counter-backfill, mid-evaluation a new doctor recruitment fires via gameplay → `monotonicCounters.put` from the trigger races with counter-backfill's `put`. → **Mitigation**: Dexie `put` is transactional per call; last-write-wins on the singleton row. Worst case: one of the writes is overwritten momentarily but the next pull cycle's backfill re-derives and patches correctly. No data loss.
- **[Risk] Counter-backfill failure breaks the achievement-backfill chain**: if counter-backfill throws, the existing try/catch around achievement-backfill catches it but achievement-backfill never runs in that cycle. → **Mitigation**: acceptable — both backfills retry on every pull cycle. A single missed cycle does not regress user-visible state.
- **[Trade-off] Accept 3 fields stay at 0**: see D6. Accepted with future-revisit door.

## Migration Plan

1. Land code + spec delta on `hotfix/backfill-monotonic-counters` branch (off origin/main at `ac6fa1a`).
2. Run `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` + `build`.
3. Run `pnpm -r typecheck` for global integrity.
4. `/opsx:verify` clean → sync delta into `openspec/specs/achievement-system/spec.md` → mv change to archive → commit + push.
5. Both GH Pages + CF Pages auto-deploy.
6. Verify post-deploy: re-trigger Chrome MCP smoke from previous session — bring MCP window to focus → visibility-change pull → counter-backfill patches mono row → achievement-backfill re-evaluates → unlocks new rows → next debounced push uploads expanded `badges_csv` to leaderboard.
7. Re-query `https://api.med-study-rpg.com/leaderboard/composite` ~3-5 min after — expect owner row's `badges_csv` to gain recruit + hospital category entries; ㄚㄚㄚ's row gains multiple after they sign in.

**Rollback**: revert the single archived merge commit. Backfilled counter values on existing clients persist (idempotent, harmless — the values are accurate floor estimates).

## Open Questions

- Whether to log per-derivation values via DEV-only console.debug for diagnosability — current design omits; revisit if dogfood reports counter mismatches.
- Whether to derive `totalStudyMinutes` from a future session-event log — see D6 future option; deferred.
- Whether to add a counter-revalidation pass that detects drift between derived and stored values (e.g., player retired a doctor but the trigger hook missed updating the counter) — out of scope; the MAX-merge logic already self-heals via subsequent pulls.
