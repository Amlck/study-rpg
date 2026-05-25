## Why

The 二階 hospital app's `/bookmarks` page has two known problems reported by dogfood users:

1. **No way to narrow down by year or subject.** Both sub-tabs ('手動收藏' and '錯題') render every row in chronological order. As corpus grows (currently ~6066 questions × 14 subjects × 9 years), a player who wants to review only 109 年 內科 wrong answers must scroll the entire list. Year and subject are both axes players naturally think in (考試年度 + 科別) — this is the single most-requested filter combination.

2. **Wrong-answer entries disappear before players can star them.** The 錯題 tab is a derived view of `questionHistory.lastResult === 'wrong'`. The moment a player answers the question correctly anywhere else (drill mode, mock exam, mentor daily), `lastResult` flips to `'correct'` and the entry vanishes from the list — even if the player intended to ⭐ star it for later review and just hadn't gotten around to it. There is no persistent record of "ever answered wrong," so once the entry is gone, it cannot be recovered without re-encountering the question.

Both problems compound: without filters, the wrong-answer tab fills up faster than players can triage it, increasing the chance entries silently disappear.

## What Changes

- **Bookmarks page filter bar (shared across both sub-tabs)**
  - Add a multi-select chip filter for 年份 (year) and a multi-select chip filter for 科別 (subject) above the sub-tab switcher.
  - Filter options derived dynamically from the union of metadata present in currently-loaded rows (NOT a static enum) — joined via `questionsById` map since `meta.year` / `subject` are not denormalized into `bookmarks` or `questionHistory` rows.
  - Filter state is shared across all sub-tabs (switching tabs preserves selection); local component state, not persisted across page reloads.
  - Empty selection on either dimension = no filtering on that dimension (full set).
  - Filter combination: AND across year × subject (a row matches if its year ∈ selected years AND its subject ∈ selected subjects).
  - Orphan rows (bookmarks whose `questionId` is not in current `questionsById`) bypass filter and always render with the existing 「題目已不在題庫」 tag.

- **Persistent 'ever wrong' history**
  - Add `everWrong: boolean` column to the `questionHistory` Dexie table (migration v17 — v15 was claimed by `add-achievement-system`, v16 by `add-hospital-equipment-medexam2`).
  - On any wrong answer (existing `recordWrongAnswer` site), set `everWrong = true` if not already true. Once set, this flag is **never** unset — even after a correct answer flips `lastResult` back to `'correct'`.
  - Split the 錯題 tab into two sub-views via a secondary tab control: 「目前未答對」 (existing `lastResult === 'wrong'` query, unchanged) and 「歷史曾錯」 (`everWrong === true` ORDER BY `lastAnsweredAt` DESC).
  - The 「歷史曾錯」 sub-view includes BOTH currently-wrong (`lastResult === 'wrong'`) AND already-corrected (`lastResult === 'correct'` after a wrong answer) entries — entries never auto-leave this view.
  - Entries in 「歷史曾錯」 visually distinguish current state (e.g., `🔴 仍未答對` / `✅ 已答對 N 次` chip) so players can prioritize their review.

- **Grace toast on wrong→correct transition**
  - When `recordCorrectAnswer` flips a `questionHistory` row from `lastResult === 'wrong'` to `'correct'`, emit a 10-second toast: 「{question identifier} 已答對，從錯題移除（10 秒內可加星）」 with an explicit ⭐ action button.
  - Clicking the ⭐ in-toast invokes the existing `toggleBookmark` flow (same row added to `bookmarks` table, behaves identically to manual star from QuizModal).
  - Toast auto-dismisses after 10 s; ignoring it is equivalent to letting the entry leave the 「目前未答對」 sub-view (still visible in 「歷史曾錯」 sub-view).
  - Toast is suppressed when the wrong→correct flip happens via cross-device sync pull (only fires for local quiz writes), to avoid spurious toasts on tab focus / app cold start.

- **R2 bundle schema_version bump** for `m2` bundle (1 → 2) to carry the new `everWrong` column. Passenger-add field via existing bundle adapter pattern — no Supabase migration needed (`questionHistory` is R2-only per established pattern). Cross-device pull MUST tolerate the field being absent on older payloads (treat missing `everWrong` as `false`).

## Capabilities

### New Capabilities

(None — both affected behaviors extend existing capabilities.)

### Modified Capabilities

- `question-bookmarks`: Add filter bar requirement to the `/bookmarks` route shell + 手動收藏 tab filter application.
- `wrong-answer-list`: Add `everWrong` data shape, split 錯題 tab into 「目前未答對」 / 「歷史曾錯」 sub-views, add grace toast on wrong→correct transition, apply shared filter bar to both sub-views.

## Impact

- **Affected code (apps/medexam2-hospital-tw only — 一階 unaffected)**:
  - `src/pages/BookmarksPage.tsx` — add filter bar, secondary sub-tab for 錯題, filter join logic
  - `src/hooks/wrong-answers.ts` — add 「歷史曾錯」 query variant (`everWrong === true`)
  - `src/lib/grace-toast.ts` (new) — toast queue + 10 s dismiss + ⭐ action handler
  - Filter chip UI component (new or reuse if existing pattern available — verify in apply phase)
- **Affected packages**:
  - `packages/core/src/lib/db.ts` — Dexie v17 schema upgrade (`everWrong` column on questionHistory)
  - `packages/core/src/lib/mastery.ts` — `recordWrongAnswer` sets `everWrong = true`
  - `packages/core/src/lib/mastery.ts` — `recordCorrectAnswer` returns transition flag (`wasWrong: boolean`) so caller can emit toast
- **Affected cloud sync**:
  - R2 `m2` bundle schema_version bump 1 → 2; `questionHistory` adapter passes through `everWrong`
  - Cross-device pull: treat missing `everWrong` as `false` for backwards compatibility
  - No Supabase migration
- **Affected dependencies**: None (filter chip + toast can use existing patterns)
- **Not affected**: 一階 medexam-tw app (own BookmarksPage / wrong-answer flow), SRS scheduling, achievements / leaderboard pushes, M4 sync engine architecture
- **Breaking changes**: None. Old saves without `everWrong` field treat it as `false` (no historical "ever wrong" record for pre-migration wrong answers — this is acceptable; existing `lastResult === 'wrong'` entries naturally migrate forward as players re-encounter them).
