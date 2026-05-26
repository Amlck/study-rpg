## 1. Hook scaffold + dispatcher

- [x] 1.1 Create `apps/medexam2-hospital-tw/src/lib/use-quiz-hotkeys.ts` with the `useQuizHotkeys` hook signature: takes `{ phase, isOpen, scrollContainerRef, onSelectChoice, onSubmit, onToggleBookmark, onToggleEasy, onToggleGuessed, onAdvance }` callbacks
- [x] 1.2 Implement single `useEffect` keydown listener mounted on `document` with cleanup on unmount or `isOpen` flip
- [x] 1.3 Add input-field guard at handler entry: `if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return`
- [x] 1.4 Implement phase dispatcher branching on `phase === 'asking' | 'answered'`
- [x] 1.5 Implement phase-change cooldown ref (`phaseChangedAt: useRef<number>`) and 150ms guard around `Enter` handling per D5

## 2. Question-phase key bindings

- [x] 2.1 Map `1` / `2` / `3` / `4` → call `onSelectChoice('A' | 'B' | 'C' | 'D')` (re-selectable; no submission)
- [x] 2.2 Map `Enter` → call `onSubmit()` if a choice is currently highlighted, else no-op
- [x] 2.3 Verify `5` / `6` / `7` / `8` / `9` / `0` keys are no-ops (no preventDefault, no error)

## 3. Answered-phase key bindings

- [x] 3.1 Map `1` → call `onToggleBookmark()`
- [x] 3.2 Map `2` → call `onToggleEasy()`
- [x] 3.3 Map `3` → call `onToggleGuessed()`
- [x] 3.4 Map `Enter` → call `onAdvance()` after 150ms phase-cooldown elapsed

## 4. Scroll key bindings (both phases)

- [x] 4.1 Map `Space` (without Shift) → `e.preventDefault()` + `scrollContainerRef.current?.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' })`
- [x] 4.2 Map `Shift+Space` → preventDefault + scrollBy up by ~80% viewport
- [x] 4.3 Map `↓` / `↑` → preventDefault + scrollBy ±40px
- [x] 4.4 Map `Home` / `End` → preventDefault + scroll to top / bottom of `scrollContainerRef`

## 5. QuizModal wiring

- [x] 5.1 Add `modalRef` ref + `tabIndex={-1}` on QuizModal root `<div role="dialog">` and `modalRef.current?.focus()` inside open-side `useEffect`
- [x] 5.2 Add `scrollContainerRef` ref on the modal body scroll container (the existing scrollable wrapper around question + explanation content)
- [x] 5.3 Replace any existing autofocus on the first choice button or 下一題 button (audit before removal — currently no autofocus exists per Explore agent survey)
- [x] 5.4 Wire `useQuizHotkeys` hook with callbacks pointing to existing `handleSelectChoice` / `handleSubmit` / `handleToggleBookmark` / `handleToggleEasy` / `handleToggleGuessed` / `handleAdvance` functions

## 6. Visual badge UI

- [x] 6.1 Add `.quiz-hotkey-badge` CSS class: `position: absolute; left: 6px; bottom: 4px; font-size: 11px; opacity: 0.55; pointer-events: none; font-variant-numeric: subscript;`
- [x] 6.2 Add `@media (hover: hover) and (pointer: fine)` gate showing badges; default `display: none` outside the gate
- [x] 6.3 Wrap each choice button in `position: relative` and render `<span class="quiz-hotkey-badge">₁</span>` etc. at bottom-left
- [x] 6.4 Add `<span class="quiz-hotkey-badge">₁</span>` to ⭐ bookmark button, ₂ to ✨ 太簡單, ₃ to 🤔 我亂猜的
- [x] 6.5 Add a small `↵` Enter hint to 下一題 button (consistent visual treatment with hotkey badges, but using Unicode return arrow)

## 7. A11y attributes

- [x] 7.1 Add `aria-keyshortcuts="1"` / `"2"` / `"3"` / `"4"` to each choice button matching A/B/C/D
- [x] 7.2 Add `aria-keyshortcuts="1"` to ⭐ bookmark, `"2"` to ✨ 太簡單, `"3"` to 🤔 我亂猜的, `"Enter"` to 下一題
- [x] 7.3 Verify modal root `role="dialog"` and `aria-modal="true"` already present (audit existing markup)

## 8. HelpMenu documentation

- [x] 8.1 Add new accordion section titled「⌨️ 鍵盤快捷鍵」 to `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` after the existing 9 sections
- [x] 8.2 List all bindings in two columns or definition list: 題目階段 / 答題後階段 / 捲動 三個 sub-headings
- [x] 8.3 Mention「需桌機 / 平板外接鍵盤；觸控裝置自動隱藏」 as device requirement note

