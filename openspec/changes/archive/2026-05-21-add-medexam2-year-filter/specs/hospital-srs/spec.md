## MODIFIED Requirements

### Requirement: Due-first picker in quiz modal

The system SHALL prefer due cards over random new questions when the user opens the quiz modal for a subject. The due queue MUST be consumed first; only when the due queue is empty does the picker fall back to the existing `pickRandomQuestion` random new-question flow.

**The QuizModal SHALL expose a player-facing `skipSrs` toggle (per the `hospital-quiz` capability). When `skipSrs` is `true`, the picker SHALL bypass the due-queue walk entirely and SHALL call `pickRandomQuestion` directly for every「下一題」request. The `skipSrs` toggle SHALL NOT alter the underlying SRS scheduler state — due cards that are not surfaced while `skipSrs` is on SHALL remain in the due queue and SHALL be available again when `skipSrs` is toggled off (or when a fresh modal is opened with default `skipSrs = false`).**

**Answering a question while `skipSrs = true` SHALL still update `questionHistory` SRS fields (`interval`, `easeFactor`, `nextDueAt`) per the binary-input SM-2 review requirement — `skipSrs` only affects which question is surfaced next, not how the answer is recorded.**

**The due-first picker SHALL also honor the active year-filter preference (per `hospital-quiz` capability). `getDueQueueAllSubjects(now, opts?)` and `getNextDueCardForSubject(subjectId, consumedIds, opts?)` SHALL each accept an optional `opts.yearFilter?: Set<number>` and SHALL drop `questionHistory` rows whose hydrated `Question.meta.year` is not in the active filter. When `opts.yearFilter` is `undefined`, `.size === 0`, OR `.size === 10`, no year filtering SHALL be applied (no-op). When the year-filtered due queue is empty for a subject, the picker SHALL fall through to `pickRandomQuestion` with the same year filter applied, preserving the existing fall-through semantics.**

#### Scenario: Subject has due card, modal opens with due card

- **GIVEN** `skipSrs = false` (the default)
- **WHEN** a user clicks a subject banner with N ≥ 1 due cards and opens the quiz modal
- **THEN** the modal MUST display the first due card (sorted by overdue days descending), looked up by `questionHistory.questionId` from the content pack

#### Scenario: Due queue depleted, fall back to new question

- **GIVEN** a subject has 0 due cards remaining
- **WHEN** the user clicks 「下一題」 in the quiz modal for that subject
- **THEN** the picker MUST fall back to `pickRandomQuestion(subjectId, seenIds)` and surface a fresh random question

#### Scenario: Year filter narrows due queue, picker drops out-of-filter due cards

- **GIVEN** a subject has 5 due cards in `questionHistory` with years `[112, 110, 108, 107, 106]`
- **AND** the active year filter is `Set([115, 114, 113, 112, 111])` (Page 1 only)
- **WHEN** `getDueQueueAllSubjects(Date.now(), { yearFilter })` is called
- **THEN** the returned Map's list for that subject SHALL contain exactly 1 row (for year 112)
- **AND** the「🔴 N due」chip on that banner SHALL display `1` (not `5`)

#### Scenario: Year filter empties due queue, falls through to random new question with same filter

- **GIVEN** a subject's entire due queue (5 cards) consists of questions whose years are all outside the active year filter `Set([115, 114])`
- **AND** the subject's year-filtered random pool is non-empty
- **WHEN** the user opens the quiz modal for that subject
- **THEN** the due-first picker SHALL return `null`
- **AND** the modal SHALL fall through to `pickRandomQuestion(subjectId, seenIds, { yearFilter: Set([115, 114]) })`
- **AND** surface a year-filtered random new question

#### Scenario: skipSrs and year filter compose

- **GIVEN** `skipSrs = true` and the active year filter is `Set([115, 114])`
- **WHEN** the user clicks 「下一題」
- **THEN** the picker SHALL bypass the due queue (per existing `skipSrs` semantics)
- **AND** SHALL call `pickRandomQuestion(subjectId, seenIds, { yearFilter: Set([115, 114]) })` directly
- **AND** the returned question's `meta.year` SHALL be in `{115, 114}`

### Requirement: Due queue surface via subject banner badge

The system SHALL display a "🔴 N due" chip on each subject banner, where N is the number of due cards available to the user for that subject under the current daily cap **AND under the active year-filter preference**. When N is 0 the chip MUST NOT render. When N exceeds 99 the chip MUST display "99+".

**The chip count SHALL re-evaluate within one render cycle whenever the year-filter preference changes (driven by the existing `useLiveQuery` reactivity that already subscribes to `getDueQueueAllSubjects`).**

#### Scenario: Subject with due cards shows badge

- **WHEN** a subject has at least one card with `nextDueAt ≤ now` whose `Question.meta.year` is in the active year filter AND the global daily cap has slots remaining for this subject
- **THEN** the subject banner MUST render a chip showing the per-subject due count (post-cap-allocation, post-year-filter)

#### Scenario: Subject with no due cards hides badge

- **WHEN** a subject has no card with `nextDueAt ≤ now` whose `Question.meta.year` is in the active year filter
- **THEN** the subject banner MUST NOT render the due chip (visual stays clean)

#### Scenario: High due count displays as 99+

- **WHEN** the per-subject allocated due count (post-year-filter) exceeds 99
- **THEN** the chip MUST display "99+" rather than the literal count

#### Scenario: Year filter change updates chip in real time

- **GIVEN** a subject's chip currently shows `8` due cards (year filter = all)
- **WHEN** the player narrows the year filter to `Set([115])` and 6 of those 8 due cards have `meta.year ≠ 115`
- **THEN** within one render cycle the chip SHALL update to display `2`
