## Context

`add-hospital-leaderboard-correct-count-filter` shipped 2026-05-24 with `total_correct = SUM(mastery.correct)`. The original design D1 weighed `mastery` vs `questionHistory` and picked `mastery` for two reasons:

1. **Read locality**: ~14 mastery rows vs N (potentially 6066) questionHistory rows per push.
2. **UI consistency**: `mastery` is the source the existing「掌握 N%」UI displays use, so the leaderboard would match what the player sees.

Both reasons turn out to be wrong on inspection:

- **Locality**: questionHistory only carries rows for questions the player has actually touched (not the full 6066 pool). For active players that is typically 100–500 rows, not thousands. Each row is small; a single `db.questionHistory.toArray()` + `reduce` runs in single-digit ms.
- **UI consistency**: the player's mental model of「答對總題數」is the raw count of correct answers, NOT a weighted aggregate. The「掌握 N%」UI uses `mastery.correct / mastery.total` because those two values share the same multiplier weighting, so the percentage is meaningful internally. But projecting `mastery.correct` to a public leaderboard exposes the weighting — leading to numbers like「外科 13.6」that confuse anyone seeing them out of context.

A user-driven smoke (2026-05-24, see Why in proposal.md) confirmed the leaderboard column reads ~20% lower than `questionHistory` for the same player, and ~100% lower for `耳鼻喉科` thanks to the pre-`e085876` tx-rollback bug.

## Goals / Non-Goals

**Goals:**
- Make `total_correct` equal the player's raw lifetime count of correct answers across all subjects, re-attempts counted, partner-specialty multiplier ignored.
- Keep the existing Worker / D1 / KV plumbing untouched (only the client-side source flips).
- Pre-tx-fix players whose `mastery.correct` is stale gain the corrected value on their next natural sync push.

**Non-Goals:**
- Backfill: no one-shot retroactive write. Players who haven't opened the app since this change ships keep showing stale `total_correct` until they sync — same lazy-sync story as the original change's §D5.
- Switching to "distinct correct questions" (i.e. ignoring re-attempts). Re-attempts are intentional study behavior and should count toward leaderboard standing.
- Touching `mastery.correct` semantics. That table still drives the「掌握 N%」UI and SRS scheduling; its weighting is load-bearing internal state.
- Adding a separate "lifetime answer count" field. Would double the payload size for no benefit since this change repurposes the existing field.

## Decisions

### D1: Source = `SUM(questionHistory.correctCount)`, re-attempts counted

`questionHistory` is the canonical first-write of the answer event in `recordCorrectAnswer` / `recordWrongAnswer`. Each row carries `correctCount` (number of times the player has answered THIS question correctly) and `attempts` (total times answered). Summing `correctCount` over all rows gives total correct answers across the player's history with re-attempts counted.

Why re-attempts counted (not distinct correct questions):
- The 5 candidates surfaced during dogfood:
  - A (mastery.correct weighted) = 79
  - B (qh.correctCount summed, re-attempts counted) = 95
  - C (qh rows where correctCount > 0, distinct correct) = 85
  - D (qh.attempts summed, includes wrong) = 189
  - E (qh row count, distinct answered) = 169
- User picked **B** (95).
- Rationale: SRS re-attempts of previously-correct questions are intentional spaced-repetition work; rewarding them is consistent with the leaderboard's mission of「how much exam practice has the player banked」.

### D2: Math.max + Math.floor clamp preserved

Defensive in case `correctCount` is somehow fractional (it shouldn't be — `recordCorrectAnswer` calls `upsertHistory(..., true)` which increments by exactly 1 — but the clamp is cheap and matches the previous shape).

### D3: No data migration; lazy resync via natural push

Existing D1 rows have whatever `total_correct` the previous client bundle pushed (weighted-mastery aggregate). They'll be overwritten on each player's next `pushLeaderboardIfOptedIn` call — typically within minutes of opening the app, since gameplay actions trigger sync pushes.

This is the same lazy-sync story as `add-hospital-leaderboard-correct-count-filter` §D5. The Worker UPSERT one-way ratchet (which preserves a populated server-side value when an empty payload arrives) doesn't fire here because the new derivation produces a STRICTLY LARGER value than the old derivation (raw count ≥ weighted aggregate; ratchet only protects against 0-payload clobber).

### D4: Worker / Core types stay unchanged

`LeaderboardUpsertPayload.total_correct` is already `number | undefined`. Server-side sanity bound `total_correct >= 0` accepts any non-negative number. INSERT statement binds positionally to the same column. No protocol break.

## Risks / Trade-offs

[Risk] Reading `questionHistory.toArray()` on every push could be slow for end-game players with thousands of history rows.
→ Mitigation: end-game scale is ~6066 rows max (entire question pool). Each row is < 200 bytes; `toArray()` + `reduce` over 6000 rows in IDB runs < 50ms on real devices. Sync push is debounced 3s so even worst case adds negligible overhead.

[Risk] Leaderboard number jumps upward for existing opted-in players on first sync after this change ships.
→ Mitigation: this is the intended correction. Players who notice will see「我的數字變大了」which matches their real activity. No UX surprise downside.

[Risk] Future spec drift if a code refactor moves `correctCount` off `questionHistory` rows.
→ Mitigation: the scenario in `hospital-leaderboard/spec.md` pins the derivation contract; any refactor that touches `questionHistory` schema MUST update the scenario together.

## Migration Plan

1. Apply this change → client bundle ships with new derivation.
2. Client deploy via main push → GH Pages + CF Pages rebuild.
3. Each player's next gameplay-triggered sync push (typically within minutes) overwrites their D1 row's `total_correct` with the new value.
4. Next `:00` / `:30` cron tick rebuilds the `correct` KV snapshot with the corrected values.
5. Within ~30 min of client deploy, the leaderboard `correct` tab reflects the corrected numbers for active players.

No Worker / D1 / KV / Core changes needed. No rollback friction — flipping back means another client-only change.

## Open Questions

(none)
