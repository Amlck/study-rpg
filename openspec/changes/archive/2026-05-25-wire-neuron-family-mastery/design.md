## Context

`connectome-collection` shipped `actionPotential` per family (monotonic increment on correct) but no notion of accuracy, mastery tier, or visual mastery chip. `add-neurons-achievements` (next in roadmap) needs mastery tier as a substrate for "P1 master" achievement entries — mirroring 二階 `achievement-system` reading from `hospital-mastery`.

This change adds the minimal mastery layer: per-family correct/total counters + tier derivation + UI chip. Mirrors `hospital-mastery` shape (separate Dexie table, pure-function tier derivation, service-layer transaction wrap, UI surfaced on relevant routes).

## Goals / Non-Goals

**Goals:**

- Per-family `correct` + `total` counters persisted in Dexie
- Pure-function tier derivation from (correct, total) → P1-P5 + 'none' (when total < threshold)
- Service-layer write within same Dexie transaction as connectome AP write (no torn state)
- UI chip per family on overview page + connectome page card, using motion library `<NumberTickUp>` for animated count
- `ConnectomeDebugPanel` extended to surface mastery for debug

**Non-Goals:**

- **不**做 quiz UI（reuse ConnectomeDebugPanel）
- **不**做 questionHistory / SRS（separate `wire-neurons-srs-queue` future change）
- **不**做 mastery decay
- **不**動 motion library API
- **不**動 connectome spec
- **不**接 R2 sync

## Decisions

### Decision 1: New `familyMastery` Dexie table (separate from `familyAccrual`)

**Choice**: New table at Dexie v2:
```ts
familyMastery: 'familyId, tier'
```
Schema: `{ familyId: string, correct: number, total: number }`.

**Why**:
- Capability boundary: mastery is its own capability spec; co-locating with familyAccrual would couple connectome to mastery
- Hospital precedent: `hospital-mastery` is separate table from `hospital-state`
- Indexed `tier` field allows future queries like "list all families at P1"

**Alternative considered**:
- Extend familyAccrual with correct/total — couples capabilities (rejected)
- Single mastery table with composite key — over-engineered (rejected)

### Decision 2: Tier derivation thresholds — count + accuracy double-gate

**Choice**: Pure function `deriveMasteryTier(correct, total)` returning `'P5' | 'P4' | 'P3' | 'P2' | 'P1' | 'none'`:

```ts
function deriveMasteryTier(correct: number, total: number): MasteryTier {
  if (total < 5) return 'none'  // not enough attempts to assess
  const acc = correct / total
  if (correct >= 200 && acc >= 0.90) return 'P1'   // Master
  if (correct >= 80  && acc >= 0.80) return 'P2'   // Expert
  if (correct >= 30  && acc >= 0.70) return 'P3'   // Proficient
  if (correct >= 10  && acc >= 0.60) return 'P4'   // Familiar
  return 'P5'                                      // Novice
}
```

**Why**:
- Mirror `priority_levels.md` 5-tier P1-P5 scheme (already in use across two changes today)
- Double-gate (count + accuracy) prevents "1 correct out of 1" gaming for P1
- Thresholds aligned with `add-neurons-motion-library/timings.ts` rarity ladder for symbolic resonance
- `'none'` state for fresh players (< 5 attempts) avoids displaying meaningless tier

**Alternative considered**:
- Accuracy-only gate — 1/1 = 100% gives instant P1 (rejected)
- Count-only gate — bad players grinding past threshold get P1 (rejected)
- Continuous mastery % only, no discrete tier — loses achievement-binding clarity (rejected)

### Decision 3: Service layer joins connectome write transaction

**Choice**: `services/mastery.ts` exports `recordAttempt(familyId, isCorrect)` that callers invoke from within the same Dexie tx as connectome's `recordCorrectAnswer`. `services/connectome.ts` extended to call mastery service inside its existing tx scope.

