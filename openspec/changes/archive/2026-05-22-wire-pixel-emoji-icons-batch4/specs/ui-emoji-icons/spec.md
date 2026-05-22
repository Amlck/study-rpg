## ADDED Requirements

### Requirement: Batch 4 integration coverage (mop-up)

The following 7 二階 small components SHALL import `<EmojiIcon>` and use it for every standalone emoji-as-icon JSX position. Components where every emoji is outside the codex pixel-art set (e.g. NicknameField's ✓/✕ validation indicators, DoctorRoster's ✦ match marker) are NOT required to import `<EmojiIcon>` since the fallback path renders identical text.

- `apps/medexam2-hospital-tw/src/components/MigrationBanner.tsx`
- `apps/medexam2-hospital-tw/src/pages/StudySessionPage.tsx`
- `apps/medexam2-hospital-tw/src/pages/DoctorRoster.tsx`
- `apps/medexam2-hospital-tw/src/components/RenameDoctorModal.tsx`
- `apps/medexam2-hospital-tw/src/components/LeaderboardSettingsControls.tsx`
- `apps/medexam2-hospital-tw/src/components/TargetedDrawTutorialOverlay.tsx`
- `apps/medexam2-hospital-tw/src/components/RoomCard.tsx`

#### Scenario: Each batch-4 component imports EmojiIcon

- **Given** a component file path from the list above
- **When** `grep -E "import .*EmojiIcon" <path>` runs
- **Then** the result contains at least one matching import line

#### Scenario: TargetedDrawTutorialOverlay COPY shape includes separated icon

- **Given** the `COPY` const inside `TargetedDrawTutorialOverlay.tsx`
- **When** inspecting its TypeScript type
- **Then** each tier entry has a separate `icon` field (string emoji) alongside `title` (string body without leading emoji), so the render site can compose `<EmojiIcon char={icon} /> {title}` rather than embedding the emoji in the title string

#### Scenario: Typecheck stays clean after batch 4 swaps

- **Given** all 7 components have been edited
- **When** `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` runs
- **Then** it exits with code 0

### Requirement: Final emoji icon coverage milestone

After batch 1-4 are all archived, the medexam2 hospital app SHALL have migrated all standalone emoji-as-icon JSX usage in user-facing components and pages to `<EmojiIcon>`. Remaining bare emoji characters in the codebase SHALL be limited to the following acceptable contexts (verified by audit):

- Code comments
- String literals consumed by `<select><option>` children, `window.confirm()`, `window.prompt()`, `console.log()`, `setMessage()` strings, error message templates
- Prose paragraphs where emoji appears mid-sentence as a textual reference (e.g. "點任一題的 ⭐ 加入收藏")
- HTML attributes (`title=`, `aria-label=`, `alt=`)
- Box-drawing characters in ASCII art (`─` `└` `├` `▼`)
- emoji characters outside the codex pixel-art set (✓ ✕ ✗ ✦ ✨ ⬇ etc. — EmojiIcon would auto-fallback to text, identical visual outcome to bare char)

#### Scenario: User-visible UI chrome covered

- **Given** the medexam2 hospital app post-batch-4 archive
- **When** a user opens any page or modal in the app
- **Then** every standalone emoji used as an icon (button prefix, section header, badge, FAB, list-item marker, status chip) renders as a pixel-art `<img>` or as a graceful text fallback via `<EmojiIcon>`; no naked OS-font emoji appears in those positions
