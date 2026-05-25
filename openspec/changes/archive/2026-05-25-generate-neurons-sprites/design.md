## Context

`theme-pixel-neurons` 目前 93 個 sprite key 全部 mapped to 1×1 transparent PNG data URI（`add-neurons-mode-scaffold` 留下的 placeholder）。本 change scope 鎖在 11 subject icons（neuron family）— 視覺 identity 最強的一層，且 future consumers 都會用到（overview / connectome / variant gacha modal / achievement modal 等）。其他 82 個 sprite 留 future per-consumer change。

技術上 mirror `theme-pixel-hospital` 的 `add-doctor-sprite-roster` 模式：sprite files 住 `packages/theme-pixel-neurons/sprites/<subfolder>/`，src/sprites.ts 用 `import.meta.glob` 自動 register。

## Goals / Non-Goals

**Goals:**

- Ship 11 neuron family sprites with real GBA-era pixel art aesthetic
- Each sprite visually reflects: (a) real neuron morphology hint, (b) NT branch color, (c) persona accessory matching family narrative role
- Pattern reproducible via documented prompts + regen procedure for future contributors / re-generation
- `import.meta.glob` mechanism ready to extend (cosmetics / items / skill placeholders 後續 change 加 glob 即可)
- Production build: sprites become Vite hashed URLs (cache-bustable), not inlined base64 (bundle stays lean)

**Non-Goals:**

- **不** generate items (20) / cosmetics (20) / skill placeholders (36) / 6 core scaffold sprites — separate future changes
- **不** generate per-rarity variants of subject sprites (P1-P5 variants live in `wire-neuron-variant-gacha`)
- **不**做 animated sprites（idle bounce / hit flash 等）— static frames only
- **不**改 sprite registry 對其他 82 keys 的 placeholder mapping
- **不**動 SUBJECT_IDS / FAMILY_BY_SUBJECT 等 data structures
- **不**用 codex CLI 路徑（per `image_gen_routing.md` 單一物件 icon Gemini-first）
- **不**生 retina @2x — 384×384 single-resolution sufficient for current viewport scales

## Decisions

### Decision 1: Gemini MCP for generation, not codex CLI

**Choice**: 所有 11 sprite 透過 `mcp__gemini__gemini_generate_image` 平行生成。

**Why**:
- Per `image_gen_routing.md`: 單一物件 / 中等複雜度 icon → Gemini-first
- 11 calls × 5 sec wallclock each, parallel-callable in one tool batch → ~10-15 sec total wallclock vs codex CLI 11 × 2-4 min = 30-45 min
- Gemini 不吃 codex Plus 試用配額
- Per existing Gemini pixel-art recipes in `image_gen_routing.md`: post-process via ImageMagick chroma-key + nearest-neighbor + 16-color quantize gives GBA aesthetic comparable to codex native pixel-art

### Decision 2: Post-process pipeline = ImageMagick chroma-key + downsample + quantize

**Choice**: Per Gemini output (typically 1024×1024 PNG with non-transparent solid-color background), post-process via:

```bash
corner=$(magick "$src" -format "%[pixel:p{0,0}]" info:)
magick "$src" -filter point -resize 384x384! +dither -colors 16 \
  -fuzz 10% -transparent "$corner" "PNG32:$out"
```

**Why**:
- 跟 `image_gen_routing.md` documented recipe 一致 — 已驗證在 study-rpg-m2 fate card art 路徑跑通
- Nearest-neighbor (`-filter point`) preserves pixel-art sharpness through resize
- 16-color quantize (`-colors 16`) hits GBA palette aesthetic
- Chroma-key (`-fuzz 10% -transparent <corner-pixel>`) removes Gemini's solid bg without harming sprite interior

### Decision 3: Sprite files live at `packages/theme-pixel-neurons/sprites/subjects/<subjectId>.png` (subfolder + Chinese filenames)

**Choice**: 
- 11 files: `藥理學.png`, `公共衛生學.png`, ..., `微生物學.png`
- Subfolder `subjects/` namespaces away from future cosmetics/items/etc.
- Chinese UTF-8 filenames per `theme-pixel-hospital/sprites/doctor-內科-P3.png` proven precedent

**Why**:
- Mirror equipment subfolder precedent established by `add-hospital-equipment-medexam2`
- Glob `'../sprites/subjects/*.png'` cleanly scoped to subject icons only
- Chinese filenames keep the artKey-to-filename mapping trivially obvious (key `subject:藥理學` → file `subjects/藥理學.png`)
- No filename munging / no transliteration table needed

### Decision 4: `import.meta.glob` with `?url` query — Vite hashed URL bundling

**Choice**: 
```ts
const subjectSprites = import.meta.glob('../sprites/subjects/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>
```

Then map to `SPRITE_MAP` with `subject:` prefix.

**Why**:
- Mirror `theme-pixel-hospital/src/sprites.ts` proven pattern
- `?url` query → Vite outputs hashed filename URL → cache-busts on rebuild
- `eager: true` → all sprites loaded at module init (no async lazy import surprises)
- Production: PNG files become `assets/藥理學-<hash>.png` referenced as `<img src>` — browser caches indefinitely until hash changes

### Decision 5: Prompt template per family — fixed structure, family-specific accessories

**Choice**: Each prompt follows template:

