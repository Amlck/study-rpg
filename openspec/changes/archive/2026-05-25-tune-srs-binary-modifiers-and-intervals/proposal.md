## Why

Players answering correctly today see the same question re-surface ~1 day later, because the SM-2 variant in `packages/core/src/lib/srs.ts` uses `STANDARD_INITIAL_INTERVALS = [1, 6]` — the first correct answer schedules a 1-day review. Combined with `everWrong` driven 「歷史曾錯」 tab (shipped 2026-05-25) that already covers proactive wrong-answer review, the SRS due-queue is doing double duty and producing the「我答對為何又考」complaint.

This change narrows SRS back to its single job (algorithmic spaced cadence) while giving players two opt-in, no-friction buttons to express finer judgment when they want to — without forcing per-question self-rating.

## What Changes

- **First-interval lengthening (BREAKING for save-file semantics, NOT for schema)**: `STANDARD_INITIAL_INTERVALS = [1, 6]` → `[3, 7]`. First correct answer now schedules review 3 days out (was 1); second correct answer 7 days out (was 6). Pre-existing rows with `interval = 1` or `interval = 6` are NOT migrated — they age out naturally on next review.

- **New「太簡單」(too easy) button — opt-in difficulty escalator**:
  - Surfaced only when answer state = correct, in QuizModal action bar (same row as 🐞 bug-report and 下一題).
  - On click: `ease *= 1.5` (multiplicative), `interval *= 3` (clamped to `MAX_INTERVAL_DAYS = 365`), `nextDueAt = now + newInterval * DAY`.
  - Also sets `everWrong = false` on the corresponding `questionHistory` row (二階 only — 一階 has no `everWrong` column). This is the semantic «player has explicitly graduated from this question — drop from both SRS active queue AND 「歷史曾錯」».
  - Single click only triggers one application; rapid double-click is debounced.

- **New「我亂猜的」(I guessed) button — opt-in honesty modifier**:
  - Surfaced only when answer state = correct, in QuizModal action bar (alongside 「太簡單」).
  - On click: `interval = 1`, `ease unchanged`, `nextDueAt = now + 1 day`, `lapses unchanged` (no lapse penalty — player admitted ambiguity, not failed).
  - `everWrong` is NOT touched (二階 only — leaving the row in 「歷史曾錯」 if it was already there).
  - Reward path (XP / fate-card draws / achievements / mastery) is NOT altered — player still answered correctly per the canonical rule.

- **Modified Capability `wrong-answer-list` (二階 only)**: The "Once set, `everWrong` is **never** unset" invariant (from `add-bookmarks-filters-and-wrong-history-medexam2`) is **rewritten**. The new invariant: `everWrong` may transition `true → false` ONLY via explicit player action on the 「太簡單」 button. Sync engine merge logic for `everWrong` changes from **monotonic-OR** to **last-explicit-write-wins** (player intent must dominate cross-device).

- **DEV-only telemetry exposure**: `globalThis.__srs?.getStats?.()` returns `{ dailyDueQueueSize, easyButtonClicks, guessedButtonClicks, totalCorrectAnswers, avgEase, easeHistogram, graduatedCount }`. No persistent metric storage — read-time aggregation from existing tables. Stripped from prod build via `import.meta.env.DEV`.

- **Cross-track parity**: Both `apps/medexam-tw` and `apps/medexam2-hospital-tw` ship the button + interval change in the same release. Core engine changes in `packages/core/src/lib/srs.ts` consumed by both.

## Capabilities

### New Capabilities

(None — all changes extend existing capabilities.)

### Modified Capabilities

- `srs-queue` (一階): Update `STANDARD_INITIAL_INTERVALS` requirement; add new requirements for「太簡單」 and「我亂猜的」 quality paths; update hidden-quality requirement to acknowledge opt-in surfaces (still no forced rating).
- `hospital-srs` (二階): Mirror `srs-queue` changes for the binary-input scheduler. Update first-correct + second-correct scenarios to use [3, 7] intervals; add new requirements for「太簡單」 (with `everWrong = false` side effect) and「我亂猜的」 quality paths.
- `wrong-answer-list` (二階): Reword the「Once set, `everWrong` is never unset」 invariant to "may be unset by explicit player action on 「太簡單」 button"; update cross-device merge semantics from monotonic-OR to last-explicit-write-wins; preserve the migration-gap behavior (Dexie v17 default-false remains correct).
- `quiz-runner` (一階): Add action-bar button surface (correct-state only) — 「太簡單」 + 「我亂猜的」.
- `hospital-quiz` (二階): Same action-bar button surface as `quiz-runner`, with the additional `everWrong = false` side effect for 「太簡單」.

## Impact

- **Affected code**:
  - `packages/core/src/lib/srs.ts` — interval constant; new `reviewCardEasy(card, now?)` and `reviewCardGuessed(card, now?)` functions; export them.
  - `packages/core/src/types.ts` — no schema change; possibly add `SrsQuality` enum / discriminator type if explicit.
  - `apps/medexam-tw/src/components/QuizModal.tsx` (or its 一階 equivalent — verify in apply) — new buttons + handlers.
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` — same buttons; the 「太簡單」 handler also calls `setEverWrongFalse(questionId)` helper in `packages/core/src/lib/mastery.ts`.
  - `apps/medexam-tw/src/App.tsx:540` (the existing 一階 `for (const qr of questionResults)` block) — branch on new quality enum or leave default path untouched if buttons write SRS state directly via separate path.
  - `apps/medexam2-hospital-tw/src/services/mastery.ts` — extend write helpers for `everWrong` unset path.
- **Affected capabilities (spec deltas)**: `srs-queue`, `hospital-srs`, `wrong-answer-list`, `quiz-runner`, `hospital-quiz` (5 total).
- **Schema**: NO Dexie version bump. NO R2 m2 bundle schema_version bump (the bundle already carries `everWrong`; only write-time semantic loosens).
- **Cross-device sync**: `everWrong` merge semantics change in the R2 m2 bundle adapter (last-explicit-write-wins for that field). Older clients without 「太簡單」 button only push `everWrong = true` writes; semantics remain compatible. v17→v17 clients across devices: explicit `false` write from one device propagates correctly.
- **Telemetry**: DEV-only `globalThis.__srs.getStats()` handle; no production metric collection.
- **Breaking changes (player-facing)**: First-interval lengthening shifts review cadence for existing saves once their next due passes (no retroactive change). Players who relied on daily review of correctly-answered questions to feel "thorough" may see fewer reviews — covered by the 「太簡單」 / 「我亂猜的」 opt-in surface plus the existing 「歷史曾錯」 tab.
- **Not affected**:
  - `mentor-daily` capability — to be audited in apply phase whether mentor uses the same `reviewCard` path; if yes, decide then whether mentor screen also surfaces the two new buttons (open uncertainty #3 in design.md).
  - `quiz-rewards.ts` / `engine-rewards` — reward dispatch path is independent of SRS update path; verified safe (open uncertainty #4 in design.md).
  - `achievement-system`, `hospital-leaderboard`, M4 sync engine architecture, all other 14 二階 capabilities — no change.
