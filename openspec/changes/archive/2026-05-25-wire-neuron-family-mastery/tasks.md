## 1. Engine + DB layer (~30 min)

- [x] 1.1 Edit `apps/neurons-tw/src/lib/db.ts`: add `FamilyMasteryRow` interface, bump to schema v2 with `familyMastery: 'familyId, tier'`, add `initFamilyMasteryIfEmpty(pack)` function
- [x] 1.2 Create `apps/neurons-tw/src/lib/mastery/mastery-tier.ts` — pure function `deriveMasteryTier(correct, total)` returning `'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'none'`
- [x] 1.3 Create `apps/neurons-tw/src/lib/mastery/index.ts` — export `deriveMasteryTier` + `MasteryTier` type
- [x] 1.4 Create `apps/neurons-tw/src/lib/services/mastery.ts` — `recordAttempt(tx, familyId, isCorrect)` (transaction-scoped, accepts tx from caller) + `getMastery(familyId)` + `listAllMastery(): Promise<FamilyMasteryRow[]>` + `initFamilyMasteryIfEmpty(pack)` wrap

## 2. Service hook (~15 min)

- [x] 2.1 Edit `apps/neurons-tw/src/lib/services/connectome.ts`:
  - In `recordCorrectAnswer` transaction scope, also call `recordAttempt(tx, familyId, true)`
  - In `recordIncorrectAnswer` transaction scope, also call `recordAttempt(tx, familyId, false)`
  - Ensure `initFamilyMasteryIfEmpty(pack)` is called alongside `initFamilyAccrualIfEmpty(pack)` on connectome init

## 3. UI: mastery chip component (~25 min)

- [x] 3.1 Create `apps/neurons-tw/src/components/MasteryChip.tsx`:
  - Props: `{ familyId, displayName, color }` (color from subject's NT branch)
  - Internal state: subscribe to familyMastery via Dexie live query (`useLiveQuery`) or polling
  - Render: tier badge + `<NumberTickUp from={prevCorrect} to={currentCorrect} />` + accuracy %
- [x] 3.2 Edit `apps/neurons-tw/src/routes/OverviewPage.tsx`: add 「家族 mastery」section between Content overview + NT stats sections, render `<MasteryChip>` for each family
- [x] 3.3 Edit `apps/neurons-tw/src/routes/ConnectomePage.tsx`: add `<MasteryChip>` to per-family card (inline with existing AP chip)
- [x] 3.4 Edit `apps/neurons-tw/src/components/ConnectomeDebugPanel.tsx`: surface mastery counters per family for debugging

## 4. Verify (~10 min)

- [x] 4.1 typecheck ✅ pass: `pnpm --filter @study-rpg/neurons-tw typecheck`
- [ ] 4.2 (Optional foreground) Dev smoke: ConnectomeDebugPanel +1 correct + +1 incorrect, verify mastery chip updates with NumberTickUp animation
- [x] 4.3 `openspec validate wire-neuron-family-mastery --strict` ✅ pass

## 5. Archive (~5 min)

- [ ] 5.1 `/verify` (user-driven, optional)
- [ ] 5.2 `/opsx:archive wire-neuron-family-mastery`
- [ ] 5.3 `openspec validate --all --strict`

**Estimated total wall time**: 85 min

## Acceptance criteria

- [ ] Dexie v2 schema adds `familyMastery` table; existing v1 tables untouched
- [ ] `deriveMasteryTier` returns correct tier for all 6 boundary cases (4 representative scenarios in spec covered)
- [ ] Recording correct/incorrect via connectome service atomically updates mastery (single tx)
- [ ] `<MasteryChip>` displays tier + animated count + accuracy
- [ ] `<NumberTickUp>` import + usage confirms first real consumer of motion library
- [ ] typecheck pass
- [ ] openspec validate --strict pass
- [ ] Foreground: clicking debug panel +5 correct shows mastery count tick from 0 → 5 with animation
