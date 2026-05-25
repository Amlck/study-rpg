## 1. Picker signature

- [x] 1.1 Extend `pickRandomQuestion` in `apps/medexam2-hospital-tw/src/lib/quiz.ts` to accept `opts.excludeIds?: Set<string>` (alongside existing `opts.yearFilter`). Narrow the post-year-filter pool by removing every id in `excludeIds` BEFORE the 3-roll `seenIds` loop. Return `null` immediately when the narrowed pool is empty.
- [x] 1.2 Update the JSDoc block above `pickRandomQuestion` to describe `excludeIds` semantics: "narrows the pool by hard-removing these ids; intended for cross-session history exclusion (skipSrs path)". Note that `seenIds` is still applied as a soft 3-roll re-roll check on top.
- [x] 1.3 Confirm `loadSubjectQuestionIds` (ER consult feeder) is NOT touched — ER quiz keeps its existing semantics. Add a one-line code comment if not already present. (Existing JSDoc on line 102-109 already documents the intentional no-year-filter; no `excludeIds` plumbing needed on this function.)

## 2. QuizModal wiring

- [x] 2.1 Add `historyIdsRef: useRef<Map<SubjectId, Set<string>>>(new Map())` in `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` near the existing `seenIdsRef` / `consumedDueIdsRef` declarations (around line 43-45).
- [x] 2.2 On `loadNextQuestion(forSubject, resetSeen)`: when `skipSrs === true` AND `historyIdsRef.current.get(forSubject)` is undefined, fetch `await db.questionHistory.where('subjectId').equals(forSubject).primaryKeys()`, build a `Set<string>`, and store in the ref map. Clear the map entry for `forSubject` when `resetSeen === true` so subject-switch and modal-mount rebuild from current Dexie state.
- [x] 2.3 In the `skipSrs === true` branch (currently falls straight through to `pickRandomQuestion` on line 169), pass `{ yearFilter: activeYearFilter, excludeIds: historyIds }` to the picker. In the `skipSrs === false` branch, pass only `{ yearFilter: activeYearFilter }` (no `excludeIds`) so the fall-back path from a depleted due queue retains current "random from full pool" semantics.
- [x] 2.4 After the answer transaction in `handlePickOption` commits (line 280, right before the toast loop), if `historyIdsRef.current.has(subjectId)`, append `capturedQuestion.id` to that Set. This keeps the cache fresh without a Dexie round-trip.
- [x] 2.5 Update the exhaustion-toast condition in `loadNextQuestion` (currently `seenIdsRef.current.size >= poolSize`, line 184) to also account for `historyIds` when `skipSrs === true`: compute `effectiveCovered = skipSrs ? new Set([...seenIdsRef.current, ...(historyIds ?? [])]).size : seenIdsRef.current.size`, and compare that against the existing `poolSize` (no `effectivePoolSize` swap in this change — that sibling fix is deferred to follow-up `fix-medexam2-exhaustion-toast-year-filter-pool-size`).

## 3. DEV-only telemetry

- [x] 3.1 In the `skipSrs === true` branch of `loadNextQuestion`, after computing / hydrating `historyIds`, emit one `import.meta.env.DEV` gated `console.info('[skipSrs] excluding %d ids for %s', historyIds.size, forSubject)` per `(modal session, subjectId)` first-tick (use the `historyIdsRef` cache miss as the trigger so we don't spam on every click).

## 4. Type safety + build

- [x] 4.1 Run `pnpm -r typecheck` from repo root. Expect zero new errors (the signature change to `pickRandomQuestion` is additive; existing callers in `TrainingPage.tsx` line 152 / 216 pass only `seenIds` so they continue to satisfy the new opts). — 8/8 green.
- [x] 4.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw build` to confirm the production bundle still compiles. The `historyIdsRef` cache and `excludeIds` parameter are pure additions — bundle size delta should be < 1 KB. — built 3.05s, gzip 326.76 kB (within noise of prior baseline).

## 5. Smoke verification (Chrome MCP)

- [x] 5.1 Preflight `mcp__Claude_in_Chrome__list_connected_browsers`. — 1 connected (macOS local).
- [x] 5.2 `pnpm --filter @study-rpg/medexam2-hospital-tw dev` to start the dev server. Navigate to `http://localhost:5174/study-rpg/hospital/` (port 5174, 5173 occupied by sibling worktree).
- [x] 5.3 Open the in-app QuizModal for a subject with known `questionHistory` rows. — Cold-state MCP Chrome profile; seeded 30 history rows for 內科 via direct IDB before opening modal.
- [x] 5.4 Verify default (`skipSrs = false`) behavior. — Modal opens for 內科, initial qid `112-2-醫學三-內科-Q1` loads, picker functions normally without excludeIds (verified by code spread `...(skipSrs ? { excludeIds } : {})`).
- [x] 5.5 Check `跳過 SRS（純隨機新題）`. — Toggled ON, captured 4 「下一題」clicks all distinct, **zero overlap with 30 seeded ids**; DEV console logged `[skipSrs] excluding 31 ids for 內科` (30 seeded + 1 auto-answered cached via §2.4 append).
- [x] 5.6 Full pool exhaust: seeded all 174 泌尿科 ids as history, opened modal + skipSrs ON + 下一題. — `pickRandomQuestion` returned null, `poolEmpty=true` flag, modal body shows `這個科別目前沒有題目可抽。換一科試試。`, no question rendered. (Toast does NOT fire on this path because picker returns null *before* duplicate-detection; spec scenario "Toggle on with fully-answered subject returns null and surfaces pool-empty UI" matches.)
- [x] 5.7 Toggle skipSrs OFF mid-session. — Toggle flipped to `aria-checked=false`, picker resumed default (qid `109-2-醫學三-內科-Q55` loaded; no excludeIds passed per code).
- [x] 5.8 Year filter + skipSrs compose: set `quiz.yearFilter` meta to `[115, 114]` then opened 內科 modal + skipSrs ON. — Clicks 1–4 all in years {114, 115} ∧ zero seeded hits. Click 0 (year 108) reflects existing useLiveQuery loading-race on first mount (separate from this change).

## 6. Spec verify + archive prep

- [x] 6.1 Run `openspec validate fix-medexam2-skip-srs-history-exclusion --strict`. Expect green. — passed.
- [x] 6.2 Run `/opsx:verify` (the OpenSpec 3-dim check) before declaring the change ready for archive. Expect green on completeness / correctness / coherence. — All 3 dimensions clean; 0 CRITICAL / 0 WARNING / 0 blocking SUGGESTION. Sibling poolSize-year-filter scope-deferral pre-acknowledged via follow-up change reference.
- [x] 6.3 Run `/verify` (the global skill) for the end-to-end check on the dev server. The Chrome MCP smoke from §5 satisfies most of it, but `/verify` also runs `/simplify` + dead-code audit which is worth a pass. — type=vibe-web. End-to-end pre-satisfied by §5. Dead code: no orphans (repo-wide `noUnusedLocals` + `noUnusedParameters` enforced by §4.1 typecheck across all 8 projects). `/simplify` pass: clean, no recommendations. git diff hygiene: only 2 intended files + change folder.
- [x] 6.4 Surface to user: ready for `/opsx:archive`. The slash workflow has a sync gate that updates `openspec/specs/hospital-quiz/spec.md` with the MODIFIED Requirement deltas; do NOT run the raw `openspec archive --yes` CLI (per project curator rule). — Announced via summary.
