# ui-emoji-icons

## Purpose

二階 hospital app 用 inline emoji 表達 UI affordance（按鈕、section header、status badge），預設 OS 字型 render 是 cartoon vector 風，跟周邊 doctor sprite / event modal icon / fate card pack art 的 GBA pixel art aesthetic 不相容。本 capability 提供 GBA-style pixel-art emoji icon 套件 + component-level lookup，讓 UI 元素可選擇性把 raw emoji char 換成 codex-generated 64×64 pixel art 視覺、跟周邊 chrome 美術同調，且對未 mapped 的 emoji 保留 OS 字型 fallback（無破壞 graceful degradation）。

## Requirements

### Requirement: Pixel-art emoji icon component

The `<EmojiIcon char="X" size={N} />` React component SHALL render a 64×64 GBA-style pixel-art PNG asset for any Unicode emoji character mapped in the manifest at `apps/medexam2-hospital-tw/src/lib/emoji-icons.ts`; for emoji characters NOT mapped, it SHALL fall back to rendering the original character text in an inline `<span>` so the OS emoji font keeps working (no broken UI for emoji we haven't generated a pixel-art asset for).

#### Scenario: Mapped emoji renders as pixel-art img

- **Given** the manifest maps `'💰'` to filename `'1f4b0.png'`
- **When** `<EmojiIcon char="💰" size={20} />` mounts
- **Then** the DOM produces `<img>` whose `src` ends with `icons/emoji/1f4b0.png`, has `width="20"` and `height="20"`, and inline style includes `image-rendering: pixelated`

#### Scenario: Unmapped emoji falls back to text span

- **Given** the manifest has no entry for `'🦄'` (this character was never sent through the codex pipeline)
- **When** `<EmojiIcon char="🦄" size={20} />` mounts
- **Then** the DOM produces `<span>` containing the literal `🦄`, with `font-size: 20px` inline style, and NO `<img>` element

#### Scenario: VS-16 variation selector normalized before lookup

- **Given** the manifest maps `'⚠'` (bare codepoint U+26A0) to `'26a0.png'`
- **When** `<EmojiIcon char="⚠️" />` mounts where the input includes U+FE0F variation selector after the base character
- **Then** the `normalize()` helper strips U+FE0F and the lookup matches `26a0.png`, rendering the pixel-art img (not the text fallback)

### Requirement: Manifest helper functions

The lookup module at `apps/medexam2-hospital-tw/src/lib/emoji-icons.ts` SHALL expose two pure functions to callers — `emojiIconUrl(emoji)` returning the absolute URL string (using `import.meta.env.BASE_URL` so it works in dev `/study-rpg/hospital/` and prod GitHub Pages base) or `null` if unmapped, and `hasEmojiIcon(emoji)` returning a boolean. The helper SHALL NOT throw on any string input, including empty string or multi-codepoint ZWJ sequences.

#### Scenario: emojiIconUrl returns absolute URL for mapped char

- **Given** the dev server runs with `import.meta.env.BASE_URL === '/study-rpg/hospital/'`
- **When** `emojiIconUrl('💰')` is called
- **Then** it returns the string `/study-rpg/hospital/icons/emoji/1f4b0.png`

#### Scenario: emojiIconUrl returns null for unmapped char

- **Given** the manifest has no entry for `'🦄'`
- **When** `emojiIconUrl('🦄')` is called
- **Then** it returns `null` (allowing callers to branch on the falsy result for fallback rendering)

#### Scenario: hasEmojiIcon predicate matches manifest

- **Given** the manifest maps `'💰'` and does NOT map `'🦄'`
- **When** `hasEmojiIcon('💰')` and `hasEmojiIcon('🦄')` are called
- **Then** they return `true` and `false` respectively

### Requirement: PNG asset coverage and naming convention

The asset bundle at `apps/medexam2-hospital-tw/public/icons/emoji/` SHALL include ≥ 65 PNG files named using the Twemoji codepoint convention (lowercase hex, codepoints joined by `-`, VS-16 stripped, e.g. `1f4b0.png` for U+1F4B0 💰). Each PNG SHALL be a 64×64 transparent-background image limited to ≤ 16 colors plus alpha, sized ≤ 8 KB per file to keep the bundle compact (current measured average ≈ 4 KB).

#### Scenario: Bundle contains the expected asset count

- **Given** the public/icons/emoji/ directory is populated after this change
- **When** `ls apps/medexam2-hospital-tw/public/icons/emoji/*.png | wc -l` runs
- **Then** the count is ≥ 65 (current shipped count is 65 — 64 follow Twemoji codepoint naming convention, plus 1 custom-named `star_outline.png` for hollow ☆ which has no emoji-class Unicode codepoint)

#### Scenario: Filename follows Twemoji codepoint convention

- **Given** an emoji like 💰 with Unicode codepoint U+1F4B0
- **When** the asset is generated and saved
- **Then** the filename is `1f4b0.png` (lowercase hex, no zero-padding, no VS-16 suffix even if source emoji had one)

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
