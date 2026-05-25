## 1. Atlas generation (codex CLI, background)

- [x] 1.1 Start codex CLI batch for `badge-atlas.png` — single-shot prompt for 7×4 grid, output to `/tmp/badge-atlas.png` (already kicked off)
- [x] 1.2 Start codex CLI batch for `family-mastery-atlas.png` — single-shot prompt for 11×5 grid, output to `/tmp/family-mastery-atlas.png` (already kicked off)
- [x] 1.3 Monitor codex completion (wait for both background tasks)
- [x] 1.4 Visual review at 24/48/64px slices: open atlases via macOS `open /tmp/*.png`; verify (a) row/column ordering matches spec, (b) each cell distinct at 24px, (c) palette consistent, (d) transparent bg clean
- [x] 1.5 If unsalvageable: re-run codex with refined prompt OR fall back to Gemini per-row + magick montage assembly

## 2. Asset placement

- [x] 2.1 `mkdir -p apps/neurons-tw/src/assets/achievements/`
- [x] 2.2 `mv /tmp/badge-atlas.png /tmp/family-mastery-atlas.png` → `apps/neurons-tw/src/assets/achievements/`
- [x] 2.3 Verify file sizes are reasonable (target < 200 KB each); if oversized run `pngquant --quality 70-85` post-process

## 3. BadgeSprite atlas swap

- [x] 3.1 Edit `apps/neurons-tw/src/components/BadgeSprite.tsx` — replace SVG placeholder body with CSS background-position atlas rendering
- [x] 3.2 Import atlas asset URL: `import badgeAtlasUrl from '../assets/achievements/badge-atlas.png'`
- [x] 3.3 Implement cell math: `backgroundPosition = '-' + (tierColIdx * 100 / 3) + '% -' + (categoryRowIdx * 100 / 6) + '%'` (atlas-units: 100% spans 4 columns or 7 rows)
- [x] 3.4 Set `backgroundSize = '400% 700%'` so each cell is 100% of element size (4 col / 7 row atlas)
- [x] 3.5 Keep `locked` prop applying `filter: grayscale(80%) opacity(0.7)` (existing behavior)
- [x] 3.6 Keep public API unchanged: `{ category, tier, size, locked }` props identical
- [x] 3.7 Drop / clean up SVG-placeholder code paths (`CATEGORY_GLYPH` emoji table, inline SVG render block)

## 4. FamilyMasteryBadgeSprite new component

- [x] 4.1 Create `apps/neurons-tw/src/components/FamilyMasteryBadgeSprite.tsx`
- [x] 4.2 Declare `FAMILY_INDEX_BY_ID: Record<string, number>` constant — alphabetical sort of 11 family ids → 0..10 (per design Decision 4)
- [x] 4.3 Props: `{ familyId: string, masteryTier: MasteryTier, size?: number }`
- [x] 4.4 Early return `null` when `masteryTier === 'none'` (per spec scenario)
- [x] 4.5 Map mastery tier → row index: P5=0 / P4=1 / P3=2 / P2=3 / P1=4
- [x] 4.6 CSS background-position: `'-' + (familyColIdx * 100 / 10) + '% -' + (tierRowIdx * 100 / 4) + '%'` (atlas units 11 col / 5 row)
- [x] 4.7 `backgroundSize = '1100% 500%'`
- [x] 4.8 Import `family-mastery-atlas.png` via Vite

## 5. ConnectomePage consumer

- [x] 5.1 Edit `apps/neurons-tw/src/routes/ConnectomePage.tsx` — import `FamilyMasteryBadgeSprite` + `deriveMasteryTier`
- [x] 5.2 For each family card, compute mastery tier from current `familyMastery` row + render `<FamilyMasteryBadgeSprite>` alongside `<MasteryChip>` (size ~32-40 px)
- [x] 5.3 Wrap in conditional — only render when tier !== 'none' (component handles internally but cleaner to skip render entirely)
- [x] 5.4 Visual smoke at 1024px / 768px / mobile to confirm layout doesn't break

## 6. Build + typecheck

- [x] 6.1 `pnpm --filter @study-rpg/neurons-tw typecheck` clean
- [x] 6.2 `pnpm --filter @study-rpg/neurons-tw build` succeeds; verify atlases appear in `dist/assets/` with cache-busted hash

## 7. Chrome MCP smoke

- [x] 7.1 Boot dev server `pnpm --filter @study-rpg/neurons-tw dev`
- [x] 7.2 Visit `/achievements`: verify BadgeSprite renders atlas cells (not placeholder emoji). Inspect element to confirm `background-image` is set to atlas URL
- [x] 7.3 Visit `/connectome`: verify FamilyMasteryBadgeSprite renders next to MasteryChip on the family card whose mastery tier is P5+ (the dev panel's 藥理學 from prior smoke had P4)
- [x] 7.4 Console clean (no asset load failures, no React errors)
- [x] 7.5 Verify atlas DevTools network response — Status 200, gzipped size reasonable

## 8. Spec sync + commit + archive

- [x] 8.1 `openspec validate generate-neurons-achievement-atlases --strict` passes
- [x] 8.2 `/opsx:verify generate-neurons-achievement-atlases` — 3-dim check passes
- [x] 8.3 git commit `spec(impl): generate-neurons-achievement-atlases — 28-cell badge + 55-cell mastery atlases via codex CLI + BadgeSprite atlas swap + FamilyMasteryBadgeSprite + ConnectomePage consumer`
- [x] 8.4 `/opsx:archive generate-neurons-achievement-atlases` — sync delta into `openspec/specs/neurons-achievements/spec.md` (overrides BadgeSprite + replaces FamilyMasteryBadgeSprite reservation), move change folder to archive
- [x] 8.5 git commit `spec(archive): merge generate-neurons-achievement-atlases — atlases shipped + FamilyMasteryBadgeSprite landed`
- [x] 8.6 Update `openspec/project.md` Roadmap row for M_3rd track — mark 10/11 shipped
