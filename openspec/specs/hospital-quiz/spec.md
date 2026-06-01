# hospital-quiz Specification

## Purpose
TBD - created by archiving change wire-hospital-quiz-ui. Update Purpose after archive.
## Requirements
### Requirement: Quiz modal SHALL launch from per-subject banner 「📚 學習」 button

The HomePage `RecruitmentBanner` component SHALL render a「📚 學習」 button alongside the existing「🎫 招募」 roll button. Clicking the 「📚 學習」 button SHALL open a `QuizModal` overlay covering the HomePage without unmounting it. The 「📚 學習」 button SHALL be enabled regardless of `affinity[subjectId]` value (i.e., locked banners still allow study entry); the「🎫 招募」 button's existing locked/unlocked behavior SHALL be unchanged by this change.

#### Scenario: Click 學習 button on unlocked banner opens quiz modal

- **GIVEN** the HomePage is rendered with 14 banners
- **AND** `affinity[外科] ≥ threshold[外科]`
- **WHEN** the player clicks the 「📚 學習」 button on the 外科 banner
- **THEN** a `QuizModal` SHALL render as an overlay
- **AND** the modal's subject dropdown SHALL be pre-selected to `外科`
- **AND** the HomePage SHALL remain mounted underneath the modal

#### Scenario: Click 學習 button on locked banner still opens quiz modal

- **GIVEN** `affinity[眼科] = 4` and `threshold[眼科] = 10`
- **AND** the 眼科 banner is in locked state
- **WHEN** the player clicks the 「📚 學習」 button on the 眼科 banner
- **THEN** the `QuizModal` SHALL open
- **AND** the modal SHALL accept question answering (this is how the player accumulates affinity to unlock)

#### Scenario: 招募 button behavior unchanged

- **GIVEN** the player clicks the 「🎫 招募」 button on a banner
- **WHEN** the banner is unlocked and `tickets.available ≥ 1`
- **THEN** the existing recruitment roll flow SHALL execute per `recruitment-gacha` spec
- **AND** no `QuizModal` SHALL open

### Requirement: Quiz modal SHALL display question stem, options, doctor partner, and close affordance

The `QuizModal` SHALL render the following elements at all times during a quiz session:

- Modal header containing the current quiz subject (e.g., `📚 外科`) and a close button (X)
- Doctor partner section showing the bound doctor's sprite + name (purely cosmetic, does not affect scoring)
- Subject dropdown allowing switching to any of 14 subjects mid-session
- **A question-meta row directly above the stem containing the raw `question.id` string (e.g., `106-2-醫學三-內科-Q10`) and a bookmark toggle button**
- Question stem (text from `corpus.stem`, supports CJK and line breaks)
- 4 option buttons labeled A / B / C / D rendering `corpus.options.A` through `corpus.options.D`
- A status / result region below the options (initially empty; reveals explanation after answer)
- A 「下一題」 button (initially disabled; enabled after answering)

The close button SHALL close the modal immediately without confirmation. The 「下一題」 button SHALL load a fresh random question from the current subject's corpus pool.

The question-meta row SHALL display `question.id` verbatim (no reformatting, no localization). The bookmark toggle SHALL be a single icon-only button with `role=switch` and `aria-pressed` reflecting current bookmark state; clicking SHALL toggle the bookmark for the currently-displayed question via the `question-bookmarks` capability. The bookmark toggle SHALL function independently of answer state — players MAY bookmark before, during, or after answering, on either correct or incorrect responses.

#### Scenario: Modal initial render shows question + 4 options

- **GIVEN** the player opens `QuizModal` from the 外科 banner
- **AND** the 外科 corpus contains at least 1 question
- **WHEN** the modal first renders
- **THEN** the modal SHALL display the doctor partner sprite + name
- **AND** the modal SHALL display the question stem text
- **AND** the modal SHALL display 4 option buttons (A / B / C / D) with text from `corpus.options`
- **AND** the result region SHALL be empty
- **AND** the 「下一題」 button SHALL be disabled

#### Scenario: Close button immediately dismisses modal

- **GIVEN** the player is mid-question in `QuizModal`
- **WHEN** the player clicks the close (X) button
- **THEN** the modal SHALL unmount without confirmation
- **AND** the HomePage SHALL be visible underneath
- **AND** any in-progress question state SHALL be discarded (no auto-save of partial answer)

#### Scenario: Question identifier displayed verbatim above stem

- **GIVEN** a question with `id = "106-2-醫學三-內科-Q10"` is loaded into `QuizModal`
- **WHEN** the modal renders
- **THEN** the question-meta row SHALL display the literal string `106-2-醫學三-內科-Q10`
- **AND** the string SHALL appear directly above the question stem
- **AND** no formatting transformation (e.g., to "106 年第 2 次 醫學三 內科 第 10 題") SHALL be applied

#### Scenario: Bookmark toggle visible and operable regardless of answer state

- **GIVEN** `QuizModal` is rendered with a fresh unanswered question
- **WHEN** the player clicks the bookmark toggle button before answering
- **THEN** the toggle SHALL switch from outline to filled glyph
- **AND** the underlying question SHALL be persisted as a bookmark per `question-bookmarks` capability
- **AND** the question stem and option buttons SHALL remain unchanged

#### Scenario: Bookmark toggle reflects current question state on every render

- **GIVEN** the player bookmarks question Q1 in `QuizModal`
- **WHEN** the player clicks 「下一題」 and Q2 (not bookmarked) loads
- **THEN** the bookmark toggle SHALL display the outline glyph for Q2
- **AND** the toggle's `aria-pressed` SHALL be `false`
- **WHEN** the same session randomly draws Q1 again
- **THEN** the bookmark toggle SHALL display the filled glyph and `aria-pressed=true` reflecting Q1's bookmark status from IndexedDB

### Requirement: Quiz session SHALL require a roster doctor selected as narrative partner

The `QuizModal` SHALL require the player to have selected a roster doctor before answer buttons become interactive. The selected doctor SHALL be referenced as `boundDoctor`. The `boundDoctor.subjectId` SHALL NOT affect any reward calculation — it is purely a visual / narrative element. If no doctor is bound, the option buttons SHALL be disabled and a doctor picker SHALL be displayed prominently.

The modal SHALL resolve the initial `boundDoctor` on each open using the following precedence:

1. If a persisted companion-doctor ID exists (per-device, stored in the `meta` table under key `quiz.companionDoctorId`) AND that doctor is still present in the `doctors` table, `boundDoctor` SHALL be that doctor.
2. Otherwise, `boundDoctor` SHALL be the doctor with the highest `obtainedAt` value (most recently obtained); the modal SHALL also persist that doctor's ID under the same `meta` key so the choice sticks across subsequent opens.

The player MAY change `boundDoctor` mid-session via an in-modal doctor picker. Changing `boundDoctor` SHALL immediately persist the new ID to the `meta` key. Changing `boundDoctor` SHALL NOT reset the current question or session state. Recruiting a new doctor while `QuizModal` is closed SHALL NOT change the persisted companion-doctor ID, so the player's previously chosen partner remains active on the next open.

The persisted ID SHALL be treated as a per-device UI preference (no cloud sync).

#### Scenario: No doctor bound disables answer buttons

- **GIVEN** the `doctors` table contains 0 roster doctors (impossible after onboarding, but defensive)
- **WHEN** the `QuizModal` opens
- **THEN** the option buttons (A/B/C/D) SHALL be disabled
- **AND** a message SHALL display: `「請先招募醫師才能學習」`

#### Scenario: First-ever open with no persisted ID defaults to most recent

- **GIVEN** the `doctors` table contains 5 doctors with various `obtainedAt` timestamps
- **AND** `meta['quiz.companionDoctorId']` does not exist (e.g. fresh player or first open after upgrade)
- **WHEN** the `QuizModal` opens
- **THEN** `boundDoctor` SHALL be the doctor with the highest `obtainedAt` value
- **AND** the modal header SHALL display that doctor's name and sprite
- **AND** the modal SHALL write that doctor's ID to `meta['quiz.companionDoctorId']`

#### Scenario: Recruiting new doctor does not displace persisted companion

- **GIVEN** `meta['quiz.companionDoctorId']` is set to doctor A's ID
- **AND** doctor A is present in the `doctors` table
- **WHEN** the player recruits doctor B (now the most recently obtained)
- **AND** the player closes and reopens the `QuizModal`
- **THEN** `boundDoctor` SHALL be doctor A (NOT doctor B)
- **AND** `meta['quiz.companionDoctorId']` SHALL still be doctor A's ID

#### Scenario: Persisted companion no longer in roster falls back to most recent

- **GIVEN** `meta['quiz.companionDoctorId']` is set to doctor A's ID
- **AND** doctor A has been retired and is no longer in the `doctors` table
- **AND** the `doctors` table contains doctors B, C, D with various `obtainedAt` timestamps
- **WHEN** the `QuizModal` opens
- **THEN** `boundDoctor` SHALL be the doctor with the highest `obtainedAt` value among the remaining roster
- **AND** the modal SHALL overwrite `meta['quiz.companionDoctorId']` to that new doctor's ID

#### Scenario: Changing doctor mid-session does not reset question and persists choice

- **GIVEN** the player is viewing question Q1 in `QuizModal` and has not yet answered
- **AND** `meta['quiz.companionDoctorId']` is doctor A's ID
- **WHEN** the player changes `boundDoctor` from doctor A to doctor B via the in-modal picker
- **THEN** the modal SHALL update the displayed doctor sprite + name to doctor B
- **AND** the question stem and option buttons SHALL remain Q1's content
- **AND** `meta['quiz.companionDoctorId']` SHALL be updated to doctor B's ID

#### Scenario: boundDoctor.subjectId does not affect affinity gain

- **GIVEN** `boundDoctor.subjectId = 內科` and the current quiz subject is `外科`
- **WHEN** the player answers an 外科 question correctly
- **THEN** `affinity[外科]` SHALL increment by exactly 1 (per `recruitment-gacha` spec)
- **AND** `affinity[內科]` SHALL be unchanged
- **AND** no multiplier or bonus SHALL apply based on doctor-subject mismatch

### Requirement: QuizModal partner section SHALL be responsive to viewport width

