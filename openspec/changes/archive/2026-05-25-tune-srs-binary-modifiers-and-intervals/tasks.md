## 1. Apply-phase audits (resolve open questions before coding)

- [x] 1.1 Audit `apps/medexam-tw/src/services/mentor-daily.ts` and trace all callers of `reviewCard()` — determine if mentor-daily uses the shared engine path. Document finding in apply notes. (Resolves design Open Question 3.)
- [x] 1.2 If mentor-daily DOES share the path, decide whether mentor screen should also surface 「太簡單」 / 「我亂猜的」 buttons. Document decision (yes = scope this change to include mentor UI; no = explicit decision to skip with rationale).
- [x] 1.3 Audit `apps/medexam-tw/src/App.tsx:540` (and 二階 equivalent at `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts` + 對應呼叫者) — verify SRS update path is independent of reward dispatch path. Document finding. (Resolves design Open Question 4.)
- [x] 1.4 Decide `everWrong = false` cross-device merge mechanism: (a) row-level LWW via `lastAnsweredAt` coupling, or (b) per-field LWW via new `everWrongUpdatedAt` column. Default to (a) unless audit reveals `lastAnsweredAt` collision with Achievement / Leaderboard semantics. (Resolves design Open Question 5.)
- [x] 1.5 Decide ease cap: add `EASE_CEILING = 5.0` to `srs.ts` or leave ease unbounded for now and rely on dogfood telemetry to detect runaway. Default: NO cap in this change (defer to follow-up); document explicit deferral in apply notes. (Resolves design Open Question 1.)
- [x] 1.6 Decide「太簡單」 undo affordance: silent click vs 10-second grace toast (mirror existing wrong→correct grace toast pattern). Default: silent click in this change (rely on action-bar placement + visual confirmation feedback to reduce accidental clicks); flag for follow-up if dogfood shows misuse. (Resolves design Open Question 2.)

## 2. Core engine changes (`packages/core/src/lib/srs.ts`)

- [x] 2.1 Change `STANDARD_INITIAL_INTERVALS` from `[1, 6]` to `[3, 7]`. Verify no other constants reference `STANDARD_INITIAL_INTERVALS[0]` or `[1]` literally.
- [x] 2.2 Add new exported function `reviewCardEasy(card: SrsCard, now: number = Date.now()): SrsCard` implementing:
  - `newEase = card.ease * 1.5`
  - `newInterval = min(MAX_INTERVAL_DAYS, Math.round(card.interval * 3))`
  - `newDueAt = now + newInterval * DAY`
  - `lapses` unchanged
- [x] 2.3 Add new exported function `reviewCardGuessed(card: SrsCard, now: number = Date.now()): SrsCard` implementing:
  - `newInterval = 1`
  - `ease` unchanged
  - `newDueAt = now + 1 * DAY`
  - `lapses` unchanged
- [x] 2.4 Mirror Easy / Guessed paths in the 二階 binary scheduler (`reviewCardBinary` variant or new `reviewCardBinaryEasy` / `reviewCardBinaryGuessed` exports — pick naming consistent with existing 二階 API surface).
- [x] 2.5 Export new functions from `packages/core/src/index.ts` (additive — preserve all existing exports).
- [x] 2.6 Add unit tests covering: fresh-correct `[3, 7]` behavior, Easy multiplicative compound, Easy 365-day clamp, Guessed `interval = 1` reset, Guessed-on-fresh-card creates `ease = 2.5 / interval = 1`, debounce semantic at the engine level (helper is idempotent within same `now` timestamp).
- [x] 2.7 Bump `@study-rpg/core` minor version (additive API). Add CHANGELOG entry noting (a) `STANDARD_INITIAL_INTERVALS` constant changed and (b) new `reviewCardEasy` / `reviewCardGuessed` exports.

## 3. 二階 mastery helper changes (`apps/medexam2-hospital-tw/src/services/mastery.ts`)

