## MODIFIED Requirements

### Requirement: QuizModal SHALL expose a Skip-SRS toggle bypassing the due-first picker

The `QuizModal` SHALL render a player-facing toggle labelled `跳過 SRS（純隨機新題）` within the modal header or controls region. The toggle SHALL be a checkbox or equivalent binary control with `role=switch` and `aria-checked` reflecting state. The toggle SHALL default to `false` (off) on every modal mount and SHALL NOT be persisted across modal open / close cycles.

When the toggle is `true`, the QuizModal's `loadNextQuestion` flow SHALL skip the `getNextDueCardForSubject` walk entirely and SHALL call `pickRandomQuestion(subjectId, seenIds, opts)` with `opts.excludeIds` populated from `db.questionHistory.where('subjectId').equals(subjectId).primaryKeys()` (the cross-session record of every question this player has previously answered for the subject). The picker SHALL narrow the playable pool by removing every `questionId` in `excludeIds` BEFORE the in-session `seenIds` re-roll loop runs. When the toggle is `false`, the existing due-first picker flow SHALL execute per the `hospital-srs` capability and SHALL NOT receive an `excludeIds` set.

A short helper line below the toggle SHALL communicate that the toggle does not affect SRS scheduling itself: `（不影響 SRS 排程，到期題仍會記）` or equivalent wording. This wording refers to answer-time side effects (`questionHistory.interval` / `easeFactor` / `nextDueAt` still update per the binary-input SM-2 review rule), which remain unchanged regardless of the toggle state.

When the toggle is `true` and the (year-filtered) playable pool minus `excludeIds` is empty, `pickRandomQuestion` SHALL return `null` and the QuizModal SHALL surface its existing pool-empty UI (banner / disabled "下一題" affordance) instead of repeating an already-answered question.

The `excludeIds` set MAY be cached per `(modal session, subjectId)` to avoid re-querying Dexie on every click. When cached, the QuizModal SHALL append the just-answered `questionId` to the cached set immediately after the answer transaction commits, so subsequent 「下一題」clicks within the same session reflect the new history row without a Dexie round-trip.

#### Scenario: Toggle defaults to off on modal open

- **GIVEN** the player opens the QuizModal for any subject
- **WHEN** the modal first renders
- **THEN** the `跳過 SRS` toggle SHALL be unchecked
- **AND** the initial question load SHALL follow the existing due-first picker flow
- **AND** `pickRandomQuestion` SHALL NOT receive any `excludeIds` set on this load

#### Scenario: Toggle on forces random picker for next AND excludes questionHistory

- **GIVEN** the QuizModal is open with subject = 外科, 2 due cards in the queue, and 47 questionHistory rows for 外科 (questions answered in prior sessions)
- **WHEN** the player checks `跳過 SRS` and clicks 「下一題」
- **THEN** the picker SHALL NOT call `getNextDueCardForSubject`
- **AND** the picker SHALL call `pickRandomQuestion('外科', seenIds, { excludeIds })` where `excludeIds` contains exactly those 47 question ids
- **AND** the returned question's `id` SHALL NOT be in the 47-id `excludeIds` set
- **AND** the 2 due cards SHALL remain in the queue (not consumed)

#### Scenario: Toggle on with fully-answered subject returns null and surfaces pool-empty UI

- **GIVEN** the player has previously answered every question in the 麻醉科 playable pool (questionHistory contains all 187 ids)
- **AND** the player opens the QuizModal for 麻醉科 with `跳過 SRS = true`
- **WHEN** `loadNextQuestion('麻醉科', true)` runs
- **THEN** `pickRandomQuestion` SHALL return `null` (narrowed pool is empty)
- **AND** the QuizModal SHALL set `poolEmpty = true` and surface its pool-empty UI
- **AND** the QuizModal SHALL NOT serve a previously-answered question

#### Scenario: Toggle state does not persist across modal sessions

- **GIVEN** the player previously had `跳過 SRS = true` and closed the modal
- **WHEN** the player re-opens the QuizModal (any subject)
- **THEN** the `跳過 SRS` toggle SHALL render as unchecked

#### Scenario: Toggle is operable both before and after answering

- **GIVEN** the QuizModal is mid-session showing a revealed answer
- **WHEN** the player toggles `跳過 SRS` on
- **AND** subsequently clicks 「下一題」
- **THEN** the picker SHALL respect the new toggle state for the next question load
- **AND** when the new state is `true`, the picker SHALL receive the up-to-date `excludeIds` set (including the just-answered question if it was a fresh answer)

#### Scenario: Year filter composes with history exclusion