The doctor partner section (`.quiz-modal__partner`) rendered by `QuizModal` SHALL display correctly at all viewport widths from 320px (narrowest mobile) up to desktop sizes. On mobile widths (≤ 520px CSS pixels) the partner card's child elements (sprite, info, bonus badge, picker dropdown) SHALL NOT visually overlap, SHALL NOT truncate the doctor name text, and SHALL NOT cause horizontal overflow of the modal container.

The detailed responsive layout behavior — including the two-row stacking, indentation, and combinatorial scenarios for bonus/picker presence — SHALL be defined by the `quiz-partner-card-rwd` capability spec.

#### Scenario: Mobile partner card renders without overlap on iPhone-class viewport

- **GIVEN** viewport width = 375px (iPhone 14 mini)
- **AND** `boundDoctor` is a same-subject roster doctor with specialty multiplier > 1.0
- **AND** `doctors.length > 1` (picker visible)
- **WHEN** the player opens `QuizModal`
- **THEN** the partner section SHALL render per the `quiz-partner-card-rwd` two-row layout
- **AND** the doctor name SHALL be fully visible (no truncation)
- **AND** the bonus badge (`✨ 1.1×`) SHALL NOT overlap the doctor name or meta text
- **AND** the picker dropdown SHALL be fully visible and operable within the modal's horizontal bounds

#### Scenario: Desktop partner card layout unchanged by responsive rules

- **GIVEN** viewport width ≥ 521px (tablet portrait, desktop)
- **WHEN** the player opens `QuizModal`
- **THEN** the partner section SHALL render in the existing single-row layout
- **AND** the visual appearance SHALL match the pre-change desktop baseline
- **AND** no regression in spacing, alignment, or element visibility SHALL be introduced by the responsive CSS rules

### Requirement: Subject dropdown SHALL default to banner subject and allow free switching

The `QuizModal` SHALL include a subject dropdown selector populated with all 14 二階國考 subjects. When the modal is opened from a banner, the dropdown SHALL be pre-selected to that banner's `subjectId`. The player MAY switch to any other subject at any time during the session. Switching subjects SHALL:

- Discard the currently displayed question
- Reset the session's `seenQuestionIds` set
- Load a fresh random question from the new subject's pool
- NOT reset `boundDoctor`
- NOT clear or modify any mastery / affinity counters

#### Scenario: Dropdown defaults to banner subject

- **GIVEN** the player clicks the 「📚 學習」 button on the 婦產科 banner
- **WHEN** the `QuizModal` opens
- **THEN** the subject dropdown SHALL show `婦產科` as the selected value

#### Scenario: Switch subject loads new question

- **GIVEN** the player is viewing an 外科 question Q1 in `QuizModal`
- **WHEN** the player changes the subject dropdown to `內科`
- **THEN** Q1 SHALL be discarded
- **AND** a new random 內科 question SHALL be loaded
- **AND** `boundDoctor` SHALL be unchanged
- **AND** `seenQuestionIds` SHALL be reset to a new empty set

### Requirement: Quiz session SHALL be continuous single-question with no batch boundary

The `QuizModal` SHALL operate in continuous single-question mode. There SHALL be no concept of "round", "batch", "score screen", or "session timer". After each question is answered, the player MAY click 「下一題」 to load a fresh question or close the modal to end the session. Closing the modal SHALL be permitted at any time, including immediately after opening with no questions answered. The modal SHALL NOT display any progress counter (e.g., "3/10"), score total, or completion celebration.

Within a single modal-open session, the system SHALL maintain a `seenQuestionIds: Set<string>` to avoid immediate repetition. When loading a new question, the picker SHALL re-roll up to 3 times if the candidate `questionId` is in `seenQuestionIds`; on the 3rd repeat the candidate SHALL be accepted to prevent infinite loops on small subject pools.

#### Scenario: Continuous flow after correct answer

- **GIVEN** the player answered question Q1 correctly
- **WHEN** the player clicks 「下一題」
- **THEN** a new random question Q2 SHALL load
- **AND** Q2.questionId SHALL NOT equal Q1.questionId (if subject pool has > 1 question)
- **AND** no score screen or "round complete" UI SHALL display

#### Scenario: Close after one question

- **GIVEN** the player answered Q1 and is viewing the explanation
- **WHEN** the player clicks the close button
- **THEN** the modal SHALL dismiss immediately
- **AND** the HomePage SHALL be visible
- **AND** Q1's mastery / affinity / history side effects (from prior requirement) SHALL persist

#### Scenario: seenQuestionIds prevents short-term repetition

- **GIVEN** the player has answered Q1, Q2, Q3 in this session
- **WHEN** the player clicks 「下一題」 for Q4
- **THEN** the picker SHALL attempt to select a question whose id is not in {Q1.id, Q2.id, Q3.id}
- **AND** if the random pick is in the set, the picker SHALL re-roll
- **AND** the picker SHALL accept the candidate after the 3rd re-roll regardless of repetition

### Requirement: Correct answer SHALL increment affinity, update mastery, and write history

When the player selects the correct option (matching `corpus.answer`), the system SHALL perform the following side effects in order, all within a single Dexie transaction where possible:

1. Increment `affinity[currentSubjectId]` by exactly 1 (delegates to `recruitment-gacha` spec affinity counter)
2. Increment `mastery[currentSubjectId].correct` by 1 and `mastery[currentSubjectId].total` by 1
3. Upsert the `questionHistory[questionId]` row: increment `attempts`, increment `correctCount`, set `lastAnsweredAt = Date.now()`, set `lastResult = 'correct'`; leave `nextDueAt` / `interval` / `easeFactor` at existing values or defaults if first insert
4. Reveal explanation in the modal result region
5. Enable the 「下一題」 button
6. Disable the option buttons to prevent re-answer

The reputation `createPerQReputationListener` SHALL fire as currently wired (hospital-tycoon-engine behavior); this requirement does NOT modify that listener.

#### Scenario: Correct answer increments all three counters

- **GIVEN** `affinity[外科] = 12`, `mastery[外科] = {correct: 5, total: 8}`, no prior history for question Q_X
- **WHEN** the player selects the correct option for Q_X (an 外科 question)
- **THEN** `affinity[外科]` SHALL equal `13`
- **AND** `mastery[外科]` SHALL equal `{correct: 6, total: 9}`
- **AND** `questionHistory[Q_X.id]` SHALL exist with `attempts=1, correctCount=1, lastResult='correct'`
- **AND** `questionHistory[Q_X.id].nextDueAt` SHALL be `null` (default, SRS scheduler will set later)
- **AND** the modal result region SHALL display the explanation text

#### Scenario: Repeat correct answer updates history attempts/correct

- **GIVEN** `questionHistory[Q_X.id] = {attempts: 2, correctCount: 1, lastResult: 'wrong', ...}`
- **WHEN** the player answers Q_X correctly again
- **THEN** `questionHistory[Q_X.id]` SHALL become `{attempts: 3, correctCount: 2, lastResult: 'correct', lastAnsweredAt: <new ms>, ...}`
- **AND** `nextDueAt / interval / easeFactor` SHALL be unchanged by this requirement (SRS scheduler concern)

### Requirement: Wrong answer SHALL reveal explanation, update mastery and history, with no penalty

When the player selects an incorrect option (not matching `corpus.answer`), the system SHALL:

1. NOT modify `affinity[currentSubjectId]` (per `recruitment-gacha` spec "never decrement")
2. NOT modify `reputation` (no reputation penalty)
3. Increment `mastery[currentSubjectId].total` by 1 (correct counter unchanged)
4. Upsert `questionHistory[questionId]`: increment `attempts`, leave `correctCount` unchanged, set `lastAnsweredAt = Date.now()`, set `lastResult = 'wrong'` (this `lastResult` write is the sole driver of the 「錯題」 derived list per `wrong-answer-list` capability — no separate trigger needed)
5. Reveal explanation in the modal result region by rendering `corpus.explanation` through the `ExplanationMarkdown` component, which parses the string as CommonMark and emits a constrained React node tree. The component SHALL recognize `### 選項詳解` headings, `**A. ...**` bold, and `  - ✗ 錯誤 [P_N XXX] 詳解：...` bullet list patterns produced by the corpus build. Raw markdown control characters (`###`, `**`, `-`) SHALL NOT appear as literal text in the rendered output.
6. Reveal the inline ★ promote affordance in the answer-feedback region (per `QuizModal answer-feedback region SHALL surface an inline ★ promote-to-manual-bookmark affordance` requirement below)
7. Enable the 「下一題」 button
8. Disable the option buttons to prevent re-answer
9. Visually highlight the correct option (e.g., green border) and the incorrectly selected option (e.g., red border)

If `corpus.explanation` is empty, null, undefined, or whitespace-only, the result region SHALL display the placeholder text `「（解析待補）」` instead of erroring. The `ExplanationMarkdown` component SHALL short-circuit to the placeholder render path in these cases without invoking the markdown parser.

The `ExplanationMarkdown` component SHALL enforce a strict whitelist of allowed HTML elements: `p`, `h1`, `h2`, `h3`, `h4`, `strong`, `em`, `ul`, `ol`, `li`, `code`, `br`. All other markdown-derived elements (`a`, `img`, `table`, `pre`, `blockquote`, `hr`, etc.) SHALL be unwrapped or omitted. The component SHALL set `skipHtml: true` (or equivalent) on the underlying markdown renderer so that any raw HTML embedded in `corpus.explanation` (intentional or LLM-hallucinated) SHALL NOT be rendered as live HTML.

#### Scenario: Wrong answer increments only mastery.total and history.attempts

- **GIVEN** `affinity[內科] = 45`, `mastery[內科] = {correct: 10, total: 20}`, `questionHistory[Q_Y] = {attempts: 1, correctCount: 1, lastResult: 'correct', ...}`
- **WHEN** the player selects an incorrect option for Q_Y (an 內科 question)
- **THEN** `affinity[內科]` SHALL remain `45`
- **AND** `reputation` SHALL be unchanged (apart from any existing `createPerQReputationListener` no-op behavior on wrong)
- **AND** `mastery[內科]` SHALL equal `{correct: 10, total: 21}`
- **AND** `questionHistory[Q_Y]` SHALL equal `{attempts: 2, correctCount: 1, lastResult: 'wrong', lastAnsweredAt: <new ms>, ...}`
- **AND** the derived wrong-answer list (filtered view of `questionHistory.lastResult = 'wrong'`) SHALL contain Q_Y

