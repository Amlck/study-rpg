## Context

The 二階 `QuizModal` (`apps/medexam2-hospital-tw/src/components/QuizModal.tsx`) has had a `跳過 SRS（純隨機新題）` toggle since the year-filter change archived 2026-05-21. Its current contract — captured in `openspec/specs/hospital-quiz/spec.md:426-458` and `openspec/specs/hospital-srs/spec.md:86-92` — is "skip the due-queue walk, call `pickRandomQuestion` directly". That contract is narrower than what the UI label conveys.

`pickRandomQuestion(subjectId, seenIds, opts?)` lives in `apps/medexam2-hospital-tw/src/lib/quiz.ts`. It takes a `seenIds: Set<string>` and re-rolls up to 3 times before accepting a repeat. The `seenIds` it receives from `QuizModal` is `seenIdsRef.current` (a `useRef<Set<string>>`), reset to an empty `Set` on every modal mount (`loadNextQuestion(initialSubject, true)` in line 197) and on subject switch (line 204). It tracks "what this open modal has shown so far", not "what the player has ever answered".

The same picker is also used by `services/training.ts` (sandbox practice with intentional repeats) and `services/er-consultation.ts` (independent ER quiz flow with its own ID feed via `loadSubjectQuestionIds`). Those callers do not pass the new exclusion set, so behavior there must remain byte-identical.

`questionHistory` (Dexie schema v11+) is indexed on `&questionId, subjectId, lastAnsweredAt, nextDueAt`. A per-subject id list is one `where('subjectId').equals(forSubject).primaryKeys()` call — sub-millisecond at corpus scale (≤ ~700 rows per subject).

## Goals / Non-Goals

**Goals:**

- When `skipSrs = true`, the picker MUST exclude every `questionId` already in `questionHistory` for that subject, in addition to the in-session `seenIds` exclusion. Behavior aligns with the UI label「純隨機新題」(emphasis on **新**).
- Pool-exhaustion toast fires at the truthful moment: when `|questionHistory ∪ seenIds| ≥ pool.length` while `skipSrs` is on (i.e. there are genuinely no unseen questions left), not just when `seenIds` alone hits pool size.
- Zero impact on:
  - The default `skipSrs = false` due-first picker flow.
  - Training-room / ER-consultation pickers (they keep calling `pickRandomQuestion` with no `excludeIds`).
  - Core engine API surface (`@study-rpg/core`).
  - One-step or one-tap perf — additional Dexie read is sub-millisecond and cached per modal session.

**Non-Goals:**

- Not adding a separate "exclude history" toggle. Player feedback says the existing toggle is already understood as "give me unseen", so the fix is to make implementation match the label, not to add a third control.
- Not changing what happens on **answering** while `skipSrs = true`. SM-2 review still records (interval / easeFactor / nextDueAt advance), per the existing `hospital-srs` Scenario「Answer while skipSrs=true still writes SRS state」. The 「（不影響 SRS 排程，到期題仍會記）」helper line under the toggle still describes accurate behavior and stays as-is.
- Not extending exclusion to bookmarks, wrong-answers-only, or any other filtered subset — that would be a separate "study weakness" feature.
- Not touching 一階 (`medexam-tw`) — it has no `skipSrs` toggle.

## Decisions

### 1. Threading `excludeIds` through `pickRandomQuestion`

**Decision**: Add optional `excludeIds: Set<string>` to `pickRandomQuestion`'s opts bag, alongside the existing `yearFilter`. When provided, treat it as a logical-OR with the existing `seenIds` re-roll check.

```ts
export async function pickRandomQuestion(
  subjectId: SubjectId,
  seenIds: Set<string>,
  opts?: { yearFilter?: Set<number>; excludeIds?: Set<string> },
): Promise<Question | null>
```

Inside the picker, before the 3-roll loop, narrow the pool by `excludeIds`. If the narrowed pool is empty, return `null` immediately (lets caller surface the exhaustion toast). The existing `seenIds` 3-roll loop runs against the already-narrowed pool — `seenIds ⊆ excludeIds` is the common case once a player has answered everything once, so the 3-roll fallback is benign.

**Alternatives considered:**

- (a) **Merge `excludeIds` into `seenIds` at the caller** before calling `pickRandomQuestion`. Cleaner picker signature, but loses the semantic distinction in tests / future readers (and forces the caller to clone a Set every pick). Rejected.
- (b) **Filter `excludeIds` after random selection** (pick first, throw away if in exclude). Wastes rolls and breaks the deterministic "narrowed-pool" 3-roll budget. Rejected.

### 2. Where the `questionHistory` set lives in the QuizModal

**Decision**: Add `historyIdsRef: useRef<Map<SubjectId, Set<string>>>(new Map())`. On `loadNextQuestion(forSubject, ...)`, if `skipSrs === true` AND `historyIdsRef.current.has(forSubject) === false`, fetch the subject's `questionHistory` primary keys once and cache. On `resetSeen = true` (modal mount + subject switch), clear the cache for that subject before re-fetching so a recent answer (which writes `questionHistory`) is reflected on the next modal session.

```ts
const historyIdsRef = useRef<Map<SubjectId, Set<string>>>(new Map())

// inside loadNextQuestion, in the skipSrs branch:
let historyIds = historyIdsRef.current.get(forSubject)
if (!historyIds) {
  const keys = await db.questionHistory
    .where('subjectId').equals(forSubject)
    .primaryKeys()
  historyIds = new Set(keys as string[])
  historyIdsRef.current.set(forSubject, historyIds)
}
```

