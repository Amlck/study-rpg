# Pixel-art Emoji Icon Set

61 GBA-style pixel-art icons used as inline UI emoji replacements in 二階 (hospital mode).

## Provenance

- Generated 2026-05-22 via OpenAI Codex CLI (`gpt-image-2` / `$imagegen`).
- 7 codex grid prompts (3×3 = 9 icons each), parallel batch ~25 min wall.
- Post-processed locally with ImageMagick: slice → chroma-key cream BG → resize 64×64 nearest-neighbor → 16-color quantize.
- Filename = Twemoji codepoint convention (lowercase hex, `-` joining sequences), e.g. `1f4b0.png` = 💰.

## Style anchor (codex prompt formula)

> Classic Japanese RPG pixel art style — Pokemon Emerald, Fire Emblem GBA, Final Fantasy Tactics Advance aesthetic. Single object centered on plain solid pastel cream background (#fef5ce). Crisp dark outlines (1-2px), multi-tone cell shading with hard-edged transitions, 8-12 color palette per icon.

## License

Generated content; project license applies (engine AGPL-3.0, content pack CC-BY-NC-4.0).

## Coverage

65 icons total: 64 mapped to Unicode emoji codepoints + 1 custom-named (`star_outline.png` for hollow ☆ which has no emoji-class Unicode counterpart).

Initial 61-icon batch (7 codex grid calls, 2026-05-22 ~02:30); 4-icon top-up batch (1 codex 2×2 grid call, 2026-05-22 ~07:11) added `1f9fa` 🩺 / `2b06` ⬆️ / `2699` ⚙️ / `25bc` ▼ — the emoji that the initial grep missed because they sit outside the regex ranges I used.

The following ASCII tree-drawing characters remain intentionally **not** converted (used inside code comments / UI structure markers, not emoji):

- `─` `└` `├`
