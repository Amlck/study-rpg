# Tasks

## 1. Source fix
- [ ] 1.1 Add `db.rooms` to the `'r'` transaction scope tuple in `apps/medexam2-hospital-tw/src/lib/achievement-stats.ts:29-39`
- [ ] 1.2 Add inline comment above the scope tuple noting that `rooms` is read by the P1-specialty-match branch at line ~102 (forward-compat reminder against drop)
- [ ] 1.3 Add `db.rooms` to QuizModal outer `'rw'` scope at `apps/medexam2-hospital-tw/src/components/QuizModal.tsx:237-254` (the sub-tx-must-be-subset rule means without this, the standalone fix still fails when called from the quiz path)
- [ ] 1.4 Update the existing scope comment block in QuizModal to mention `rooms` alongside the other 7 tables added by the previous hotfix

## 2. Spec delta
- [ ] 2.1 Add ADDED Requirement "buildAchievementStats transaction scope SHALL cover every read" to `openspec/specs/achievement-system/spec.md` under the existing diff-based-detection section
- [ ] 2.2 Add 1 scenario: WHEN a P1 doctor exists and all P1 are assigned to rooms, THEN `buildAchievementStats` SHALL complete without throwing `Table rooms not part of transaction`

## 3. Verification
- [ ] 3.1 `pnpm -r typecheck` — full repo type-clean (regression guard against unrelated breakage)
- [ ] 3.2 Chrome MCP smoke on `pnpm --filter @study-rpg/medexam2-hospital-tw dev` (localhost:5173/study-rpg/hospital/) reproducing wenhsien trigger state:
  - Start fresh sign-in (or use dogfood account); recruit until 1 P1 doctor; assign to a room
  - Confirm console clean
  - Click 招募 → expect doctor roll or `招募券不足` toast (NOT silent no-response)
  - Click AAD on the P1 → expect retire outcome modal (NOT silent dismiss)
  - Answer a question correctly → expect mastery / questionHistory / affinity all increment (NOT rolled-back)
- [ ] 3.3 Watch DevTools console for any residual `Table rooms not part of transaction` or `SubTransactionError` for the duration of the smoke

## 4. Ship
- [ ] 4.1 Commit on `hotfix/fix-medexam2-achievement-stats-rooms-scope` branch (await user confirmation per Curator Rules)
- [ ] 4.2 Fast-forward merge → push origin main (await user confirmation)
- [ ] 4.3 Cherry-pick (or merge) into `track-m2` so the parallel 二階 worktree stays aligned
- [ ] 4.4 `/opsx:archive fix-medexam2-achievement-stats-rooms-scope` after main deploy goes live
- [ ] 4.5 Notify wenhsien1203 to hard-reload the page (no client-side action needed — fix lives in the bundle)
