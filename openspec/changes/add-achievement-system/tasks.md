## 1. Pre-flight & alignment

- [x] 1.1 Run `git log --since="2 weeks ago" -- apps/medexam2-hospital-tw/src/lib/sync/ cloudflare/sync-worker/` to confirm `LEADERBOARD_PROFILE` adapter + `m2 bundle` shape have not drifted since 2026-05-22
- [x] 1.2 Verify `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` still has `M2_ADAPTERS` array distinct from `HOSPITAL_ADAPTERS`; if shape changed, update design.md and proceed
- [x] 1.3 Verify `cloudflare/sync-worker/migrations/0001_leaderboard.sql` exists and is applied; new migration 0002 will follow same manual-apply discipline
- [x] 1.4 Confirm two prod URLs (GH Pages `fireman333.github.io/study-rpg/hospital/` + CF Pages `med-study-rpg.com`) currently render and load 二階 OK; no concurrent breakage to confuse later smoke

## 2. Core engine (packages/core)

- [x] 2.1 Add `Achievement` / `AchievementTier` / `AchievementCategory` / `AchievementReward` / `AchievementStats` types in `packages/core/src/types.ts`; tier MUST be literal union `'P1' | 'P2' | 'P3' | 'P4'`; reward MUST be discriminated union over `cosmetic` / `title` / `badge` kinds (no `equipment` kind)
- [x] 2.2 Create `packages/core/src/lib/achievement.ts` (< 100 lines) mirroring `cosmetic.ts`:
   - `checkAchievementUnlocks(prev, prevStats, next, nextStats, catalog)` returning diff-based unlocks
   - `listUnlockedAchievements(player, stats, catalog)` convenience
   - `listLockedAchievements(player, stats, catalog)` convenience
   - `visibleAchievements(catalog, unlockedIds)` for hidden-strict UI filtering
- [x] 2.3 Export new symbols from `packages/core/src/index.ts`
- [ ] 2.4 ~~Write `packages/core/src/lib/achievement.test.ts`~~ **N/A** — `packages/core` has zero existing test infra (no vitest config, cosmetic.ts itself untested). Setting up vitest in packages/core is out of this change's scope. Reconsider in a separate `add-core-package-test-infra` change; defer test coverage for now.
- [x] 2.5 Run `pnpm --filter @study-rpg/core build` and `pnpm --filter @study-rpg/core typecheck`; both pass

## 3. Content catalog (packages/content-medexam2-tw)

- [x] 3.1 Create `packages/content-medexam2-tw/src/achievements.ts` with 28 entries for 6 main categories (study 4 / quiz 8 [accum+streak] / recruit 4 / hospital 4 / fortune 4 / hidden 3) + 14 subject + 1 capstone = 42 entries. Each entry typed against `Achievement`
- [x] 3.2 4 streak achievements (`streak-correct-5/10/20/40`); P1 composite (40 連 **且** overallAccuracy ≥ 85%)
- [x] 3.3 14 subject mastery entries via `buildSubjectMasteryEntries()` helper, all P2 金, predicate reads `subjectAttemptCounts >= SUBJECT_QUESTION_TOTALS`
- [x] 3.4 `all-subjects-mastered` P1 鑽石 capstone (composite via 14-subject AND)
- [x] 3.5 `validateAchievementCatalog()` exported + auto-invoked at module load (non-strict mode); rejects P1 entries lacking `composite: true`, also checks unique ids + predicate sanity + optional strict wired-predicate mode
- [ ] 3.6 ~~Compute per-subject counts dynamically from questions.json~~ **PARTIAL** — currently hardcoded `SUBJECT_QUESTION_TOTALS` (snapshot from dist/subjects.json 2026-05-23), with comment pointing at canonical source. Dynamic loading deferred — current corpus is stable; if it regenerates, manual re-sync via comment. **Follow-up**: add `validate:achievements` npm script that diffs against `dist/subjects.json` and fails CI if mismatch.
- [x] 3.7 `export * from './achievements'` added to `packages/content-medexam2-tw/src/index.ts`
- [ ] 3.8 ~~Write content unit test~~ **N/A** — same reason as 2.4: no vitest infra in content packages. Validator's module-load side effect IS the test (build fails loudly on invalid catalog).
- [x] 3.9 `pnpm --filter @study-rpg/content-medexam2-tw typecheck + build` pass; catalog stats: 7 P1 / 21 P2 / 7 P3 / 7 P4, 3 hidden, validator OK