- [x] 3.1 Add `recordEverWrongFalse(questionId: string, now: number = Date.now()): Promise<void>` helper that updates `db.questionHistory[questionId]` to `{ everWrong: false, lastAnsweredAt: now }` within an atomic transaction.
- [x] 3.2 Add `recordCorrectAnswerEasy(questionId, ...args)` orchestrator that combines `reviewCardBinaryEasy` SRS update + `everWrong = false` write + canonical reward dispatch in a single Dexie transaction.
- [x] 3.3 Add `recordCorrectAnswerGuessed(questionId, ...args)` orchestrator that combines `reviewCardBinaryGuessed` SRS update + canonical reward dispatch (no `everWrong` change) in a single transaction.
- [x] 3.4 Ensure both orchestrators emit the same `onPushComplete` sync trigger as `recordCorrectAnswer` (preserve leaderboard push semantics).

## 4. R2 sync adapter changes (`apps/medexam2-hospital-tw/src/lib/sync/r2/`)

- [x] 4.1 Locate the `questionHistory` adapter's `applyToLocal` (or equivalent merge function) and replace the monotonic-OR merge for `everWrong` with row-level LWW (using `lastAnsweredAt` as the timestamp). (Per Decision 4 and Task 1.4.)
- [x] 4.2 Add a comment block documenting the semantics change vs the prior monotonic-OR (link to this change folder).
- [x] 4.3 Verify R2 m2 bundle schema_version remains `2` (no bump needed — the field shape is unchanged).
- [x] 4.4 Test cross-device propagation scenario: device A writes `everWrong = false` via 「太簡單」, push → device B pulls → device B's row has `everWrong = false`. Confirm reverse: stale-clock device cannot revoke fresh `everWrong = true`.

## 5. UI: 一階 QuizModal (`apps/medexam-tw/src/components/QuizModal.tsx` or equivalent)

- [x] 5.1 Locate the action bar in the answer-reveal state — verify current order is 🐞 bug-report + 下一題 (or document the actual current layout).
- [x] 5.2 Add ✨ 「太簡單」 button: visible only when `answerStatus === 'correct'`; debounced; renders between 🐞 and 下一題.
- [x] 5.3 Add 🤔 「我亂猜的」 button: visible only when `answerStatus === 'correct'`; debounced; renders between 「太簡單」 and 下一題.
- [x] 5.4 Wire click handlers: 「太簡單」 → invoke engine's Easy path + write to `db.srs`; 「我亂猜的」 → invoke engine's Guessed path + write to `db.srs`. Both replace the default `reviewCard(card, 4)` write (mutually exclusive with default path within a single answer reveal).
- [x] 5.5 Add visual confirmation feedback (button dim / check mark / similar) on click.
- [x] 5.6 If Task 1.2 decided mentor-daily inherits, extend the mentor screen UI analogously.
- [x] 5.7 Add E2E-style component test (vitest + happy-dom): correct answer → click 「太簡單」 → verify card update; correct answer → click 「我亂猜的」 → verify card update; wrong answer → buttons absent.

## 6. UI: 二階 QuizModal (`apps/medexam2-hospital-tw/src/components/QuizModal.tsx`)

- [x] 6.1 Mirror Tasks 5.1–5.5 for 二階, matching visual order (🐞 + ✨ + 🤔 + 下一題) for cross-track parity.
- [x] 6.2 「太簡單」 handler calls `recordCorrectAnswerEasy` (which includes `everWrong = false` write).
- [x] 6.3 「我亂猜的」 handler calls `recordCorrectAnswerGuessed` (no `everWrong` change).
- [x] 6.4 Verify the inline ★ promote-to-manual-bookmark affordance in the explanation region remains untouched and visually distinct from the new action-bar buttons.
- [x] 6.5 Add component test: correct answer + 「太簡單」 click → `questionHistory[Q].everWrong === false` AND `interval` updated. Correct answer + 「我亂猜的」 → `interval === 1` AND `everWrong` unchanged. Wrong answer → buttons absent.

