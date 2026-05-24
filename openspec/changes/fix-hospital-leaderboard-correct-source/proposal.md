## Why

The 5th leaderboard filter「答對總題數」shipped 2026-05-24 via `add-hospital-leaderboard-correct-count-filter` sources its value from `SUM(mastery.correct)`. Dogfood smoke immediately surfaced two problems that make this source the wrong fit:

1. **Multiplier weighting**: `mastery.correct` is bumped by `multiplier` (specialty-match factor) per correct answer — not by 1. Generalist doctors or wrong-specialty partners produce fractional increments (0.6, 0.8). Net effect: a player who actually answered 20 questions correctly in 外科 sees `mastery.correct = 13.6`. The leaderboard column underreports actual answer count by 20–40%.
2. **Pre-fix tx rollback drop**: Before `e085876 fix(medexam2-quiz): expand outer tx scope` shipped, mastery upserts silently rolled back because the achievement-stats capture inside `applyQuizReward` blew up the outer transaction. `questionHistory` rows survived (they wrote first), but `mastery.correct` stayed at the last cloud-pulled value. One affected player's snapshot: `耳鼻喉科 mastery.correct=0` despite `questionHistory` showing 11 distinct correct answers across 30 attempts.

Both problems vanish if we read `questionHistory.correctCount` instead — that table is the canonical first-write of the answer event, never weighted, and was always written even when the broken outer-tx pattern killed mastery upserts.

## What Changes

- Change `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` `buildLeaderboardAttributes()` to compute `total_correct` from `SUM(questionHistory.correctCount)` instead of `SUM(mastery.correct)`.
- Update the `total_correct computed from mastery aggregate` scenario in `openspec/specs/hospital-leaderboard/spec.md` to reference `questionHistory.correctCount` aggregate instead.
- Update [docs/LEADERBOARD.md](../../../docs/LEADERBOARD.md) schema row note + body description.
- No Worker, D1, KV, or core-type changes. Worker keeps accepting `total_correct: number` — only the client-side derivation source flips.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `hospital-leaderboard`: the `total_correct` derivation source changes from `mastery.correct` aggregate to `questionHistory.correctCount` aggregate. Net semantics: every correct answer (including re-attempts) counts as exactly 1, regardless of partner specialty multiplier.

## Impact

**Client (medexam2-hospital-tw)**
- `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` (`buildLeaderboardAttributes` only — single function body change)

**Specs**
- `openspec/specs/hospital-leaderboard/spec.md` (one scenario re-worded)

**Docs**
- `docs/LEADERBOARD.md` (schema row note + 1 paragraph)

**No-op zones**
- Worker code (`cloudflare/sync-worker/src/leaderboard.ts`): payload shape unchanged; positional binds unchanged
- D1 schema: `total_correct` column unchanged
- KV snapshot keys: unchanged
- `LeaderboardUpsertPayload` / `LeaderboardRow` shapes in `@study-rpg/core`: unchanged
- Migration plan: no new migration; existing rows get their next natural-sync push overwritten with the higher questionHistory-derived value
