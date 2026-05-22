## Context

The 二階 leaderboard shipped end-to-end in `add-hospital-leaderboard` (archived 2026-05-21, see `openspec/changes/archive/2026-05-21-add-hospital-leaderboard/`). Subsequent polish change `polish-leaderboard-cron-freq-and-mobile-nav` (archived 2026-05-22 morning) tightened cron freq and mobile nav overflow. Both shipped to prod. What's left is the page's visual layer.

**Discovered during exploration (sharpens the framing in `proposal.md`)**: a grep of `apps/medexam2-hospital-tw/src/styles.css` shows literally zero `.leaderboard-*` CSS rules. The JSX in `LeaderboardPage.tsx` uses semantic class names (`.leaderboard-list`, `.leaderboard-list__row`, etc.) that browser defaults render as a bare `<ol>` with naked `<span>` columns. So this change is **not** "convert vertical card UI to grid" (as the 2026-05-22 handoff note assumed) — it's **"ship the leaderboard's first real visual styling"**.

Design tokens already present in `styles.css` and reused throughout the hospital shell:

| Token | Value | Existing uses |
|---|---|---|
| `--frame-dark` | `#5a3f29` (warm dark brown) | `.frame`, `.app-header`, `.filter-chip`, modal borders |
| `--accent-gold` | `#d4a04d` (warm gold) | `.filter-chip[aria-pressed=true]`, ER-consult highlight, opt-in modal CTA |
| `--font-pixel-cjk` | `'Cubic 11', 'Noto Sans TC', sans-serif` | nickname / header text everywhere |
| `--font-pixel-num` | `'Cubic 11', 'VT323', 'Courier New', monospace` | numeric stats in `RoomCard`, gacha pity counter |