```
GBA-era pixel art neuron sprite, 384×384 centered, transparent background,
flat shading, 16-color limited palette. Subject: <neuron-type morphology hint>
neuron creature with cute round face, blob-style body shape echoing the real
<neuron-class> shape (e.g., Purkinje = elaborate dendritic tree fan above head;
Pyramidal = triangular body; ...). Color theme: <NT-branch color> primary
(<DA gold #d4a04d / 5HT red #c44d4d / GABA blue #6a9bc4 / Glu green #6a8c3f>).
Accessory: <persona-specific> (e.g., Thrill-Seeker = aviator sunglasses + lightning bolt;
Mathematician = small abacus; Judge = tiny gavel; Scout = compass + explorer hat).
Style reference: Pokemon Red/Blue Gen 1 sprites + Stardew Valley creature design.
No text. No watermark. Solid background color (#ffffff or single solid color
for chroma-key removal). Single creature centered.
```

**Why**:
- Fixed structure ensures consistency across 11 sprites (same lighting, same scale, same anatomy hint mechanism)
- Family-specific accessory injection creates per-family identity without departing from house style
- Solid background color makes ImageMagick chroma-key reliable
- "No text" guard prevents Gemini from spelling out family names on sprite

### Decision 6: Save raw Gemini PNGs to `/tmp/neurons-sprites-raw/` then post-process in-place to final destination

**Choice**: Two-stage pipeline:
1. Gemini saves raw 1024×1024 to `/tmp/neurons-sprites-raw/<subjectId>.png`
2. magick reads from /tmp, writes 384×384 quantized transparent to `packages/theme-pixel-neurons/sprites/subjects/<subjectId>.png`

**Why**:
- Gemini MCP's `save_dir` parameter is per-call — passing /tmp first then magick consolidates
- `/tmp/` raw files can be inspected if a particular sprite needs prompt tuning + regen
- magick is local + fast (~1 sec per image); no need to checkpoint

## Risks / Trade-offs

- **[Gemini might fail content-safety on some prompts (e.g., medical terms 解剖學 anatomy)]** → Per `image_gen_routing.md`: 醫療詞 偶爾卡 codex content gate；Gemini 通常照畫。If hit, retry with toned-down prompt (e.g., "explorer" instead of "anatomy") → 接受 (low likelihood for neuron art)
- **[Sprite visual inconsistency across 11 — different styles/lighting]** → Fixed prompt template (Decision 5) mitigates; if still inconsistent in regen, fix template + regen all 11 (cheap) → 接受
- **[Chinese filenames break on Windows / certain file systems]** → Per hospital precedent (doctor-內科-P3.png) Vite + macOS + Linux handle UTF-8 paths fine. Windows shouldn't be a target. → 接受
- **[Bundle size grows by ~330KB from 11 PNGs]** → Acceptable; PNG sprites load lazily on first render, don't bloat main bundle; hashed URLs cache long-term → 接受
- **[Gemini API rate limit hit on 11 parallel calls]** → Free tier limits known; if hit, fall back to serial calls (~1 min total). Wall time impact minor → 接受
- **[Style not matching existing connectome / overview pages]** → Pages currently render text-only (no sprite display yet on overview); when consumers render sprites, this is the first concrete style. Owner foreground review at end can flag mismatches → 接受

## Migration Plan

純 asset addition + 1 file edit. Steps:

1. Verify Gemini MCP loadable (`mcp__gemini__gemini_generate_image` schema available)
2. Mkdir `mkdir -p packages/theme-pixel-neurons/sprites/subjects` + `mkdir -p /tmp/neurons-sprites-raw`
3. Fire 11 parallel Gemini calls (one per family, each with per-family-tuned prompt per Decision 5) → save raw to `/tmp/neurons-sprites-raw/`
4. Post-process each raw via ImageMagick (Decision 2) → write final to `packages/theme-pixel-neurons/sprites/subjects/`
5. Verify all 11 final files exist + reasonable size (15-50KB each)
6. Edit `packages/theme-pixel-neurons/src/sprites.ts`:
   - Add `subjectSprites` glob block before `SPRITE_MAP` definition
   - Replace `...SUBJECT_IDS.map((id) => [`subject:${id}`, TRANSPARENT_PIXEL])` with spread of resolved subjectSprites
7. Write `packages/theme-pixel-neurons/SPRITE_GENERATION.md` documenting prompts + regen procedure
8. typecheck (`pnpm --filter @study-rpg/theme-pixel-neurons typecheck`)
9. Open `apps/neurons-tw/` dev server + visual check that overview page now shows real sprites for subject section (or wait for user foreground check)
10. `openspec validate generate-neurons-sprites --strict`
11. `/verify` (user-driven)
12. `/opsx:archive generate-neurons-sprites`

**Rollback**: `git rm packages/theme-pixel-neurons/sprites/subjects/*.png` + revert sprites.ts to TRANSPARENT_PIXEL spread. Spec is no-delta so archive sync is no-op.

## Open Questions

- **Should the prompts be language-mixed (Chinese family name + English prompt)?** Proposal: pure English prompt with English neuron type label (e.g., "VTA Dopaminergic" not "藥理學"). Gemini handles English better; subject ID is internal mapping concern only.
- **Should we generate 1024×1024 then quantize to 384×384, or ask Gemini for 384×384 native?** Proposal: 1024 → 384 quantize. Gemini's native quality is higher at 1024; quantize-down preserves more detail than native-low-res.
- **Should sprites be square or have aspect ratio?** Proposal: square 384×384. All consumers render in `<img>` with fixed aspect — square is universal.
- **What if a sprite comes out ugly?** Proposal: tune the family-specific prompt + regen just that one (Gemini is cheap). If 3+ ugly, revisit prompt template.
