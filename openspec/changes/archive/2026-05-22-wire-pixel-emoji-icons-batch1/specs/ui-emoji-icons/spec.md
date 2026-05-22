## ADDED Requirements

### Requirement: Batch 1 integration coverage

The following 6 二階 components SHALL import `<EmojiIcon>` from `../components/EmojiIcon` (or `./EmojiIcon` for sibling files) and use it for every standalone emoji-as-icon JSX position — FAB icons, button label prefixes, section header icons, modal title icons, status badges, banner icons. Emoji embedded in prose paragraphs (`<p>{... 💰 ...}`), inside string literals (`setMessage('✓ done')`), or inside `<select><option>` (HTML restriction) SHALL remain as text characters to preserve text flow, line height, and HTML semantics.

- `apps/medexam2-hospital-tw/src/components/EventModal.tsx`
- `apps/medexam2-hospital-tw/src/components/BugReportModal.tsx`
- `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`
- `apps/medexam2-hospital-tw/src/components/RecruitmentBanner.tsx`
- `apps/medexam2-hospital-tw/src/components/RecruitmentResultModal.tsx`
- `apps/medexam2-hospital-tw/src/pages/HomePage.tsx`

#### Scenario: Each batch-1 component imports EmojiIcon

- **Given** a component file path from the list above
- **When** `grep -E "import .*EmojiIcon" <path>` runs
- **Then** the result contains at least one matching import line

#### Scenario: JSX-position emojis swapped, prose-position emojis preserved

- **Given** the change has been applied
- **When** reviewing each component diff
- **Then** every standalone emoji-as-icon JSX position now renders `<EmojiIcon char="..." />` (not bare char), AND every emoji in a string literal / prose paragraph / `<option>` child remains as the original character

#### Scenario: Typecheck stays clean after swap

- **Given** all 6 components have been edited
- **When** `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` runs
- **Then** it exits with code 0 (no TS errors introduced by the swap)