#### Scenario: Explanation rendered from corpus

- **GIVEN** the player selects an incorrect option
- **AND** `corpus.explanation` for the question contains `### 選項詳解\n\n**A. ...**\n  - ✗ 錯誤 [P1 夯]\n  - 詳解：...`
- **WHEN** the modal result region renders
- **THEN** the explanation SHALL display the full text with markdown rendering (headings, bold, bullet points)
- **AND** the rendered DOM SHALL contain at least one `<h3>` element with text content `選項詳解` (rendered from the `### 選項詳解` source line)
- **AND** the rendered DOM SHALL contain `<strong>` elements wrapping the `A. ...` option labels
- **AND** the rendered DOM SHALL contain a `<ul>` element with `<li>` children for the ✗ / ✓ bullets
- **AND** the literal characters `###`, `**`, and `  - ` (leading dash-space) SHALL NOT appear as visible text in the rendered output
- **AND** the correct option button SHALL receive a "correct" visual treatment
- **AND** the selected wrong option SHALL receive a "wrong" visual treatment

#### Scenario: Missing explanation falls back to placeholder

- **GIVEN** a question has `corpus.explanation = ""` (empty string), missing field, or whitespace-only content
- **WHEN** the player answers and the result region renders
- **THEN** the result region SHALL display the placeholder text `「（解析待補）」`
- **AND** no markdown parsing SHALL be invoked (short-circuit path)
- **AND** no error SHALL be thrown
- **AND** the flow SHALL proceed (「下一題」 enabled normally)

#### Scenario: Explanation containing raw HTML is sanitized

- **GIVEN** a hypothetical `corpus.explanation` containing the string `<script>alert(1)</script>` or `<img src=x onerror=...>`
- **WHEN** the modal result region renders
- **THEN** no `<script>` element SHALL appear in the rendered DOM
- **AND** no `<img>` element SHALL appear in the rendered DOM
- **AND** the page SHALL NOT execute any embedded JavaScript
- **AND** the offending text MAY appear as escaped literal text but SHALL NOT be interpreted as HTML

### Requirement: QuizModal SHALL render question image when `imagePath` is present

When `question.imagePath` is a non-null, non-empty string, the `QuizModal` SHALL render an `<img>` element directly beneath the question stem and above the option buttons. The image SHALL:

- Use `${import.meta.env.BASE_URL}${question.imagePath}` as the `src` (base URL path safety: dev `/study-rpg/hospital/` and prod `/study-rpg/hospital/` share the same base, but using `BASE_URL` insulates against future base changes)
- Use the literal string `"題目附圖"` as the `alt` attribute
- Be wrapped in a styled container `<div className="quiz-modal__image">` to allow CSS sizing (max-width: 100%, max-height: 50vh, object-fit: contain for aspect-ratio preservation on small screens)
- Render between the stem `<p>` and the options `<ul>` in DOM order

The image SHALL re-render correctly when the player advances to a new question (React key on question id, or unconditional re-render on stem change).

#### Scenario: Question with imagePath renders img element

- **GIVEN** the player is shown question `108-2-醫學三-內科-Q45` in QuizModal
- **AND** `question.imagePath = "images/medexam2-tw/108-2-醫學三-內科-Q45.png"`
- **WHEN** the modal renders
- **THEN** an `<img>` element SHALL be present in the DOM, between the stem and the options
- **AND** the `src` attribute SHALL end with `"images/medexam2-tw/108-2-醫學三-內科-Q45.png"`
- **AND** the `alt` attribute SHALL equal `"題目附圖"`

#### Scenario: Switching to next question swaps image

- **GIVEN** the player is viewing a question with an image
- **WHEN** the player clicks 「下一題」 and the next question also has an image (different `imagePath`)
- **THEN** the rendered `<img>` SHALL update its `src` to the new question's `imagePath`
- **AND** no stale image from the previous question SHALL remain in the DOM

#### Scenario: Plain text question renders no image element

- **GIVEN** the player is shown a question where `question.imagePath` is `null` or absent
- **AND** `question.hasImage` is `false`
- **WHEN** the modal renders
- **THEN** no `<img>` element SHALL be present in the question body
- **AND** no `.quiz-modal__image` or `.quiz-modal__image-missing` container SHALL render

### Requirement: QuizModal SHALL render missing-image fallback when `hasImage` is true but `imagePath` is absent

When `question.hasImage === true` AND `question.imagePath` is null/absent, the `QuizModal` SHALL render a fallback notice in place of where the image would appear. The notice SHALL:

- Display Chinese copy: `「📷 此題含附圖但尚未補齊（{question.id}）」`
- Render in a styled container `<div className="quiz-modal__image-missing">` with muted appearance (e.g., gray border, italic text, smaller font) to signal degraded state without blocking interaction
- NOT prevent answering — option buttons SHALL remain interactive

This handles two known cases gracefully:
1. **False positives**: the tightened `hasImage` regex misses an edge case and flags a question that does not actually require an image (rare after regex tightening; still possible)
2. **Extraction failures**: the PyMuPDF extraction script failed to locate or extract the image for that question (logged to `extraction.log`; user can manually backfill later by dropping a PNG into `public/images/medexam2-tw/`)

The fallback SHALL persist until the next build re-runs and the missing PNG is now present.

#### Scenario: hasImage with no imagePath renders fallback notice

- **GIVEN** a question with `hasImage = true` and `imagePath = null`
- **AND** the question id is `109-1-醫學四-外科-Q12`
- **WHEN** the modal renders
- **THEN** the fallback container `.quiz-modal__image-missing` SHALL be present
- **AND** the text content SHALL contain `"📷 此題含附圖但尚未補齊（109-1-醫學四-外科-Q12）"`
- **AND** no `<img>` element SHALL be present

#### Scenario: Fallback does not disable answering

- **GIVEN** the modal renders the missing-image fallback
- **AND** a doctor is bound
- **WHEN** the player clicks an option button
- **THEN** the answer flow (correct/wrong handling, mastery / affinity / history updates per existing requirements) SHALL proceed normally
- **AND** the fallback notice SHALL remain visible alongside the revealed explanation


### Requirement: Random-pool picker SHALL exclude `hasOptionImages` questions

The 二階 random question picker (`pickRandomQuestion` and its callers) SHALL NOT return any question whose `hasOptionImages` is `true`. Filtering SHALL happen at content-pack load time so that:

1. `bySubject` per-subject counts reflect only playable (text-renderable) questions.
2. `pickRandomQuestion` cannot select a flagged question even with maximally-skewed re-rolls.
3. `byId` lookup SHALL retain the full pack so historical bookmark / SRS row hydration of flagged IDs still resolves to a `Question` object (downstream UI may then display a graceful fallback rather than crash on missing).

Existing scenarios for QuizModal rendering, doctor partner, mid-session subject switching, etc. SHALL continue to apply to the filtered pool — they are not behavior changes, only operate over a smaller pool of ~6056 instead of 6066 questions.

#### Scenario: Filtered pool excludes flagged questions

- **GIVEN** the 二階 content pack contains 10 questions with `hasOptionImages: true` (耳鼻喉科 Q27 of 109_第二次, etc.)
- **WHEN** `loadPack()` resolves
- **THEN** `bySubject.get('耳鼻喉科')` SHALL NOT include any flagged question
- **AND** `pickRandomQuestion('耳鼻喉科', new Set())` SHALL never return a question with `hasOptionImages === true` over any number of calls

#### Scenario: byId retains flagged questions for historical hydration

- **GIVEN** a user's `questionHistory` contains a row for `109-2-醫學六-耳鼻喉科-Q27` answered before this filter shipped
- **WHEN** `pickQuestionById('109-2-醫學六-耳鼻喉科-Q27')` is called
- **THEN** the call SHALL return the full `Question` object (not null)
- **AND** the calling UI MAY choose to display a graceful notice; the lookup itself SHALL NOT throw

#### Scenario: Subject counts after filter remain consistent with player perception

- **GIVEN** the 耳鼻喉科 pool of N total questions
- **WHEN** the filtered `bySubject.get('耳鼻喉科')` is sized
- **THEN** the size SHALL equal `N - (耳鼻喉科 questions with hasOptionImages === true)`
- **AND** UI elements that surface a "remaining unseen" count for the subject SHALL derive from this filtered size (no off-by-one between picker and counter)

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

### Requirement: Correct answer SHALL grant revenue and reputation rewards

The `QuizModal`'s correct-answer side-effect chain SHALL grant `revenue` and `reputation` deltas to `gameCounters.singleton` via the `applyQuizReward` service (`apps/medexam2-hospital-tw/src/services/quiz-rewards.ts`). The grant SHALL fire on every correct answer, including questions where `question.disputed === true` (送分題, which the existing `recordCorrectAnswer` logic treats as correct regardless of option chosen). Incorrect answers SHALL NOT grant any revenue or reputation.

The base per-correct reward constants SHALL be locked literals exported from `packages/content-medexam2-tw/src/recruitment.ts`:

- `QUIZ_REVENUE_PER_CORRECT_BASE = 80`
- `QUIZ_REPUTATION_PER_CORRECT_BASE = 80`

**The tier-scaled multiplier `QUIZ_TIER_MULTIPLIER: Record<HospitalTier, number>` SHALL be exported from the same module with locked literal values (`// TUNED 2026-05-19 — first dogfood pass; revisit after 1-2 weeks of telemetry`):**

| Tier | Multiplier |
|---|---|
| 診所 | 1.0 |
| 區域醫院 | 1.3 |
| 醫學中心 | 1.6 |
| 國家級教學醫院 | 2.0 |

The final granted amounts SHALL be computed by the formula:

```
revenuePerCorrect = ROUND(
  QUIZ_REVENUE_PER_CORRECT_BASE
  × getSpecialtyMultiplier(boundDoctor.subjectId, boundDoctor.rarity, currentSubjectId)
  × QUIZ_TIER_MULTIPLIER[gameCounters.tier]
)

reputationPerCorrect = ROUND(
  QUIZ_REPUTATION_PER_CORRECT_BASE
  × getSpecialtyMultiplier(boundDoctor.subjectId, boundDoctor.rarity, currentSubjectId)
  × QUIZ_TIER_MULTIPLIER[gameCounters.tier]
)
```

