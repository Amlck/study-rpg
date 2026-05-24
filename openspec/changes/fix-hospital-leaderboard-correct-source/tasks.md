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
- [ ] 4.4 Chrome MCP smoke against prod (post-deploy): on the signed-in test account, trigger one quiz answer → wait for sync push (~3s) → `wrangler d1 execute --remote --command "SELECT user_id, total_correct FROM leaderboard_m2 WHERE user_id = '<sub>'"` shows a value matching the player's local `SUM(questionHistory.correctCount)` (±1 for the just-answered question). Expected for current dogfood user: D1 jumps from 0 → 95.

## 5. Deploy

- [ ] 5.1 Commit (explicit file-by-file `git add`, never `-A`).
- [ ] 5.2 Push to `track-m2` → merge into `main` → push `main`.
- [ ] 5.3 GH Pages + CF Pages deploys auto-trigger; wait for green status (no Worker / D1 changes so those workflows skip — only `cloudflare/sync-worker/**` paths trigger Worker deploy).
- [ ] 5.4 Verify on prod: same Chrome MCP smoke as 4.4 against `https://med-study-rpg.com/2nd/`.

## 6. Archive

- [ ] 6.1 Once 4.4 / 5.4 verifications pass: `mv openspec/changes/fix-hospital-leaderboard-correct-source openspec/changes/archive/YYYY-MM-DD-fix-hospital-leaderboard-correct-source`. Commit with `spec(archive)` prefix. Push.
