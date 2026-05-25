## Context

借鏡自 二階 `recruitment-gacha` + `affinity-specialty-bonus` (per `neurons-mode` Req 5 borrowing pattern). Semantic mappings:

| 二階 source | 神經元 here |
|---|---|
| Doctor (per-subject hire, can have many) | Neuron variant (per-family-per-slot, exactly one) |
| 醫師招募券 / 抽卡券 | 不存在 — AP threshold cross IS the trigger, gacha is automatic + free |
| `affinity[subjectId].correctCount` (gates banner unlock) | `actionPotential[familyId]` (gates slot unlock via 5-step ladder defined by `connectome-collection`) |
| Per-subject banner with one-time unlock + repeated rolls | Per-family-per-slot one-shot — slot fills exactly once, lifetime |
| `recruitment-gacha` pity (30-roll P3, 100-roll P2) | Per-slot rarity floor — slot 4 ≥ P3, slot 5 ≥ P2, slots 1–3 pure weight |
| `RecruitmentResultModal` + tier label + sprite + 保底 chip | `VariantUnlockModal` + tier label + sprite + 保底 chip + slot index |
| `DEFAULT_DOCTOR_TITLE_BY_RARITY` (`大P` / `主任` / `Senior V` / `Young V` / `R`) | `DEFAULT_VARIANT_TITLE_BY_RARITY` (神經元始祖 / 共振核心 / 穩態突觸 / 漂移末梢 / 失活幼苗) |
| `doctors` Dexie table (LWW, cloud sync) | `neuronVariants` Dexie table (local-only this change; cloud sync deferred to `add-neurons-deploy`) |

Critical scope-cut: this change does NOT modify `openspec/specs/recruitment-gacha/spec.md` and does NOT reuse its spec text. The borrowing-without-modification rule is enforced by `neurons-mode` Req 5 Scenario「Variant gacha design borrows recruitment-gacha pattern but declares own spec」.

**Current state**:
- `connectome-collection` already publishes `connectome.variantSlotUnlocked` events with payload `{ familyId, slotIndex, apAtUnlock }` (Req「Variant slot unlock SHALL emit event when family AP crosses one of five threshold values」)
- `neurons-motion-library` already exports `TOAST_AUTO_DISMISS_MS` + `useRespectsReducedMotion` + Framer Motion primitives
- `theme-pixel-neurons` already follows the `subject:<id>` sprite-key + 1×1 transparent-PNG placeholder pattern from scaffold phase, later upgraded by `generate-neurons-sprites`
- `packages/core/src/lib/gacha.ts` ships `rollGacha(config, stats, rng?)` generic — supports arbitrary tier identifiers, used by both `recruitment-gacha` and the legacy loot path

**Stakeholders**:
- Dogfood owner (the medical-student player) — primary user, motivated by closed-loop collection
- Future contributors forking neurons-mode for different subject domains — variant catalog + theme sprites should be content/theme-pack-driven, not hardcoded in core

## Goals / Non-Goals

**Goals:**
- Subscribe to `connectome.variantSlotUnlocked` exactly once per app boot; gracefully no-op on duplicate events (idempotency)
- Roll P1–P5 rarity per slot using canonical 60 / 25 / 10 / 4 / 1 weights, with slot-4 P3 floor + slot-5 P2 floor enforced via deterministic reroll (mirror `recruitment-gacha` targeted-ticket path)
- Persist `(familyId, slotIndex)` → variant row in Dexie v3 — composite PK enforces lifetime uniqueness
- Surface a player-facing modal + toast on unlock (Modal+toast 雙重儀式 confirmed by user)
- Variant displayName + flavour blurb live in `content-neurons-tw` (forkable); rarity-suffix mapping also in content pack
- Extend connectome page family card with `🧬 X / 5` collected-variants chip — live-updating via Dexie `useLiveQuery`

**Non-Goals:**
- Cloud sync of `neuronVariants` (no Supabase / R2 / Worker wiring — defer to `add-neurons-deploy`)
- Real pixel-art sprites for the 55 variants (placeholders this change; deferred follow-up = `generate-neuron-variant-sprites`)
- Leaderboard exposure of collection completeness (deferred to `add-neurons-leaderboard` — that change will add a `variant_count` column to leaderboard schema, mirror 二階 `subject_mastery_count`)
- Achievement triggers (e.g., "first P1 variant", "55/55 complete") — deferred to `add-neurons-achievements`
- Player rename of variants (out of scope — variants are stable named NPCs, not mutable like 二階 doctors)
- Manual reroll / dupe consume / variant fusion — none of those mechanics
- Pity counter / streak — closed-cap 55 means traditional pity (track N rolls without rare) is misapplied; per-slot floor handles the only real anxiety point (slot 5 grind feeling unrewarded)

