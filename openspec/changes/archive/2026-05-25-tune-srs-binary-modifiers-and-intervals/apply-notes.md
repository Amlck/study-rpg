# Apply Notes — tune-srs-binary-modifiers-and-intervals

Notes captured during the apply phase that future readers (or the archive review) should know about. Not part of the spec contract.

## Audit findings (Task Group 1)

### 1.1 / 1.2 — mentor-daily is OUT OF SCOPE

- `apps/medexam-tw/src/services/mentor-daily.ts` does NOT exist as a standalone file. Mentor flow lives inline in `apps/medexam-tw/src/App.tsx:820-898`.
- On correct mentor answer: NO `reviewCard()` call. Only XP / stats / streak updates via `setPlayer`.
- On wrong mentor answer: `newCard()` enqueue only (no `reviewCard()` either).
- **Decision**: Mentor flow does not share the `reviewCard()` path that this change modifies. 「太簡單」/「我亂猜的」 buttons would have no effect on mentor screen. Skip mentor UI extension.
- **Follow-up candidate (out of this change)**: Make mentor correct answers ALSO advance SRS (currently they don't). Would need a separate proposal.

### 1.3 — reward / SRS path separation verified

- 一階 `App.tsx:525-550`: reward dispatch (setPlayer / quizEvents.emit / doRoll) at lines 525-534; SRS write at lines 536-550. Two independent code blocks, share no state. ✓
- 二階 `mastery.ts:107-145`: `recordCorrectAnswer` does SRS + mastery + affinity in one tx; revenue/reputation dispatch happens at QuizModal call sites AFTER this returns. Sequenced but uncoupled — SRS values don't influence reward magnitude. ✓
- The 「我亂猜的」 button preserving rewards while resetting interval is safe to wire.

### 1.4 — `everWrong` cross-device merge: option (a) chosen

- Row-level LWW via `lastAnsweredAt` coupling.
- Confirmed `lastAnsweredAt` is already bumped on every write path in `mastery.ts` (`upsertHistory`).
- Confirmed Achievement / Leaderboard pipelines do NOT overload `lastAnsweredAt` semantics — they read `correctCount` / `attempts` / `mastery.correct` etc.
- Implemented in `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` HOSPITAL_QUESTION_HISTORY adapter.
- For backwards-compat with older clients that ship payloads without an `everWrong` field: preserve local on cloud omission.

### 1.5 — Ease cap: NO cap in this change

- Defer `EASE_CEILING` to dogfood-driven follow-up. The `interval` clamp at 365 already collars the runaway-schedule risk; ease creep is a cosmetic / telemetry signal at this stage.

### 1.6 — Undo grace toast for 「太簡單」: silent click in this change

- Visual confirmation (button `is-active` style) is the only undo affordance for now. Cross-modifier switching (click 「太簡單」 → click 「我亂猜的」) overrides; same-modifier re-click is debounced no-op. Cannot revert to default without reconstructing pre-answer state (`everWrong`).
- Flag for follow-up if dogfood shows misuse.

## Implementation deviations from proposal

### 1. Engine refactor scope creep

- The proposal called for changing the `STANDARD_INITIAL_INTERVALS` constant. Discovered during apply that `reviewCard` (一階) HARDCODED `1` and `6` at `srs.ts:69-70` instead of reading the constant — so a pure value swap would only have affected 二階.
- Refactored `reviewCard` to read from `STANDARD_INITIAL_INTERVALS` so both variants use the constant. Pure improvement, doesn't widen the spec contract.

### 2. 二階 mastery helper API shape

- Proposal called for separate `recordCorrectAnswerEasy` / `recordCorrectAnswerGuessed` orchestrators (Task 3.2 / 3.3).
- Apply implemented as a single `recordCorrectAnswer` with optional `opts.quality: 'default' | 'easy' | 'guessed'` discriminator + a new follow-up helper `applyQualityModifier` (called from QuizModal click handler).
- Why: `recordCorrectAnswer` runs immediately on pick in 二階 (not batched at modal close like 一階), and the modifier button click happens AFTER the default-path write commits. Reapplying via a separate helper is the cleanest design without restructuring the atomic transaction scope. The helper takes the captured pre-answer state from a ref and re-derives the modifier-applied state.
- Tasks 3.1 / 3.2 / 3.3 marked done; the functional contract (atomic SRS + everWrong write per modifier) is satisfied even though the API surface differs.

### 3. 一階 QuizModal 🐞 button stays in header

- Spec scenarios for `quiz-runner` originally said "action bar in order: 🐞 bug-report, ✨ 太簡單, 🤔 我亂猜的, 下一題".
- Reality: 一階 has 🐞 in the modal header, not the action bar. Moving it would be a UI refactor outside this change's scope.
- **Resolution (during `/opsx:verify`)**: Spec delta `quiz-runner/spec.md` reworded to make 🐞 placement explicitly app-discretionary — 一階 may keep 🐞 in header, 二階 keeps 🐞 in footer. Cross-track visual parity of 🐞 is now explicitly out of scope.
- 一階 action bar contains: ✨ 太簡單, 🤔 我亂猜的, 下一題.
- 二階 action bar contains: 🐞 bug-report, ✨ 太簡單, 🤔 我亂猜的, 下一題.
- Core spec intent (correct-state-only, action-bar location, visual distinction from inline ★) preserved.

### 4. Component E2E tests deferred

- Tasks 5.7 + 6.5 called for E2E component tests (vitest + happy-dom).
- Apply found neither app has React Testing Library / happy-dom set up. Setting it up just for these two tests is heavy.
- Engine unit tests (23 tests, all passing) cover SRS state transitions. Chrome MCP smoke in Task 9 covers UI integration.
- Deferred to a follow-up if test coverage gap becomes a maintenance pain.

### 4b. Grace-toast gate simplification (during `/opsx:verify`)

The original code at `apps/medexam2-hospital-tw/src/lib/mastery.ts:129` gated grace toast emission on `prevLastResult === 'wrong' && quality !== 'easy'`. Verify-phase audit showed `quality` is always `'default'` at this call site (because the QuizModal opt-in buttons run `applyQualityModifier` AFTER `recordCorrectAnswer` completes, not as part of the same call). So `quality !== 'easy'` was structurally always true — dead code.

Simplified to `if (prevLastResult === 'wrong')` with a comment explaining the architecture choice + the conditional that would matter if a future refactor inlines the modifier into the same call. Behavior unchanged.

### 5. 一階 HelpMenu paragraph

- Task 10.1 called for adding a HelpMenu paragraph in both apps.
- 一階 doesn't have a HelpMenu component (only SettingsPanel which is for account/data/bug-report). Skipped 一階 doc.
- 二階 HelpMenu got a new `srs-modifiers` accordion section.
- Both apps' new buttons have `title=` tooltip text inline.

## DEV telemetry usage

Open DevTools console, then:

```js
await __srs.getStats()
// 一階 returns:
// {
//   dailyDueQueueSize: 12,
//   totalCards: 234,
//   easyButtonClicks: 3,
//   guessedButtonClicks: 1,
//   avgEase: 2.61,
//   easeHistogram: { '<2.0': 0, '2.0-2.5': 5, '2.5-3.0': 200, '3.0-4.0': 27, '4.0-5.0': 2, '>5.0': 0 },
//   graduatedCount: 8,
// }
// 二階 returns same shape + `everWrongCount` field.
```

What to watch during dogfood:

| Signal | Healthy range | Red flag |
|---|---|---|
| `dailyDueQueueSize` | < 30 | > 50 sustained over multiple days |
| `easyButtonClicks` / `totalCorrectAnswers` ratio | 5–20% | < 1% (button not discovered) or > 40% (over-applied) |
| `easeHistogram[>5.0]` | 0 or low single digits | sustained growth — consider adding `EASE_CEILING` |
| `graduatedCount` | grows gradually | huge spike → check for accidental mass-click |
| `everWrongCount` (二階) | tracks accumulated wrong-answer history | sudden drop → bug in clear path |

Stripped from prod (verified via `grep __srs apps/medexam-tw/dist/assets/index-*.js` → 0 hits).

## What's NOT in this change

For the avoidance of doubt, the following are explicitly out of scope (per design.md Open Questions):

1. `EASE_CEILING` constant or runaway ease prevention (Open Question 1)
2. 「太簡單」 undo grace toast / confirmation modal (Open Question 2)
3. Mentor-daily 「太簡單」/「我亂猜的」 surface (Open Question 3 — resolved as N/A by audit)
4. Per-field `everWrongUpdatedAt` column (Open Question 5 — resolved as (a) row-level LWW)
5. Persistent telemetry metric table (deferred to follow-up if dogfood signals warrant)
6. FSRS migration (out of scope — see design.md Non-Goals)
7. Player-configurable interval presets (deferred — design.md Decision 1)