## 8b. Homepage announcement banner

- [x] 8b.1 Create `apps/medexam2-hospital-tw/src/components/QuizHotkeysAnnouncementBanner.tsx` mirroring `DomainMigrationBanner` localStorage-dismiss pattern (key `quiz-hotkeys-banner-dismissed-v1`)
- [x] 8b.2 Mount above `<LeaderboardPromoBanner />` in `apps/medexam2-hospital-tw/src/pages/HomePage.tsx`
- [x] 8b.3 CSS `.quiz-hotkeys-banner` styles with `@media (hover: hover) and (pointer: fine)` gate — desktop-only display, hidden on touch
- [x] 8b.4 Inline `<kbd>` chips visible inside banner copy showing 1-4 / Enter / 1/2/3 / Space / ↓↑ mappings
- [x] 8b.5 ✕ dismiss button with `aria-label="關閉公告"` that persists dismissal across reloads (localStorage)

## 8c. Modifier deselect (toggle off via second click)

- [x] 8c.1 Add `restoreDefaultSrs` helper + `DefaultPathSnapshot` type to `apps/medexam2-hospital-tw/src/lib/mastery.ts`
- [x] 8c.2 Add `defaultPostSrsRef = useRef<DefaultPathSnapshot | null>(null)` to QuizModal state; snapshot questionHistory row immediately after default-path tx commits (only on `wasCorrect`)
- [x] 8c.3 Replace `handleQualityClick` debounce-no-op with deselect branch: when `activeQuality === target`, call `restoreDefaultSrs` + `setActiveQuality(null)`
- [x] 8c.4 Reset `defaultPostSrsRef.current = null` in `handleNext` finally block alongside the existing `prevSrsRef` reset
- [x] 8c.5 Update HelpMenu §srs-modifiers copy: replace 「同一個按鈕連按是 no-op（防誤觸）」 with 「再點同顆會取消、SRS 回到預設排程」

## 9. Tests + manual verification

- [x] 9.1 Add Vitest unit test for `useQuizHotkeys` covering: input-field guard skips, phase dispatch, key mappings, cooldown timing (use vitest fake timers for 150ms test)
- [x] 9.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw test` and confirm all tests pass
- [x] 9.3 Run `pnpm -r typecheck` and confirm no new errors
- [x] 9.4 Chrome MCP preflight: `list_connected_browsers` → if connected, dev server smoke; otherwise prompt user to open extension per chrome_mcp_preflight rule
- [x] 9.5 Chrome MCP smoke — question phase: launch quiz from 📚 學習 button, press `2` → choice B highlight, press `3` → switches to C, press `Enter` → submission
- [x] 9.6 Chrome MCP smoke — answered phase: press `1` → bookmark toggles ⭐ on (verify Dexie row + visual), press `1` again → toggles off, press `2` → 太簡單 applies (verify SRS ease bump), press `Enter` → next question
- [x] 9.7 Chrome MCP smoke — scroll: open a long case-based question (e.g. 內科 心血管), press `Space` → modal body scrolls down, `Shift+Space` → up, `End` → bottom of explanation, `Home` → back to top
- [x] 9.8 Chrome MCP smoke — `<textarea>` guard: open 🐞 bug report sheet, focus textarea, type `1` → character inserted, bookmark NOT toggled
- [x] 9.9 Chrome MCP smoke — Enter cooldown: in question phase, hold `Enter` for 500ms → answer submitted once, modal stays on explanation (not auto-advanced)
- [x] 9.10 RWD probe per chrome_mcp_rwd_probe.md: simulate touch device with class override → verify badges hidden, listener still attached (harmless)

## 10. Doc + ship

- [ ] 10.1 Update `apps/medexam2-hospital-tw/CHANGELOG.md` or root `CHANGELOG.md` (whichever exists) with one-line entry
- [ ] 10.2 Bump `apps/medexam2-hospital-tw/package.json` `version` field (semver patch — this is additive feature, but per project convention check existing bump pattern)
- [ ] 10.3 Run `/verify` for end-to-end check (web app + Chrome MCP per CLAUDE.md vibe-coding rules)
- [ ] 10.4 Commit with message `feat(medexam2): add keyboard hotkeys to QuizModal (1-4 select + Enter / 1-3 modifier + Enter / Space scroll)` — defer to user confirmation per Curator rules
- [ ] 10.5 Open `/opsx:verify` to validate completeness / correctness / coherence
- [ ] 10.6 Owner pushes to track-m2 branch; CF Pages + GH Pages deploys auto-trigger
- [ ] 10.7 Dogfood 1-2 days; if no P1 / P2 bugs reported, run `/opsx:archive` and proceed to open sibling change `add-quiz-number-hotkeys-medexam-tw`
