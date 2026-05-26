## ADDED Requirements

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