## 7. DEV-only telemetry

- [x] 7.1 Add `globalThis.__srs` handle gated on `import.meta.env.DEV` in `apps/medexam-tw/src/main.tsx` (or equivalent bootstrap).
- [x] 7.2 Implement `__srs.getStats()` returning `{ dailyDueQueueSize, easyButtonClicks, guessedButtonClicks, totalCorrectAnswers, avgEase, easeHistogram, graduatedCount }`.
- [x] 7.3 Increment `easyButtonClicks` / `guessedButtonClicks` from the click handlers (in-memory counters in a module-scoped ref or Zustand-style store).
- [x] 7.4 Mirror Tasks 7.1–7.3 for 二階 app.
- [x] 7.5 Verify the prod build strips `__srs` (sanity grep `dist/` after `pnpm --filter @study-rpg/medexam-tw build`).

## 8. Spec sync (post-archive — handled by /opsx:archive, listed here for completeness)

- [x] 8.1 Confirm `openspec validate tune-srs-binary-modifiers-and-intervals` passes locally.
- [x] 8.2 Confirm spec deltas resolve cleanly into main specs at archive time (no orphaned MODIFIED blocks).

## 9. Verify (Chrome MCP + manual)

- [x] 9.1 Run `pnpm -r typecheck` and `pnpm -r build` to confirm no compile errors.
- [ ] 9.2 Chrome MCP smoke on 一階 (localhost:5173/study-rpg/): answer 5 fresh questions correctly → verify each has `interval = 3` in DevTools `__db.srs.toArray()`. Answer 1 question correctly, click 「太簡單」 → verify `interval = 9`, `ease = 3.75`. Answer 1 question correctly, click 「我亂猜的」 → verify `interval = 1`. Answer 1 wrong → verify buttons hidden.
- [x] 9.3 Chrome MCP smoke on 二階 (localhost:5174/study-rpg/hospital/ or equivalent): mirror Task 9.2 for 二階, additionally verify (a) `everWrong = false` after 「太簡單」 click on a previously-wrong question, (b) `everWrong` unchanged after 「我亂猜的」 click.
- [ ] 9.4 SPA route three-event check on 一階: in-app navigation + direct URL `/skills` + F5 reload on `/skills` (all three pass for the affected UI components).
- [x] 9.5 SPA route three-event check on 二階: in-app navigation + direct URL `/bookmarks?tab=wrong&sub=history` + F5 reload (verify 「歷史曾錯」 list correctly reflects post-「太簡單」 state).
- [ ] 9.6 Cross-device sync verify (二階 only): on device A click 「太簡單」 on a question with `everWrong = true` → wait for push → on device B trigger pull → verify device B's `questionHistory[Q].everWrong === false`.
- [x] 9.7 DEV telemetry sanity: open DevTools → `__srs.getStats()` returns the expected shape with non-undefined fields.
- [ ] 9.8 `/verify` skill end-to-end (Boris Cherny gate): biostats-guardian skip (no statistical work) + Chrome MCP smoke pass + dead-code audit (knip) + auto-git commit gate.

## 10. Documentation + dogfood comms

- [x] 10.1 Add a brief paragraph to `apps/medexam-tw/src/components/HelpMenu.tsx` (or equivalent) explaining the new opt-in buttons. Same for 二階 (`apps/medexam2-hospital-tw/src/components/HelpMenu.tsx`).
- [x] 10.2 Update `CLAUDE.md` Known sharp edges section with: 「答對的題第一次 3 天後 due (was 1)；「太簡單」/「我亂猜的」是 opt-in modifier；二階「太簡單」連帶清 everWrong」 (~one line).
- [x] 10.3 Owner-facing dogfood note in the change folder's `apply-notes.md` (created during apply): how to inspect `__srs.getStats()`, what numbers to watch (avg ease creep, button click rate ratio, graduated count growth).
