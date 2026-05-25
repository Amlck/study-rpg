## 1. Preflight + baseline

- [x] 1.1 Verify worktree on `track-neurons` branch + working tree clean: `cd ~/coding-scratch/study-rpg-neurons && git status --porcelain` (empty)
- [x] 1.2 Baseline `pnpm -r typecheck` green across 12 workspaces
- [x] 1.3 Verify medexam-tw build artifact exists: `ls apps/medexam-tw/public/content/medexam-tw/{meta,subjects,questions}.json` (3 files); if missing, run `pnpm build:content` first
- [x] 1.4 Snapshot medexam-tw subject id list to design.md Open Questions area for cross-reference during build script validation

## 2. content-neurons-tw build pipeline (11-subject framework with 微生物暨免疫學 split)

- [x] 2.1 Add `tsx` + `@types/node` + `yaml` to `packages/content-neurons-tw/devDependencies` (yaml needed to parse source markdown frontmatter if any; verify scaffold and add yaml)
- [x] 2.2 Create `packages/content-neurons-tw/scripts/build.ts` with the following logic:
  - **Inputs**:
    - `MEDEXAM_TW_DIST` env var (default: resolve from worktree root → `apps/medexam-tw/public/content/medexam-tw`) — verbatim source for 9 直送 subjects
    - `MEDEXAM_SOURCE_ROOT` env var (default: `~/Desktop/國考/一階國考/陽明國考考古/_extracted`) — source markdown for 微生物暨免疫學 split
    - `MEDEXAM_ALLOW_SKIPS=1` (default 0) — allow untagged questions to take default route without erroring
  - **Step 1: Read medexam-tw artifacts** → `meta.json`, `subjects.json`, `questions.json`; assert all 3 files exist
  - **Step 2: 直送 9 subjects** → for each question with `subject !== '微生物暨免疫學'`, keep `subject` verbatim, push to output questions list
  - **Step 3: Split 微生物暨免疫學** → for each question with `subject === '微生物暨免疫學'`:
    - Locate source .md file via `meta.year` + `meta.session` + `meta.book` + 'microbiology folder' (path = `$MEDEXAM_SOURCE_ROOT/醫學二/微生物暨免疫學/{year}-{session}.md`)
    - Parse the file for the matching `## Q{qNumber}` block
    - Extract the `**科目**：<tag>` line within the Q block body
    - Apply split heuristic: if tag matches `/免疫|微免/` → `subject = '免疫學'`; else if tag matches `/微生物|細菌|病毒|黴菌|微生/` → `subject = '微生物學'`; else (untagged / typo) → default `'微生物學'` + log warning
    - Push to output questions list with new subject id
  - **Step 4: Generate `dist/subjects.json`** with 11 entries (9 直送 + 微生物學 + 免疫學) per design Decision 1 mapping; for each entry: `id` / `displayName` (neuron family + persona) / `group` (NT branch `'DA' | '5HT' | 'GABA' | 'Glu'`) / `color` (NT palette hex `'#d4a04d'` / `'#c44d4d'` / `'#6a9bc4'` / `'#6a8c3f'`) / `totalQuestions` (recomputed from re-classified question pool)
  - **Step 5: Generate `dist/meta.json`** with `id: 'neurons-tw'`, `displayName: '神經元 RPG — Long-term Potentiation Edition'`, `locale: 'zh-TW'`, `examMeta.supportsMockExam: true`, `credits`: [陽明 + 中華民國考選部 + neurons reskin AGPL-3.0], `statSchema` per design Decision 3
  - **Step 6: Write `dist/questions.json`** (re-classified per-Q `subject`)
  - **Step 7: Print counters** `imported: N / skipped: M / total: K / split: 微生物學=X 免疫學=Y / 直送 subjects: 9` per `coding_principles.md` rule 5
  - **Step 8: Build-time assertions** (per spec Requirement scenarios):
    - Every output question's `subject` resolves to exactly one subjects.json entry
    - 微生物學 + 免疫學 question counts sum equals original 微生物暨免疫學 count
    - 11 subjects all have `totalQuestions > 0` (no orphan empty subject)
    - No question has unresolved subject id; fail loud if any