**`READING_SESSION_BUFF_MULTIPLIER` SHALL NOT appear in this formula** — the reading-session buff is now applied to the tick-loop idle income (see `hospital-tycoon-engine` capability), not to quiz reward. `applyQuizReward` SHALL NOT read `gameCounters.currentSessionStartedAt` — quiz reward is independent of session state.

The `gameCounters.tier` SHALL be read inside the same Dexie transaction as the mastery write — both reads happen on the same gameCounters singleton row, so consistency is guaranteed without separate locks.

The `getSpecialtyMultiplier` function SHALL remain the same single source of truth used by mastery accrual (see `hospital-specialty-bonus` capability, modified scope). The grant SHALL happen in the same Dexie transaction as the mastery / affinity / questionHistory writes performed by `recordCorrectAnswer`, to maintain atomicity across all correct-answer side effects.

The HomePage revenue / reputation chips SHALL reflect the new value within one render cycle (existing `useLiveQuery` reactivity).

**The HomePage 「淨收 / 分鐘」 cell sublabel SHALL apply `READING_IDLE_RATE_REDUCTION` to the displayed throughput value when no session is active, OR `READING_SESSION_BUFF_MULTIPLIER` when a session is active (matching the tick-loop math). The sublabel SHALL render as `毛 {ROUND(throughput × multiplier)} − 薪 {ROUND(salary)}` where `multiplier = currentSessionStartedAt !== null ? READING_SESSION_BUFF_MULTIPLIER : READING_IDLE_RATE_REDUCTION`. The net cell value SHALL likewise compute `(throughput × multiplier) − salary` so the displayed integer matches the tick-loop accrual.**

#### Scenario: Correct answer at 診所 tier with no doctor partner grants base reward (×1.0 tier multiplier)

- **GIVEN** `gameCounters.tier === '診所'`, no doctor is bound (boundDoctor = null)
- **WHEN** the player answers the current question correctly
- **THEN** `revenue` SHALL increase by exactly `80` (= `80 × 1.0 × 1.0`)
- **AND** `reputation` SHALL increase by exactly `80`

#### Scenario: Correct answer at 區域醫院 tier with no doctor partner applies 1.3× tier multiplier

- **GIVEN** `gameCounters.tier === '區域醫院'`, no doctor partner
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.3) = 104`
- **AND** `reputation` SHALL increase by exactly `104`

#### Scenario: Correct answer at 醫學中心 tier with same-subject P1 partner applies all (specialty + tier) multipliers

- **GIVEN** `gameCounters.tier === '醫學中心'`, doctor partner = same-subject P1 (specialty multiplier = 1.5)
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.5 × 1.6) = 192`
- **AND** `reputation` SHALL increase by exactly `192`

#### Scenario: Correct answer at 國家級教學醫院 tier with same-subject P1 partner gives max stacked reward (NO session buff applied)

- **GIVEN** `gameCounters.tier === '國家級教學醫院'`, doctor partner = same-subject P1 (specialty multiplier = 1.5), **session is active**
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.5 × 2.0) = 240` (NOT 360 — session state is irrelevant to quiz reward)
- **AND** `reputation` SHALL increase by exactly `240`

#### Scenario: Session state is irrelevant to quiz reward

- **GIVEN** `gameCounters.tier === '區域醫院'`, no doctor partner
- **WHEN** the player answers correctly with `currentSessionStartedAt !== null` (session active)
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.3) = 104`
- **AND** the same answer with `currentSessionStartedAt === null` (session inactive) SHALL produce the same `104` delta
- **AND** the `applyQuizReward` Dexie transaction SHALL NOT read `currentSessionStartedAt`

#### Scenario: Correct answer with same-subject P5 partner at 醫學中心 — specialty + tier only

