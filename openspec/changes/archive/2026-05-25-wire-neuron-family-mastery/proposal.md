## Why

`connectome-collection` already tracks per-family `actionPotential` (AP) — a monotonic counter incremented on every correct quiz answer. But AP alone doesn't tell the player how *good* they are at each family — there's no notion of accuracy, mastery tier, or visual progress chip.

Per `add-neurons-mode-scaffold` roadmap, `wire-neuron-family-mastery` is the foundational mastery layer that `add-neurons-achievements` will hook into (e.g., "P1 master in 11 families" achievement). Mirrors `hospital-mastery` capability shape from M_2nd (`apps/medexam2-hospital-tw`).

This change also delivers the first concrete consumer of `neurons-motion-library`'s `<NumberTickUp>` primitive — mastery chip animates when correct count increments.

## What Changes

- Extend `apps/neurons-tw` Dexie schema v1 → v2: add new `familyMastery` table (PK `familyId`, fields `correct: number`, `total: number`)
- Add `apps/neurons-tw/src/lib/mastery/` subdirectory with two pure-function modules:
  - `mastery-tier.ts` — derive P1-P5 tier from `(correct, total)` per accuracy + count thresholds
  - `index.ts` — public API
- Add `apps/neurons-tw/src/lib/services/mastery.ts` service layer — `recordAttempt(familyId, isCorrect)`, `getMastery(familyId)`, `listAllMastery()`
- Hook existing `services/connectome.ts` `recordCorrectAnswer` + `recordIncorrectAnswer` to ALSO call mastery service (single Dexie transaction)
- Add mastery chip UI to overview page (`/`) per neuron family — uses `<NumberTickUp>` for animated count display + tier label badge
- Add mastery chip to ConnectomePage per-family card next to AP chip
- Add new capability spec `neuron-family-mastery` (4 requirements)
- Extend `ConnectomeDebugPanel` to display mastery counts for debugging

**不做**：

- 不做真正的 quiz UI（reuse existing `ConnectomeDebugPanel` correct/incorrect buttons for triggering）
- 不做 per-question history table（hospital-mastery has both mastery + questionHistory; neurons-tw can defer questionHistory until SRS / wrong-answer-list consumer ships）
- 不做 mastery decay / forgetting curve（pure incremental, like hospital-mastery）
- 不做 cross-family mastery aggregation chip（e.g., "全 NT branch 平均 mastery"）
- 不動 motion library / connectome existing specs
- 不動 R2 sync schema (neurons-tw 還沒接 R2)

## Capabilities

### New Capabilities

- `neuron-family-mastery`: Per-family correct/total counters, tier derivation (P1-P5), service layer wrapping Dexie + transaction safety, UI chip with motion library NumberTickUp

### Modified Capabilities

- 無（不動既有 spec）

## Impact

- **Code**:
  - `apps/neurons-tw/src/lib/db.ts`（Dexie v2 + new `FamilyMasteryRow` + initFamilyMasteryIfEmpty）
  - `apps/neurons-tw/src/lib/mastery/{mastery-tier,index}.ts`（新子目錄、2 檔）
  - `apps/neurons-tw/src/lib/services/mastery.ts`（新 service）
  - `apps/neurons-tw/src/lib/services/connectome.ts`（modified — recordCorrectAnswer/Incorrect 加 mastery write 進 tx）
  - `apps/neurons-tw/src/routes/OverviewPage.tsx`（modified — 加 mastery chip section）
  - `apps/neurons-tw/src/routes/ConnectomePage.tsx`（modified — 加 mastery chip 到 family card）
  - `apps/neurons-tw/src/components/ConnectomeDebugPanel.tsx`（modified — 顯示 mastery）
- **APIs**: 無 core API 變動
- **Dependencies**: 無新增
- **Data**: Dexie v2 schema bump (additive 新 table，無破壞性 migration — v1 沒此 table)
- **Backwards compat**: 純 additive；既有 player 升級時 Dexie 自動建新 table；首次 `loadConnectome` / `loadMastery` 觸發 `initFamilyMasteryIfEmpty` 建 11 row 全 zero
- **Sync**: 不碰
- **Spec touched**: 新增 `openspec/specs/neuron-family-mastery/spec.md`（4 requirements）
