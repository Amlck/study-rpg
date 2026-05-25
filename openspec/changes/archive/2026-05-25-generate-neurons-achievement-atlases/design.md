## Context

`add-neurons-achievements` (archived 2026-05-25) shipped with two intentional deferrals: `badge-atlas.png` not yet generated, and `FamilyMasteryBadgeSprite` component slot reserved. Both decisions documented in archive `design.md` Decision 8 + tasks.md §9.1–§9.6. This change resolves both.

Codex CLI is the pixel-art generation path of choice on this project — proven by `generate-neurons-sprites` (2026-05-25, 11 neuron family icons). Same recipe per `~/.claude/imports/codex_image_gen.md`:
- `cd /tmp && codex exec --sandbox workspace-write --skip-git-repo-check "<prompt>. Save to /tmp/<file>.png. \$imagegen" < /dev/null`
- Output stays in /tmp until manual `mv` to repo
- Wall time ~5–8 min per atlas (more complex grid prompt vs single sprite)

## Goals / Non-Goals

**Goals:**
- Two atlas PNGs at `apps/neurons-tw/src/assets/achievements/` matching dimensions specified in `neurons-achievements` spec (896×512 + 1408×640)
- BadgeSprite atlas mode shipped — placeholder rendering removed
- FamilyMasteryBadgeSprite component shipped + at least one consumer site rendering it
- Visual smoke at 24 / 48 / 64 px confirms cell distinguishability
- No regression in existing AchievementsPage / AchievementCard / Toast / Modal rendering

**Non-Goals:**
- ❌ Leaderboard row mastery-badge display (Worker schema change required → separate future change)
- ❌ Animation on cell hover (out of scope; static atlas)
- ❌ Multiple atlas sizes for retina (one resolution; CSS `image-rendering: pixelated` handles upscale)
- ❌ Per-locale alternate atlases (single canonical asset)

## Decisions

### Decision 1: Generate full grid in one codex prompt, not per-cell

**Choice**: Single codex call per atlas. Prompt describes the full grid layout; codex outputs one PNG.

**Alternatives considered**:
- **A. Per-cell generation**(28 + 55 = 83 codex calls) — wall time 83 × 2–4 min = 3–6 hours; pixel-art consistency between cells likely poor (different runs produce different palettes / styles)
- **B. Per-row generation** (7 + 11 = 18 calls) — intermediate option; still palette drift between row generations
- **C. Single full-grid per atlas** (this choice, 2 calls total) — wall time ~10–20 min; codex produces coherent palette + consistent cell sizing in one shot; aligns with 二階 `achievement-system` archive precedent ("2 張 atlas asset 走 codex CLI 一次生成")

**Trade-off**: If codex output has unsalvageable issues (wrong cell ordering, off-by-one alignment, illegible 24 px) we re-run the whole atlas (~10 min) instead of cherry-picking cells. Acceptable for one-shot.

### Decision 2: FamilyMasteryBadgeSprite consumer = ConnectomePage family cards

**Choice**: Render `<FamilyMasteryBadgeSprite>` alongside the existing `<MasteryChip>` text on each family card in `ConnectomePage`.

**Alternatives considered**:
- **A. AchievementsPage mastery category section** — would need a new layout sub-section; mastery category cards already render BadgeSprite (category × tier), adding family-mastery breakdown is information overload on the page
- **B. New dedicated `/mastery` route** — overkill for one component
- **C. ConnectomePage family card chip** (this choice) — natural co-location: each family card already shows `MasteryChip` (tier text + accuracy %); adding the visual badge alongside is a clean upgrade with zero layout disruption
- **D. LeaderboardPage row chip** — semantic mismatch (LeaderboardPage shows max-tier-per-category badges, not per-family mastery); also breaks data-isolation principle (would need Worker schema change to push per-family mastery)

**Implication**: ConnectomePage now imports + renders FamilyMasteryBadgeSprite. Single render site is sufficient to satisfy the "≥ 1 consumer site" coherent-ship rule.

### Decision 3: Atlas mode is now the ship-time state; spec drops placeholder allowance

**Choice**: MODIFY the existing `BadgeSprite` requirement to require atlas-mode rendering (drop placeholder mode). The component still has fallback rendering in code for the case where atlas PNG fails to load, but spec language is tightened.

