## 1. Client code

- [x] 1.1 `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` `buildLeaderboardAttributes()` now reads `db.questionHistory.toArray()` and computes `totalCorrect = Math.max(0, Math.floor(historyRows.reduce((acc, q) => acc + (q.correctCount ?? 0), 0)))`. mastery.toArray() call removed from the parallel `Promise.all`.
- [x] 1.2 Inline comment above `totalCorrect` now points at `questionHistory.correctCount` + cites both multiplier-weighting and outer-tx rollback rationale + back-references design D1.

## 2. Spec sync

- [x] 2.1 Scenario renamed to「total_correct computed from questionHistory aggregate」in `openspec/specs/hospital-leaderboard/spec.md`; derivation swapped + 「why not mastery」clause added.

## 3. Docs

- [x] 3.1 `docs/LEADERBOARD.md` schema row note for `total_correct` updated.
- [x] 3.2 No other inline references to「mastery.correct」/「mastery aggregate」as the data source — only the one schema-table row note needed updating.

## 4. Verify

- [x] 4.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` → green. No Worker / core changes so the cross-package typecheck cascade is a no-op for those.
- [x] 4.2 `openspec validate --strict fix-hospital-leaderboard-correct-source` → valid.
- [x] 4.3 `openspec validate --strict hospital-leaderboard` (main spec post-edit) → valid.
- [x] 4.4 Chrome MCP smoke against prod (post-deploy): signed-in dogfood account (康勞德 / tony85314@gmail.com) baseline D1 row had `total_correct=79` (last push under pre-fix weighted-mastery derivation); local Dexie aggregate at smoke time `SUM(qh.correctCount)=95`, `SUM(mastery.correct)=79.2` (matches D1 baseline — pre-fix code was correctly summing mastery). Forced a sync push by reloading + clicking 開始唸書 (started a study session → state mutation → R2 push → onPushComplete → leaderboard upsert). Network confirmed `POST https://api.med-study-rpg.com/leaderboard/upsert 200`. Post-push D1: `total_correct=95, updated_at=1779634584506` (jumped from 79 → 95 exactly matching expected raw qh.correctCount aggregate).

## 5. Deploy

- [x] 5.1 Committed `a73918f` with explicit file-by-file `git add` (7 files: lib/sync/leaderboard.ts + docs/LEADERBOARD.md + openspec spec + 4 change artifact files); pre-existing dirt (meta.json + supabase/functions/) intentionally not staged.
- [x] 5.2 Pushed `track-m2` → fast-forward merge into `main` (commit `788ce61`) → pushed `main`.
- [x] 5.3 GH Pages run `26364419007` (50s ✓) + CF Pages run `26364419023` (45s ✓). Worker workflow correctly skipped (no `cloudflare/sync-worker/**` paths changed).
- [x] 5.4 Verified on prod `https://med-study-rpg.com/2nd/` — same chain as 4.4: hard reload + click 開始唸書 + skip ER popup → leaderboard upsert POST 200 → D1 row `total_correct` 79 → 95 exactly matching local raw count.

## 6. Archive

- [ ] 6.1 Run `/opsx:archive fix-hospital-leaderboard-correct-source` to `mv openspec/changes/fix-hospital-leaderboard-correct-source openspec/changes/archive/YYYY-MM-DD-fix-hospital-leaderboard-correct-source`. Commit with `spec(archive)` prefix. Push.