## Decisions

### D1: Trigger model = pure AP slot unlock, NO separate affinity counter

**Decision**: `wire-neuron-variant-gacha` subscribes to `connectome.variantSlotUnlocked` events as its sole roll trigger. There is **no** `affinity[familyId]` counter introduced — the umbrella `neurons-mode` Req 1 wording about "affinity drives gacha unlock" is interpreted as imprecise pre-design language; `actionPotential` IS the gacha-driving counter.

**Rationale**:
- Two parallel counters (affinity + AP) for the same family would dilute the per-correct-answer payoff signal
- AP already has clear ladder semantics (10 / 30 / 80 / 200 / 500) — adding affinity duplicates the role
- Closed-cap collection (55 lifetime variants) motivates sustained question-answering more strongly than open-ended pity grinding (confirmed with dogfood owner)
- Eliminates a Dexie table, a sync table, and a counter UI element

**Alternatives considered**:
1. Affinity + AP dual track (mirror 二階's affinity behaviour exactly) — rejected: cognitive overload, dilutes AP threshold cross excitement
2. AP unlock + multi-roll per slot (open-ended) — rejected: removes Pokédex-style completion drive, weaker sustained engagement signal per dogfood-owner intuition

**Follow-up**: if dogfood telemetry later shows AP grind feels too slow or unrewarding at high slots, can add a secondary engagement mechanic (e.g. daily quest, weekly synapse-formation streak bonus) — but those would be new capabilities, not a re-introduction of affinity.

### D2: Rarity floor enforcement = deterministic reroll (5 attempts) then force-sample at floor tier

**Decision**: For slot 4 (P3 floor) and slot 5 (P2 floor), implement floor via deterministic reroll: roll up to 5 times using the canonical weight table; accept the first roll meeting the floor; if all 5 fail, force-sample uniformly from the floor tier. Mark `wasPityFloor = true` on the persisted row whenever the floor path was taken (either accepted by reroll OR forced).

**Rationale**:
- Mirrors `recruitment-gacha` Req「Targeted ticket consumption SHALL roll target banner with rarity-floor enforcement」exactly — same constant `TARGETED_REROLL_CAP = 5`, same fallback strategy. Single mental model for the dogfood owner across both apps
- Preserves the canonical 60 / 25 / 10 / 4 / 1 weight table as the only knob to tune (no per-slot weight ramping)
- `wasPityFloor` flag gives UI an unambiguous signal for the 保底 chip — no ambiguity about whether a P2 came from natural roll vs floor enforcement

**Alternatives considered**:
1. Per-slot weight ramping (e.g. slot 5 = 30/30/25/10/5) — rejected: 5 weight tables to balance, 5× the dogfood-tuning surface area
2. Truncate-and-renormalise (slot 5 weight table = drop P5, redistribute its 60 weight proportionally) — rejected: still 2 extra tables to maintain; reroll path is conceptually simpler and reuses existing helper

### D3: Variant displayName = content-pack-driven persona name + rarity suffix (auto-generated at roll time)

**Decision**: The persisted `neuronVariant.displayName` SHALL be computed at roll time as:
```
"<NEURON_VARIANT_CATALOG[familyId, slotIndex].displayName>"
  + "·"
  + "<DEFAULT_VARIANT_TITLE_BY_RARITY[rarity]>"
```
Example: 藥理學 slot 1 roll = P2 → `"初代代謝師 · 共振核心"`. The catalog name (`初代代謝師`) reflects the slot's narrative role (first-discovered variant of 藥理學 family); the rarity suffix (`共振核心`) reflects the gacha outcome.

**Rationale**:
- Two-part naming gives every variant a unique identifier (catalog name) AND a rarity flavour signal — both legible in toast / modal / roster
- Catalog names are content-pack-specific and forkable; rarity titles are content-pack-specific too but consistent across all 55 variants (mirror `recruitment-gacha`'s mapping pattern)
- Player does NOT rename variants — out of scope per proposal scope-cut. The auto-computed string is the final stored value, no `defaultName` separate from `name` (unlike 二階 doctors)

**Alternatives considered**:
1. Single-part name = catalog name only (no rarity suffix) — rejected: loses the rarity flavour signal, P5 vs P1 reads the same in toast
2. Three-part name (catalog + rarity + ordinal e.g. `#1`) — rejected: ordinal is meaningless when slots are unique (`(familyId, slotIndex)` IS the ordinal)

### D4: Sprite key + fallback chain

**Decision**: `neuronVariant.spriteKey` follows pattern `variant:<familyId>:<slotIndex>`. Theme pack lookup fallback chain:
```
variant:<familyId>:<slotIndex>
  → variant:<familyId>:default         (per-family fallback)
  → variant:default:<rarity>           (rarity-tier fallback — to be added by future change)
  → variant:default                    (terminal fallback)
```

This change registers all 55 `variant:<familyId>:<slotIndex>` keys mapping to the **1×1 transparent-PNG placeholder URI** used during scaffold phase. The terminal `variant:default` placeholder is also registered. Per-family / per-rarity fallback keys are NOT registered this change (no consumer yet; future-proofing only).

**Rationale**:
- Mirror `recruitment-gacha` Req「Theme pack sprite registry SHALL provide doctor sprites covering the fallback chain」structure exactly
- Same scaffold-era placeholder pattern as families had pre-`generate-neurons-sprites` — proven safe and renders without broken-image icons
- Real sprite generation deferred to follow-up = unblocks this change immediately without 55 codex-CLI image generations gating the spec landing

**Alternatives considered**:
1. Generate all 55 sprites in this change — rejected: ~2-4 min × 55 = 2-3.5 hour wall clock for codex CLI per `~/.claude/imports/codex_image_gen.md`; would balloon this change unnecessarily. Gemini MCP fallback also possible for non-complex icons (per `~/.claude/imports/image_gen_routing.md`) but still adds 30+ min serial wall time
2. Reuse the 11 family sprites for variants too (visual proxy) — rejected: defeats the variant-as-distinct-collectible feeling; toast/modal would show duplicate art for all 5 slot rolls of the same family

### D5: Reveal UX = `VariantUnlockModal` (dismiss-required) + `VariantUnlockToast` (auto-dismiss)

**Decision**: On successful roll:
1. Synchronously push a toast onto the existing `ConnectomeToastHost` (top-right vertical-stack, 8s auto-dismiss per `TOAST_AUTO_DISMISS_MS`) — copy: `🧬 <familyDisplayName> 變體 <variantDisplayName> 解鎖`
2. Open `VariantUnlockModal` (full-screen overlay, dismiss-required) — content: sprite (image-rendering:pixelated), family display name, variant displayName (full two-part), rarity badge (P-N + Chinese label), slot index chip, `保底` indicator iff `wasPityFloor = true`
3. Modal dismissal does NOT consume any state — purely UI

**Rationale**:
- Modal + toast 雙重儀式 confirmed by user (Q3 answer)
- Toast = ambient acknowledgement that doesn't block flow (player can keep quizzing); Modal = ceremonial reveal for the dopamine hit
- Mirror 二階 `RecruitmentResultModal` structure but **rename every doctor/hospital token** (per `neurons-mode` Req 5 borrowing rules)
- Reuse `neurons-motion-library` (Framer Motion + `useRespectsReducedMotion`) so prefers-reduced-motion users get fade-only entry — same pattern as `ConnectomeToastHost`

**Alternatives considered**:
1. Modal only (no toast) — rejected: if 2-3 slots unlock in rapid succession (e.g., starter session with many corrects), modal queue feels like a wall of pop-ups; toast deferral lets player batch-review
2. Toast only — rejected: lacks ceremonial weight; user explicitly chose 雙重儀式

### D6: Idempotency strategy = composite-PK upsert with pre-write existence check

**Decision**: The service entry point `handleSlotUnlock(event)` SHALL:
1. Read `db.neuronVariants.get({ familyId, slotIndex })` — if a row exists, return early (no event, no roll, no UI)
2. Otherwise: roll rarity → compute displayName → write row via `db.neuronVariants.put({...})` (Dexie upsert, but with the pre-check guard the row never exists at this point)
3. Emit modal+toast AFTER the Dexie write commits (per `connectome-collection` Req「Connectome service SHALL wrap all writes in a single Dexie transaction with events emitted after commit」)

**Rationale**:
- Connectome already guarantees `connectome.variantSlotUnlocked` fires at most once per slot (Req「Subsequent AP increments past 10 do not re-emit slot 1 event」+ `unlockedSlots` set persistence), so duplicate events SHOULD be impossible — but defensive pre-check costs ~1ms and prevents any future event-replay or dev-tool reset from creating a second variant
- Post-commit event emission matches the connectome capability's discipline; subscribers (modal, toast, page badge re-render) all observe a consistent post-write state

**Alternatives considered**:
1. Trust the connectome unlockedSlots set, skip pre-check — rejected: cheap defence-in-depth, especially given lifetime closed-cap semantics
2. Use Dexie unique-index constraint + try/catch on collision — rejected: hides idempotency behind exception handling, harder to test and reason about

## Risks / Trade-offs

- **[Risk]** Placeholder sprites ship to dogfood looking identical for all 55 variants → **Mitigation**: scaffold-era convention already established (family sprites went placeholder-first too); follow-up change `generate-neuron-variant-sprites` tracked in roadmap. Modal still meaningful because variantDisplayName + rarity badge carry the identity signal
- **[Risk]** Dexie v2→v3 migration on existing dogfood saves → **Mitigation**: pure additive — new table, no column changes on existing tables. Standard Dexie `upgrade` callback handles forward migration; rollback path = revert app version (Dexie auto-detects schema mismatch and refuses to open newer-schema DB on older app — single-user dogfood owner accepts this)
- **[Risk]** Modal+toast double-fire if 2+ slots unlock from a single answer (impossible by current AP rules — increment-1 per correct, only one threshold can cross per increment) → **Mitigation**: explicit invariant assertion in service code + scenario in spec that pins this assumption to AP-increments-by-1 contract
- **[Risk]** Player at AP 499 (1 question from slot 5 unlock) anticipates and overgrinds → **Trade-off**: this is the intended psychology, not a bug. The dogfood owner confirms closed-loop progression is the desired engagement model
- **[Trade-off]** Slot-4/5 floor uses deterministic reroll vs simpler per-slot weight tables — chose reroll for single-source-of-truth weight table. Cost: extra `rollGachaWithFloor` helper in core (~30 LOC); benefit: dogfood tuning never has to touch 5 separate tables

## Migration Plan

1. **Pre-flight check**: confirm `connectome-collection` capability is active and `connectome.variantSlotUnlocked` events fire correctly on AP threshold cross (validated by `add-connectome-collection` archive)
2. **Phase 1 — Core + content + theme**: ship `packages/core/src/lib/gacha.ts` `rollGachaWithFloor`, ship `content-neurons-tw/src/variants.ts` (55-entry catalog + 5 default-title mapping + weight + floor constants), register 55 placeholder sprite keys in `theme-pixel-neurons`. No app-level change yet — packages can publish independently if needed
3. **Phase 2 — App wiring**: Dexie v2→v3 upgrade, `variant-gacha.ts` service, `VariantUnlockModal` + `VariantUnlockToast` components, event subscriber wired at `main.tsx` boot, `ConnectomePage` family card chip extension
4. **Phase 3 — Verify**: typecheck (`pnpm -r typecheck`), build (`pnpm -r build`), Chrome MCP smoke (per `~/.claude/imports/chrome_mcp_preflight.md`):
   - Fresh save: trigger 10 correct answers in 1 family → slot 1 unlock → modal renders → variant row exists → page chip shows `🧬 1 / 5`
   - Replay event manually via DEV console (`globalThis.__connectomeBus.emit(...)`) → no second variant created (idempotency)
   - F5 reload mid-modal → modal does NOT re-fire (event already consumed pre-modal)
5. **Rollback**: if any phase fails, revert all commits — Dexie v3 schema is the only forward-only artifact, and v3 → v2 manual rollback is acceptable for single-user dogfood (`indexedDB.deleteDatabase('neurons-tw')` from devtools)

## Open Questions

- **Sprite generation tooling for follow-up**: codex CLI per `image_gen_routing.md` 為複雜場景優先, Gemini MCP 為簡單 icon 優先. 55 variants are individual-character portraits → leans codex (complex pose / personality). Will gate decision when `generate-neuron-variant-sprites` change is proposed; not blocking this change
- **Future leaderboard schema column for collection completeness**: `variant_count INTEGER DEFAULT 0` similar to 二階 `subject_mastery_count`? Or richer encoding like CSV badges? Defer to `add-neurons-leaderboard` design phase
- **Achievement granularity**: should the achievement system reward each P1 variant rolled OR the full 55/55 set OR per-family completion (5/5 for one family)? Defer to `add-neurons-achievements` design phase