**Alternatives considered**:
- **A. Keep dual-mode spec** (atlas OR placeholder both acceptable) — semantically weak; once atlas exists, placeholder mode is a degraded path
- **B. Atlas-only with fail-fast** (Vite build fails if atlas missing) — too brittle for a graceful-degradation philosophy
- **C. Atlas-primary with optional fallback** (this choice) — spec requires atlas mode + atlas file existence; component code may keep a silent fallback for the broken-asset case but spec scenarios verify atlas-mode rendering

**Rationale**: Spec describes the intended state. Implementation can be more defensive than spec without violating it.

### Decision 4: Alphabetical family-id → column index for family-mastery-atlas

**Choice**: 11 family IDs sorted alphabetically → 0..10 column index. Encoded as a constant `FAMILY_INDEX_BY_ID` exported alongside `FamilyMasteryBadgeSprite`.

**Order**: 公共衛生學 / 免疫學 / 寄生蟲學 / 微生物學 / 病理學 / 生物化學 / 生理學 / 組織學 / 胚胎學 / 解剖學 / 藥理學

**Alternatives considered**:
- **A. NT-branch grouping** (DA / 5-HT / GABA / Glu) — visually more meaningful but tied to content-pack data; atlas would need regen if family is reassigned NT-branch
- **B. Alphabetical** (this choice) — deterministic, decoupled from content-pack metadata, stable across content-pack updates

**Implication**: Codex prompt must specify this exact ordering. Component encodes the same constant. Any future content-pack family rename would require atlas regen (acceptable — rename is rare event).

## Risks / Trade-offs

[**R1 — codex grid generation produces low-quality / off-alignment cells**] → mitigate by reviewing visually at 24/48/64 px before commit; if unsalvageable, re-run codex with refined prompt OR fall back to per-row generation. Time cost: +20–30 min per regen.

[**R2 — atlas file size > 200 KB hurts first-load**] → 16-color quantize keeps PNG under ~150 KB typically. If oversized, run `pngquant` post-process or upgrade to WebP.

[**R3 — codex "$imagegen" service rate limit**] → unlikely for 2 calls; if hit, retry with delay or fall back to Gemini MCP (`mcp__gemini__gemini_generate_image`) for individual cell generation + assemble via `magick` montage.

[**R4 — BadgeSprite swap breaks existing AchievementsPage / AchievementCard layouts**] → public API unchanged (`category` / `tier` / `size` / `locked` props); swap is internal-only. Manual visual smoke confirms.

[**R5 — FamilyMasteryBadgeSprite consumer site (ConnectomePage) layout is already dense**] → render badge as small 32–40 px element to the right of MasteryChip; doesn't disrupt vertical layout.

## Migration Plan

1. Codex CLI generation (2 background calls, ~10–20 min wall time each, can run in parallel)
2. Visual review of /tmp output at multiple sizes (zoom into atlas + check 24/48/64 px slice)
3. mv to `apps/neurons-tw/src/assets/achievements/`
4. Update `BadgeSprite.tsx` — atlas mode body
5. Create `FamilyMasteryBadgeSprite.tsx`
6. Wire into `ConnectomePage.tsx`
7. Typecheck + build
8. Chrome MCP smoke: visit `/achievements` (BadgeSprite atlas display) + `/connectome` (FamilyMasteryBadgeSprite on family card)
9. /opsx:verify + commit + archive

**Rollback**: Revert commit. Reverted BadgeSprite returns to SVG placeholder. No data loss (atlas is asset-only, no state).

## Open Questions

- **Q1: Should `FamilyMasteryBadgeSprite` for `none` mastery tier render anything?**  
  → No. Component returns `null` when masteryTier === 'none'. ConnectomePage consumer conditionally renders only when MasteryChip shows P1–P5.

- **Q2: Atlas filename / path bikeshed**  
  → Locked to `apps/neurons-tw/src/assets/achievements/badge-atlas.png` + `family-mastery-atlas.png` per archive spec text.

- **Q3: Should atlas be referenced via `import` (Vite asset pipeline) or absolute path?**  
  → Vite `import badgeAtlasUrl from '...'` for HMR + cache-busting hash. Component reads URL into CSS `background-image: url(...)`.