- [x] 2.3 Update `packages/content-neurons-tw/package.json` — add `"build": "tsx scripts/build.ts"` script
- [x] 2.4 Rewrite `packages/content-neurons-tw/src/index.ts` from empty stub to real fetch loader (pattern from `packages/content-medexam-tw/src/index.ts`):
  - `getContentPack(baseUrl = '/content/neurons-tw')` reads meta.json / subjects.json / questions.json via 3 parallel fetches
  - Return shape conforming to ContentPack (meta + subjects + questions)
- [x] 2.5 Update `packages/content-neurons-tw/README.md` from scaffold stub to brief usage + pointer to design.md naming table + split heuristic
- [x] 2.6 Run `pnpm --filter @study-rpg/content-neurons-tw build`; confirm:
  - dist/ contains `meta.json`, `subjects.json`, `questions.json`
  - `subjects.json` has exactly 11 entries (4 NT branches DA 2 / 5-HT 2 / GABA 3 / Glu 4)
  - 微生物暨免疫學 NOT present; 微生物學 + 免疫學 PRESENT
  - `meta.stats.totalQuestions === questions.length`
  - Imported / skipped / total / split counts printed
  - Subject resolution assertion passes
- [x] 2.3 Update `packages/content-neurons-tw/package.json`:
  - Add `"build": "tsx scripts/build.ts"` script
  - Verify `peerDependencies` already has `@study-rpg/core: workspace:*`
- [x] 2.4 Rewrite `packages/content-neurons-tw/src/index.ts` from empty stub to real fetch loader (pattern from `packages/content-medexam-tw/src/index.ts`):
  - `getContentPack(baseUrl = '/content/neurons-tw')` reads meta.json / subjects.json / questions.json via 3 parallel fetches
  - Return shape conforming to ContentPack (meta + subjects + questions)
- [x] 2.5 Update `packages/content-neurons-tw/README.md` from scaffold stub to brief usage + pointer to design.md naming table
- [x] 2.6 Run `pnpm --filter @study-rpg/content-neurons-tw build`; confirm:
  - dist/ contains `meta.json`, `subjects.json`, `questions.json`
  - `meta.stats.totalQuestions === questions.length`
  - Imported / skipped / total printed
  - Subject id assertion passes

## 3. theme-pixel-neurons content fill — palette + fonts

- [x] 3.1 Update `packages/theme-pixel-neurons/src/index.ts` `cssVars` per design Decision 5:
  - 4 NT branch colors: `--nt-da` / `--nt-5ht` / `--nt-gaba` / `--nt-glu`
  - 4 synapse state colors: `--synapse-dormant` / `--synapse-forming` / `--synapse-potentiated` / `--synapse-mastered`
  - 5 rarity frame colors: `--rarity-n` / `--rarity-r` / `--rarity-sr` / `--rarity-ssr` / `--rarity-ur`
  - Base layout: `--bg-cream` / `--bg-dark` / `--ink` / `--frame-cell-light` / `--frame-cell-dark`
- [x] 3.2 Update `packages/theme-pixel-neurons/src/index.ts` `fonts` array:
  - 3 font defs matching medical theme: 'Press Start 2P' (Google Fonts CDN), 'VT323' (Google Fonts CDN), 'Cubic 11' (self-hosted via host app public/fonts/)
- [x] 3.3 Extend `packages/theme-pixel-neurons/styles/global.css`:
  - Inline 3 fonts via `@font-face` (Cubic 11) + `@import` (Press Start 2P / VT323)
  - Base layout: html / body with bg + ink + font-family fallback chain
  - Pixel rendering hint: `image-rendering: pixelated` (for sprite-heavy components)

## 4. theme-pixel-neurons content fill — item catalog

