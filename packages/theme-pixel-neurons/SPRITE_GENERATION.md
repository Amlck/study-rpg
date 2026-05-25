# Neuron Sprite Generation

This document covers the 11 neuron family subject icons in `sprites/subjects/`.
Other categories (items / cosmetics / skill placeholders / 6 core scaffold keys)
remain on placeholder PNG until their respective consumer capabilities ship.

## Status

| Category | Sprite count | Status |
|---|---|---|
| Subject icons (neuron families) | 11 | ✅ Real (this doc) |
| Item art | 20 | ⏳ Placeholder until variant gacha / inventory ships |
| Cosmetic art | 20 | ⏳ Placeholder until dorm-view consumer ships |
| Skill placeholders | 36 | ⏳ Placeholder until skill tree consumer ships |
| Core scaffold (character-base, slot-placeholder-*, dorm-default) | 6 | ⏳ Placeholder until character / dorm consumer ships |

## Generation tool

Codex CLI `gpt-image-2` via `codex exec` (per `~/.claude/imports/codex_image_gen.md`
recipe + `~/.claude/imports/image_gen_routing.md` routing rules).

**Note (2026-05-25)**: codex 0.128.0 requires `--skip-git-repo-check` when
running from `/tmp` — the `codex_image_gen.md` memo predates this and needs an
update. Recipe used:

```bash
cd /tmp && codex exec --sandbox workspace-write --skip-git-repo-check \
  "<prompt>. Save the result to /tmp/<filename>.png. \$imagegen" \
  < /dev/null
mv /tmp/<filename>.png <project>/packages/theme-pixel-neurons/sprites/subjects/<filename>.png
```

Wall time: ~2-3 min per sprite, ~35 min serial for all 11.

Why codex not Gemini MCP: Gemini hit auth "image creation not available in your
location" on 2026-05-25 attempt; codex fallback per `image_gen_routing.md`.

## Prompt template

```
GBA-era pixel art sprite, 384x384 centered, transparent background, flat shading,
16-color limited palette. Single creature centered: cute <neuron-type> neuron
creature with friendly round face. Body morphology echoes real <neuron-class>:
<morphology-hint>. Color theme: <NT-color-name> (<hex>) as primary body color.
Personality: <persona>. Accessories: <persona-accessory>. Style reference:
Pokemon Red/Blue Gen 1 sprites + Stardew Valley creature design. No text, no
watermark.
```

## 11 family prompts

| # | File | Neuron type | NT color | Morphology hint | Accessory |
|---|---|---|---|---|---|
| 1 | 藥理學.png | VTA Dopaminergic | gold #d4a04d | small spherical soma + short axon | Thrill-Seeker: aviator sunglasses + lightning bolt |
| 2 | 公共衛生學.png | SNc Dopaminergic | gold #d4a04d | pyramidal-ish soma + longer dendrite | Aging Guardian: gray beard + reading glasses + walking stick |
| 3 | 寄生蟲學.png | Enteric Serotonergic | red #c44d4d | small spherical body | Puppeteer's Puppet: marionette strings + cross-bar at top |
| 4 | 組織學.png | MRN Serotonergic | red #c44d4d | simple bipolar | Quiet Curator: magnifying glass + scroll + cardigan |
| 5 | 生物化學.png | Cerebellar Purkinje | blue #6a9bc4 | **huge fan-shaped dendritic tree above head** (defining feature) | Mathematician: abacus or chalkboard with equation |
| 6 | 病理學.png | Striatal MSN | blue #6a9bc4 | medium soma + spiny dendrites | Judge: gavel + powdered wig + judge robe |
| 7 | 免疫學.png | PV+ Cortical Interneuron | blue #6a9bc4 | compact dense soma | Sentry Under Siege: shield + spear + helmet |
| 8 | 解剖學.png | DRG Sensory Afferent | green #6a8c3f | pseudo-unipolar (one process splits into two) | Scout: compass + explorer hat + binoculars |
| 9 | 生理學.png | Cortical Pyramidal L5 | green #6a8c3f | **triangular soma + apical dendrite up** (defining feature) | CEO: business suit + briefcase + sunglasses |
| 10 | 胚胎學.png | Cajal-Retzius | green #6a8c3f | **horizontal bipolar, layer 1 cortex** (defining feature) | Pioneer Architect: blueprint scroll + hardhat + T-square |
| 11 | 微生物學.png | Olfactory Sensory | green #6a8c3f | **long apical dendrite + cilia tuft on top** (defining feature) | Sentinel: spyglass + tiny watchtower silhouette |

## Regenerate a single sprite

If a sprite needs tweaking (visual doesn't read right, persona accessory wrong, etc.):

```bash
cd /tmp && codex exec --sandbox workspace-write --skip-git-repo-check \
  "<edited-prompt>. Save the result to /tmp/<filename>.png. \$imagegen" \
  < /dev/null
# Verify
ls -la /tmp/<filename>.png
# Replace in project
mv /tmp/<filename>.png /Users/kangweiling/coding-scratch/study-rpg-neurons/packages/theme-pixel-neurons/sprites/subjects/<filename>.png
```

Vite dev server auto-reloads the sprite via HMR (`import.meta.glob` watches the
directory). Hashed URLs regenerate on next prod build.

## Why not Gemini MCP

Gemini was the planned tool per `image_gen_routing.md` Decision (simple icons →
Gemini-first, ~5 sec/image, parallel-callable). On 2026-05-25 attempt, all 11
parallel Gemini calls returned auth "image creation not available in your
location" — likely needs `nlm login` refresh. Codex CLI was the fallback per the
same routing memo; slower (~2-3 min/sprite sequential) but reliable.

For future regen, try Gemini first; if still failing, follow the codex recipe above.

## Bundle impact

11 PNG files, total ~440 KB on disk:

```
12 KB 胚胎學.png
21 KB 解剖學.png
23 KB 寄生蟲學.png
23 KB 組織學.png
28 KB 微生物學.png
29 KB 生物化學.png
29 KB 病理學.png
57 KB 生理學.png
61 KB 藥理學.png
65 KB 公共衛生學.png
98 KB 免疫學.png
```

Vite production build bundles each with hashed URL (cache-busting). Sprites are
loaded as `<img src>` URLs, not inlined to main bundle. Browser caches indefinitely
until hash changes.
