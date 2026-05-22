## ADDED Requirements

### Requirement: Batch 2 integration coverage

The following 3 二階 page-level components SHALL import `<EmojiIcon>` from `../components/EmojiIcon` and use it for every standalone emoji-as-icon JSX position (h1/h2 titles, tab labels, status chips, modal title icons, badge prefixes). Emoji embedded in prose paragraphs (`<p>... {cost} 💰</p>`), inside HTML attribute values (e.g. `title="退休 — 退還 X 💰"`), and inside string literals SHALL remain as text characters.

- `apps/medexam2-hospital-tw/src/pages/LeaderboardPage.tsx`
- `apps/medexam2-hospital-tw/src/pages/BookmarksPage.tsx`
- `apps/medexam2-hospital-tw/src/pages/TrainingPage.tsx`

#### Scenario: Each batch-2 page imports EmojiIcon

- **Given** a page file path from the list above
- **When** `grep -E "import .*EmojiIcon" <path>` runs
- **Then** the result contains at least one matching import line

#### Scenario: JSX-position emojis swapped, prose / attribute / string-literal preserved

- **Given** the change has been applied
- **When** reviewing each page diff
- **Then** every standalone emoji-as-icon JSX position now renders `<EmojiIcon char="..." />` (not bare char), AND every emoji in a prose paragraph / HTML attribute / string literal remains as the original character

#### Scenario: Typecheck stays clean after batch 2 swaps

- **Given** all 3 pages have been edited
- **When** `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` runs
- **Then** it exits with code 0 (no TS errors introduced by the swap)