- [x] 4.1 Create `packages/theme-pixel-neurons/src/items.ts` exporting `ITEM_CATALOG: Item[]` with ~20 entries × 5 rarity:
  - Ion channels (5+): Na_v (Sodium voltage-gated), K_v (Potassium voltage-gated), Ca_v L-type, HCN (Hyperpolarization-activated), Kir (Inward rectifier)
  - Ionotropic receptors (5+): AMPA, NMDA, GABA-A, Glycine, Nicotinic ACh (nAChR)
  - Metabotropic receptors (5+): D2 dopamine, 5-HT2A serotonin, mGluR1, GABA-B, M1 muscarinic
  - NT molecules (5+): Dopamine, Serotonin, GABA, Glutamate, ATP
  - Each item: stable `artKey` (e.g. `ion-na-v`), `slot` (e.g. 'head'/'body'/'weapon'/'charm' — mapped per item-catalog spec), `rarity` (N/R/SR/SSR/UR), `effects[]` with at least one stat or multiplier per `theme-pack-contract` requirement
- [x] 4.2 Wire `ITEM_CATALOG` into `THEME_PIXEL_NEURONS.itemCatalog`
- [x] 4.3 Update `packages/theme-pixel-neurons/src/sprites.ts` SPRITE_MAP to include placeholder transparent PNG for every `artKey` referenced in ITEM_CATALOG (~20 new keys; all point to same TRANSPARENT_PIXEL constant; real assets land in generate-neurons-sprites)
- [x] 4.4 Verify boot-time invariant from theme-pack-contract: every artKey in itemCatalog has matching entry in sprites map; every effect has at least one stat/multiplier; every slot is valid EquipSlot enum

## 5. theme-pixel-neurons content fill — cosmetics + skill tree

- [x] 5.1 Create `packages/theme-pixel-neurons/src/cosmetics.ts` exporting `COSMETIC_CATALOG: Cosmetic[]` with ~20 entries across 5 categories per design Decision 5:
  - `soma-shape`: 4 entries (e.g. `soma-pyramidal`, `soma-stellate`, `soma-spindle`, `soma-round`)
  - `dendrite-pattern`: 4 entries
  - `myelin-color`: 4 entries
  - `axon-decoration`: 4 entries
  - `synapse-vesicle-color`: 4 entries
  - Each entry: `id` / `name` / `category` (matching `cosmetic-<category>-<id>` sprite key convention) / `unlockCondition` (predicate against player stats — first pass uses generic thresholds like `da >= 5`, `dailyStreak >= 7`; refine in apply review)
- [x] 5.2 Export `COSMETIC_CATALOG` + `COSMETIC_CATALOG_SIZE` from `packages/theme-pixel-neurons/src/index.ts` (matching medical theme export pattern)
- [x] 5.3 Update `SPRITE_MAP` in sprites.ts to include `cosmetic-<category>-<id>` placeholder keys (20 new keys, all transparent PNG)
- [x] 5.4 Add `dorm-default` sprite key (also transparent PNG placeholder) for cosmetic-system gracefully-degrade fallback per theme-pack-contract
- [x] 5.5 Create `packages/theme-pixel-neurons/src/skillTree.ts` exporting `SKILL_TREE_PIXEL_NEURONS: SkillTreeContent`:
  - 4 branches matching 4 NT (DA / 5-HT / GABA / Glu)
  - Each branch 9 nodes named `<nt>-<aspect>-<level>` (e.g. `da-reward-1`, `da-reward-2`, `da-motivation-3`, ...)
  - Each node: stable `id` / `name` / `unlockCondition` (predicate on the corresponding NT stat) / `tier` (1-9)
- [x] 5.6 Wire `SKILL_TREE_PIXEL_NEURONS` into `THEME_PIXEL_NEURONS.skillTree`

## 6. theme-pixel-neurons content fill — DESIGN.md expansion

- [x] 6.1 Expand `packages/theme-pixel-neurons/DESIGN.md` from stub to full:
  - Palette: 4 NT colors + synapse states + rarity colors (hex values)
  - Tree layout direction (root → 4 NT branches → families → variants); ASCII sketch acceptable
  - Synapse animation guidance (dormant=灰虛線 / forming=藍實線 / potentiated=金光 / mastered=綠 glow)
  - Cosmetic category bbox convention (對齊 cosmetic-system spec bbox compliance rule)
  - Sprite style anchor (GBA-era, 384×384 transparent PNG, 16-color quantize)

## 7. apps/neurons-tw wire content + theme