Reference visual patterns (per 2026-05-22 handoff note's Game UI Database list): retro arcade leaderboards typically use a tight cell-divider grid with a single hero accent on the top three. Not aiming for full GBA-faithful pixel-perfect — aiming for "fits the rest of the app and reads as deliberate".

The `LeaderboardRow` type (from `@study-rpg/core`) carries:

```ts
{ user_id, nickname, hospital_tier, reputation, doctor_count, total_study_min, updated_at }
```

Current `<LeaderboardList>` JSX collapses 4 stats into two `<span>`s (`primary-stat` derived from active filter + `secondary-stats` summary string). New JSX will expand to one cell per attribute.

## Goals / Non-Goals

**Goals:**

- Replace unstyled `<ol>` render with a CSS Grid layout where every cell aligns vertically with its column header.
- All 6 data columns (rank / nickname / tier / reputation / doctors / study min) visible on desktop ≥ 768 px.
- Mobile < 768 px shows essential columns (rank / nickname / active filter's primary stat / one secondary) without horizontal overflow.
- Rank-1 / 2 / 3 cells visually distinct (gold / silver / bronze CSS tint + emboss) without adding new image assets.
- My-row stays discoverable when scrolled offscreen — either reinforce existing sticky chip, or add sticky-bottom repeat row.
- Visual style matches existing hospital shell — same `--frame-dark` border weight, same `Cubic 11` font, no new design language.

**Non-Goals:**

- Adding 🥇 / 🥈 / 🥉 pixel emoji PNG assets — pure CSS tint covers the visual need for this pass; assets can ship in a separate emoji-batch change later.
- Animated rank-change deltas (↑/↓ indicators) — needs comparing snapshots client-side; out of scope.
- Top-3 "podium" hero block above the table — would be a separate second change.
- Row-tap accordion on mobile — adds interaction complexity for marginal density gain.
- Touching D1, KV, Worker endpoints, or `@study-rpg/core` types — pure presentation change.

## Decisions

### 1. CSS Grid (`display: grid`) over `<table>` element

**Decision**: Use semantic `<ol>` + `<li>` (preserving the existing JSX structure) and lay out cells with `display: grid; grid-template-columns: ...` on the `<ol>` and `subgrid` (or matching template) on each `<li>`. **Not** switching to a `<table>` element.

**Why**:

- `<table>` would require restructuring the JSX more aggressively (currently each row is `<li>` with `<span>` children; `<table>` wants `<tr>` with `<td>`).
- CSS Grid with named template columns gives us mobile collapse via media query `grid-template-columns: ...` override with zero markup change.
- Accessibility: ordered ranked list is semantically `<ol>` more than `<table>` (a table implies cell relationships; a leaderboard is a sorted list of entities with attributes).
- `subgrid` support: Chrome 117+ / Safari 16+ / Firefox 117+ — all current. If we hit a regression we fall back to `grid-template-columns` on each row matching the parent.

**Alternative considered**: Re-skinning current JSX where `.leaderboard-list__row` is `display: flex` with fixed widths. Rejected — cell alignment breaks when nickname lengths vary (and Cubic 11 has per-char-width pixel quirks).

### 2. Pixel-art medal sprite + CSS tint as belt-and-suspenders (codex CLI generates all 3 in one image)

**Decision**: Generate 3 pixel-art medal sprites (🥇 / 🥈 / 🥉) via codex CLI `gpt-image-2` in **one** image-gen call: prompt codex to produce a single layout image with three side-by-side medals on transparent background, then post-process with `magick` to slice into three separate PNGs (`1f947.png` / `1f948.png` / `1f949.png`) at the standard pixel-emoji size (verify against existing manifest entries — likely 72×72 or 96×96, 16-color quantized). Add the 3 entries to `apps/medexam2-hospital-tw/src/lib/emoji-icons.ts` `ICON_FILES`. JSX renders `<EmojiIcon char="🥇" />` etc. in the rank cell for ranks 1–3. **In parallel**, CSS still applies `.leaderboard-row--rank-1` / `--rank-2` / `--rank-3` modifier classes with background tint (gold `#d4a04d` reusing `--accent-gold` / silver `#c0c0c0` / bronze `#cd7f32`) on the rank cell behind the sprite — belt-and-suspenders: the sprite carries identity, the CSS tint guarantees the row reads as "medal" even before image decode or if the PNG fails to load.

**Why**:

- One codex call instead of three saves ~6–8 min of wall time (each codex `gpt-image-2` round is ~2–4 min with ~30K reasoning tokens — `~/.claude/imports/codex_image_gen.md`).
- Style consistency: three medals in one prompt = one rendering pass = identical shading, frame thickness, light direction. Sequential calls would risk visual drift between gold and silver and bronze.
- The PNG sprites match the existing pixel-emoji baseline (per `wire-pixel-emoji-icons-batch1..4` archived changes) — visually consistent with 🏆 / ⭐ / 🎫 / other pixel icons already in the manifest.
- CSS tint behind the sprite is essentially free (3 modifier classes) and guards against the failure mode where PNG asset 404s in prod or first-paint shows un-decoded image.
- 🥇 / 🥈 / 🥉 (`1f947` / `1f948` / `1f949`) follow the same Twemoji-codepoint-as-filename convention as every other entry in `ICON_FILES`, so the manifest extension is mechanical.

**Codex prompt sketch** (refined in task 2.x):

> "Three pixel art medals arranged side by side on a fully transparent background, GBA-era style, gold / silver / bronze, each with embossed frame border and a numeric digit (1 / 2 / 3) centered, suitable for slicing into three separate sprites. 16-color palette per medal. `$imagegen`"

Run from `/tmp` per the SessionStart-hook-collision workaround in `~/.claude/imports/codex_image_gen.md`.

**Alternative considered**: Run codex 3 times sequentially (one per medal). Rejected — 3× wall time, style-drift risk between calls, no upside.

**Alternative considered**: Use a Unicode 🥇/🥈/🥉 in the rank cell with no PNG fallback (current `EmojiIcon` falls back to system emoji if not in manifest). Rejected — mixing system emoji with the existing pixel-emoji style would visually clash and undo prior `wire-pixel-emoji-icons-batch*` work.

**Alternative considered**: Pure CSS tint only (original first-pass decision). Rejected per owner direction 2026-05-22 — sprites give more identity, codex batch is cheap, CSS tint stays as backstop.

### 3. My-row sticky-bottom row over scroll-into-view UX

**Decision**: When the user's row is in the top 100 but scrolled out of viewport, render a duplicate sticky `<li>` pinned to `bottom: 0` of the scroll container that mirrors the user's row data. Highlight matches the inline row's gold border. When the inline row is in viewport the sticky duplicate hides (via `IntersectionObserver` or simpler scroll-position math).

**Why**:

- Spreadsheet-style frozen row is a familiar pattern (Excel / Google Sheets), no learning curve.
- Avoids scroll-jacking (no auto-scroll on tab switch).
- Existing my-rank chip at the top of the page handles the "I'm not in top 100" case; this sticky bottom handles the "I'm rank 47, where am I" case.

**Alternative considered**: Auto-scroll the user's row into view on mount. Rejected — opinionated scroll-jacking is jarring and conflicts with the natural reading order (rank 1 first).

**Alternative considered**: Just rely on the existing sticky top chip. Rejected — the chip only shows the rank number, not the user's stats vs neighbors, which is the comparison the player actually wants to do.

### 4. Mobile breakpoint: hide hospital tier + doctor count below 768 px

**Decision**: At viewport < 768 px, CSS sets `display: none` on `.leaderboard-cell--tier` and `.leaderboard-cell--doctors`. Remaining cells: rank / nickname / reputation / total study minutes / (active filter's primary stat gets `.leaderboard-cell--primary` modifier that bolds the cell).

**Why**:

- Mobile width (~390 px on iPhone 12 / 13) cannot fit 6 numeric columns with Cubic 11 at any readable size.
- Hospital tier is 1–3 → low-information (everyone visible is mid-game-ish).
- Doctor count tends to correlate tightly with reputation (more docs = more clinical output = more reputation), so removing it isn't a major signal loss.
- Reputation + study minutes survive because they map directly to the two most likely filters a mobile user picks.

**Alternative considered**: Show all 6 columns with horizontal scroll. Rejected — horizontal scroll on mobile lists is rarely discoverable; users miss columns past the fold.

**Alternative considered**: Tap-to-expand accordion revealing hidden cells. Rejected — adds state machinery for marginal benefit; defer to a follow-up if owner asks.

### 5. JSX restructure scope: change only `<LeaderboardList>` and add `<MyRowSticky>`

**Decision**: Touch only:
- `<LeaderboardList>` (function at `LeaderboardPage.tsx:288–324`) — expand each `<li>` from 4 `<span>`s to 6 cells.
- Add `<MyRowSticky>` sub-component reading `rows` + `currentUserId`; render conditionally next to or below the `<LeaderboardList>`.

**Do NOT touch**: `<MyRankChip>`, `<LeaderboardBody>`, the page header, the filter bar, the opt-in modal, footer disclosures. Surgical change per `coding_principles.md` rule 3 (Surgical Changes).

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| `subgrid` regression on older Safari versions (< 16) | Fall back to `grid-template-columns` declared on each `<li>` matching the parent — same visual result, ~2 lines more CSS |
| Cubic 11 numeric column widths variable per digit (e.g. `1` is narrower than `4`), causing visual misalignment | Use `font-variant-numeric: tabular-nums;` on the stat cells; Cubic 11 supports it. Verify in Chrome MCP. |
| Mobile-hidden cells (tier + doctors) hurt advanced players who care about those stats | They're still visible on desktop and via the row's `aria-label`; opt-in to "expert mobile view" can be a future polish |
| My-row sticky duplicate confuses screen readers (read once + repeat) | Add `aria-hidden="true"` on the sticky duplicate so AT users only encounter the canonical row once |
| Gold-silver-bronze color contrast on `--frame-dark` background fails WCAG AA | Verify with Chrome MCP devtools' contrast checker; if any pair fails, deepen the medal hue or thicken the row border for non-color signaling |
| First-load layout shift between unstyled-state render and CSS application (CLS) | Minimal — CSS is in `styles.css` already imported by `main.tsx`, applies synchronously; verify with Chrome MCP Performance tab |
| Worktree drift — leaderboard page also exists in 一階? | `apps/medexam-tw/src/pages/` has no `LeaderboardPage` (verified via earlier `ls`); change scope is 二階-only. No symmetry burden. |

## Open Questions

- **Q1**: Should the my-row sticky also show on mobile, or only desktop? — Default to "yes, both"; revisit if mobile viewport feels too cramped after Chrome MCP verify.
- **Q2**: Do we apply `font-variant-numeric: tabular-nums` to ALL numeric cells, or only the stat columns? — Apply to stat columns; rank number is its own visual highlight and benefits from non-tabular width.
- **Q3**: For my-row sticky offscreen detection — IntersectionObserver vs scroll-position math? — Default IntersectionObserver (one-line API, modern browser support); fallback to scroll math only if observer turns out to fight `position: sticky`.

## Visual Direction Lock — 2026-05-22

Owner-confirmed after Game UI Database moodboard pass (`~/.claude/scratch/leaderboard-moodboard-2026-05-22/`):

**Target feel**: **GBA-era tabular structure + DK King of Swing chunky-pixel typography + DK-style my-row gold-tint highlight**.

Cross-referencing the saved JPGs:

| Element | Source ref | Apply to our impl |
|---|---|---|
| Row spacing + cell density | `Mario-Kart-Super-Circuit-GBA.jpg`, `Sonic-Advance-GBA.jpg` | Tight ~24–28px row height; minimal padding; cells touch via shared 2px `--frame-dark` border |
| Typography character | `DK-King-of-Swing-A_ranked-list.jpg` | Cubic 11 at +1 step (~13–14px) for nickname + numeric stats; bolder than current Cubic 11 11px body baseline |
| My-row highlight | `DK-King-of-Swing-A_ranked-list.jpg` (Donkey Kong row gold) | Full row background `rgba(212, 160, 77, 0.18)` tint + 2px `--accent-gold` left+right border (replaces vertical dividers on that row only) |
| Frame edge | `Pokemon-Pinball-RubySapphire-GBA.jpg`, all DK refs | Outer `.leaderboard-list` wrapper uses `.frame` border-2 + 4px box-shadow offset (matches `.frame` used by `RoomCard` + `MigrationBanner` etc.) |
| Status/footer chip | `DK-King-of-Swing-A_ranked-list.jpg` "Records updated!" chip | Existing `.leaderboard-footer__disclosure` already plays this role — light styling pass to give it a similar pill-chip frame |
| Medal cell base | (CSS only — codex sprites + tint backstop per Decision 2) | rank-1/2/3 cell keeps Decision 2's pixel sprite + colour tint backstop; the chunky-pixel feel comes from the row-level typography, not the medal cell |

**Out**: Konami-Krazy-Racers portrait-grid (doesn't scale to 100 rows), Joe-Danger-2 results-screen burst (one-shot tone, wrong for persistent leaderboard).
