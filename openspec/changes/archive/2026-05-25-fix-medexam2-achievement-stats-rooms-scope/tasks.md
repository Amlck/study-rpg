# Tasks

## 1. Source fix
- [x] 1.1 Add `db.rooms` to the `'r'` transaction scope tuple in `apps/medexam2-hospital-tw/src/lib/achievement-stats.ts:29-39`
- [x] 1.2 Add inline comment above the scope tuple noting that `rooms` is read by the P1-specialty-match branch at line ~102 (forward-compat reminder against drop)
- [x] 1.3 Add `db.rooms` to QuizModal outer `'rw'` scope at `apps/medexam2-hospital-tw/src/components/QuizModal.tsx:237-254` (the sub-tx-must-be-subset rule means without this, the standalone fix still fails when called from the quiz path)
- [x] 1.4 Update the existing scope comment block in QuizModal to mention `rooms` alongside the other 7 tables added by the previous hotfix

## 2. Spec delta
- [x] 2.1 Add ADDED Requirement "buildAchievementStats transaction scope SHALL cover every read" to `openspec/specs/achievement-system/spec.md` under the existing diff-based-detection section
- [x] 2.2 Add 1 scenario: WHEN a P1 doctor exists and all P1 are assigned to rooms, THEN `buildAchievementStats` SHALL complete without throwing `Table rooms not part of transaction`

## 3. Verification
- [x] 3.1 `pnpm -r typecheck` — full repo type-clean (regression guard against unrelated breakage). Result: 3 pre-existing errors in `LeaderboardPage.tsx` (314 / 376 / 508) re `correct` filter type union — confirmed unrelated via baseline stash; tracked separately as `add-hospital-leaderboard-correct-count-filter` follow-up.
- [x] 3.2 Chrome MCP smoke on `pnpm --filter @study-rpg/medexam2-hospital-tw dev` (localhost:5178/study-rpg/hospital/) reproducing wenhsien trigger state via injected P1 doctor (id=`test-p1-1779672929596`, subject=內科, assignedRoom='outpatient-1'):
  - `buildAchievementStats()` direct call → returned 20-key stats object with `allP1MatchedSpecialty: true` (entered the P1-specialty-match branch and ran `db.rooms.bulkGet` cleanly, no throw)
  - `attemptRoll(內科)` → returned structured `{ ok: false, reason: 'banner-locked', missing: 66 }` (proper outcome, not unhandled rejection)
  - `retireDoctor(p1Id)` → returned `{ kind: 'success', refund: 4000, roomFreed: 'outpatient-1' }`; verified Dexie writes — doctor count 3→2, P1 count 1→0, revenue 0→4000, retirementLog row inserted
- [x] 3.3 Console scan during smoke (pattern `rooms|Transaction|SubTransaction|Dexie|achievement|NotFoundError`) returned 0 errors; only an expected `[assignment] repaired 1 drift` info log (from the injection setting `rooms.assignedDoctorId`, which the single-source-of-truth drift-repair clears — by design)

## 4. Ship
- [x] 4.1 Commit on `hotfix/fix-medexam2-achievement-stats-rooms-scope` branch → 332a52a
- [x] 4.2 Merge into main → acf6c0c (`--no-ff` merge commit per project convention); pushed origin main → both GH Pages + CF Pages deploys succeeded (run ids 26378980701 + 26378980709)
- [~] 4.3 Cherry-pick / merge into `track-m2` — **deferred**: the parallel session working on a fate-card / 抽卡 change in track-m2 will rebase onto the new main after their own work archives, picking this fix up via rebase. No explicit cherry-pick required.
- [x] 4.4 `/opsx:archive fix-medexam2-achievement-stats-rooms-scope` (this archive)
- [ ] 4.5 Notify wenhsien1203 to hard-reload the page (no client-side action needed — fix lives in the bundle). Manual follow-up by the dogfood owner.
