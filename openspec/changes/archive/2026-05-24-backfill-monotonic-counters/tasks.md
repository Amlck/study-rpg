## 1. Create counter-backfill service

- [x] 1.1 Created `services/counter-backfill.ts` (~98 LOC including JSDoc).
- [x] 1.2 Static `TIER_TO_UPGRADE_COUNT` map defined.
- [x] 1.3 Implemented derivation + MAX-merge patch; uses existing `monotonicCounters.put({...mono, ...patches})` convention (Dexie hook auto-stamps `_updatedAt`).
- [x] 1.4 JSDoc header documents D1-D6 rationale.

## 2. Chain into existing onPullComplete

- [x] 2.1 onPullComplete chains counter-backfill before achievement-backfill, both inside the existing try/catch.
- [x] 2.2 Imported backfillMonotonicCounters service.
- [x] 2.3 二階 typecheck passes.

## 3. Vitest unit coverage — DEFERRED (二階 lacks test infra)

- [x] 3.1 Tests deferred per same documented rationale as `fix-r2-conditional-pull-cors` D5 and `backfill-achievements-on-sign-in` Group 3: no `test` script in 二階 package.json, no `vitest` devDep, zero existing test files. Service is ~45 LOC of pure-function code with straight-line logic; production smoke (Group 6) provides decisive binary verification (counter values populate → achievement-backfill unlocks new rows → leaderboard upsert pushes expanded badges_csv).

## 4. Verify & build

- [x] 4.1 Verify: strict validate ✓; 8 spec scenarios all map to implementation (derivation rules, MAX-merge, ordering before achievement-backfill, idempotency, error containment); 6 design decisions reflected; pattern matches existing services/ conventions.
- [x] 4.2 `pnpm -r typecheck` across the monorepo passes (8/8 packages).
- [x] 4.3 `pnpm --filter @study-rpg/medexam2-hospital-tw build` succeeds.

## 5. Archive + deploy

- [ ] 5.1 Sync delta into `openspec/specs/achievement-system/spec.md` (16 → 17 requirements). Move change to `openspec/changes/archive/2026-05-24-backfill-monotonic-counters/`.
- [ ] 5.2 Stage 4 explicit paths (service + useSync + main spec + archive dir) + commit on hotfix branch with template message `spec(archive): merge backfill-monotonic-counters — derive 3 missing counters from existing tables for pre-existing players`. Confirm with user before committing.
- [ ] 5.3 Fast-forward merge to main + push origin/main. Confirm with user before push. Triggers GH Pages + CF Pages auto-deploy.

## 6. Production smoke

- [ ] 6.1 Wait for CF Pages deploy to complete (~1-2 min).
- [ ] 6.2 In MCP Chrome on `https://med-study-rpg.com/2nd/achievements`, signed in as owner: bring window to foreground briefly (visibility-change fires pull cycle). Re-inspect Dexie via `indexedDB.open` snippet — expect `monotonicCounters.singleton.totalDoctorsRecruited` populated (was undefined); expect achievements table to gain new rows (recruit-first-doctor at minimum).
- [ ] 6.3 Wait ~5 min for debounced push + leaderboard upsert to fire. Re-query `https://api.med-study-rpg.com/leaderboard/composite`. Expect owner row's `badges_csv` to expand from `quiz:P4` to include `recruit:*`. Multi-player rollout (ㄚㄚㄚ, Nigga, etc.) populates over coming days as they sign in.
- [ ] 6.4 If smoke uncovers issue, document in scratch handoff + propose follow-up change. Do NOT amend post-archive.