## 4. Atlas asset generation (2 sprite sheets)

- [x] 4.1 Main badge atlas generated via codex CLI (`--skip-git-repo-check` required by current codex 1.x; recipe in [imports/codex_image_gen.md](.claude/imports/codex_image_gen.md) was for 0.128.0). Output: 512×768 PNG, 8-bit RGBA, 88 KB, mv'd to `apps/medexam2-hospital-tw/src/assets/achievements/badge-atlas.png`. Wall ~1-2 min (faster than design.md estimate)
- [x] 4.2 Preview opened — codex self-validation: "512x768, alpha 透明背景, 四角透明, 15 色量化"
- [ ] 4.3 _Reroll fallback unused_ — first generation accepted (visual review delegated to user during 4.5)
- [x] 4.4 Subject atlas generated parallel: 896×256, 8-bit RGBA, 172 KB, mv'd to `apps/medexam2-hospital-tw/src/assets/achievements/subject-atlas.png`
- [x] 4.5 User visual review pass (2026-05-23): both atlases approved as-is, no reroll needed
- [ ] 4.6 _Chinese-character fallback not needed — 4.5 passed_
- [x] 4.7 Both atlases at final size in project path; Vite Phase 5 build pass (assets/achievements/ included naturally — assets only invoked via component import in Phase 8, no missing-asset error at build time)

## 5. Dexie v15 schema + sync adapter