- [x] 7.1 Update `apps/neurons-tw/package.json`:
  - Add `prebuild` hook: build `@study-rpg/core` + `@study-rpg/content-neurons-tw` + copy dist artifacts to `apps/neurons-tw/public/content/neurons-tw/`
  - Pattern adapter from `apps/medexam-tw/package.json` prebuild
- [x] 7.2 Rewrite `apps/neurons-tw/src/App.tsx`:
  - Use React `useEffect` to call `getContentPack()` on mount
  - Display:
    - Page title + Hebb quote (kept from scaffold)
    - 10 neuron family list (grouped by NT branch; family `displayName` + group + color swatch)
    - 4 NT stat key labels (with bilingual labels per statSchema)
    - Question total count from `pack.questions.length`
    - Subject id check: simple count assert (`pack.subjects.length === 10`)
  - Use only inline styles / CSS vars — no router, no Dexie, no auth wiring (still scaffold-light)
- [x] 7.3 Run `pnpm --filter @study-rpg/neurons-tw build` (via prebuild → core + content build → vite build); confirm output succeeds
- [x] 7.4 Verify `apps/neurons-tw/public/content/neurons-tw/{meta,subjects,questions}.json` exist after prebuild

## 8. Root package.json scripts

- [x] 8.1 Add `"build:neurons-content": "pnpm --filter @study-rpg/content-neurons-tw build"` to root package.json
- [x] 8.2 (Optional) Add convenience `"build:cf:neurons": ...` for Cloudflare Pages deploy; defer to `add-neurons-deploy` if cleaner

## 9. Smoke verify

- [x] 9.1 Run `pnpm -r typecheck` across 12 workspaces; expect 0 errors
- [x] 9.2 Chrome MCP preflight via `mcp__Claude_in_Chrome__list_connected_browsers` then start `pnpm --filter @study-rpg/neurons-tw dev`; navigate to `http://localhost:5175/` (or fallback port)
- [x] 9.3 Verify in Chrome:
  - 11 neuron family items visible (correct names + 4 NT branch group labels DA 2 / 5-HT 2 / GABA 3 / Glu 4)
  - 4 NT stat labels visible (DA / 5-HT / GABA / Glu bilingual)
  - Question total count matches medexam-tw's count (current ~3291)
  - 微生物學 + 免疫學 both present (合計 question count ≈ medexam-tw 461 微生物暨免疫學 數量)
  - 0 console errors (read_console_messages with onlyErrors=true)
- [x] 9.4 Kill neurons-tw dev server
- [x] 9.5 Regression check: ensure `apps/medexam-tw/` and `apps/medexam2-hospital-tw/` source unchanged; spot-check `pnpm --filter @study-rpg/medexam-tw typecheck` (already covered by Task 9.1, but explicit reassurance)
- [x] 9.6 Run `openspec validate wire-neurons-content-and-theme`; confirm passing
- [x] 9.7 Run `openspec validate --all --strict`; confirm 52/52 (or 53/53 if any added) passing

## 10. Pre-archive review

- [x] 10.1 Owner reviews 10-row subject↔family↔NT mapping table in design.md; iterate if any family naming feels off (subject displayName is a simple text change, no code impact)
- [x] 10.2 Owner reviews ~20-entry item catalog in items.ts for naming consistency (Greek letters / subscripts in artKey ok per existing convention; remove ambiguous duplicates)
- [x] 10.3 Owner reviews 20-entry cosmetic catalog and unlock predicate threshold values (`da >= 5` may be too easy / too hard — placeholder fine, refine later when telemetry is available)
- [x] 10.4 Owner reviews 4 NT branch × 9 node skill tree structure for medical-exam alignment
- [x] 10.5 Grep for accidental Glia mention in core code (umbrella spec scoped to neurons; glia could appear in DESIGN.md / cosmetic copy but should NOT appear in stat schema)
- [x] 10.6 Confirm content credits attribution intact in meta.json (陽明 CC-BY-NC + neurons reskin entry; per content-pack-contract Attribution Non-Removable requirement)
- [x] 10.7 Stage files for commit explicitly (per multi_agent_git_safety); confirm `git diff --cached --name-status` shows only intended new/modified paths; user explicit confirm before commit