**Why**:
- Atomic: AP counter + mastery counter must be in sync (one without other = torn state)
- Connectome already wraps its writes in a single Dexie tx; extending scope is natural
- Mirror二階 quiz-rewards tx scope hotfix lessons learned (`e085876`)

### Decision 4: UI chip uses motion library `<NumberTickUp>` for animated correct count

**Choice**: Mastery chip displays `<NumberTickUp from={prev} to={current} />` for correct count + tier badge label + accuracy %.

**Why**:
- First consumer of motion library `<NumberTickUp>` — validates that primitive in real flow
- Animated count provides positive feedback for correct answers (reduced-motion fallback handled by NumberTickUp itself)
- Tier badge uses static color label, no extra animation needed

### Decision 5: Tier colors mirror existing CSS vars

**Choice**: 
- P1 Master = `var(--rarity-ssr)` or fallback gold
- P2 Expert = purple
- P3 Proficient = blue (DA branch teal?)
- P4 Familiar = green
- P5 Novice = grey

Use inline style colors for now; CSS var integration follow-up.

## Risks / Trade-offs

- **[StrictMode double-mount calls recordAttempt twice]** → React 18 StrictMode dev double-invoke; service `recordAttempt` is just Dexie write, idempotent? Actually count would double. Mitigate by debouncing in caller (ConnectomeDebugPanel button click already a single user action) → 接受 (low risk; if surfaces will use ref-guard)
- **[Dexie v1 → v2 migration on existing user with connectome data]** → v2 adds new table only, doesn't alter existing v1 tables. Dexie auto-migrates; existing familyAccrual data preserved. No data loss. → 接受
- **[NumberTickUp re-mounts on every correct answer (key changes)]** → If we key by `correct` value, each increment unmounts/remounts and re-runs animation. Want this behavior. → 接受
- **[Total count diverges from AP if some attempts skip mastery write]** → Both write in same tx; should be impossible. Add assertion in dev mode? YAGNI for now → 接受
- **[Tier threshold thresholds 太嚴 / 太鬆 後續 dogfood 調整]** → Pure function in one file, micro-change trivial → 接受

## Migration Plan

1. Edit `apps/neurons-tw/src/lib/db.ts`:
   - Add `FamilyMasteryRow` interface
   - Add `familyMastery` to v2 schema
   - Add `initFamilyMasteryIfEmpty(pack)` function
2. Create `apps/neurons-tw/src/lib/mastery/mastery-tier.ts` — pure function
3. Create `apps/neurons-tw/src/lib/mastery/index.ts` — public API export
4. Create `apps/neurons-tw/src/lib/services/mastery.ts` — `recordAttempt` (callable from connectome tx), `getMastery`, `listAllMastery`
5. Modify `apps/neurons-tw/src/lib/services/connectome.ts`:
   - Inside existing `recordCorrectAnswer` tx → also call mastery service
   - Inside existing `recordIncorrectAnswer` tx → also call mastery service
6. Modify `apps/neurons-tw/src/routes/OverviewPage.tsx` — add mastery section listing 11 family chips
7. Modify `apps/neurons-tw/src/routes/ConnectomePage.tsx` — add mastery chip to per-family card
8. Modify `apps/neurons-tw/src/components/ConnectomeDebugPanel.tsx` — surface mastery counters
9. typecheck `pnpm --filter @study-rpg/neurons-tw typecheck`
10. Dev smoke (optional foreground): click debug panel +5 correct + -1 incorrect, verify mastery chip updates with animation
11. `openspec validate wire-neuron-family-mastery --strict`
12. `/opsx:archive` + dual commit

**Rollback**: revert 8 file edits + drop Dexie v2 (downgrade not natively supported but additive table is harmless to leave).

## Open Questions

- **Display accuracy % on chip or just count + tier?** Proposal: both — `<NumberTickUp correct/>/total (acc%) [P3]`
- **Where to put mastery section on overview page?** Proposal: between existing "Content overview" section and "4 Neurotransmitter Stats" section
- **Should mastery chip clickable to expand details?** Proposal: no — keep stub; details panel separate future change