- **GIVEN** `gameCounters.tier === '醫學中心'`, doctor partner = same-subject P5 (specialty multiplier = 1.05)
- **WHEN** the player answers correctly
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.05 × 1.6) = 134`
- **AND** `reputation` SHALL increase by exactly `134`

#### Scenario: Wrong answer grants zero quiz reward regardless of tier

- **GIVEN** `gameCounters.tier === '醫學中心'`, same-subject P3 partner
- **WHEN** the player selects an incorrect option
- **THEN** `revenue` SHALL remain unchanged by quiz-reward path
- **AND** `reputation` SHALL remain unchanged by quiz-reward path
- **AND** mastery / questionHistory side effects (per existing `hospital-quiz` requirements) SHALL still fire

#### Scenario: Disputed (送分題) question grants tier-scaled reward regardless of option chosen

- **GIVEN** `question.disputed === true`, `gameCounters.tier === '區域醫院'`, no partner
- **WHEN** the player selects any option
- **THEN** `revenue` SHALL increase by exactly `ROUND(80 × 1.0 × 1.3) = 104`
- **AND** the existing `recordCorrectAnswer` mastery side effect SHALL fire

#### Scenario: Tier upgrade mid-modal applies new multiplier on next answer

- **GIVEN** the player is in QuizModal at 區域醫院 tier
- **AND** a tier upgrade fires from background tick (`gameCounters.tier` changes to `醫學中心`)
- **WHEN** the player answers the next question correctly (cross-subject partner)
- **THEN** `revenue` SHALL increase by `ROUND(80 × 1.0 × 1.6) = 128` (using new 醫學中心 multiplier)
- **AND** the previous question's revenue grant (if any) SHALL NOT be retroactively adjusted

#### Scenario: HomePage 「淨收 / 分鐘」 sublabel reflects session-aware throughput at 醫學中心

- **GIVEN** `gameCounters.tier === '醫學中心'`, total room throughput from `computeThroughput` summed across rooms = 210, total salary drain from `computeSalaryDrain` = 132
- **WHEN** HomePage renders with `currentSessionStartedAt === null` (session inactive)
- **THEN** the 「淨收 / 分鐘」 sublabel SHALL show `毛 63 − 薪 132` (= `ROUND(210 × 0.3) = 63`)
- **AND** the cell value SHALL show `-69` (= `63 - 132`)
- **AND** when `currentSessionStartedAt !== null` (session active) the sublabel SHALL show `毛 315 − 薪 132` (= `ROUND(210 × 1.5) = 315`) and the cell value SHALL show `183`

#### Scenario: HomePage 「淨收 / 分鐘」 display at 診所 with empty rooms

- **GIVEN** `gameCounters.tier === '診所'`, no doctors assigned to rooms (throughput = 0), salary = 0
- **WHEN** HomePage renders
- **THEN** the 「淨收 / 分鐘」 cell SHALL show `0`
- **AND** the sublabel SHALL show `毛 0 − 薪 0` (or be hidden per existing conditional rendering for salary === 0)

#### Scenario: Reward writes are atomic with mastery / affinity writes (tier read included, no session read)

- **GIVEN** P3 same-subject partner, tier = 醫學中心
- **WHEN** the player answers correctly
- **THEN** within a single Dexie transaction the system SHALL read: `gameCounters.tier`; then update: `gameCounters.revenue / reputation`, `mastery[subjectId].correct / total`, `affinity[subjectId].correctCount`, `questionHistory[questionId]` (SRS fields)
- **AND** the transaction SHALL NOT read `gameCounters.currentSessionStartedAt`
- **AND** if any one write fails, all SHALL roll back
- **AND** the tier read SHALL be consistent with the tier value used for the multiplier (no torn read across the upgrade boundary)

### Requirement: QuizModal answer-feedback region SHALL surface an inline ★ promote-to-manual-bookmark affordance

When the player has submitted an answer (regardless of correct or wrong) and the answer-feedback region is visible (explanation + 「下一題」 enabled), `QuizModal` SHALL render an inline ★ toggle button within or immediately adjacent to the answer-feedback region. The toggle SHALL reflect the current `bookmarks` Dexie store membership for `currentQuestion.id`: filled ★ if a bookmark row exists, outline ☆ otherwise. Clicking the toggle SHALL invoke the same add/remove logic defined in `question-bookmarks` spec (synchronous Dexie write + debounced cloud push when authenticated). The toggle SHALL be additive to any pre-existing top-of-modal bookmark toggle (if present); both SHALL share the same underlying state. The toggle SHALL include a short label such as 「加入收藏」 / 「已收藏」 in Traditional Chinese to make its purpose clear, distinguishing it visually from the corner / icon-only top toggle.

The inline ★ affordance SHALL be visually prominent on wrong answers (the primary use case is "I answered wrong → want to remember to revisit even after I get it right next time") but SHALL ALSO render on correct answers (player may still want to bookmark for future reference).

The inline ★ SHALL NOT interact with the wrong-answer derived list — that list is auto-managed by the correct/wrong answer requirements above (driven by `questionHistory.lastResult`). The inline ★ is purely a manual-bookmark control.

#### Scenario: Inline ★ renders on wrong-answer feedback

- **GIVEN** the player answers question `Q_Y` incorrectly and the explanation is now revealed
- **WHEN** the answer-feedback region renders
- **THEN** an inline ★ toggle SHALL be visible in or adjacent to the feedback region
- **AND** the toggle SHALL show outline ☆ if no `bookmarks` row exists for Q_Y, or filled ★ if it exists
- **AND** the toggle SHALL include a Chinese label indicating its purpose (e.g., 「加入收藏」 or 「已收藏」)

#### Scenario: Inline ★ click adds bookmark synchronously

- **GIVEN** the player just answered `Q_Y` wrong and no `bookmarks` row exists for Q_Y
- **WHEN** the player clicks the inline ★ toggle
- **THEN** a new `bookmarks` row SHALL exist with `questionId = Q_Y.id` and `addedAt = Date.now()`
- **AND** the toggle SHALL re-render with filled ★
- **AND** the question SHALL now appear in both the 「手動收藏」 tab and the 「錯題」 tab of `/bookmarks`

#### Scenario: Inline ★ also renders on correct-answer feedback

- **GIVEN** the player answers question `Q_Z` correctly and the explanation is revealed
- **WHEN** the answer-feedback region renders
- **THEN** the inline ★ toggle SHALL still be visible (not only on wrong answers)
- **AND** clicking it SHALL toggle the `bookmarks` row identically

#### Scenario: Inline ★ and top-of-modal bookmark toggle share state

- **GIVEN** `QuizModal` displays question Q_Y with no bookmark
- **AND** both a top-of-modal bookmark toggle (existing) and an inline ★ (new, in feedback region) are rendered
- **WHEN** the player clicks either toggle
- **THEN** both toggles SHALL update to the new state (filled ★ if just bookmarked) on the next render
- **AND** exactly one `bookmarks` row SHALL exist for Q_Y (no duplicate write)

### Requirement: HomePage SHALL render a two-page chevron-paginated year-filter chip group

The HomePage SHALL render a `.filter-bar` instance (sharing the visual language defined by `Better screeners for roster and training screens`) above the 14 RecruitmentBanner grid, containing a 「年份」 group whose chips represent the 10 民國 years 106 through 115. Chips SHALL be paginated into two pages with exactly 5 chips each:

- **Page 1**: 115, 114, 113, 112, 111 (in this left-to-right order)
- **Page 2**: 110, 109, 108, 107, 106 (in this left-to-right order)

The bar SHALL render a pager control immediately after the chip group consisting of:

1. A 「‹」 previous-page button (`role=button`, `aria-label="上一頁"`)
2. An indicator span showing `1 / 2` or `2 / 2` reflecting current page (1-indexed)
3. A 「›」 next-page button (`role=button`, `aria-label="下一頁"`)

The pager buttons SHALL disable (with `aria-disabled="true"` and visibly reduced opacity) at the page extremes: 「‹」 disabled on Page 1, 「›」 disabled on Page 2. No wrap-around navigation. Page index SHALL NOT persist across HomePage mounts — every HomePage navigation SHALL initialize to Page 1 (近 5 年).

Each year chip SHALL be a `<button>` with `className="filter-chip"`, `aria-pressed` reflecting its membership in the active year-filter set, and `onClick` that toggles year membership (add if absent, remove if present). A 「全部」 reset chip SHALL precede the 10 year chips and SHALL be `aria-pressed={yearFilter.length === 10 || yearFilter.length === 0}`; clicking 「全部」 SHALL select all 10 years (the chip group's "everything is selected" state — semantically identical to the empty / default state per Requirement below).

The active filter set SHALL be sourced via `useLiveQuery` from `getYearFilter()` (Dexie `meta` KV); when the row is absent or its value array is empty, the effective filter SHALL be 「全選 10 年」 (per the default requirement below). Toggle actions SHALL write the new filter array back to Dexie via `setYearFilter(years: number[])` immediately (no debounce).

A 「目前 N 個年份」counter SHALL render at the right edge of the filter bar (mirroring PR #3 `.filter-bar__count`) showing the count of active years (e.g. `5 / 10 年`).

#### Scenario: Initial HomePage render shows year filter bar with all chips active

- **GIVEN** the player opens HomePage on a fresh save with no `meta['quiz.yearFilter']` row
- **WHEN** HomePage finishes rendering
- **THEN** the year filter bar SHALL be visible above the banner grid
- **AND** Page 1 SHALL be active (chips for 115, 114, 113, 112, 111 visible)
- **AND** all 10 year chips (across both pages) SHALL render with `aria-pressed="true"`
- **AND** the 「全部」 chip SHALL render with `aria-pressed="true"`
- **AND** the 「‹」 button SHALL be `aria-disabled="true"` and the 「›」 button enabled
- **AND** the indicator SHALL display `1 / 2`
- **AND** the counter SHALL display `10 / 10 年`

#### Scenario: Click chevron right switches to Page 2

- **GIVEN** the year filter bar is on Page 1
- **WHEN** the player clicks the 「›」 button
- **THEN** Page 1 chips SHALL unmount and Page 2 chips (110, 109, 108, 107, 106) SHALL render in left-to-right order
- **AND** the indicator SHALL display `2 / 2`
- **AND** the 「›」 button SHALL become `aria-disabled="true"` and 「‹」 SHALL be enabled
- **AND** the active year-filter state SHALL NOT change (chips switching is purely visual)

#### Scenario: Click year chip toggles membership and persists to Dexie

- **GIVEN** the year filter is `{106..115}` (all selected) and Page 1 is showing
- **WHEN** the player clicks the `113` chip
- **THEN** the `113` chip SHALL switch to `aria-pressed="false"`
- **AND** `meta['quiz.yearFilter']` SHALL be persisted as `[115, 114, 112, 111, 110, 109, 108, 107, 106]` (order may vary; membership is what matters)
- **AND** the counter SHALL update to `9 / 10 年`
- **AND** the 「全部」 chip SHALL switch to `aria-pressed="false"`

#### Scenario: Click 「全部」 reset chip restores all 10 years

- **GIVEN** the year filter has fewer than 10 years selected
- **WHEN** the player clicks the 「全部」 chip
- **THEN** all 10 year chips (across both pages) SHALL render with `aria-pressed="true"`
- **AND** `meta['quiz.yearFilter']` SHALL be persisted as an array containing all 10 years
- **AND** the counter SHALL display `10 / 10 年`

#### Scenario: Page index resets to 1 on HomePage remount

- **GIVEN** the player navigated chevron to Page 2 and then routed away from HomePage
- **WHEN** the player returns to HomePage
- **THEN** the year filter bar SHALL re-initialize to Page 1
- **AND** the active year-filter set SHALL remain whatever was persisted in Dexie

### Requirement: Year-filter preference SHALL persist to Dexie `meta` table with all-selected default semantics

The year-filter preference SHALL be stored in the existing Dexie `meta` table under key `quiz.yearFilter`, with value type `number[]` (an array of 民國 years in the range `106..115` inclusive). A new service module `services/year-filter.ts` SHALL expose:

- `async function getYearFilter(): Promise<number[] | null>` — returns the persisted array, or `null` when the row is absent
- `async function setYearFilter(years: number[]): Promise<void>` — writes the array (idempotent put)
- `function effectiveYearSet(persisted: number[] | null): Set<number>` — derives the effective filter Set from persisted state, returning `Set([106..115])` when input is `null` OR when input is an empty array
- `async function effectivePoolSize(subjectId: SubjectId, yearFilter: Set<number>): Promise<number>` — counts playable questions in the subject pool whose `meta.year` is in `yearFilter`

The persisted value SHALL NOT participate in cloud sync (R2 or Supabase bundles) — it is a per-device UI preference, mirroring the precedent set by `quiz.companionDoctorId`. The Dexie schema SHALL bump to v13 to mark the version that introduces this key; no upgrade hook is required (additive KV row).

The default semantics — `null` AND `[]` BOTH map to 「全選 10 年」 — SHALL be enforced exclusively in `effectiveYearSet`, so every caller (HomePage chips, picker plumbing, 0-題 gate) reads consistent behavior.

#### Scenario: First read on fresh save returns null and effectively means all years

- **GIVEN** a save with no `meta['quiz.yearFilter']` row
- **WHEN** `getYearFilter()` is called
- **THEN** the returned value SHALL be `null`
- **AND** `effectiveYearSet(null)` SHALL equal `Set([106, 107, 108, 109, 110, 111, 112, 113, 114, 115])`

#### Scenario: Empty array persisted treated identically to null

- **GIVEN** a save where `meta['quiz.yearFilter']` was previously written as `[]`
- **WHEN** `effectiveYearSet([])` is called
- **THEN** the returned Set SHALL equal `Set([106, 107, 108, 109, 110, 111, 112, 113, 114, 115])`

#### Scenario: setYearFilter writes idempotently

- **GIVEN** `meta['quiz.yearFilter']` does not exist
- **WHEN** `setYearFilter([115, 114, 113])` is called
- **THEN** `getYearFilter()` SHALL return `[115, 114, 113]` (or an equivalent permutation; membership is what matters)
- **AND** a subsequent `setYearFilter([113, 114, 115])` (same membership) SHALL be a no-op-effectively (same row contents post-write)

#### Scenario: Schema bumps to v13 without data loss

- **GIVEN** a player at Dexie schema v12 with existing hospital data
- **WHEN** the app boots after the v13 deploy
- **THEN** the Dexie open SHALL succeed
- **AND** all v12 data (doctors, rooms, gameCounters, etc.) SHALL be preserved untouched
- **AND** `meta` table SHALL be writable for the new `quiz.yearFilter` key

### Requirement: Random-pool picker SHALL honor the optional year-filter parameter

The `pickRandomQuestion(subjectId, seenIds, opts?)` function in `apps/medexam2-hospital-tw/src/lib/quiz.ts` SHALL accept an optional `opts.yearFilter?: Set<number>`. When `opts.yearFilter` is provided AND its `.size > 0` AND its `.size < 10`, the picker SHALL filter the per-subject pool to only questions whose `Question.meta.year ∈ opts.yearFilter` before random selection. When `opts.yearFilter` is `undefined` OR `opts.yearFilter.size === 0` OR `opts.yearFilter.size === 10` (all years selected), the picker SHALL operate on the full per-subject pool (no-op filter).

Likewise, `loadSubjectQuestionIds(subjectId, opts?)` SHALL accept and honor `opts.yearFilter` with identical semantics, returning the filtered id list.

The re-roll-up-to-3-times-on-seen-collision behavior (per existing `Quiz session SHALL be continuous single-question with no batch boundary` scenario) SHALL apply over the year-filtered sub-pool, not the original pool.

When the year-filtered sub-pool is empty (i.e. no question in the subject matches the year filter), the picker SHALL return `null` (the existing null-return contract for unknown subjects also covers this case).

#### Scenario: Picker returns only questions in active year filter

- **GIVEN** the 外科 pool contains 640 questions across years 106-115 (~64 per year)
- **AND** `opts.yearFilter = Set([115, 114, 113])`
- **WHEN** `pickRandomQuestion('外科', new Set(), { yearFilter })` is called 100 times
- **THEN** every returned question's `meta.year` SHALL be in `{115, 114, 113}`
- **AND** no question with `meta.year ∈ {106..112}` SHALL be returned

#### Scenario: Picker returns null when year filter intersects subject pool to empty

- **GIVEN** a (hypothetical) subject `X` whose pool contains only questions from year 107
- **AND** `opts.yearFilter = Set([115])`
- **WHEN** `pickRandomQuestion('X', new Set(), { yearFilter })` is called
- **THEN** the return value SHALL be `null`

#### Scenario: Undefined / full-selection / empty filter is treated as no-op

- **GIVEN** the 內科 pool contains 640 questions across years 106-115
- **WHEN** `pickRandomQuestion('內科', new Set())` is called (no opts)
- **AND** `pickRandomQuestion('內科', new Set(), { yearFilter: new Set() })` is called
- **AND** `pickRandomQuestion('內科', new Set(), { yearFilter: new Set([106,107,108,109,110,111,112,113,114,115]) })` is called
- **THEN** all three calls SHALL draw from the full 640-question pool with equal probability

### Requirement: QuizModal SHALL thread year-filter preference to picker calls and gate empty pools

The `QuizModal` component SHALL subscribe to the year-filter preference via `useLiveQuery(() => getYearFilter())` and pass `effectiveYearSet(persisted)` into every picker call: `pickRandomQuestion(subjectId, seenIds, { yearFilter })` and `loadSubjectQuestionIds(subjectId, { yearFilter })`. The due-first picker delegated to `getNextDueCardForSubject` SHALL also receive the year filter per `hospital-srs` capability.

When the picker returns `null` (subject's year-filtered pool is empty) at any point during the modal session, the modal SHALL:

- Disable the option buttons (A/B/C/D) and the 「下一題」 button
- Replace the question stem region with the message `「此組合 0 題，請放寬篩選或切換科目」`
- Leave the subject dropdown enabled so the player can pivot to a subject whose year-filtered pool is non-empty
- Leave the close (X) button enabled

The mid-session toggling of year chips on HomePage (if HomePage and QuizModal are both mounted, which is the current overlay pattern) SHALL be observed by the QuizModal via the `useLiveQuery` subscription, causing the modal to re-pick or fall into the 0-題 fallback state on the next render cycle.

#### Scenario: Modal opens with year filter applied to first question

- **GIVEN** `meta['quiz.yearFilter']` is `[115, 114]`
- **AND** the player opens QuizModal from the 內科 banner
- **WHEN** the modal renders the first question
- **THEN** the question's `meta.year` SHALL be either 115 or 114
- **AND** never any other year

#### Scenario: Mid-session year filter narrow to 0 displays fallback message

- **GIVEN** QuizModal is open on a subject `X` with `yearFilter = Set([115])` and pool size 64
- **AND** the player has answered all 64 distinct 115-year questions for subject `X` this session (seenIds = 64)
- **AND** the player clicks 「下一題」, the picker exhausts re-rolls and the existing pool-exhausted toast fires
- **THEN** subsequent behavior is per existing `pool-exhausted toast` requirement (questions still served from same pool with repeats), NOT the 0-題 fallback (which only triggers when filter narrows the pool itself to 0)

#### Scenario: Empty filter result mid-session disables next button and shows message

- **GIVEN** QuizModal is open for 內科 and the year filter is currently `Set([115, 114])` with playable pool size > 0
- **WHEN** the player switches the subject dropdown to a (hypothetical) subject `Y` whose year-filtered pool size is 0
- **THEN** the modal SHALL display `「此組合 0 題，請放寬篩選或切換科目」` in the question region
- **AND** the option buttons SHALL be disabled
- **AND** the 「下一題」 button SHALL be disabled
- **AND** the subject dropdown SHALL remain interactive

### Requirement: HomePage banner 「📚 學習」 button SHALL disable when year-filtered pool is 0 for its subject

Each `RecruitmentBanner`'s 「📚 學習」 button SHALL be disabled when `effectivePoolSize(banner.subjectId, effectiveYearSet(persisted)) === 0`. When disabled:

- The button SHALL render with `disabled` attribute and visually-muted styling
- Hover/focus tooltip SHALL display `此組合 0 題，請放寬年份篩選`
- The banner SHALL also display an inline small-text caption directly below the button: `📷 此組合 0 題，請放寬年份篩選` (mirrors the `.quiz-modal__image-missing` muted appearance for visual consistency)

The 「🎫 招募」 button on the same banner SHALL NOT be affected by this requirement (招募 is gacha, not quiz; year filter is irrelevant to recruitment).

When the year-filter preference changes via the HomePage filter bar (or any other channel), each banner's button state SHALL re-evaluate within one render cycle via the existing `useLiveQuery` reactivity.

#### Scenario: All-years selected leaves 學習 button enabled

- **GIVEN** `meta['quiz.yearFilter']` is `null` (default = 全選 10 年)
- **WHEN** HomePage renders
- **THEN** every banner's 「📚 學習」 button SHALL be enabled (assuming the subject's full pool > 0, which is always true in production)
- **AND** no `0 題` inline caption SHALL render

#### Scenario: Narrow filter to 1 year and 1 subject results in disabled button + caption

- **GIVEN** the player sets year filter to `[115]` only
- **AND** a (hypothetical) subject whose 115-year pool is 0 (corpus reality: 115 has only 320 questions but each subject still has > 0 — this scenario is defensive against future corpus drift)
- **WHEN** HomePage re-renders after the filter change
- **THEN** that subject's banner 「📚 學習」 button SHALL render with `disabled` attribute
- **AND** the caption `此組合 0 題，請放寬年份篩選` SHALL render below the button
- **AND** the same banner's 「🎫 招募」 button SHALL retain its existing enabled/disabled state per recruitment rules

#### Scenario: Loosening the filter re-enables the button without page reload

- **GIVEN** a banner's 「📚 學習」 button is currently disabled due to 0-題 filter combo
- **WHEN** the player clicks the 「全部」 reset chip on the year filter bar
- **THEN** the same banner's button SHALL re-enable within one render cycle
- **AND** the inline caption SHALL disappear

### Requirement: TrainingPage random picker SHALL honor year-filter preference

The TrainingPage's `pickRandomQuestion` call inside `confirmStartTraining` and the in-battle 「下一題」 flow SHALL pass `{ yearFilter: effectiveYearSet(persisted) }` resolved from the same Dexie `meta['quiz.yearFilter']` key. The training success-rate formula and pity-counter logic SHALL be unchanged by this requirement — only the question source pool SHALL be year-filtered.

When the year-filtered pool for the doctor's `subjectId` is empty, the TrainingPage SHALL display an inline message in the training-modal area: `「目前年份篩選下，{subjectId} 0 題可用，請至首頁放寬篩選」`, and the 「開始進修」 button SHALL be disabled.

#### Scenario: Training pulls from year-filtered pool

- **GIVEN** the player has year filter set to `[115, 114]`
- **AND** the player initiates training for a 外科 doctor
- **WHEN** `pickRandomQuestion('外科', seenIds, { yearFilter: Set([115, 114]) })` resolves
- **THEN** the training question's `meta.year` SHALL be in `{115, 114}`

#### Scenario: Training disabled when year filter empties subject pool

- **GIVEN** a doctor's `subjectId` is `X` and the player has year filter narrowed such that `X`'s pool is empty
- **WHEN** the player attempts to start training for that doctor
- **THEN** the 「開始進修」 button SHALL be disabled
- **AND** the inline message `目前年份篩選下，X 0 題可用，請至首頁放寬篩選` SHALL display

### Requirement: Quiz reading area uses readable typography with per-device pixel mode override

The QuizModal reading area — defined as the question meta row (year-subject ID line), question stem, all answer options, dispute-question banner, explanation block, and edge messages (empty pool / missing image) — SHALL render in a readable CJK body font with subpixel antialiasing enabled by default. The default font stack SHALL be `'Noto Sans TC', system-ui, sans-serif` (the existing `--font-body-cjk` token), with `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` explicitly applied to defeat the body-level `font-smoothing: none` that intentionally pixelates UI chrome.

The system SHALL persist a per-device `ui.fontMode` preference (`'readable' | 'pixel'`) in the Dexie `meta` table with key `ui.fontMode`. When the preference is `'pixel'`, the same reading-area selectors SHALL revert to the pixel font stack (`--font-pixel-cjk`, i.e. Cubic 11) and `font-smoothing: none`. UI chrome outside the reading area (modal headers, buttons, banners, navigation, partner card, subject dropdown label) SHALL remain in pixel font regardless of the preference — the toggle affects reading area only.

A toggle SHALL be exposed in the HelpMenu accordion under a new section「字型偏好（題目 / 選項 / 詳解）」. The toggle SHALL not require sign-in and SHALL not synchronise to cloud storage. The preference SHALL be applied via a `data-font-mode` attribute on `document.body`, which CSS selectors of the form `body[data-font-mode="pixel"] <reading-area-selector>` SHALL target.

#### Scenario: Default readable rendering across browser engines

- **GIVEN** a player on a device with no prior `ui.fontMode` preference written to the Dexie `meta` table
- **AND** the player opens any QuizModal (via banner 「📚 學習」 or SRS due picker)
- **WHEN** the modal renders the question stem, options A–D, and explanation
- **THEN** all four areas SHALL display in Noto Sans TC with subpixel antialiasing active
- **AND** the rendering SHALL be visually consistent between Safari and Chrome (no engine-specific pixelation regression)
- **AND** the modal header, partner card, subject dropdown label, and 下一題 button SHALL remain in Cubic 11 pixel font (UI chrome unaffected)

#### Scenario: Player toggles pixel mode in HelpMenu

- **GIVEN** a player opens HelpMenu → 「字型偏好」 section while a QuizModal is also open in another route
- **WHEN** the player selects the「像素 (Cubic 11)」radio option
- **THEN** the `ui.fontMode` Dexie meta row SHALL be set to `'pixel'`
- **AND** `document.body.dataset.fontMode` SHALL update to `'pixel'` via the App-level live query effect
- **AND** the QuizModal reading area (stem / options / explanation / meta row / disputed banner) SHALL re-render with Cubic 11 + `font-smoothing: none`
- **AND** the UI chrome SHALL remain visually unchanged
- **AND** on next page reload the preference SHALL persist (Dexie meta still holds `'pixel'`)

### Requirement: QuizModal action bar SHALL surface 「太簡單」 and 「我亂猜的」 opt-in buttons in correct-answer state (二階)

When the player has answered a question correctly in `apps/medexam2-hospital-tw`'s QuizModal and the reveal panel is shown, the action bar SHALL render two opt-in buttons alongside the existing 🐞 bug-report and 下一題 affordances:

- **「太簡單」** — visual label with a「✨」 (or equivalent visual cue). On click, invokes the Easy modifier path on the corresponding `questionHistory` row (per `hospital-srs` capability's `Easy modifier path (二階)` requirement). This path ALSO sets `everWrong = false` (per `wrong-answer-list` capability's `everWrong` flag requirement).
- **「我亂猜的」** — visual label with a 「🤔」 (or equivalent visual cue). On click, invokes the Guessed modifier path on the corresponding `questionHistory` row (per `hospital-srs` capability's `Guessed modifier path (二階)` requirement). `everWrong` is NOT modified by this path.

Both buttons SHALL be hidden when the player answered incorrectly. The action bar in the wrong-state SHALL contain only 🐞 + 下一題 (current behavior, unchanged).

Both buttons SHALL be debounced (single click = single application) and SHALL provide visual confirmation feedback after click.

Both buttons SHALL be optional — clicking 下一題 without engaging either modifier proceeds with the default binary correct-path mapping.

The buttons SHALL NOT alter the reward dispatch path (revenue, reputation, affinity, mastery, achievement triggers, leaderboard pushes) — they only modify SRS state and (for 「太簡單」) the `everWrong` flag.

These buttons SHALL be visually distinguished from the inline ★ promote-to-manual-bookmark affordance (per the existing `QuizModal answer-feedback region SHALL surface an inline ★ promote-to-manual-bookmark affordance` requirement), which lives in the explanation region and writes a different Dexie table (`bookmarks`, not `questionHistory`).

The action bar layout SHALL be: 🐞 bug-report, ✨ 「太簡單」, 🤔 「我亂猜的」, 下一題.

#### Scenario: Correct answer reveal shows both opt-in buttons

- **GIVEN** the player answers a question correctly in 二階 QuizModal
- **WHEN** the reveal panel renders
- **THEN** the action bar SHALL display in order: 🐞 bug-report, ✨ 「太簡單」, 🤔 「我亂猜的」, 下一題

#### Scenario: Wrong answer reveal hides opt-in buttons

- **GIVEN** the player answers a question incorrectly in 二階 QuizModal
- **WHEN** the reveal panel renders
- **THEN** the action bar SHALL display ONLY 🐞 bug-report and 下一題

#### Scenario: 「太簡單」 click clears everWrong and applies Easy modifier atomically

- **GIVEN** a `questionHistory[Q]` row with `interval = 7`, `easeFactor = 2.5`, `everWrong = true`, `lastResult = 'wrong'` (player previously got Q wrong)
- **WHEN** the player answers Q correctly AND clicks 「太簡單」
- **THEN** within a single Dexie transaction, the row SHALL update to `interval = 21`, `easeFactor = 3.75`, `everWrong = false`, `lastResult = 'correct'`, `lastAnsweredAt = now`
- **AND** Q SHALL no longer appear in 「歷史曾錯」 sub-view
- **AND** Q SHALL no longer appear in 「目前未答對」 sub-view (already removed since `lastResult` flipped)

#### Scenario: 「我亂猜的」 click resets interval but preserves everWrong

- **GIVEN** a `questionHistory[Q]` row with `interval = 21`, `easeFactor = 3.0`, `everWrong = true`
- **WHEN** the player answers Q correctly AND clicks 「我亂猜的」
- **THEN** the row SHALL update to `interval = 1`, `easeFactor = 3.0` (unchanged), `everWrong = true` (unchanged), `lastResult = 'correct'`, `lastAnsweredAt = now`
- **AND** Q SHALL STILL appear in 「歷史曾錯」 sub-view (with 「✅ 已答對 N 次」 chip)

#### Scenario: Click 「太簡單」 then 下一題 advances and applies modifier

- **GIVEN** the reveal panel is open after a correct answer in 二階
- **WHEN** the player clicks 「太簡單」 then clicks 下一題
- **THEN** the SRS update + `everWrong = false` write SHALL complete in a single transaction
- **AND** the modal SHALL advance to the next question (via existing due-first picker per `hospital-srs` capability)

#### Scenario: Click neither button proceeds with default binary correct path

- **GIVEN** the reveal panel is open after a correct answer
- **WHEN** the player clicks 下一題 without touching either modifier
- **THEN** the row SHALL be updated per the default binary correct path (existing `Binary-input SM-2 review on answer` requirement, now using `[3, 7]` first-interval seeds)
- **AND** `everWrong` SHALL be untouched

#### Scenario: 「我亂猜的」 click preserves reward dispatch

- **GIVEN** a correct answer in 二階 with partner specialty match would normally grant revenue R + reputation +Δ + affinity to the partner doctor
- **WHEN** the player clicks 「我亂猜的」
- **THEN** the same revenue R + reputation +Δ + affinity SHALL be dispatched
- **AND** achievement counters SHALL update identically to the default correct path
- **AND** leaderboard push SHALL fire on the next sync engine `onPushComplete` callback as usual

#### Scenario: 「太簡單」 in 二階 keeps reward dispatch intact

- **GIVEN** a correct answer in 二階 with partner specialty match would normally grant revenue R + reputation +Δ
- **WHEN** the player clicks 「太簡單」
- **THEN** the same revenue R + reputation +Δ SHALL be dispatched (no penalty for graduating the question)
- **AND** affinity / mastery / achievement counters SHALL update identically

### Requirement: QuizModal SHALL support number-key choice selection during question phase

While the modal is in question phase (no answer submitted yet), the user SHALL be able to press number keys `1`, `2`, `3`, `4` to highlight choices A, B, C, D respectively. Highlighting SHALL be re-selectable (pressing a different number key replaces the highlight). Pressing `Enter` SHALL submit the currently highlighted choice. Number keys `5`–`9` and `0` SHALL be no-ops (no error, no preventDefault).

#### Scenario: Press number key highlights matching choice

- **GIVEN** the QuizModal is open in question phase with 4 choices A/B/C/D and none selected
- **WHEN** the player presses `2`
- **THEN** choice B SHALL show the highlighted (pre-submit) visual state
- **AND** the other choices SHALL NOT be highlighted

#### Scenario: Press different number key replaces selection

- **GIVEN** the QuizModal is in question phase with choice B highlighted
- **WHEN** the player presses `3`
- **THEN** choice C SHALL become highlighted
- **AND** choice B SHALL no longer be highlighted

#### Scenario: Enter submits highlighted choice

- **GIVEN** the QuizModal is in question phase with choice C highlighted
- **WHEN** the player presses `Enter`
- **THEN** the modal SHALL transition to answered phase using choice C as the submitted answer
- **AND** the submission SHALL be identical to clicking choice C with the mouse

#### Scenario: Enter without highlight is no-op

- **GIVEN** the QuizModal is in question phase with no choice highlighted
- **WHEN** the player presses `Enter`
- **THEN** nothing SHALL happen (no submission, no error)

#### Scenario: Out-of-range number key is no-op

- **GIVEN** the QuizModal is in question phase
- **WHEN** the player presses `5` or `0`
- **THEN** the modal state SHALL be unchanged
- **AND** the browser's default keydown behavior SHALL NOT be prevented

### Requirement: QuizModal SHALL support number-key modifier toggles during answered phase

After answer submission, the user SHALL be able to press `1` to toggle ⭐ bookmark, `2` to toggle ✨ 太簡單, `3` to toggle 🤔 我亂猜的, and `Enter` to advance to the next question. Each number key SHALL act as a toggle (re-pressing reverses the state, identical to clicking the same button twice). Modifiers SHALL NOT auto-advance to the next question; the player MUST press `Enter` (or click 下一題) to proceed.

#### Scenario: Press 1 toggles bookmark on

- **GIVEN** the QuizModal is in answered phase with bookmark currently off
- **WHEN** the player presses `1`
- **THEN** ⭐ bookmark SHALL be persisted as on for the current question
- **AND** the bookmark button visual SHALL reflect the on state

#### Scenario: Press 1 again toggles bookmark off

- **GIVEN** the QuizModal is in answered phase with bookmark currently on
- **WHEN** the player presses `1`
- **THEN** ⭐ bookmark SHALL be persisted as off for the current question

#### Scenario: Press 2 toggles 太簡單 SRS modifier

- **GIVEN** the QuizModal is in answered phase with the answer correct and 太簡單 not yet applied
- **WHEN** the player presses `2`
- **THEN** the SRS card SHALL be updated via `reviewCardEasy/Binary` semantics (ease ×1.5, interval ×3, `everWrong = false`)
- **AND** the visual state of the ✨ 太簡單 button SHALL reflect the applied state

#### Scenario: Press 3 toggles 我亂猜的 SRS modifier

- **GIVEN** the QuizModal is in answered phase with the answer correct and 我亂猜的 not yet applied
- **WHEN** the player presses `3`
- **THEN** the SRS card SHALL be updated via `reviewCardGuessed/Binary` semantics (interval = 1, ease unchanged)

#### Scenario: Press 2 again deselects 太簡單 (revert to default SRS schedule)

- **GIVEN** the QuizModal is in answered phase with ✨ 太簡單 currently active (player pressed `2` earlier this reveal)
- **WHEN** the player presses `2` again
- **THEN** the SRS row SHALL be restored to the snapshot captured immediately after the default-path `recordCorrectAnswer` commit (interval / easeFactor / nextDueAt / everWrong / lastAnsweredAt all reverted)
- **AND** the activeQuality SHALL become `null`
- **AND** the ✨ 太簡單 button's `is-active` visual state SHALL clear

#### Scenario: Press 3 again deselects 我亂猜的 (revert to default SRS schedule)

- **GIVEN** the QuizModal is in answered phase with 🤔 我亂猜的 currently active
- **WHEN** the player presses `3` again
- **THEN** the SRS row SHALL be restored to the default-path snapshot
- **AND** the activeQuality SHALL become `null`

#### Scenario: Switch between modifiers replaces (NOT toggle off)

- **GIVEN** the QuizModal is in answered phase with ✨ 太簡單 currently active
- **WHEN** the player presses `3`
- **THEN** the SRS row SHALL be updated via 我亂猜的 semantics (replacing the 太簡單 write — uses pre-answer `prevSrsRef` baseline, not stacked on top of 太簡單)
- **AND** the activeQuality SHALL become `'guessed'` (not `null`)

#### Scenario: Enter advances to next question

- **GIVEN** the QuizModal is in answered phase with explanation visible
- **WHEN** the player presses `Enter`
- **THEN** the modal SHALL advance to the next question
- **AND** the action SHALL be identical to clicking the 下一題 button

#### Scenario: Modifier keys do not auto-advance

- **GIVEN** the QuizModal is in answered phase
- **WHEN** the player presses `1` then `2`
- **THEN** bookmark SHALL be toggled and 太簡單 SHALL be toggled
- **AND** the modal SHALL remain on the current question (no advance)

### Requirement: QuizModal SHALL support keyboard scrolling within the modal body

The user SHALL be able to scroll the modal body content via `Space` (page-down), `Shift+Space` (page-up), `↓` / `↑` arrow keys (small step ~40px), `Home` (jump to top), and `End` (jump to bottom). Scroll keys SHALL work in both question phase and answered phase. `Space` SHALL NOT trigger an accidental click on any focused button (the modal root takes focus on open, not any button).

#### Scenario: Space scrolls modal body down by ~80% viewport

- **GIVEN** the QuizModal is open and the modal body has scrollable overflow
- **WHEN** the player presses `Space`
- **THEN** the modal body SHALL scroll down by approximately 80% of viewport height with smooth behavior
- **AND** the browser's default page-scroll behavior SHALL NOT scroll the underlying page

#### Scenario: Shift+Space scrolls modal body up

- **GIVEN** the QuizModal body is scrolled mid-content
- **WHEN** the player presses `Shift+Space`
- **THEN** the modal body SHALL scroll up by approximately 80% of viewport height

#### Scenario: Arrow keys micro-scroll

- **WHEN** the player presses `↓`
- **THEN** the modal body SHALL scroll down by approximately 40px

#### Scenario: Home jumps to modal top

- **GIVEN** the QuizModal body is scrolled to the middle
- **WHEN** the player presses `Home`
- **THEN** the modal body SHALL scroll to the top

#### Scenario: End jumps to modal bottom

- **WHEN** the player presses `End`
- **THEN** the modal body SHALL scroll to the bottom

#### Scenario: Space does not click any button while modal is open

- **GIVEN** the QuizModal is open with no button focused
- **WHEN** the player presses `Space`
- **THEN** the modal body SHALL scroll (no button click triggered)
- **AND** no answer SHALL be submitted, no modifier toggled, and no advance triggered

### Requirement: QuizModal SHALL skip hotkey handling when focus is inside an input or textarea

While focus is inside an `<input>` or `<textarea>` element (including the inline 🐞 bug report sheet's input fields), all QuizModal hotkeys (number keys, Enter, Space, arrows, Home, End) SHALL be ignored and pass through to the focused element's native behavior.

#### Scenario: Typing 1 inside bug report textarea does not toggle bookmark

- **GIVEN** the QuizModal is in answered phase
- **AND** the 🐞 bug report sheet is expanded with the textarea focused
- **WHEN** the player types the character `1` into the textarea
- **THEN** the character `1` SHALL be inserted into the textarea
- **AND** the ⭐ bookmark state SHALL NOT change

#### Scenario: Pressing Enter inside textarea does not advance

- **GIVEN** the 🐞 bug report textarea is focused with text typed
- **WHEN** the player presses `Enter`
- **THEN** a newline SHALL be inserted into the textarea (textarea native behavior)
- **AND** the QuizModal SHALL NOT advance to the next question

#### Scenario: Pressing Space inside input does not scroll

- **GIVEN** an `<input>` element inside the modal (e.g. bug report target picker free-text) is focused
- **WHEN** the player presses `Space`
- **THEN** a space character SHALL be inserted into the input
- **AND** the modal body SHALL NOT scroll

### Requirement: QuizModal SHALL render keyboard-shortcut visual hints on desktop only

Each choice button and each modifier button SHALL render a subscript number badge at the bottom-left corner indicating its keyboard shortcut. The badge SHALL be visible only on devices that support fine-pointer hover (desktop / laptop with mouse or trackpad). On touch-only devices, the badge SHALL be hidden via CSS media query gating.

#### Scenario: Desktop browser shows badges

- **GIVEN** the QuizModal is open in a desktop browser environment matching `@media (hover: hover) and (pointer: fine)`
- **WHEN** the question is rendered
- **THEN** each of the 4 choice buttons SHALL display a ₁, ₂, ₃, ₄ badge at its bottom-left

#### Scenario: Touch device hides badges

- **GIVEN** the QuizModal is open on a touch-only device (e.g. iPhone Safari, Android Chrome) where the hover media query does not match
- **WHEN** the question is rendered
- **THEN** no hotkey badges SHALL be visible on choice or modifier buttons

#### Scenario: Answered phase shows 3 modifier badges

- **GIVEN** the QuizModal is in answered phase on a desktop browser
- **WHEN** the modifier button row is rendered
- **THEN** the ⭐ bookmark button SHALL display a ₁ badge
- **AND** the ✨ 太簡單 button SHALL display a ₂ badge
- **AND** the 🤔 我亂猜的 button SHALL display a ₃ badge
- **AND** the 下一題 button SHALL display a small `↵` (Enter) hint (not a number badge)

### Requirement: QuizModal SHALL manage focus to enable hotkeys reliably

When the QuizModal opens, the modal root container SHALL take focus immediately so keyboard events reach the listener regardless of where focus was on the parent page. No interactive button SHALL be auto-focused on open (preventing Space-key accidental clicks). The modal SHALL declare `aria-keyshortcuts` on each hotkey-bound button for screen reader announcement.

#### Scenario: Modal root takes focus on open

- **GIVEN** the player clicks the 📚 學習 button on the HomePage
- **WHEN** the QuizModal opens
- **THEN** focus SHALL move to the modal root container `<div role="dialog" tabIndex={-1}>`
- **AND** the hotkey listener SHALL be active immediately

#### Scenario: No button is auto-focused on open

- **GIVEN** the QuizModal has just opened
- **WHEN** focus state is inspected
- **THEN** no `<button>` element inside the modal SHALL have native focus
- **AND** pressing `Space` SHALL scroll the modal body (not click any button)

#### Scenario: aria-keyshortcuts attributes are present

- **WHEN** the QuizModal is open in answered phase
- **THEN** the ⭐ bookmark button SHALL declare `aria-keyshortcuts="1"`
- **AND** the ✨ 太簡單 button SHALL declare `aria-keyshortcuts="2"`
- **AND** the 🤔 我亂猜的 button SHALL declare `aria-keyshortcuts="3"`
- **AND** the 下一題 button SHALL declare `aria-keyshortcuts="Enter"`
- **AND** each choice button (question phase) SHALL declare `aria-keyshortcuts="1"` / `"2"` / `"3"` / `"4"` matching A/B/C/D

### Requirement: QuizModal SHALL guard against phase-transition keypress race

When the modal transitions from question phase to answered phase via `Enter` submission, the listener SHALL apply a ≥150ms cooldown before the next `Enter` keypress is honored. This SHALL prevent a held-down `Enter` key from inadvertently advancing past the explanation screen immediately after submission.

#### Scenario: Hold Enter does not skip explanation

- **GIVEN** the QuizModal is in question phase with choice B highlighted
- **WHEN** the player holds down `Enter` for 500ms
- **THEN** the first `Enter` keydown SHALL submit choice B (phase becomes answered)
- **AND** subsequent `Enter` keydown events within 150ms of the phase change SHALL be ignored
- **AND** the modal SHALL remain on the explanation screen, not advance to the next question

#### Scenario: Enter after cooldown advances normally

- **GIVEN** the QuizModal entered answered phase 200ms ago
- **WHEN** the player presses `Enter`
- **THEN** the modal SHALL advance to the next question (cooldown elapsed)

### Requirement: HomePage SHALL announce keyboard hotkey availability via dismissible banner

The HomePage SHALL render a `QuizHotkeysAnnouncementBanner` above the existing `LeaderboardPromoBanner` that briefly lists the new hotkey bindings (1-4 select / Enter submit / 1-3 modifier / Space scroll) and points users at the HelpMenu「⌨️ 鍵盤快捷鍵」section for the full list. The banner SHALL be dismissible per-device via a ✕ button (localStorage key `quiz-hotkeys-banner-dismissed-v1`). Once dismissed, the banner SHALL stay hidden across subsequent reloads on that device. The banner SHALL only render on devices matching `@media (hover: hover) and (pointer: fine)` — touch devices hide it entirely since the underlying feature requires a physical keyboard.

#### Scenario: Banner visible on first homepage load (desktop, not previously dismissed)

- **GIVEN** the HomePage mounts on a desktop browser
- **AND** `localStorage.getItem('quiz-hotkeys-banner-dismissed-v1')` returns `null`
- **WHEN** the page renders
- **THEN** the banner SHALL be visible above `LeaderboardPromoBanner`
- **AND** the banner SHALL contain at least one `<kbd>` element labelled with a hotkey

#### Scenario: ✕ button dismisses banner and persists across reload

- **GIVEN** the banner is visible
- **WHEN** the player clicks the ✕ button
- **THEN** the banner SHALL be removed from the DOM immediately
- **AND** `localStorage.getItem('quiz-hotkeys-banner-dismissed-v1')` SHALL return `'true'`

#### Scenario: Dismissed banner stays hidden after reload

- **GIVEN** the banner was previously dismissed on this device
- **WHEN** the HomePage reloads
- **THEN** the banner SHALL NOT render

#### Scenario: Banner hidden on touch-only devices

- **GIVEN** the HomePage renders on a touch-only device where the `(hover: hover) and (pointer: fine)` media query does NOT match
- **WHEN** the page renders
- **THEN** the banner SHALL NOT be visible (via CSS `display: none` outside the gate)
- **AND** no reservation of vertical space SHALL appear where the banner would have rendered

### Requirement: QuizModal SHALL document keyboard shortcuts in HelpMenu

HelpMenu SHALL include a「⌨️ 鍵盤快捷鍵」section listing all QuizModal hotkeys (question-phase number keys, answered-phase modifiers, scroll keys, Enter behavior). The section SHALL be visible to all players regardless of device (mobile users see docs but no functional hotkeys, matching existing HelpMenu behavior).

#### Scenario: HelpMenu lists keyboard shortcut section

- **GIVEN** the player opens HelpMenu
- **WHEN** the accordion is rendered
- **THEN** there SHALL be a section titled「⌨️ 鍵盤快捷鍵」 (or equivalent localized label)
- **AND** the section SHALL list: `1`-`4` 選 A/B/C/D / `Enter` 送出 / 答題後 `1` 收藏 `2` 太簡單 `3` 亂猜 `Enter` 下一題 / `Space` `Shift+Space` 翻頁 / `↓↑` 微捲 / `Home` `End` 跳頂底
