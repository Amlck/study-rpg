## Why

A player reported that ticking **跳過 SRS（純隨機新題）** in the 二階 quiz modal still surfaces questions they already answered in previous sessions. The toggle's UI label promises 「新題」(new questions), but the current implementation only de-duplicates within the current modal session via `seenIdsRef.current` — it does not consult IndexedDB `questionHistory`, so any question answered yesterday (or 30 days ago) is fair game for re-rolling.

The existing `hospital-quiz` spec describes the toggle's contract as "skip due-queue scheduling only, does not affect SRS scheduling itself", which is narrower than what the UI label conveys. Players read 「純隨機新題」as "give me only questions I haven't seen", and that mismatch is what they're reporting as a bug.

## What Changes

- **BREAKING (player-facing contract)**: When `skipSrs = true`, the random picker MUST exclude every `questionId` already present in `questionHistory` (the cross-session record of every question the player has answered), in addition to the existing in-session `seenIds` exclusion.
- Pool-exhaustion detection in `QuizModal.loadNextQuestion` switches from `seenIds.size >= poolSize` to the union of `(questionHistory ∪ seenIds).size >= poolSize` while `skipSrs` is on, so the 「本科獨立題已掃完」toast fires at the correct moment (when there are no truly-new questions left, not when the player has merely cycled through this modal's session).
- `pickRandomQuestion` in `apps/medexam2-hospital-tw/src/lib/quiz.ts` gains an optional `excludeIds: Set<string>` parameter (additive, defaults to empty — non-`skipSrs` and ER-consult / training callers stay byte-for-byte identical).
- `hospital-quiz` spec Requirement「QuizModal SHALL expose a Skip-SRS toggle bypassing the due-first picker」is reworded to require exclusion of `questionHistory` entries, and gains a new Scenario covering cross-session exclusion. The helper-line wording 「（不影響 SRS 排程，到期題仍會記）」is preserved — that statement was about whether **answering** affects SRS, which remains true.
- One-time DEV-only sanity check: when `skipSrs` flips on, log the size of the excluded `questionHistory` set so dogfood telemetry can confirm the fix is wired.

**Out of scope**: 一階 (`medexam-tw`) has no `skipSrs` toggle, so no changes there. Core engine (`packages/core/`) is untouched — `pickRandomQuestion` is an app-level helper, not part of the published `@study-rpg/core` API surface.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `hospital-quiz`: Reword the Skip-SRS toggle Requirement so it mandates `questionHistory` exclusion on top of `seenIds`; add Scenario「Toggle on excludes previously-answered questions across sessions」and Scenario「Pool exhaustion fires when history union seen covers full pool」; revise existing Scenario「Toggle on forces random picker for next」to call out the exclusion.

## Impact

- **Code**:
  - `apps/medexam2-hospital-tw/src/lib/quiz.ts` — `pickRandomQuestion` signature gains optional `excludeIds`.
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` — `loadNextQuestion` (and the surrounding refs) pre-fetch the `questionHistory` id set on the `skipSrs` branch and pass it through; exhaustion-toast condition updated.
- **Specs**: `openspec/specs/hospital-quiz/spec.md` delta only. `hospital-srs/spec.md` cross-references `skipSrs` semantics but only to assert "due queue is bypassed" — no requirement change needed there.
- **Data / migrations**: none. `questionHistory` is already populated by the existing answer-recording path; this change only reads it.
- **Performance**: One additional Dexie `db.questionHistory.where('subjectId').equals(forSubject).primaryKeys()` per `loadNextQuestion` call when `skipSrs=true`. For dogfood-scale corpora (≤ 6066 二階 questions, single-subject buckets ≤ ~700) this is sub-millisecond; caching the result in a ref for the modal session is a no-cost optimization.
- **Backwards compatibility**: Pre-existing player saves are unaffected (no schema changes). The behavioral change is strictly more restrictive — players who relied on the old behavior to re-encounter old questions can simply leave `skipSrs` unchecked (the default), which surfaces due cards plus full-pool random fallback exactly as before.
- **Sync / R2 / leaderboard**: no impact (no new persisted state).
