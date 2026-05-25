## Why

`buildAchievementStats()` opens an `'r'` Dexie transaction (`apps/medexam2-hospital-tw/src/lib/achievement-stats.ts:29-39`) whose scope **omits `db.rooms`**, but the function body reads `db.rooms.bulkGet(roomIds)` at line 102 inside the P1-specialty-match branch. Dexie rejects with `Table rooms not part of transaction` the moment a player has ≥ 1 P1 doctor **and** every P1 doctor is assigned to a room.

This is a P1 SHIPPED regression introduced by `add-achievement-system` (commit `ff57375`, 2026-05-23). Player `wenhsien1203@gmail.com` reported it 2026-05-24: 「在 AAD 醫師但一半突然沒反應 後續也不能招募了」. DB confirms the trigger state — 1 P1 / 1 assigned, 0 unassigned. The previous quiz-path hotfix (`e085876`) widened `QuizModal`'s outer tx scope but did not add `rooms`, so even the quiz reward path still throws for affected players.

`buildAchievementStats` is called from six sites; failure cascades into every player-facing path:

| Caller | Symptom for affected players |
|---|---|
| `services/retire.ts` ([TrainingPage:181](apps/medexam2-hospital-tw/src/pages/TrainingPage.tsx)) | AAD confirm modal dismisses with no outcome (`try { … } finally` swallows; no `catch`) |
| `services/recruitment.ts` ([HomePage:132](apps/medexam2-hospital-tw/src/pages/HomePage.tsx)) | Recruit button: unhandled rejection, no toast, no modal |
| `services/fate-card.ts` | Fate card draw silently fails |
| `services/training.ts` | Training attempt silently fails |
| `lib/tick.ts:120` | Every 5 s tick rejects → no idle income / events / tier upgrade |
| `services/quiz-rewards.ts` (via [QuizModal:237](apps/medexam2-hospital-tw/src/components/QuizModal.tsx)) | Quiz answer reward still rolls back (e085876 added 7 tables but not rooms) |

## What Changes

- **Source fix**: add `db.rooms` to the transaction scope tuple at `apps/medexam2-hospital-tw/src/lib/achievement-stats.ts:29-39`. One-line addition.
- **Source comment**: short inline note explaining the rooms read at line ~102 requires rooms in the scope (so a future reader doesn't drop it again).
- **QuizModal outer tx scope**: add `db.rooms` to `QuizModal.tsx:237-254` outer scope. Required because `buildAchievementStats`'s `'r'` sub-tx scope must be a subset of the parent's `'rw'` scope; without rooms in the parent, the sub-tx still fails for affected players even after the standalone fix.
- **Spec delta**: extend `openspec/specs/achievement-system/spec.md` with an explicit requirement that `buildAchievementStats`'s transaction scope SHALL cover every table read inside the function body, including `rooms`. Prevents regression.

## Capabilities

### Modified Capabilities

- `achievement-system`: tighten the diff-based unlock detection contract to enumerate required Dexie scope tables (forward-compat against the recurring "transaction scope omitted" failure mode that just bit ship-day-2).

## Impact

- **改動檔案**:
  - `apps/medexam2-hospital-tw/src/lib/achievement-stats.ts` (+1 scope entry, +short comment)
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx` (+1 scope entry, update existing scope comment)
  - `openspec/specs/achievement-system/spec.md` (+1 SHALL requirement + 1 scenario)
- **零 schema 變動 / 零 migration / 零新 dependency**
- **零行為變動**（除「不再炸」之外）: predicate / unlock logic / catalog 完全不動
- **驗證**: `pnpm -r typecheck` 全綠；Chrome MCP smoke — 用 wenhsien 等價狀態（1 P1 assigned）招募一次 + AAD 一次 + 答題一次，三者各自正常完成、console 無 `Table rooms not part of transaction` error
- **Blast radius**: 二階 only。一階 `apps/medexam-tw/` 沒有 achievement-stats / rooms 概念。
- **Out of scope（顯式留 follow-up）**:
  - 把 `handleRetireConfirm` / `handleRoll` 等 UI 加 `catch` 改成可見 error toast（cosmetic resilience；本次 hotfix 只修讓他們不該炸的 root cause，不擴大 surgical scope）
  - `tick.ts` 的 silent-error-swallow audit（同樣 follow-up）
  - 改寫 `buildAchievementStats` 把 rooms 讀拉出 tx（更乾淨但 churn 大，不在 hotfix SLA 範圍）
