## Why

`add-neurons-mode-scaffold` + `wire-neurons-content-and-theme` shipped `theme-pixel-neurons` with all 93 sprite keys mapped to a 1×1 transparent PNG data URI placeholder. The 11 neuron family icons are the **highest-identity visual element** in the entire neurons mode (`/` overview page lists them grouped by NT branch, `/connectome` page displays them per family card, future variant gacha + achievement modals will all reference them). Without real sprites, the app reads as "spec wire-up demo" rather than a game.

Per `image_gen_routing.md`, single-object cute pixel-art icons → Gemini MCP first (~5 sec / image, parallel-callable). Codex CLI is reserved for complex scenes; not needed here.

Scope **only 11 subject icons** in this change — items (20) / cosmetics (20) / skill placeholders (36) / 6 core scaffold keys all stay placeholder until their respective consumer capabilities ship. This keeps the change small, parallelizable, and high-ROI.

## What Changes

- Generate 11 GBA-era pixel-art neuron sprites (one per neuron family, 384×384, 16-color quantized, transparent background) via Gemini MCP parallel calls
- Each sprite reflects: (a) the real neuron morphology referenced in the family name (Purkinje = huge dendritic tree, Pyramidal = triangle body, etc.); (b) NT branch color tint (DA gold / 5HT red / GABA blue / Glu green); (c) cute persona accessory matching the family's narrative role (Mathematician = abacus, Judge = gavel, Scout = compass, etc.)
- Save to `packages/theme-pixel-neurons/sprites/subjects/<subjectId>.png` (Chinese filenames, mirrors `theme-pixel-hospital/sprites/doctor-內科-P3.png` precedent)
- Refactor `packages/theme-pixel-neurons/src/sprites.ts` to:
  - Use Vite `import.meta.glob('../sprites/subjects/*.png', { eager, query: '?url', import: 'default' })` for the subject sprites
  - Map glob result keys to `subject:<id>` keys in `SPRITE_MAP`
  - Keep all other sprite categories (core / items / cosmetics / skill placeholders) on the transparent placeholder for now
- Add `packages/theme-pixel-neurons/SPRITE_GENERATION.md` documenting the 11 prompts + regen procedure (mirrors hospital convention)

**不做**：

- 不 generate 其他 82 個 sprite keys（items / cosmetics / skill placeholders / 6 core scaffold）— 留 future change per-consumer
- 不改 sprite size from 384×384 GBA convention
- 不 ship 多套 rarity variants per family（P1-P5 variant art 留 `wire-neuron-variant-gacha` follow-up）
- 不 wire sprites into UI components — `theme-pixel-neurons` SPRITE_MAP 是 single source；consumers 透過 `pack.subjects[i].artKey = 'subject:藥理學'` 自然 resolve

## Capabilities

### Modified Capabilities

- 無 spec change（sprite generation 純 asset 增加，不改 capability behavior；`theme-pack-contract` 既有要求只規定「SPRITE_MAP 提供 valid URL for every artKey」— placeholder PNG 跟 real PNG 都符合，behavior 一致）

### New Capabilities

- 無

## Impact

- **Code**:
  - `packages/theme-pixel-neurons/sprites/subjects/<11 files>.png`（新；each ~20–40 KB after 16-color quantize）
  - `packages/theme-pixel-neurons/src/sprites.ts`（modified：subject section 改用 `import.meta.glob`，其他 sections 不動）
  - `packages/theme-pixel-neurons/SPRITE_GENERATION.md`（新；documents prompts + regen procedure）
- **APIs**: 無
- **Dependencies**: 無 npm 新增
- **Data**: 無 Dexie / R2 / event schema 變動
- **Backwards compat**: 純 asset 替換；任何 consumer 已透過 SPRITE_MAP['subject:X'] 拿 URL 都會自然升級
- **Sync**: 不碰
- **Spec touched**: 無
- **Bundle delta**: 11 sprites × ~30 KB = ~330 KB raw；Vite 會用 hashed URLs + lazy load via image tag，不會炸進 main bundle；只在 page render 時請求
