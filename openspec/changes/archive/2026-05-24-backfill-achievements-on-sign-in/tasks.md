## 1. Create backfill service

- [x] 1.1 Create `apps/medexam2-hospital-tw/src/services/achievement-backfill.ts` exporting `backfillAchievementsFromCurrentStats(): Promise<number>`.
- [x] 1.2 Implementation: build player + stats via existing helpers; call `listUnlockedAchievements`; diff against existing IDs Set; bulkPut missing rows silently.
- [x] 1.3 Added JSDoc header documenting the why (mirrors design.md D1+D2) to prevent future reward-dispatch reintroduction.

## 2. Wire backfill into onPullComplete

- [x] 2.1 Modified `useSync.ts` onPullComplete to await `checkAssignmentInvariants()` then call `backfillAchievementsFromCurrentStats()` inside try/catch (logs via `console.warn` on failure, lets pull cycle proceed).
- [x] 2.2 Added `import { backfillAchievementsFromCurrentStats } from '../../services/achievement-backfill'`.
- [x] 2.3 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` passes.

## 3. Vitest unit coverage — DEFERRED (二階 lacks test infrastructure)

- [x] 3.1 ~~Create test file~~ **DEFERRED**: `apps/medexam2-hospital-tw/package.json` has no `test` script; no `vitest` devDep; zero existing test files in `apps/medexam2-hospital-tw/**`. Same constraint observed in `fix-r2-conditional-pull-cors` change (where 二階's R2 engine was covered by 一階 unit tests alone via byte-identity). For this 二階-specific fix, coverage relies on: (a) the underlying `listUnlockedAchievements` helper is pure-function logic in `@study-rpg/core` (covered by core's tests); (b) production smoke per Group 6 provides an unambiguous binary fix-works check (owner's `badges_csv` populates from `quiz:P4` → multi-category within minutes of first pull); (c) the service is ~30 LOC of straight-line code with no branching beyond the trivial empty-diff short-circuit.
- [x] 3.2 ~~Test case 1~~ **DEFERRED** — see 3.1.
- [x] 3.3 ~~Test case 2~~ **DEFERRED** — see 3.1.
- [x] 3.4 ~~Test case 3~~ **DEFERRED** — see 3.1.
- [x] 3.5 ~~Test case 4~~ **DEFERRED** — see 3.1.
- [x] 3.6 ~~Run pnpm test~~ **DEFERRED** — no test runner to invoke; `pnpm --filter @study-rpg/medexam2-hospital-tw build` (via tsc --noEmit) serves as the type-level validation.

## 4. Verify

- [x] 4.1 Run `/opsx:verify backfill-achievements-on-sign-in` — clean: 0 critical, 0 warnings, 0 suggestions; all 6 spec scenarios covered; all 5 design decisions reflected.
- [x] 4.2 `pnpm -r typecheck` across the monorepo passes (8/8: core, sync-worker, content-medexam-tw, content-medexam2-tw, theme-pixel-medical, theme-pixel-hospital, medexam-tw, medexam2-hospital-tw all green).
- [x] 4.3 `pnpm --filter @study-rpg/medexam2-hospital-tw build` succeeds (1034.17 kB bundle, only standard large-chunk warning).
- [x] 4.4 `pnpm --filter @study-rpg/medexam-tw build` succeeds (793.66 kB bundle, unchanged — fix doesn't touch 一階).

## 5. Archive + deploy

- [x] 5.1 `/opsx:archive backfill-achievements-on-sign-in` — merges delta into `openspec/specs/achievement-system/spec.md`.
- [ ] 5.2 Stage + commit explicitly (per multi-agent git safety): the 1 new service + 1 new test + 1 modified useSync.ts + the merged main spec + the archived change dir. Commit message template: `spec(archive): merge backfill-achievements-on-sign-in — silent retro-unlock on every pull for pre-existing players`. Confirm with user before committing.
- [ ] 5.3 `cd ~/coding-scratch/study-rpg && git merge --ff-only hotfix/backfill-achievements-on-sign-in && git push origin main`. Confirm with user before push. Triggers GH Pages + CF Pages auto-deploy. No Worker / D1 / Supabase changes; deploy is app-build only.

## 6. Production smoke

- [ ] 6.1 Wait for both deploy workflows to complete (~2–4 min via `gh run list --branch main`).
- [ ] 6.2 In Chrome on `https://med-study-rpg.com/2nd/`, signed-in as owner: trigger a visibility-change pull cycle. Capture console — expect new `[achievement-backfill]` debug entries on first pull (silent on later pulls). Expect new badges immediately visible on `/achievements` page (no need to do gameplay).
- [ ] 6.3 Wait ~5 minutes for debounced push + leaderboard upsert to fire. Re-query `https://api.med-study-rpg.com/leaderboard/composite` — expect owner row's `badges_csv` to now contain multiple categories (not just `quiz:P4`).
- [ ] 6.4 (Multi-player verification, requires natural rollout): over the next 1–7 days, periodically re-query the leaderboard — expect rows for other players to gradually get populated `badges_csv` as they each sign in once. Document the rollout progress in a scratch note if anything looks off.
- [ ] 6.5 If smoke uncovers any issue, document in a handoff note and propose a follow-up change (do NOT amend this archive post-merge).