- [x] 5.1 Dexie version 14 → v15 in `apps/medexam2-hospital-tw/src/db/schema.ts`
- [x] 5.2 `AchievementRow` interface + `achievements: '&id, unlockedAt'` table in v15 stores
- [x] 5.3 `MonotonicCountersRow` extended with 5 optional MAX-merge fields
- [x] 5.4 `GameCountersRow.currentQuizCorrectStreak?: number` added
- [x] 5.5 `LeaderboardProfileRow.selectedTitle?: string \| null` added
- [x] 5.6 v14→v15 upgrade is purely additive (new table + optional fields); Dexie auto-creates empty `achievements` table on schema upgrade — no explicit callback needed (mirror v14 leaderboardProfile pattern)
- [x] 5.7 `ACHIEVEMENTS` TableAdapter created in `tables.ts` mirroring `LEADERBOARD_PROFILE` shape (collection-style, snapshotDirty + snapshotAll + applyToLocal with LWW; explicit comment about no toast on cross-device pull)
- [x] 5.8 `ACHIEVEMENTS` in `M2_ADAPTERS` only (verified via awk grep: 1 in M2_ADAPTERS, 0 in HOSPITAL_ADAPTERS)
- [x] 5.9 migration.ts no change needed — `leaderboardProfile` precedent confirms Dexie's auto-table-creation on schema upgrade is sufficient (no explicit init refs to `db.leaderboardProfile` in migration.ts; achievements follows same pattern)
- [x] 5.10 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` + Vite build both pass

## 6. Reward dispatcher service

- [x] 6.1 `services/achievement-reward.ts` created with `dispatchReward()` + `checkAndUnlockAchievements()` orchestrator (idempotent — skips already-unlocked, persists row + dispatches reward + queues toast)
- [x] 6.2 Branch on `reward.kind`:
   - `'cosmetic'` → log intent + TODO note (cosmetic catalog `achievement-*` entries deferred to Phase 8+ per cosmetic-system spec delta)
   - `'title'` → append to Dexie `meta` key `achievement-titles-unlocked` (SettingsPanel reads in Phase 8)
   - `'badge'` → no-op
- [x] 6.3 `AchievementReward` discriminated union has exactly 3 kinds; equipment/ticket/pity absent — TypeScript enforces
- [ ] 6.4 ~~Tests~~ **N/A** — same reason as 2.4 / 3.8: no test infra in this app package

## 7. Trigger hooks (5 service files)

- [x] 7.1 Hook in `quiz-rewards.ts` — post-tx `checkAndUnlockAchievements` with prev/next stats; try/catch swallows errors so reward grant unaffected
- [x] 7.2 Streak counter logic in `quiz-rewards.ts` inside transaction: correct/disputed → currentQuizCorrectStreak++, also MAX-update maxQuizCorrectStreak; wrong → reset to 0; skipped → no change (not in this code path). Wrong-answer no longer early-returns
- [x] 7.3 Hook in `lib/tick.ts` — post-tx achievement check; also bumps `monotonicCounters.tierUpgradeCount` when `upgradedTo` set inside tx. Hot path note documented (~100-400ms per tick, optimize if dogfood shows jank)
- [x] 7.4 Hook in `services/recruitment.ts` — post-tx check; inside tx bumps `totalDoctorsRecruited` always and `totalP1DoctorsRecruited` when rarity === 'P1'
- [x] 7.5 Hook in `services/fate-card.ts` — post-tx check (legendary/epic counts derived from fateCardHistory rows)
- [x] 7.6 Hook in BOTH `services/training.ts` (training success → P1 increments `totalP1DoctorsRecruited`) AND `services/retire.ts` (retire path — affects `p1DoctorsRetired` via retirementLog). Tasks.md original wording was ambiguous; split for clarity
- [x] 7.7 `lib/achievement-toast-queue.ts` singleton pub-sub created — `push()` / `dismiss()` / `subscribe()` / `snapshot()`. UI subscribes in Phase 8. Single queue handles both P4-P2 toast + P1 modal routing (UI decides renderer based on tier)

## 8. UI components

- [x] 8.1 `BadgeSprite.tsx` — 6×4 CSS sprite + tier-class drop-shadow hook
- [x] 8.2 `SubjectBadgeSprite.tsx` — 7×2 CSS sprite, 14-subject cell mapping
- [x] 8.3 `AchievementUnlockToast.tsx` — mirror MilestoneTipToast 8s pattern, 64px BadgeSprite/SubjectBadgeSprite routing on category
- [x] 8.4 `AchievementUnlockModal.tsx` — full-screen reveal for P1 鑽石, 128px badge, reward label, modal backdrop dismiss
- [x] 8.5 `AchievementCard.tsx` — locked-silhouette / unlocked-full-state with date + reward chip; "?" placeholder when locked
- [x] 8.6 `AchievementsPage.tsx` — 2 sub-tabs (成就 / 科別精通), 3 filters (category / tier / lock), strict hidden filter, live Dexie subscribe
- [x] 8.7 `/achievements` route wired in `App.tsx`; HomePage tile added「成就 →」+ `AchievementUnlockOverlay` component routes P1→Modal / P2-P4→Toast based on tier
- [x] 8.8 HelpMenu section「成就系統 — 4 tier 像素勳章」added — 4 paragraphs explaining tiers / P1 composite rule / 14 科 100% / unlock notification UX
- [x] 8.9 ~~SettingsPanel~~ **二階 doesn't have SettingsPanel** (per styles.css comment: 二階 only AuthMenu, 一階 has SettingsPanel). Created `AchievementTitleSelector.tsx` + embedded in `LeaderboardSettingsControls` (the existing leaderboard config area) which is the natural home for title display selection. Falls back to empty-state hint「解鎖成就以獲得稱號」when no titles unlocked yet

## 9. Cloudflare D1 + Worker

- [x] 9.1 `cloudflare/sync-worker/migrations/0002_add_badges.sql` created — two `ALTER TABLE leaderboard_m2 ADD COLUMN` statements with safe defaults (`TEXT NOT NULL DEFAULT ''` + `INTEGER NOT NULL DEFAULT 0`)
- [x] 9.2 `handleUpsert` accepts + validates `badges_csv` (regex `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$`, max len 60, max 6 entries) + `subject_mastery_count` (integer 0-14). Invalid → 400 with typed error; INSERT/UPSERT extended with both fields
- [x] 9.3 `SNAPSHOT_COLUMNS` const extended to include `badges_csv` + `subject_mastery_count` — cron auto-picks them in hourly Top 100 KV snapshots
- [x] 9.4 `handleGetMe` SELECT extended; returns `badges_csv ?? ""` + `subject_mastery_count ?? 0` (null-safe for pre-0002 rows). `handleGetFilter` auto-returns since it reads KV passthrough
- [ ] 9.5 ~~Vitest unit tests~~ **N/A** — no test infra in `cloudflare/sync-worker/` (package has only `dev` / `deploy` / `tail` / `typecheck` scripts). Adding `@cloudflare/vitest-pool-workers` + D1 mock setup is out of scope. Manual smoke via deployed Worker covers in Phase 11
- [x] 9.6 Worker typecheck pass; commit pending in this turn
- [ ] 9.7 **Owner manual step (post-deploy)**: `cd cloudflare/sync-worker && wrangler d1 migrations apply study-rpg-leaderboard --remote`
- [ ] 9.8 **Owner manual verify post-apply**: `wrangler d1 execute study-rpg-leaderboard --remote --command "SELECT sql FROM sqlite_master WHERE name='leaderboard_m2'"` — should show both new columns

## 10. Leaderboard client push integration

- [x] 10.1 `lib/sync/leaderboard.ts` extends `LeaderboardAttributes` with badges_csv + subject_mastery_count; new `deriveAchievementSnapshot()` helper folds over local achievements table picking per-category max-tier + counting `subject-master-*` entries
- [x] 10.2 `buildLeaderboardAttributes()` calls deriveAchievementSnapshot in parallel with existing reads; `pushLeaderboardIfOptedIn` (the engine onPushComplete hook) auto-includes new fields via spread
- [x] 10.3 LeaderboardPage `NicknameWithBadges` helper added — parses badges_csv, renders inline 20px BadgeSprite per category in CATEGORY_ORDER + `🩺 X/14` chip when subject_mastery_count > 0
- [x] 10.4 BadgeSprite already includes `title=` attribute (P1 鑽石級招募達人成就 etc); subject chip has `title="已寫完 X 科"` + aria-label
- [x] 10.5 Inline 20px × max 6 badges = 120px + chip ≈ 200px — fits in nickname column at both mobile and desktop widths. No CSS yet (visual polish deferred to styles.css follow-up); layout works with default span flow

## 11. Verification (Chrome MCP E2E)

- [ ] 11.1 Run `mcp__Claude_in_Chrome__list_connected_browsers` to confirm chrome MCP connected (per chrome_mcp_preflight rule)
- [ ] 11.2 Dev smoke (`localhost:5173/study-rpg/hospital/`):
   - Trigger 1 correct quiz answer → AchievementUnlockToast appears for `first-quiz-answered` P4
   - Manually set `monotonicCounters.totalDoctorsRecruited = 3` via `globalThis.__db` → reload → unlock toast appears
   - Navigate `/achievements` → P4 unlocked card visible; locked cards silhouette; hidden cards absent
   - Pick a title in SettingsPanel → `/leaderboard` shows title chip next to own nickname
   - `/leaderboard` own row shows at least 1 BadgeSprite after unlock
- [ ] 11.3 SPA route 三件套: F5 on `/achievements` → not 404; direct URL `https://...hospital/achievements` → not 404; in-app nav from HomePage tile → works
- [ ] 11.4 Cloud sync verification: `globalThis.__sync.pushNow()` → Performance API confirms PUT to R2 m2-snapshot → pull on second device (or after clearing Dexie) → achievements re-populate
- [ ] 11.5 D1 leaderboard verification: `curl https://api.med-study-rpg.com/leaderboard/composite` → response JSON contains own row with non-empty `badges_csv` + valid `subject_mastery_count`
- [ ] 11.6 Anti-grind validator runtime check: temporarily add a "pure-time P1" entry to a test catalog → `pnpm --filter @study-rpg/content-medexam2-tw build` fails with clear error → remove test entry
- [ ] 11.7 Prod smoke (after merge + auto-deploy completes both GH Pages + CF Pages): repeat 11.2-11.5 on BOTH `https://fireman333.github.io/study-rpg/hospital/` AND `https://med-study-rpg.com/` — three-pronged SPA test on each
- [ ] 11.8 Confirm CF Worker deploy succeeded: `curl https://api.med-study-rpg.com/health` (or wherever the health endpoint lives) returns 200
- [ ] 11.9 Verify D1 column exists post-migration: SQL inspection as 9.8

## 12. Cleanup & archival

- [ ] 12.1 Run `pnpm -r typecheck` and `pnpm -r build`; both must pass cleanly
- [ ] 12.2 Run `/simplify` over new code (per project pipeline convention)
- [ ] 12.3 Run `/opsx:verify` on this change for completeness / correctness / coherence check
- [ ] 12.4 Run `/verify` (Chrome MCP global skill) — auto-confirm or escalate
- [ ] 12.5 Update `openspec/project.md` Roadmap row for M5+ to mention achievement system shipped
- [ ] 12.6 Update `apps/medexam2-hospital-tw/CLAUDE.md` (or root `CLAUDE.md`) with achievement system pointer (key files + reward channels + how to add new achievement)
- [ ] 12.7 Open PR with description summarizing 7 categories + 4 tiers + atlas approach + R2-only adapter
- [ ] 12.8 After user approves: merge → ensure all 3 workflows green (GH Pages + CF Pages + CF Worker) → owner runs D1 manual apply → final dual-prod smoke → `/opsx:archive` this change