- **GIVEN** `跳過 SRS = true`, the active year filter is `Set([115, 114])`, and 12 questionHistory rows exist for subject 內科
- **WHEN** the player clicks 「下一題」
- **THEN** the picker SHALL first narrow the 內科 playable pool to questions whose `meta.year ∈ {115, 114}` (per the existing year-filter Requirement)
- **AND** SHALL then narrow that year-filtered pool further by removing every id in the 12-row `excludeIds` set
- **AND** SHALL pick uniformly at random from the doubly-narrowed pool
- **AND** SHALL return `null` if the doubly-narrowed pool is empty


### Requirement: QuizModal SHALL emit a one-shot pool-exhausted toast per subject per session

When the random-pool picker (`pickRandomQuestion`) returns a question whose id is already in the in-session `seenIds` set AND the effective "seen-or-excluded" set covers the full playable pool for the current subject (as reported by the same `loadPoolSizeMap` source the existing check uses — year-filter awareness of this `poolSize` source is a separate concern tracked by a follow-up change), the QuizModal SHALL emit exactly one toast message reading `本科獨立題已掃完，繼續會開始重練` (or visually equivalent wording).

The effective "seen-or-excluded" set is defined as:

- When `skipSrs === false`: `seenIds` (in-session only; matches prior behavior).
- When `skipSrs === true`: `seenIds ∪ excludeIds` (in-session plus cross-session `questionHistory`).

The toast SHALL fire at most once per `(modal-session, subjectId)` tuple. Switching subjects mid-session SHALL allow a fresh exhaustion toast to fire when the new subject's pool is later exhausted. Closing and re-opening the modal SHALL reset the exhaustion-fired tracking (so the toast MAY fire again on the same subject in a subsequent session).

The toast SHALL NOT block further answering. It SHALL NOT alter SRS scheduling, mastery, affinity, history writes, or any other side effect. Questions SHALL continue to be served (now drawn from the same pool with repeats) UNLESS `skipSrs === true` AND the narrowed pool is empty (per the Skip-SRS Requirement), in which case the QuizModal SHALL surface its pool-empty UI instead of an answerable question.

#### Scenario: First time pool exhausted fires toast (skipSrs off)

- **GIVEN** the QuizModal has subject = 麻醉科 with playable pool size 187 and `跳過 SRS = false`
- **AND** the player has answered all 187 distinct questions in the current modal session (`seenIds.size === 187`)
- **WHEN** the player clicks 「下一題」 and `pickRandomQuestion` returns a question already in `seenIds`
- **THEN** the modal SHALL emit one toast `本科獨立題已掃完，繼續會開始重練`
- **AND** the question SHALL still render and be answerable

#### Scenario: Exhaustion toast fires earlier when skipSrs is on due to history exclusion

- **GIVEN** the QuizModal has subject = 麻醉科 with playable pool size 187 and `跳過 SRS = true`
- **AND** the player has 180 questionHistory rows for 麻醉科 from prior sessions (`excludeIds.size === 180`)
- **AND** in the current modal session the player has answered 7 new 麻醉科 questions (`seenIds.size === 7`, `excludeIds.size === 187` after the 7 fresh-answer cache appends)
- **WHEN** the player clicks 「下一題」
- **THEN** `pickRandomQuestion` SHALL return `null` (narrowed pool empty)
- **AND** the QuizModal SHALL emit the `本科獨立題已掃完` toast at most once for 麻醉科 in this session
- **AND** the QuizModal SHALL surface pool-empty UI for the next click

#### Scenario: Repeated exhaustion in same subject suppresses subsequent toasts

- **GIVEN** the exhaustion toast has already fired this session for 麻醉科
- **WHEN** the player clicks 「下一題」 again and again hits a repeat question (or null return)
- **THEN** NO additional toast SHALL fire for 麻醉科 in this session

#### Scenario: Switching subject after exhaustion does not pre-fire toast for new subject

- **GIVEN** the exhaustion toast has fired for 麻醉科 in this session
- **WHEN** the player switches the subject dropdown to 復健科
- **THEN** the modal SHALL NOT immediately re-fire the exhaustion toast
- **AND** the toast SHALL only fire for 復健科 once 復健科's own pool is exhausted within this session

#### Scenario: Close and re-open modal resets exhaustion tracking

- **GIVEN** the exhaustion toast has fired for 麻醉科 in modal session A
- **WHEN** the player closes the modal and re-opens it (modal session B)
- **AND** session B subsequently exhausts the 麻醉科 pool again (with the same or different `skipSrs` state)
- **THEN** the exhaustion toast SHALL fire once in session B
