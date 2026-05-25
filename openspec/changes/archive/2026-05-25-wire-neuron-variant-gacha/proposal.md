## Why

`connectome-collection` already fires `connectome.variantSlotUnlocked` events at the 5 AP thresholds (10 / 30 / 80 / 200 / 500) per family — but **nothing listens**. The Hebbian collection loop is half-built: AP accrues, slots conceptually unlock, but no variant ever materialises in IndexedDB and no UI reveals the milestone. Without this listener-and-reveal layer the neurons-tw player has no payoff for grinding AP past slot 1, and the umbrella `neurons-mode` Req 1 promise — "drives variant collection growth" — is unfulfilled.

Shipping this change closes the loop with a closed-cap collection target (**55 variants total** = 11 neuron families × 5 slots) which the dogfood owner has confirmed will best motivate sustained question-answering (Pokédex pull > infinite slot machine).

## What Changes

- **New capability `neuron-variant-gacha`**: subscribes to `connectome.variantSlotUnlocked` from `connectome-collection`, auto-rolls a P1–P5 rarity per slot using the canonical 60 / 25 / 10 / 4 / 1 weight table, persists the resulting `neuronVariant` row, and surfaces reveal UX
- **Closed-loop variant cap**: each `(familyId, slotIndex)` produces **exactly one variant for the save's lifetime** — slot already filled emits no further rolls (idempotent on duplicate events)
- **Pity floor by slot tier**: slot 4 SHALL guarantee P3+ minimum, slot 5 SHALL guarantee P2+ minimum (mirrors the deterministic-reroll-then-floor strategy from `recruitment-gacha`'s targeted-ticket consume path); slots 1–3 are pure-weight rolls with no floor
- **Reveal UX**: `VariantUnlockModal` full-screen reveal (sprite + variant name + family + rarity label + slot index) **plus** `VariantUnlockToast` (8 s auto-dismiss, sourced from `neurons-motion-library`) — both mirror the `recruitment-gacha` RecruitmentResultModal pattern but carry no doctor/hospital terms
- **Content catalog**: `packages/content-neurons-tw` exports a `NEURON_VARIANT_CATALOG: NeuronVariantDef[]` of 55 named variants (one per slot per family), each with: `familyId`, `slotIndex`, `displayName` (the unique persona name — e.g., 藥理學 slot 1 = 「初代代謝師」), `spriteKey`, `description` (1–2 sentence flavour blurb). Variant names + descriptions are content-pack-specific; rarity is rolled per-save, not declared in the catalog
- **Default variant-name title mapping**: content pack also exports a `DEFAULT_VARIANT_TITLE_BY_RARITY` map (mirroring `DEFAULT_DOCTOR_TITLE_BY_RARITY` from 二階) so the displayed name appends a rarity-flavoured suffix (e.g., P1 = `· 神經元始祖`, P5 = `· 失活幼苗`)
- **Theme sprite registry — placeholders this change, real sprites later**: 55 `variant:<familyId>:<slotIndex>` sprite keys SHALL be registered in `theme-pixel-neurons` mapping to the 1×1 transparent-PNG placeholder used during scaffold phase. A follow-up change (separate from this propose) generates the real pixel-art assets via codex CLI per `~/.claude/imports/codex_image_gen.md` recipe — same pattern that `generate-neurons-sprites` followed for family icons
- **Dexie schema bump**: `neurons-tw` local DB v2 → v3, adds `neuronVariants` table with composite PK `(familyId, slotIndex)`, columns `rarity / displayName / spriteKey / rolledAt / wasPityFloor`
- **Connectome event subscriber**: `apps/neurons-tw/src/services/variant-gacha.ts` registers a singleton listener on the connectome event bus at app boot; idempotent against duplicate slot-unlock events (already-filled slot = no-op)
- **NOT in scope this change**: cloud sync of the `neuronVariants` table (deferred to `add-neurons-deploy`); real pixel-art sprites for the 55 variants (deferred to a follow-up `generate-neuron-variant-sprites`); leaderboard exposure of variant collection completeness (deferred to `add-neurons-leaderboard`); achievement triggers on variant unlock (deferred to `add-neurons-achievements`); player rename of variants (out of scope — variants are stable named NPCs, not customisable like 二階 doctors)

## Capabilities

### New Capabilities
- `neuron-variant-gacha`: AP-slot-driven variant collection — listens to connectome slot-unlock events, rolls P1–P5 rarity (with slot-4/5 pity floors), persists the result, surfaces modal+toast reveal, exposes a roster view of collected variants per family

### Modified Capabilities

None. This change explicitly does NOT modify `recruitment-gacha` (二階 source), `connectome-collection` (publisher of the trigger event), `neurons-mode` (umbrella already declared this capability would be deferred to this change), or `affinity-specialty-bonus`. The borrowing-without-modification pattern is mandated by `neurons-mode` Req 5.

## Impact

**Affected code**:
- `packages/core/src/lib/gacha.ts` — add `rollGachaWithFloor(config, stats, floor, rng?)` helper (deterministic reroll up to 5 times, then force-sample at floor tier). Existing `rollGacha` signature unchanged
- `packages/content-neurons-tw/src/variants.ts` — NEW, exports `NEURON_VARIANT_CATALOG` + `DEFAULT_VARIANT_TITLE_BY_RARITY` + `VARIANT_RARITY_WEIGHTS` (re-exports 60/25/10/4/1 for parity with 二階) + `SLOT_RARITY_FLOOR` (`{ 4: 'P3', 5: 'P2' }`)
- `packages/content-neurons-tw/src/index.ts` — re-export the new symbols
- `packages/theme-pixel-neurons/src/sprites.ts` — register 55 `variant:<familyId>:<slotIndex>` keys with placeholder URI (same pattern as scaffold-era family sprites)
- `apps/neurons-tw/src/lib/db.ts` — Dexie v2 → v3 migration adding `neuronVariants` table
- `apps/neurons-tw/src/services/variant-gacha.ts` — NEW, the singleton event subscriber + roll-and-persist orchestrator
- `apps/neurons-tw/src/components/VariantUnlockModal.tsx` — NEW
- `apps/neurons-tw/src/components/VariantUnlockToast.tsx` — NEW (uses `neurons-motion-library` primitives)
- `apps/neurons-tw/src/pages/ConnectomePage.tsx` — extend the family card to show `🧬 X / 5` collected-variants chip per family
- `apps/neurons-tw/src/main.tsx` (or equivalent boot path) — wire the variant-gacha listener at app init

**Affected APIs / contracts**:
- `connectome-collection` events: this change is a pure consumer; no event-shape changes to the publisher
- `@study-rpg/core` public API: `rollGachaWithFloor` is additive — existing `rollGacha` / `rollLoot` semantics unchanged (preserves Req「Generic gacha API in core SHALL replace internal loot implementation without breaking loot API」)

**Dependencies**: no new npm packages. Reuses `neurons-motion-library` (already shipped) for toast animation timing + `useRespectsReducedMotion`.

**Risks**:
- Dexie v3 migration on existing dogfood saves (currently v2): pure additive — new table, no column changes on existing tables. Standard Dexie `upgrade` callback handles forward migration; downgrade path not required (single-user dogfood)
- Idempotency of the connectome event subscriber: must handle duplicate slot-unlock events safely (already-filled `(familyId, slotIndex)` row = no roll, no event). Tested via verify checklist
- Placeholder sprites = ugly first impression: acceptable per scaffold-era convention, follow-up real-sprite change tracked in roadmap
