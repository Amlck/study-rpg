## 1. Core gacha helper

- [x] 1.1 Add `rollGachaWithFloor(config, stats, floor, rerollCap, rng?)` to `packages/core/src/lib/gacha.ts`; degenerates to `rollGacha` when `floor === null`; deterministic reroll-then-force-sample strategy otherwise
- [x] 1.2 Add unit / inline assertions that `rollGachaWithFloor` with `floor=null` returns identical PRNG-deterministic tier to `rollGacha`
- [x] 1.3 Verify existing `rollGacha` + `rollLoot` signatures and behaviour unchanged (snapshot 10k-roll distribution check)
- [x] 1.4 Re-export `rollGachaWithFloor` from `packages/core/src/index.ts`
- [x] 1.5 `pnpm --filter @study-rpg/core build` succeeds; dist `.d.ts` includes the new export

## 2. Content pack — variant catalog + constants

- [x] 2.1 Create `packages/content-neurons-tw/src/variants.ts`
- [x] 2.2 Export `VARIANT_RARITY_WEIGHTS` as `[{id:'P5',weight:60},{id:'P4',weight:25},{id:'P3',weight:10},{id:'P2',weight:4},{id:'P1',weight:1}]`
- [x] 2.3 Export `SLOT_RARITY_FLOOR: Record<number, Rarity | null>` = `{1:null, 2:null, 3:null, 4:'P3', 5:'P2'}`
- [x] 2.4 Export `VARIANT_REROLL_CAP = 5` (locked literal)
- [x] 2.5 Export `DEFAULT_VARIANT_TITLE_BY_RARITY: Record<Rarity, string>` = `{P1:'神經元始祖', P2:'共振核心', P3:'穩態突觸', P4:'漂移末梢', P5:'失活幼苗'}`
- [x] 2.6 Author `NEURON_VARIANT_CATALOG: NeuronVariantDef[]` with all 55 entries (11 families × 5 slots). Each entry has unique `displayName` reflecting slot narrative role (e.g., slot 1 = 「初代...」/「初代代謝師」, slot 5 = 「末代...」/「末代記憶守...」); use OpenEvidence anchored neurology rationale where slot/family pairing implies a real cell-type signature (per CLAUDE.md neuroscience design verification rule)
- [x] 2.7 Each catalog entry has 1–2 sentence `description` flavour blurb (player-facing, content-pack-domain-specific)
- [x] 2.8 Re-export new symbols from `packages/content-neurons-tw/src/index.ts`
- [x] 2.9 Build script asserts catalog length is exactly 55 + each entry has non-empty `displayName / spriteKey / description` (fail loudly if not)
- [x] 2.10 `pnpm --filter @study-rpg/content-neurons-tw build` succeeds; dist artifact includes catalog

## 3. Theme pack — sprite registry placeholders

- [x] 3.1 Extend `packages/theme-pixel-neurons/src/sprites.ts` `SPRITE_MAP` with 55 `variant:<familyId>:<slotIndex>` keys, all mapping to the 1×1 transparent-PNG data URI placeholder used during scaffold phase
- [x] 3.2 Add terminal fallback key `variant:default` mapping to the same placeholder
- [x] 3.3 `pnpm --filter @study-rpg/theme-pixel-neurons build` succeeds; dist exposes the new entries

## 4. App — Dexie v3 migration

- [x] 4.1 Bump `apps/neurons-tw/src/lib/db.ts` schema version 2 → 3
- [x] 4.2 Define `neuronVariants` table with composite PK `[familyId, slotIndex]` + secondary index on `rolledAt`
- [x] 4.3 Add `NeuronVariantRow` TypeScript interface with all 7 fields (`familyId / slotIndex / rarity / displayName / spriteKey / rolledAt / wasPityFloor`)
- [x] 4.4 Verify upgrade callback runs cleanly on a v2 save (no data loss in existing `familyAccrual` / `synapses` tables)
- [x] 4.5 DEV-only console assertion at app boot logs current Dexie version and the number of `neuronVariants` rows

## 5. App — Service layer (variant-gacha.ts)

- [x] 5.1 Create `apps/neurons-tw/src/services/variant-gacha.ts`
- [x] 5.2 Implement `handleSlotUnlock(event)` function: idempotency check → roll via `rollGachaWithFloor` with content-pack floor → compose displayName → write row inside a single Dexie transaction → post-commit emit modal+toast events
- [x] 5.3 Implement `registerVariantGachaSubscriber(eventBus)` singleton — registers the handler once, idempotent on repeated calls (no double-subscription bug)
- [x] 5.4 Wrap handler body in try/catch; `console.error` on failure; do not re-throw to publisher
- [x] 5.5 Wire `registerVariantGachaSubscriber` into `apps/neurons-tw/src/main.tsx` (or equivalent boot path) so it activates at app init alongside the connectome service
- [x] 5.6 DEV-only `globalThis.__variantGacha` exposes `{ rerollLast?: never, peekLast?: () => ... }` debug handles gated by `import.meta.env.DEV`

