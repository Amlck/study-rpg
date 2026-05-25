## Why

`add-neurons-achievements` (2026-05-25) shipped with SVG placeholder rendering for `BadgeSprite` (emoji + tier-color ring) and explicitly reserved `FamilyMasteryBadgeSprite` for a future change. Both spec requirements were amended mid-apply to accept placeholder mode + reserve atlas mode for follow-up. This is that follow-up.

Two atlas assets are now ready to generate via codex CLI batch:

1. **`badge-atlas.png`** — 7 categories × 4 tiers = 28 cells (896×512 px, 128 px cells, GBA pixel-art, transparent bg). Drop-in replacement for placeholder rendering. Public API of `BadgeSprite` unchanged.
2. **`family-mastery-atlas.png`** — 11 neuron families × 5 mastery tiers (P5 → P1) = 55 cells (1408×640 px). Powers a new `FamilyMasteryBadgeSprite` component with at least one consumer site (ConnectomePage family cards alongside existing `MasteryChip`).

## What Changes

- **Generate `badge-atlas.png`** via codex CLI (~10–20 min wall time, one-shot prompt covering full 7×4 grid)
- **Generate `family-mastery-atlas.png`** via codex CLI (~10–20 min, one-shot 11×5 grid)
- **Drop assets** to `apps/neurons-tw/src/assets/achievements/`
- **Swap `BadgeSprite.tsx`** from SVG placeholder → CSS `background-position` atlas mode. Single-file change; props API (`category` / `tier` / `size` / `locked`) unchanged
- **Create `FamilyMasteryBadgeSprite.tsx`** with `{familyId, masteryTier, size}` props sourcing cells from atlas; alphabetical family-id → column index mapping
- **Wire FamilyMasteryBadgeSprite into ConnectomePage** family cards as a visual companion alongside the existing `MasteryChip` (per the spec "ship atlas + component + ≥ 1 consumer site as a coherent unit" requirement)
- **Spec amendments** in `neurons-achievements` capability:
  - MODIFY「BadgeSprite component SHALL render category × tier badges with atlas-ready API」 → drop placeholder allowance; atlas mode is now the ship-time state
  - MODIFY「FamilyMasteryBadgeSprite component slot SHALL be reserved without partial implementation」 → replace reservation with actual SHALL requirements covering atlas + component + consumer
- **Vite build** automatically picks up new assets in `src/assets/`; no config change required
- **No** changes to: trigger hooks / catalog / Dexie schema / leaderboard derivation / reward dispatcher / AchievementsPage layout / AchievementCard / AchievementToastHost / AchievementUnlockModal

## Capabilities

### New Capabilities

無 — this change updates an existing capability.

### Modified Capabilities

- `neurons-achievements`: MODIFY 2 existing requirements (BadgeSprite placeholder allowance dropped; FamilyMasteryBadgeSprite reservation replaced with functional requirement)

## Impact

**Code**
- New: `apps/neurons-tw/src/assets/achievements/badge-atlas.png` (~30–80 KB)
- New: `apps/neurons-tw/src/assets/achievements/family-mastery-atlas.png` (~50–150 KB)
- New: `apps/neurons-tw/src/components/FamilyMasteryBadgeSprite.tsx`
- Modified: `apps/neurons-tw/src/components/BadgeSprite.tsx` (~30 line rewrite, public API unchanged)
- Modified: `apps/neurons-tw/src/routes/ConnectomePage.tsx` (1 import + 1 component render per family card)
- Possibly modified: Vite config — `import.meta.glob` for asset registration if not already covered by default static-asset handling

**Data / Schema** — none. No Dexie change. No D1 change. No Supabase change. No content-pack change. Catalog stays at 30 entries.

**Build & CI** — Vite default static-asset pipeline handles PNG imports. Gzipped atlas adds ~30–150 KB to bundle.

**Dependencies** — none added.

**Out of scope**
- ❌ Leaderboard row mastery-badge display (different concern; would need Worker schema change)
- ❌ Per-cell sprite alternative rendering (sticking with atlas mode for consistency)
- ❌ AchievementsPage layout changes (Card already renders BadgeSprite; atlas swap is automatic)
- ❌ Animation on badge unlock (out of scope; toast/modal already animate via motion library)
