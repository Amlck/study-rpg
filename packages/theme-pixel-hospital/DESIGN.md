# DESIGN.md — theme-pixel-hospital

> Sibling to root [`DESIGN.md`](../../DESIGN.md) (which scopes to `apps/medexam-tw/`
> + `theme-pixel-medical`). This file documents the 二階 hospital-management
> mode (`apps/medexam2-hospital-tw/` + `@study-rpg/theme-pixel-hospital`).
>
> Engine-wide rules (color palette, image-rendering, font-size scale, no
> gradient / no border-radius / no drop-shadow) inherit from root DESIGN.md —
> they apply here too. This file documents what's **different or load-bearing**
> for hospital mode.

## Typography decision rule (load-bearing)

CSS tokens live in `apps/medexam2-hospital-tw/src/styles.css :root` (not
exported from the theme package — host app owns @font-face self-hosting).

| Token | Use for |
|---|---|
| `--font-pixel-cjk` | UI chrome — heading / button / nav / chip / stat / label |
| `--font-pixel-num` | Numeric stats — 聲望 / 收入 / 等級 (Cubic 11 → VT323 fallback) |
| `--font-pixel-en` | Pure latin debug strings or English-only labels |
| `--font-body-cjk` | Long-form readability — quiz stems, explanations, bookmarks |

**Body default is `--font-pixel-cjk`.** Long-form text opts out via the
explicit class list near the top of `styles.css`:

```css
.quiz-modal__stem,
.quiz-modal__explanation,
.explanation-markdown,
.bookmarks-page__entry-stem,
.bookmarks-page__entry-explanation,
.er-consult__stem,
.er-consult__explanation {
  font-family: var(--font-body-cjk);
}
```

When adding a new component with > 1 sentence of body copy that users read
for ≥ 30 seconds (clinical scenario stems, explanation prose, long-form
journal entries), **add its class to this opt-out list**. Cubic 11 at 11px
is tiring past ~30 seconds for CJK reading.

## DON'T

- ❌ Write `font-family: 'Press Start 2P', 'Noto Sans TC'` directly. `Press Start 2P` has 0 CJK coverage → silently falls back to anti-aliased Noto → pixel aesthetic is lost on every Chinese character. Use `var(--font-pixel-cjk)` instead.
- ❌ Use `--font-pixel-cjk` on long-form text. Cubic 11 11px is for UI chrome.
- ❌ Add new hard-coded `font-family` declarations. Route through a token.
- ❌ Add `border-radius` > 4px or any gradient. Hospital mode mirrors root rules — chunky 2–3px borders, no rounded corners on cards.
- ❌ Use `transition: ease` on hover/active button feedback in NEW components. Prefer `transition: none` (GBA hardware had no easing) or `steps(2)` for chunky stepped animation.

## Hospital-mode visual identity (vs 一階 medical)

| Aspect | 一階 medical | 二階 hospital |
|---|---|---|
| Mood | Cozy「at the study desk」warm reading | Tycoon management — busy hospital floor |
| Frame metaphor | Wooden quest-log / 卷軸 | Hospital signage + dept badges |
| Primary loop UI | Quiz card + boss fight | Multi-dept dashboard + recruitment gacha |
| Hero element | Student sprite (custom variants) | Doctor sprite roster by dept (內科 / 外科 / ...) — see `sprites/` |
| Tonality | Healing / nostalgic | Strategic / management / mild urgency on event modal |
| Common ground | GBA palette, Cubic 11, integer-px, no gradient, `image-rendering: pixelated` | Same |

## Component patterns unique to hospital mode

These have established visual conventions worth preserving:

- **Three-tier hospital badge** (診所 → 區域醫院 → 醫學中心): chunky border + level number + reputation progress bar (no smooth ease — use `transition: width 0.25s steps(8)` if animating)
- **Doctor sprite card**: 192×192 sprite from `sprites/doctor-<dept>-P<tier>[-female].png`; rarity outline via `border-color: var(--rarity-p1..p5)`; name in `--font-pixel-cjk`
- **Recruitment gacha modal**: pull-card flip animation; pity counter chip uses `--font-pixel-num` for the count
- **Event modal** (malpractice / VIP / emergency / audit): icon from `apps/medexam2-hospital-tw/public/events/` (codex-generated GBA pixel art with native transparent bg); border-color tinted by event severity (rose / gold / sky)
- **Fate card pack art**: per-rarity center icon + frame (gemini-generated); see `~/.claude/imports/image_gen_routing.md` for the asset pipeline

## Long-form text opt-out — when to add a class

A class belongs in the opt-out list when **both** conditions hold:

1. Content is ≥ 1 sentence of Chinese prose (not a label / chip / stat)
2. Users are expected to read it for ≥ 30 seconds in a single sitting

Examples that **should** opt out: quiz stems, explanations, journal entries,
bug-report description previews.

Examples that **should NOT** opt out (stay pixel-cjk): dept names, sprite
names, button labels, tooltip one-liners, modal titles, stat numerals,
chip text — even if Chinese — because they're scanned, not read.

## File reference

- Font file (Cubic 11 self-hosted): `apps/medexam2-hospital-tw/public/fonts/Cubic_11.{woff,woff2}`
- @font-face declaration: top of `apps/medexam2-hospital-tw/src/styles.css`
- Token definitions: `:root` in same file
- Doctor sprites: `packages/theme-pixel-hospital/sprites/`
- Sprite generation pipeline: `packages/theme-pixel-hospital/SPRITE_GENERATION.md`

## When to update this file

Update when you:

- Add a new long-form text class (extend opt-out list)
- Introduce a new component pattern that diverges from 一階 conventions
- Change the typography decision rule (e.g. add a third-tier readability token)
- Add a new visual surface that future contributors should learn from

Don't update for:

- Routine new component built on existing tokens
- Bug fixes that don't change conventions
- Sprite additions (those go in SPRITE_GENERATION.md)
