> **STATUS (2026-05-30 checkpoint)**: 53/55 sprites generated + wired + typecheck green + doc done.
> Generation pivoted from Gemini → **codex CLI** (Gemini image-gen unavailable: "not available in your location", looks geo/account-restricted). codex hit its usage limit at 53/55; **微生物學 slots 4 & 5 remain** (fall back to transparent placeholder — app works). Finish those 2 + dev smoke + archive after codex quota resets (~23:30).

## 1. Setup

- [x] 1.1 Verify Gemini MCP loadable via ToolSearch (loaded OK, but returned "image creation not available in your location" → pivoted to codex CLI)
- [x] 1.2 `mkdir -p packages/theme-pixel-neurons/sprites/variants /tmp/neurons-variant-sprites-raw`
- [x] 1.3 Read `packages/content-neurons-tw/src/variants.ts` `NEURON_VARIANT_CATALOG` — confirmed 11 families × 5 slots = 55 entries, extracted persona names + blurbs

## 2. Author prompts (per design Decision 5)

- [x] 2.1 Wrote 11 per-family base fragments (neuron-type silhouette + NT-branch hex color + house style)
- [x] 2.2 Confirmed the 5 uniform slot stage-modifiers (newcomer → legendary apex)
- [x] 2.3 Assembled 55 full prompts = base × stage with per-slot persona accessory (in `/tmp/gen-variants.sh`)

## 3. Generate raw sprites (codex CLI fallback, batched by family)

- [x] 3.1 Generated via codex CLI `gpt-image-2` (Gemini unavailable), concurrency-5 batch script `/tmp/gen-variants.sh`. **53/55 done** — 微生物學 slots 4 & 5 FAILED on codex usage limit ("try again at 11:30 PM"), NOT content-gate
- [x] 3.2 No content-gating hit — prompts kept all clinical nouns out (pure creature + color + persona), so 解剖/病理/寄生蟲/免疫 all generated fine
- [x] 3.3 Verified raw files: 53/55 present; 2 missing identified (微生物學-4, 微生物學-5) with root cause = quota
- [ ] 3.4 **PENDING (codex quota ~23:30)**: regen 微生物學-4 (master) + 微生物學-5 (legendary apex), green Sentinel persona matching slots 1–3

## 4. Post-process via ImageMagick (per design Decision 2)

- [x] 4.1 Ran chroma-key + nearest-neighbor 384×384 + 16-color quantize on all 53 → `sprites/variants/<familyId>-<slot>.png`
- [x] 4.2 Verified 53 final files: all 384×384, ≤50 KB, transparent (2 micro slots pending generation)

## 5. Per-family QA + regen loop (the coherence gate)

- [x] 5.1 Reviewed 11×5 grid montage (`/tmp/variant-grid.png`): NT color coding correct (gold/red/blue/green by branch), within-family slot 1→5 escalation reads, Purkinje fan-tree differentiates 生物化學
- [x] 5.2 No family required style regen — all 10 complete families coherent on first pass
- [x] 5.3 All 10 complete families pass coherence; 微生物學 passes for slots 1–3 (4–5 pending generation, will match)

## 6. Wire into SPRITE_MAP

- [x] 6.1 Added `variantSprites` glob + filename→key parse (split on LAST `-`) in `sprites.ts`
- [x] 6.2 Replaced 55 `TRANSPARENT_PIXEL` variant entries with `variantSprites[k] ?? TRANSPARENT_PIXEL`; `variant:default` stays placeholder; other categories unchanged
- [x] 6.3 Missing-file fallback verified: 2 ungenerated slots safely resolve to placeholder (no broken-image)

## 7. Documentation

- [x] 7.1 Extended `SPRITE_GENERATION.md`: variant section with 11 base fragments + 5 stage modifiers + codex recipe + regen procedure + quota/zsh gotchas

## 8. Verify

- [x] 8.1 typecheck: `pnpm --filter @study-rpg/theme-pixel-neurons typecheck` ✅
- [x] 8.2 typecheck: `pnpm --filter @study-rpg/neurons-tw typecheck` ✅
- [ ] 8.3 **PENDING**: Dev smoke (Chrome MCP) → unlock/open variant, real sprite renders, console clean
- [ ] 8.4 **PENDING**: `openspec validate generate-neuron-variant-sprites --strict`

## 9. Archive (PENDING — after 55/55)

- [ ] 9.1 `/verify` (optional, user-driven)
- [ ] 9.2 `/opsx:archive generate-neuron-variant-sprites`
- [ ] 9.3 `openspec validate --all --strict` confirm specs valid post-merge

## Acceptance criteria

- [ ] 55 PNG files exist at `packages/theme-pixel-neurons/sprites/variants/<familyId>-<slotIndex>.png` (**53/55** — 2 pending codex quota)
- [x] Each file is 384×384, ≤50 KB, 16-color quantized, transparent background (verified for the 53)
- [x] `sprites.ts` `SPRITE_MAP` has real variant URLs (53) with safe fallback; `variant:default` stays placeholder
- [x] Within each family the 5 slots read as one neuron archetype evolving (10/11 verified; 微生物學 pending its 2)
- [x] typecheck passes (both `theme-pixel-neurons` + `neurons-tw`)
- [x] `SPRITE_GENERATION.md` documents the prompts + regen procedure
- [ ] Dev smoke: variant unlock modal shows real art instead of blank (PENDING)