## 6. App — UI components

- [x] 6.1 Create `apps/neurons-tw/src/components/VariantUnlockModal.tsx`: full-screen overlay, dismiss-required, renders sprite + family name + variant displayName + rarity badge + slot chip + conditional 保底 badge
- [x] 6.2 Modal uses Framer Motion entry variants from `'../lib/motion'`; `useRespectsReducedMotion` degrades to opacity fade
- [x] 6.3 Modal sprite resolves via `theme-pixel-neurons` `SPRITE_MAP[spriteKey]` with fallback to `variant:default`; renders with `image-rendering: pixelated`
- [x] 6.4 Create `apps/neurons-tw/src/components/VariantUnlockToast.tsx`: uses `ConnectomeToastHost` queue; imports `TOAST_AUTO_DISMISS_MS` from motion library (no local literal `8000`)
- [x] 6.5 Toast copy: `🧬 <familyDisplayName> 變體 <variantDisplayName> 解鎖`; tone matches existing connectome toast for parity
- [x] 6.6 Wire variant-gacha event emissions to a small in-memory dispatcher consumed by both modal mount logic + toast push

## 7. App — ConnectomePage chip

- [x] 7.1 Extend the family card component in `ConnectomePage.tsx` to compute per-family variant count via Dexie `useLiveQuery` (`db.neuronVariants.where('familyId').equals(id).count()`)
- [x] 7.2 Render `🧬 X / 5` chip alongside existing AP / next-threshold chip
- [x] 7.3 When `X === 5`, swap chip to `🏆 5 / 5` celebratory variant with gold accent (CSS variant — no toast/modal side-effect)
- [x] 7.4 Chip visible regardless of unlock state (locked families also show `🧬 0 / 5`)

## 8. Build + content-build integration

- [x] 8.1 Re-run `pnpm --filter @study-rpg/content-neurons-tw build` so the dist includes the catalog
- [x] 8.2 Copy/rebuild app's `apps/neurons-tw/public/content/neurons-tw/` if catalog is consumed via that path; otherwise verify direct package import path resolves
- [x] 8.3 `pnpm -r build` succeeds across all 4 affected packages
- [x] 8.4 `pnpm -r typecheck` clean

## 9. Verify — Chrome MCP smoke test

- [x] 9.1 Preflight `mcp__Claude_in_Chrome__list_connected_browsers` (per `~/.claude/imports/chrome_mcp_preflight.md`)
- [x] 9.2 Boot `apps/neurons-tw` dev server (`pnpm --filter @study-rpg/neurons-tw dev`)
- [x] 9.3 Navigate to root; verify no console errors (DEV `__db` exposes Dexie v3)
- [x] 9.4 Trigger 10 correct answers in 1 family (or use DEV bus emit on `connectome.variantSlotUnlocked` for `familyId='藥理學', slotIndex=1`): observe `VariantUnlockModal` renders + toast pushes + Dexie row created
- [x] 9.5 Dismiss modal; F5 reload; verify modal does NOT re-fire (event already consumed pre-modal)
- [x] 9.6 Manually emit duplicate event for same `(familyId, slotIndex)`: verify no second variant created, no UI fires (idempotency)
- [x] 9.7 Manually emit events for all 5 slots of one family: verify family card chip transitions `0/5 → 1/5 → ... → 🏆 5/5`
- [x] 9.8 Test slot 5 floor: manually emit slot-5 event 10 times with biased PRNG (or seed) producing P5 baseline; verify all rolls produce P2-or-better, `wasPityFloor === true`, modal 保底 badge renders
- [x] 9.9 Verify SPA route F5 + direct URL on `/connectome` still works (per `chrome_mcp_preflight.md` SPA validation triad)
- [x] 9.10 Verify `prefers-reduced-motion` setting causes modal to use opacity-only entry (toggle in OS or DevTools rendering panel)

## 10. Wrap-up

- [x] 10.1 Run `openspec validate --change wire-neuron-variant-gacha --all` — expect green
- [x] 10.2 Run `/opsx:verify wire-neuron-variant-gacha` — expect completeness / correctness / coherence all pass
- [x] 10.3 Optional `/codex:review` per CLAUDE.md trial — focus on `rollGachaWithFloor` correctness + Dexie migration safety + idempotency invariants
- [x] 10.4 Final state: working tree clean except for the 4 spec artifacts under `openspec/changes/wire-neuron-variant-gacha/` + the new code; ready for `/opsx:archive` after user confirms
