## 1. Setup (5 min)

- [x] 1.1 Verify Gemini MCP loadable via ToolSearch
- [x] 1.2 `mkdir -p packages/theme-pixel-neurons/sprites/subjects /tmp/neurons-sprites-raw`

## 2. Generate raw sprites via Gemini parallel calls (~2 min wallclock)

- [x] 2.1 Fire 11 `mcp__gemini__gemini_generate_image` calls in parallel (one batch), one per neuron family — save_dir = `/tmp/neurons-sprites-raw/`
  - 藥理學 (VTA Dopaminergic — Thrill-Seeker, DA gold)
  - 公共衛生學 (SNc Dopaminergic — Aging Guardian, DA gold)
  - 寄生蟲學 (Enteric Serotonergic — Puppeteer's Puppet, 5HT red)
  - 組織學 (MRN Serotonergic — Quiet Curator, 5HT red)
  - 生物化學 (Cerebellar Purkinje — Mathematician, GABA blue)
  - 病理學 (Striatal MSN — Judge, GABA blue)
  - 免疫學 (PV+ Cortical Interneuron — Sentry Under Siege, GABA blue)
  - 解剖學 (DRG Sensory Afferent — Scout, Glu green)
  - 生理學 (Cortical Pyramidal L5 — CEO, Glu green)
  - 胚胎學 (Cajal-Retzius — Pioneer Architect, Glu green)
  - 微生物學 (Olfactory Sensory — Sentinel, Glu green)
- [x] 2.2 Verify all 11 raw files landed in `/tmp/neurons-sprites-raw/` with reasonable size (>50KB each, indicating real image not error placeholder)

## 3. Post-process via ImageMagick (~1 min)

- [x] 3.1 For each raw file, run the chroma-key + downsample + quantize recipe per design Decision 2; output to `packages/theme-pixel-neurons/sprites/subjects/<subjectId>.png`
- [x] 3.2 Verify all 11 final files exist with size 15-50KB (indicating successful quantize + transparent bg)

## 4. Wire into SPRITE_MAP (~5 min)

- [x] 4.1 Edit `packages/theme-pixel-neurons/src/sprites.ts`:
  - Add `subjectSprites` glob: `import.meta.glob('../sprites/subjects/*.png', { eager: true, query: '?url', import: 'default' })`
  - Map filename → `subject:<id>` key
  - Replace `...SUBJECT_IDS.map((id) => [`subject:${id}`, TRANSPARENT_PIXEL])` line in `SPRITE_MAP` definition with `...Object.entries(subjectSprites).map(...)`
- [x] 4.2 Keep all other sections (CORE_KEYS, ITEM_ART_KEYS, COSMETIC_ART_KEYS, SKILL_ART_KEYS) on TRANSPARENT_PIXEL unchanged

## 5. Documentation (~5 min)

- [x] 5.1 Write `packages/theme-pixel-neurons/SPRITE_GENERATION.md` covering: (a) which sprites are real vs placeholder; (b) 11 family prompts verbatim; (c) magick post-process recipe; (d) regen procedure for tweaking individual sprite

## 6. Verify (~10 min)

- [x] 6.1 typecheck: `pnpm --filter @study-rpg/theme-pixel-neurons typecheck` ✅
- [x] 6.2 typecheck: `pnpm --filter @study-rpg/neurons-tw typecheck` ✅ (after adding `vite-env.d.ts` + `vite-shims.d.ts` for import.meta.glob types)
- [ ] 6.3 (Optional foreground) Dev smoke: open localhost / overview page, verify subjects section shows real sprites instead of broken/blank
- [x] 6.4 `openspec validate generate-neurons-sprites --strict` ✅

## 7. Archive (~5 min)

- [ ] 7.1 `/verify` (optional, user-driven)
- [ ] 7.2 `/opsx:archive generate-neurons-sprites`
- [ ] 7.3 `openspec validate --all --strict` confirm 54+ specs valid post-merge (no-delta change so unchanged count)

**Estimated total wall time**: 35 min

## Acceptance criteria

- [ ] 11 PNG files exist at `packages/theme-pixel-neurons/sprites/subjects/<subjectId>.png`
- [ ] Each file is 384×384, ≤50KB, 16-color quantized, transparent background
- [ ] `sprites.ts` SPRITE_MAP has 11 real subject URLs (not TRANSPARENT_PIXEL)
- [ ] typecheck pass (both theme-pixel-neurons + neurons-tw)
- [ ] `SPRITE_GENERATION.md` documents all 11 prompts + regen procedure
- [ ] Foreground visual: each family has distinct identity-relevant sprite (Mathematician with abacus, Judge with gavel, etc.)
