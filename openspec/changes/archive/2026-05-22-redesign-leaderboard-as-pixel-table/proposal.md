## Why

The 二階 leaderboard ship (`add-hospital-leaderboard`, archived 2026-05-21) wired the data path (D1 + KV + Worker + opt-in modal + 4 filter tabs + my-rank chip), but the page's visual layer is **unstyled** — `apps/medexam2-hospital-tw/src/styles.css` contains zero `.leaderboard-*` rules, so the Top 100 list renders as a default browser `<ol>` with naked `<span>` columns. On a pixel-art game shell that ships Cubic 11 + `.frame` borders + Twemoji pixel icons elsewhere, the bare-list page reads as broken / unfinished. Owner-stated 2026-05-22 handoff intent: make the leaderboard a true pixel-style tabular grid that visually matches the rest of the hospital UI.

## What Changes

- Ship first-pass CSS for the leaderboard page: tabular grid layout, pixel-art `.frame` borders, Cubic 11 pixel font on nicknames + stats, accent-gold rank highlight for rank 1 / 2 / 3, my-row sticky highlight.
- Expand the `<LeaderboardList>` JSX so all 6 data columns (rank / nickname / hospital tier / reputation / doctor count / total study minutes) render in their own dedicated grid cells instead of being collapsed into "primary stat string + summary string" pair.
- Add desktop / mobile responsive grid: desktop ≥ 768 px shows all 6 columns at full width; mobile < 768 px hides hospital tier + doctor count cells (low-information density per filter context), keeps rank / nickname / reputation / study minutes + active filter's primary stat bolded.
- Add my-row sticky-bottom behavior: when the current user appears anywhere in Top 100 but is scrolled out of viewport, a pinned bottom row repeats their stats for at-a-glance reference (similar to spreadsheet frozen-row pattern).
- Add rank-1 / rank-2 / rank-3 medal cell styling using **both** a new pixel-art medal sprite (codex CLI `gpt-image-2` — one prompt that emits the 3 medals in a single layout image, then magick-sliced into 3 PNGs and added to the existing `emoji-icons` manifest as 🥇 / 🥈 / 🥉) **and** a CSS gold / silver / bronze background tint on the rank cell, layered behind the medal sprite. The sprite carries the visual identity; the CSS tint acts as a fallback if the asset fails to load and ensures the row reads as "medal" even before image decode.
- Keep current data shape, API surface, and filter-tab behavior identical — this is a pure presentation-layer change.

## Capabilities

### New Capabilities
<!-- none — pure visual layer change on top of existing hospital-leaderboard capability -->

### Modified Capabilities

- `hospital-leaderboard`: The "Top 100 list plus my-rank chip" requirement (currently § ~line 87 of `openspec/specs/hospital-leaderboard/spec.md`) is strengthened with normative visual + layout behavior — tabular grid (not bare list), explicit 6-column desktop / 4-column mobile breakpoints, rank-1/2/3 medal highlight, and my-row sticky-bottom visibility when user's row is scrolled offscreen.

## Impact

**Affected code**:

- `apps/medexam2-hospital-tw/src/pages/LeaderboardPage.tsx` (~324 lines) — restructure `<LeaderboardList>` JSX so each row becomes a 6-cell grid; add `<MyRowSticky>` sub-component reading the same row data; preserve all current props / state / hooks
- `apps/medexam2-hospital-tw/src/styles.css` (~5205 lines) — add `.leaderboard-page`, `.leaderboard-list`, `.leaderboard-row`, `.leaderboard-cell` and friends; ~150–250 net new lines of CSS using existing design tokens (`--frame-dark`, `--accent-gold`, `--font-pixel-cjk`, `--font-pixel-num`)
- `apps/medexam2-hospital-tw/src/lib/emoji-icons.ts` — add 3 new entries (🥇 → `1f947.png`, 🥈 → `1f948.png`, 🥉 → `1f949.png`) to the `ICON_FILES` array
- `apps/medexam2-hospital-tw/public/emoji-icons/` (or wherever existing pixel-emoji PNGs live — verify path in tasks.md task 2.x) — 3 new sprite PNGs sized to match other pixel emoji (likely 72×72 or 96×96 quantized to 16 colors with nearest-neighbor scaling per `~/.claude/imports/codex_image_gen.md`)

**Unaffected**:

- D1 schema, KV snapshot format, Worker endpoints (`/leaderboard/*`)
- `LeaderboardRow` data type in `@study-rpg/core`
- Opt-in flow (`LeaderboardOptInModal`), nickname-check, opt-out / delete-me — all stay intact
- 4 filter tabs (`composite` / `reputation` / `doctor` / `study`) — tab behavior unchanged; only the cell that bolds for "primary stat per active filter" gets a `.leaderboard-cell--primary` modifier class
- Footer disclosure copy (resource integrity + V6 cutoff notes)

**Dependencies**:

- None added or removed. Uses existing pixel design tokens already in `styles.css`.

**Risk**: P4 NPC — pure visual change, no data / API / engine path touched. Worst-case regression = ugly layout fixed in follow-up Chrome MCP iteration (typical 1–2 rounds per `pptx-layout-qa`-class polish).

**Out of scope**:

- Mobile row-tap accordion to reveal hidden cells (defer — horizontal info density on mobile is fine for 4 cells; tap-to-expand adds complexity for marginal benefit)
- Animated rank-change indicators (e.g. ↑ / ↓ delta vs last snapshot) — needs new client-side state comparing snapshots; out of scope for visual restyle
- Leaderboard "podium" hero block above the table (top 3 in stylized 1st/2nd/3rd plinth layout) — would be a second change after this restyle settles
