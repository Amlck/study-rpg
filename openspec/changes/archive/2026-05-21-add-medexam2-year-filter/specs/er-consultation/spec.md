## MODIFIED Requirements

### Requirement: Question picker SHALL select from selected subject excluding recent attempts

After the selector picks a `subjectId`, the question picker SHALL:

1. Filter `content.questions` to questions with matching `subjectId`
2. Exclude any `questionId` present in `questionHistory` with `lastAnsweredAt >= now - 30*24*60*60*1000` (30-day recency exclusion, mirrors mentor-daily)
3. Randomly select one from the filtered pool
4. If the filtered pool is empty (all questions in this subject answered within 30 days), the picker SHALL fall through to the **full subject pool** (no exclusion) and pick randomly

The picker SHALL NOT touch the SRS queue — ER consult is its own selection path; SRS due cards remain mentor-daily / quiz domain.

**The picker SHALL NOT consult the active year-filter preference (`meta['quiz.yearFilter']` per `hospital-quiz` capability). ER consultation is event-driven (background tick spawns it under cadence + idle gates), not a player-initiated quiz action; applying the year filter here would let a narrow player preference (e.g. 「只練 115」) silently starve the ER spawn pool and make the feature appear broken. The implementation file SHALL include an inline comment at the picker entry point explicitly documenting this exclusion.**

#### Scenario: Picker selects unanswered question

- **GIVEN** selected subject `骨科` has 200 questions in `content.questions`
- **AND** 5 of those questions have `lastAnsweredAt` within last 30 days in `questionHistory`
- **WHEN** the picker runs
- **THEN** the selected `questionId` SHALL be from the 195 unfiltered questions
- **AND** the selection SHALL be uniformly random within that pool

#### Scenario: All questions recently answered — full pool fallback

- **GIVEN** selected subject `皮膚科` has 30 questions in `content.questions`
- **AND** all 30 have `lastAnsweredAt` within last 30 days
- **WHEN** the picker runs
- **THEN** the picker SHALL select from the full 30-question pool with no exclusion

#### Scenario: Year filter does not constrain ER consult pool

- **GIVEN** the player's active year filter `meta['quiz.yearFilter']` is `[115]` (only year 115 selected)
- **AND** the ER consult selector chooses subject 骨科 whose 115-year pool is only ~32 questions
- **WHEN** the ER consult picker runs
- **THEN** the picker SHALL operate on the full 200-question 骨科 pool (minus 30-day recency exclusion)
- **AND** the returned question's `meta.year` MAY be any value in `[106..115]`
- **AND** the returned question SHALL NOT be filtered to only `115`
