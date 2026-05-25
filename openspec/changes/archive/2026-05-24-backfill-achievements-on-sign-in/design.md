## Context

The achievement system shipped via change `add-achievement-system` (archived 2026-05-24 at commit `820a95e`). The detection mechanism uses pure-function predicates over `(Player, AchievementStats)` evaluated at each gameplay event:

```
quizAction → buildAchievementStats() → prevStats
           → mutate Dexie
           → buildAchievementStats() → nextStats
           → checkAchievementUnlocks(synthPlayer, prevStats, synthPlayer, nextStats, ACHIEVEMENTS)
           → for each transition false → true: db.achievements.put(...) + dispatchReward + toast
```

This design is correct for **runtime transitions** — players cross thresholds during gameplay, get instant feedback. It is incorrect for **pre-existing state** — players who were already past thresholds when the catalog deployed never experience the transition (both prev and next satisfy the predicate). The Dexie `achievements` table stays empty for them, `deriveAchievementSnapshot()` returns `{badges_csv: '', subject_mastery_count: 0}`, and the leaderboard renders blank-badge rows.

Live verification 2026-05-24: 9 of 10 rows in the prod `composite` snapshot have empty `badges_csv` despite stats clearly past multiple thresholds. The single non-empty row (`康勞德 = quiz:P4`) reflects a single fresh threshold I crossed post-deploy during smoke testing.

The bug is display-only — no data loss, no functional regression — but it defeats the purpose of the badges feature: only players who happened to cross a *new* threshold in a *new* gameplay event after the deploy will ever show badges. Most active players have already crossed their applicable thresholds long ago.

## Goals / Non-Goals

**Goals:**
- Every existing player gets their full applicable badge set on next sign-in / engine pull cycle, no user action required.
- Self-heal: if predicates are later refined or new achievements added to the catalog, players retroactively get newly-eligible badges on next pull.
- No regression in the existing diff-based unlock detection for **new** transitions (which still need toast + modal + reward dispatch).
- No new engine API surface; reuse the existing `onPullComplete` hook.
- Silent operation — pre-existing players shouldn't be spammed with retroactive toasts for things they already accomplished weeks/months ago.

**Non-Goals:**
- Server-side backfill from the Worker (would require querying counters on the server; client has the same data via Dexie and is the canonical evaluator anyway).
- Backfill triggering for the `cosmetic` reward channel (currently the catalog has no cosmetic rewards; if one is added later, `dispatchReward` for backfill rows can be enabled by removing the suppression — out of scope here).
- Backfill triggering for the `title` reward channel (titles add to the user's selectable display titles via `db.meta` — silently writing 20+ titles into that list for a long-time player would clutter the title picker; defer this design until we have user feedback on what's wanted).
- Changing predicate semantics, threshold values, or the catalog itself.
- Performance optimization beyond the natural short-circuit after first backfill.

## Decisions

### D1: Run backfill on every pull cycle via existing `onPullComplete`, not a one-shot startup callback

**Decision**: Extend the existing `onPullComplete` callback (currently wired in `useSync.ts:253` to run `checkAssignmentInvariants`) to also `await backfillAchievementsFromCurrentStats()` after invariant repair completes.

**Alternatives considered**:

| Option | Cost | Pro | Con |
|---|---|---|---|
| A. **Reuse `onPullComplete`** (chosen) | ~200ms / pull cycle | No engine API change; self-heals on every pull; idempotent | Fires more often than strictly needed; fast short-circuit after first backfill makes this negligible |
| B. New `onStartupPullComplete` engine callback | One-time engine API addition | Fires exactly once per session | New API surface to maintain; doesn't self-heal if a future predicate change makes new things eligible mid-session |
| C. Boot-time `useEffect` in App.tsx independent of engine | Simple but timing-fragile | No engine dependency | Risk of running before cold-start pull populates Dexie; would see stale state |

Option A wins on simplicity and self-heal. Per-pull overhead is bounded by the `existingIds` Set lookup which short-circuits if everything is already backfilled. The first call after deploy does the heavy lift (one bulkPut); subsequent calls return `0`.

### D2: Silent backfill — no toast, no full-screen modal, no reward dispatch

**Decision**: Backfilled rows are written with `notificationShown: true` and the orchestrator does NOT call `dispatchReward` or push to `achievementToastQueue`.

**Rationale**: A long-time player signing in for the first time after this fix could be eligible for 20+ achievements simultaneously. Firing the full unlock-detection pipeline (toast for each + full-screen modal for any P1) would be a disruptive UX surprise — the player didn't just *do* anything. The badges show up silently on their leaderboard row + their `/achievements` page; they discover them organically.

**Trade-off**: Players don't get a retroactive celebration for past accomplishments. Accepted — the celebration is the unlock toast which is supposed to coincide with the action that triggered it. Showing it days/weeks later for an action they don't remember is dissonant.

If telemetry or feedback later shows users want a "what you've unlocked since we shipped this" recap, that's a separate change with its own UX design (e.g., a single summary modal, not 20 toasts).

### D3: Backfill `subject-master-*` entries too

**Decision**: The backfill loop iterates ALL `ACHIEVEMENTS` entries including the 14 `subject-master-<科>` entries (used to derive `subject_mastery_count` on the leaderboard).

