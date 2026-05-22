## ADDED Requirements

### Requirement: Batch 3 integration coverage

The following 12 二階 medium-density components SHALL import `<EmojiIcon>` from `./EmojiIcon` (or `../components/EmojiIcon` for pages) and use it for every standalone emoji-as-icon JSX position. Emoji in HTML attributes, native browser dialogs (`window.confirm`), `<option>` children, and prose paragraphs SHALL remain as text characters.

- `apps/medexam2-hospital-tw/src/components/SyncStatusChip.tsx`
- `apps/medexam2-hospital-tw/src/components/LeaderboardOptInModal.tsx`
- `apps/medexam2-hospital-tw/src/components/ConflictChooserModal.tsx`
- `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx`
- `apps/medexam2-hospital-tw/src/components/V6MigrationModal.tsx`
- `apps/medexam2-hospital-tw/src/components/QuizBugReportSheet.tsx`
- `apps/medexam2-hospital-tw/src/components/ERConsultDialog.tsx`
- `apps/medexam2-hospital-tw/src/components/AccountSwitchPrompt.tsx`
- `apps/medexam2-hospital-tw/src/pages/Hospital.tsx`
- `apps/medexam2-hospital-tw/src/components/MigrationUploadPrompt.tsx`
- `apps/medexam2-hospital-tw/src/components/AuthButton.tsx`
- `apps/medexam2-hospital-tw/src/components/AssignDoctorModal.tsx`

#### Scenario: Each batch-3 component imports EmojiIcon

- **Given** a component file path from the list above
- **When** `grep -E "import .*EmojiIcon" <path>` runs
- **Then** the result contains at least one matching import line

#### Scenario: Typecheck stays clean after batch 3 swaps

- **Given** all 12 components have been edited
- **When** `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` runs
- **Then** it exits with code 0

#### Scenario: ZWJ sequences gracefully degrade to text fallback

- **Given** an unmapped multi-codepoint emoji like `👨‍⚕️` (`1f468-200d-2695-fe0f`) inside `<EmojiIcon char="👨‍⚕️">`
- **When** the component renders
- **Then** the DOM shows a `<span>` containing the literal `👨‍⚕️` character (text fallback path), not an `<img>`, and the layout does not break
