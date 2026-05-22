## ADDED Requirements

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