**Rationale**: Same root cause applies — players who already wrote all 1306 內科 questions before the catalog shipped never transitioned the predicate. Without backfilling these, `subject_mastery_count` stays 0 even for completionist players.

### D4: Use `listUnlockedAchievements` helper from core; don't reimplement

**Decision**: Call the existing `listUnlockedAchievements(player, stats, catalog): Achievement[]` helper (already exported from `@study-rpg/core/lib/achievement.ts`) rather than re-walking the catalog and calling predicates inline.

**Rationale**: That helper is exactly the operation we need — "filter catalog to entries whose predicate is currently true." Avoids drift if the helper's behavior evolves; matches the contract used by `AchievementsPage.tsx` for the locked/unlocked display.

### D5: Bound errors via try/catch in the onPullComplete extension

**Decision**: Wrap the `backfillAchievementsFromCurrentStats()` call in a try/catch at the call site in useSync.ts. If backfill throws (e.g., Dexie transaction failure mid-evaluation), log via `console.warn` with `[achievement-backfill]` channel prefix and let the rest of `onPullComplete` proceed normally.

**Rationale**: Backfill is a best-effort augmentation, not a correctness invariant. A transient Dexie failure should not break the pull cycle or block `checkAssignmentInvariants`. Errors surface to operator via console + bug-report `recent_console_errors` ring buffer.

## Risks / Trade-offs

- **[Risk] Performance on first backfill for long-time players**: a player with 1004 study minutes + 48 doctors + full subject coverage could match ~30 catalog entries. Single `bulkPut` of 30 rows is sub-100ms in Dexie. Per `buildAchievementStats()` doc comment, the stats scan itself is ~200ms typical. Total backfill: <500ms one-time, negligible thereafter. → **Mitigation**: short-circuit after first run via Set diff. Acceptable.
- **[Risk] Backfill races with concurrent gameplay unlock**: player signs in, force-pull triggers backfill, mid-backfill they answer a quiz that also triggers the normal unlock-detection path → both might try to put the same achievement row. → **Mitigation**: `db.achievements.put` is idempotent (last-write-wins on `id` primary key); backfill uses `bulkPut` which is also idempotent. The `services/achievement-reward.ts:101` "Idempotent guard" already checks for `existing` before puts. No corruption risk.
- **[Risk] Backfill fires before cloud-sync replaces local stale state**: order-dependent — if backfill runs before the cold-start force-pull's apply phase completes, it evaluates against stale local stats and may miss thresholds that the cloud has counters for. → **Mitigation**: `onPullComplete` fires AFTER the apply phase by design (see `engine.ts` `pullAllNow` logic — applies first, fires callback last). And even in worst case, the NEXT pull cycle catches what was missed (self-healing).
- **[Risk] User clears Dexie / fresh device → backfill re-fires + leaderboard upsert re-pushes**: expected behavior, not a bug. The achievements get the new `unlockedAt = Date.now()` timestamp instead of the original; for badges_csv computation this doesn't matter (only the set membership matters).
- **[Trade-off] Backfill timestamps reflect backfill time, not original threshold-crossing time**: if a player asks "when did I unlock 唸書 5 小時?" their AchievementsPage will say "2026-05-25" instead of the historically correct "2026-03-12". Accepted — original timestamp is unrecoverable without server-side replay of all gameplay events.
- **[Trade-off] No retroactive title / cosmetic dispatch**: see D2. Accepted with a follow-up-if-asked door.

## Migration Plan

1. Land code + tests + spec delta on `hotfix/backfill-achievements-on-sign-in` (this change).
2. Run `pnpm --filter @study-rpg/medexam2-hospital-tw test` (the new backfill test + existing tests still green).
3. Run `pnpm --filter @study-rpg/medexam2-hospital-tw build` + `pnpm -r typecheck` for global integrity.
4. `/opsx:verify` clean → `/opsx:archive` → auto-git commit (template: `spec(archive): merge backfill-achievements-on-sign-in — silent retro-unlock on every pull for pre-existing players`) → merge to main via fast-forward → push.
5. Both GH Pages + CF Pages auto-deploy.
6. Verify post-deploy: re-query `https://api.med-study-rpg.com/leaderboard/composite` 30+ minutes after deploy. Expect: rows for players who logged in during the bake start showing non-empty `badges_csv`. (Rows for players who haven't logged in yet stay empty until they sign in once.)

**Rollback**: revert the single archived merge commit; redeploy. Backfilled Dexie rows on existing clients remain (idempotent, harmless), the leaderboard `badges_csv` field also remains (also harmless — just stale-on-display).

## Open Questions

- Whether to add a one-time "you have N new badges" summary toast for users who get a non-zero backfill — explicitly deferred per D2; revisit if dogfood feedback asks for it.
- Whether to enable retroactive title dispatch (D2 trade-off) — deferred pending the title-picker UI being implemented (currently the titles list lives in `db.meta['achievement-titles-unlocked']` but the picker is Phase 8 unimplemented).
- Whether backfill should also fire on app boot independent of sync (offline player scenario) — current design only fires on pull, which requires authed online state. An offline player would not see backfill until they next come online. Acceptable since `badges_csv` only matters for the public leaderboard (which requires server contact anyway).