**Alternatives considered:**

- (a) **Live-query the whole `questionHistory` table** via `useLiveQuery` and derive a per-subject Set in `useMemo`. Reactive but wasteful — modal usually answers ≤ 50 questions per session, full-table snapshot rebuild on every answer is overkill. Rejected for perf.
- (b) **Re-fetch on every single `loadNextQuestion` call**, no cache. Simpler but wastes one Dexie hop per click. For a snappy quiz loop this stings on slow phones. Rejected.

### 3. Cache invalidation after answering

**Decision**: After `handlePickOption` writes the answer (transaction at line 237-279), append the just-answered `questionId` to `historyIdsRef.current.get(subjectId)` if the entry exists. Cheap, keeps cache fresh, no Dexie round-trip.

This matters for the niche case where a player answers a question that was NOT previously in history (`isFresh === true`) while `skipSrs = true`, and then immediately clicks 「下一題」without closing the modal. Without the cache update, the same just-answered question could re-roll (3-roll budget) until the in-session `seenIds` write catches it. With the update, it's properly excluded.

### 4. Exhaustion toast condition

**Decision**: Compute the toast trigger as `(historyIds ∪ seenIds).size >= poolSize` when `skipSrs === true`; keep the existing `seenIds.size >= poolSize` check when `skipSrs === false`. Computed inline in `loadNextQuestion`, no helper extraction.

When `skipSrs = true` AND the (year-filtered) pool minus `excludeIds` is empty before the picker even rolls, `pickRandomQuestion` now returns `null` — `setPoolEmpty(true)` fires (existing branch on line 173). The exhaustion toast is a secondary signal for the "rolled and got a repeat" case; in `skipSrs = true` mode that case becomes the rare "history doesn't cover full pool yet, but seen+history together do" boundary. Code handles both.

### 5. Year filter interaction

**Decision**: When both `yearFilter` and `excludeIds` are active, narrowing order is `pool → year filter → exclude ids → random`. `pickRandomQuestion`'s internal `applyYearFilter` runs first (existing code), then `excludeIds` narrows further. Same as how the function already composes `yearFilter` with `seenIds`.

Exhaustion toast in `skipSrs = true + yearFilter` mode triggers when `|history ∪ seen| (intersected with year-filtered pool) ≥ year-filtered pool size`. The `poolSize` used must come from the year-filter-aware service `effectivePoolSize(forSubject, yearFilter)`, not the raw `loadPoolSizeMap` value. If the existing toast code uses the raw map, fix during apply (sibling bug, but small and on-path).

### 6. DEV-only sanity log

**Decision**: When `skipSrs` flips from `false` to `true` (or the first `loadNextQuestion` call while it's already `true`), log to console with `import.meta.env.DEV` gate:

```ts
if (import.meta.env.DEV) {
  console.info('[skipSrs] excluding %d questions from history for %s', historyIds.size, forSubject)
}
```

Cheap dogfood signal that the new path is wired. Strip-able in prod build via Vite's dead-code elimination. Not part of spec.

## Risks / Trade-offs

- **[Risk] Player who *wants* to re-encounter old questions for revision is now blocked when `skipSrs = true`.** → Mitigation: the default state is `skipSrs = false` (unchanged), which gives them due-first SRS scheduling — exactly the "review old questions" path. Player who explicitly checks 「跳過 SRS（純隨機新題）」has opted out of SRS *and* opted into "新題" semantics; if they wanted random-from-full-pool they should leave it unchecked.

- **[Risk] Once a player has answered every question in a subject, `skipSrs = true` becomes a dead toggle (always returns null + exhaustion banner).** → Mitigation: this is the intended terminal state, communicated via the existing 「本科獨立題已掃完」toast. Player can uncheck the toggle to resume due-first SRS flow on past answers.

- **[Risk] `historyIdsRef` cache goes stale if another tab / device writes a new answer (R2 sync pulls in).** → Mitigation: stale cache only causes `skipSrs` to show a question the player has technically answered on another device. The wrong-answer is mild (worst case: same question shown twice across devices in the same hour); on the next modal session the cache rebuilds. Not worth subscribing to Dexie change events for one toggle.

- **[Trade-off] One extra Dexie `primaryKeys()` call per first-`skipSrs`-tick-per-subject-per-modal-session.** → Measured cost is sub-millisecond on dogfood data (subject buckets ≤ 700 ids). Memoized for the rest of the session.

- **[Risk] The 3-roll budget in `pickRandomQuestion` is now mostly wasted in `skipSrs = true` mode** (the narrowed pool either contains a fresh pick on the first roll or is empty). → Mitigation: still benign. The 3-roll loop is a fast `O(3)` check; not worth a separate code path.

## Migration Plan

- Deploy = redeploy. No data migration. The behavioral change is gated by the in-modal toggle (default off), so a deployed change only affects players who explicitly tick the toggle. Rollback = revert the apply commit.
- No DB schema bump. `questionHistory` indexes are already where we need them (v11+).
- No spec capability rename.

## Open Questions

(none — direction confirmed by product owner; `hospital-quiz` is the only modified capability.)
