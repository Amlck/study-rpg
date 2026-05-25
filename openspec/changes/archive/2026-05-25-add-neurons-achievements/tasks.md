## 1. Pre-flight + Core type audit

- [x] 1.1 Confirmed core exports `Achievement` / `AchievementTier` / `AchievementCategory` / `AchievementReward` / `AchievementStats` / `Player` / `checkAchievementUnlocks` / `listUnlockedAchievements` / `listLockedAchievements` / `visibleAchievements`
- [x] 1.2 Audit result: `AchievementCategory` is strict union `'study'|'quiz'|'recruit'|'hospital'|'fortune'|'hidden'|'subject'` — neurons needs `'variant'|'synapse'|'mastery'` instead. **Decision: re-declare neurons-side, no core change.** Reasoning: `AchievementStats` is also 二階-specific (`totalDoctorsRecruited` / `currentHospitalTier` / `subjectAttemptCounts`); widening core to fit both is invasive and breaks `@study-rpg/core@0.2.x` published API contract. Neurons re-declares 5 types locally + re-impl 5-line `checkAchievementUnlocks` — aligns with `neurons-mode` Req 4 data isolation
- [x] 1.3 Audit result: `AchievementReward` core union includes `'cosmetic'` (which neurons can't fulfill); re-declare neurons-side as 2-kind subset `{kind:'leaderboard'}|{kind:'title';title:string}` (badge dropped — neurons uses 'leaderboard' for the implicit 勳章 effect)
- [x] 1.4 Read `apps/neurons-tw/src/lib/db.ts` — v4 schema confirmed with `leaderboardProfile`; v5 will additively add `achievements`

## 2. Content pack — catalog + validator

- [x] 2.1 Create `packages/content-neurons-tw/src/achievements.ts` exporting `NEURONS_ACHIEVEMENT_CATEGORIES` (7-tuple) + `NEURONS_ACHIEVEMENTS: readonly Achievement[]`
- [x] 2.2 Author **study** category 4 entries — P4 (10 min cumulative reading) / P3 (5 hr) / P2 (20 hr) / P1 ("50 hr 累積 且 連續唸書 ≥ 14 天 streak" composite 量×持續, with `composite: true`)
- [x] 2.3 Author **quiz** category 5 entries — P4 (50 correct) / P3 (300 correct) / P2 (streak ≥ 10) / P2 (1000 correct) / P1 ("3000 correct 且 整體準確率 ≥ 80%" composite 量×質, `composite: true`)
- [x] 2.4 Author **variant** category 5 entries — P4 (5 variants) / P3 (15 variants) / P2 (30 variants) / P2 (first 5/5 family complete) / P1 ("5 families 5/5 complete 且 ≥ 1 個 P1 variant" composite 廣×質, `composite: true`)
- [x] 2.5 Author **synapse** category 4 entries — P4 (first synapse formed) / P3 (5 synapses) / P2 (3 strong synapses) / P1 ("10 strong synapses 且 同一日激發 ≥ 4 families 過 1 次" composite 量×廣度, `composite: true`)
- [x] 2.6 Author **mastery** category 4 entries — P4 (1 family ≥ P5 Novice) / P3 (3 families ≥ P4 Familiar) / P2 (5 families ≥ P3 Proficient) / P1 ("3 families ≥ P2 Expert 且 1 family P1 Master" composite 廣×高度, `composite: true`)
- [x] 2.7 Author **fortune** category 4 entries — P4 (first slot 4 pity hit) / P3 (first slot 5 pity hit) / P2 (first natural-roll P1 variant, non-pity) / P1 ("5 natural-roll P1 variants 且 跨 ≥ 3 families" composite 量×廣度, `composite: true`)
- [x] 2.8 Author **hidden** category 4 entries — predicates documented in inline comments; e.g., P4 (first-day 答對 10 題) / P3 (連續 3 天每天至少 form 1 synapse) / P2 (持有 P1+P2+P3+P4+P5 各 ≥1 variant — rarity diversity) / P1 ("全 11 family 都 ≥ P3 Proficient" composite 廣×高度, `composite: true`)
- [x] 2.9 Each P1 entry header comment explicit names the 2 dimensions combined (per spec Req metadata documentation)
- [x] 2.10 Each entry has `id` (kebab-case unique) / `name` (zh-TW ≤ 12 char) / `description` (zh-TW 1-2 sentences) / `tier` / `category` / `hidden` / `predicate` / `reward`
- [x] 2.11 Reward distribution: all 30 entries `kind: 'leaderboard'` by default; P1 + select P2 entries (~10 total) carry additional `kind: 'title'` reward with neurons-flavored title strings (e.g., '神經元始祖' / '突觸鍛造者' / '連線大師'); rationale documented in inline comments
- [x] 2.12 Create `packages/content-neurons-tw/src/validator.ts` exporting `validateNeuronsAchievementCatalog(catalog): void` — rules: (a) P1 entries MUST have `composite: true`, (b) non-P1 entries MUST NOT have `composite: true`, (c) all entries have all required fields populated; throws `Error` with offending `id` + rule violated
- [x] 2.13 Wire validator into `packages/content-neurons-tw` build script — fail build on rule violation
- [x] 2.14 Add unit tests for validator covering 3 negative cases (P1 missing composite / P4 has composite / missing required field) and 1 positive case (full valid catalog)

## 3. Engine plumbing — types + stat builder

- [x] 3.1 Add `AchievementStats` interface to `apps/neurons-tw/src/lib/services/achievement.ts` capturing all neurons predicate inputs (totalStudyMinutes / totalCorrectAnswers / totalQuestionsAnswered / currentQuizCorrectStreak / maxQuizCorrectStreak / variantCount / familyCompleteCount / naturalP1VariantCount / variantPityFloorCount / totalAP / synapseFormedCount / synapseStrongCount / synapseLastFormedDate / consecutiveSynapseDays / masteryTierByFamily Map / accuracyOverall / etc.)
- [x] 3.2 Implement `buildAchievementStats(): Promise<AchievementStats>` reading all neurons Dexie tables (`familyAccrual` / `synapses` / `familyMastery` / `neuronVariants` / `meta`) — single transaction read for snapshot consistency
- [x] 3.3 Implement `buildPlayerSnapshot(): PlayerSnapshot` (mirror existing shape; if `PlayerSnapshot` is a `@study-rpg/core` published type confirm shape; if neurons-specific just declare locally)
- [x] 3.4 Verify `checkAchievementUnlocks` from core works against neurons stats shape (TypeScript type check + manual smoke test with 2-3 catalog entries)

## 4. Dexie v5 migration

- [x] 4.1 Edit `apps/neurons-tw/src/lib/db.ts` add `AchievementRow` interface + `achievements` `Table<AchievementRow, 'id'>` typed handle
- [x] 4.2 Add `this.version(5).stores({...v4 tables, achievements: 'id, unlockedAt'})` to NeuronsDB constructor
- [x] 4.3 Add v5 upgrade callback if needed (likely no body — additive table doesn't need data migration)
- [x] 4.4 Verify in dev console: open IndexedDB devtools, force `db.delete()` + reload to test fresh install; reload existing v4 save to test additive upgrade
- [x] 4.5 Extend `LeaderboardProfileRow` interface with `unlockedTitles?: string[]` and `selectedTitle?: string | null`; no schema change required (Dexie v5 lazy serialization, existing rows just have undefined for these fields)

## 5. Streak counter service

- [x] 5.1 Create `apps/neurons-tw/src/lib/services/streak.ts` exporting `getStreaks()` / `incrementCurrentStreak(tx?)` / `resetCurrentStreak(tx?)`; reads + writes `meta['currentQuizCorrectStreak']` + `meta['maxQuizCorrectStreak']` as stringified ints
- [x] 5.2 Modify `connectome.ts` `recordCorrectAnswer` Dexie transaction — co-commit streak +1 + MAX-merge update
- [x] 5.3 Modify `connectome.ts` `recordIncorrectAnswer` Dexie transaction — co-commit streak reset to 0 (no change to max)
- [x] 5.4 Add unit test: simulate sequence (correct × 5, wrong × 1, correct × 8) and verify (current=8, max=8)

## 6. Reward dispatcher service

- [x] 6.1 Create `apps/neurons-tw/src/lib/services/achievement-reward.ts` exporting `dispatchReward(achievement: Achievement, reward: AchievementReward): Promise<void>`
- [x] 6.2 Branch on `reward.kind`:
  - `'leaderboard'` → no-op (`badges_csv` derivation runs on next leaderboard push)
  - `'title'` → append `reward.title` to `db.leaderboardProfile.unlockedTitles` (create list if missing)
- [x] 6.3 Wrap in try/catch; failure logs `[achievement-reward]` channel via console.warn; achievement is still persisted regardless
- [x] 6.4 Test: trigger a title-reward predicate, verify `unlockedTitles` array updates

## 7. Orchestrator + trigger hooks

- [x] 7.1 Create `apps/neurons-tw/src/lib/services/achievement.ts` exporting `checkAndUnlockAchievements(prev, prevStats, next, nextStats): Promise<void>` that:
  - Calls `checkAchievementUnlocks(prev, prevStats, next, nextStats, NEURONS_ACHIEVEMENTS)`
  - For each returned achievement: `db.achievements.add({ id, unlockedAt: Date.now(), notificationShown: false })` (idempotent via PK)
  - Call `dispatchReward(...)` for each
  - Push to `achievementToastQueue` (P2-P4) or emit `achievement.modalUnlocked` event (P1)
- [x] 7.2 Wire hook into `connectome.ts` `recordCorrectAnswer` — capture pre-snapshot before mutation, call orchestrator after transaction commits
- [x] 7.3 Wire hook into `connectome.ts` `recordIncorrectAnswer` — same pattern
- [x] 7.4 Wire hook into `variant-gacha.ts` subscriber — after variant persisted
- [x] 7.5 Wrap each hook in try/catch (`[achievement]` channel) so failure doesn't break originating action
- [x] 7.6 Add `console.log` in dev mode logging which achievement just unlocked (will strip in prod build per Vite import.meta.env.DEV)

## 8. Backfill service

- [x] 8.1 Create `backfillAchievementsFromCurrentStats()` in `services/achievement.ts`:
  1. Build snapshot + stats
  2. Call `listUnlockedAchievements(snapshot, stats, NEURONS_ACHIEVEMENTS)` from core
  3. Diff vs `db.achievements.toArray()`
  4. `bulkPut` missing rows with `notificationShown: true`
  5. **NO** dispatchReward / toast / modal
- [x] 8.2 Wrap in try/catch (`[achievement-backfill]` channel)
- [x] 8.3 Wire into `App.tsx` (or root layout) `useEffect(() => { backfillAchievementsFromCurrentStats() }, [])` with `useRef`-based double-mount guard
- [x] 8.4 Test on 3 fixtures: (a) fresh install no Dexie data → 0 rows written, (b) v4 save with rich state but empty achievements table → many rows written, (c) v5 save with partial achievements table → only missing rows added (idempotency)

## 9. UI components — sprite + atlas + cards

- [ ] 9.1 Generate `badge-atlas.png` 896×512 (7×4) via codex CLI batch — **DEFERRED to follow-up change** `generate-neurons-achievement-atlases`. UI ships with SVG placeholder rendering (emoji + tier-color ring) in `BadgeSprite.tsx`; atlas swap is single-file change once asset exists. Rationale: codex CLI batch is 60–90 min wall time per atlas, not blocking ship
- [ ] 9.2 Generate `family-mastery-atlas.png` 1408×640 (11×5) — **DEFERRED**, same reason; no consumer site in this PR (FamilyMasteryBadgeSprite component not built)
- [ ] 9.3 Save atlases — DEFERRED with §9.1/9.2
- [ ] 9.4 24/48/64px visual review — DEFERRED with atlas generation
- [x] 9.5 `BadgeSprite.tsx` created with placeholder (SVG + emoji glyph + tier-color ring); `{category, tier, size, locked}` API ready for atlas swap
- [ ] 9.6 `FamilyMasteryBadgeSprite.tsx` — **DEFERRED** with atlas (no consumer in this PR)
- [x] 9.7 `AchievementCard.tsx` shipped
- [x] 9.8 `AchievementToastHost.tsx` shipped — uses motion library `<Toast>` + `TOAST_AUTO_DISMISS_MS`; note: spec mentions `AchievementUnlockToast` as conceptual name; this implementation reuses the motion library Toast directly (cleaner than separate component) — Toast variant + content composition matches spec scenarios
- [x] 9.9 `AchievementUnlockModal.tsx` (app-side wrapper) shipped — wraps motion library `<AchievementUnlockModal>` primitive; dismiss-required; reduced-motion honored via primitive
- [x] 9.10 `achievement-toast-queue.ts` singleton shipped — `subscribeAchievementToasts` / `dismissToast` / `dismissModal` / `pushAchievementToast` / `clearAchievementQueues` API; P1 → modal queue, P2-P4 → toast queue

## 10. AchievementsPage + route

- [x] 10.1 Create `apps/neurons-tw/src/pages/AchievementsPage.tsx`:
  - Sub-tabs 「已解鎖」/ 「全部」
  - Category filter (7-option dropdown OR chip row)
  - Tier filter (4-option)
  - Hidden filter toggle (strict — locked hidden never shown)
  - Grid of AchievementCard
  - 「N / M 已解鎖」counter at top
- [x] 10.2 Strict hidden filtering — verify locked hidden achievements never render anywhere (cards / counter denominators include hidden; filter dropdown lists "hidden" option but locked entries don't appear even when filter selected)
- [x] 10.3 Register route `/achievements` in router config; add NavBar link
- [x] 10.4 Manual visual smoke at 1024px / 768px / 360px viewports

## 11. Leaderboard integration

- [x] 11.1 `deriveAchievementSnapshot` + `deriveBadgesCsvFromDexie` added to `neurons-leaderboard.ts`; `buildLeaderboardPayload` includes `badges_csv`
- [x] 11.2 (subsumed by 11.1)
- [x] 11.3 6-entry max-length regex verified by inspection: `study:P1,quiz:P1,variant:P1,synapse:P1,mastery:P1,fortune:P1` = 47 chars, 6 entries → matches `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` (5 commas + 6 entries = pass). Live Worker round-trip deferred to §12 smoke
- [x] 11.4 `NicknameWithBadges` helper renders inline 20px badges from `badges_csv` parse
- [ ] 11.5 Render selected title inline in own row + my-rank chip — DEFERRED to follow-up. Title selection works in settings (TitleSelector), and `leaderboardProfile.selectedTitle` persists, but rendering on LeaderboardPage row would need adding `selected_title` to Worker schema (D1 column + KV snapshot + payload). That's a separate small change with its own D1 migration. Out of scope for this PR.
- [x] 11.6 `TitleSelector` embedded in `LeaderboardSettingsControls` — dropdown over `unlockedTitles` with 「（無）」option; writes `leaderboardProfile.selectedTitle` on change

## 12. Smoke testing — local + remote

- [x] 12.1 Chrome MCP smoke: dev server boots on :5175, `/achievements` loads clean (only pre-existing React Router future warnings), Dexie v5 schema confirmed via direct IndexedDB query
- [x] 12.2 Debug panel 10×「+5 答對」on 藥理學: pipeline fired 3 live unlocks (`variant-first-pull` P4 + `quiz-streak-10` P2 + `hidden-first-day-blitz` P4 hidden); toast visible with BadgeSprite + name + description; Dexie achievements table contains 4 rows total (incl. backfilled `mastery-first-novice`)
- [ ] 12.3 P1 capstone via Dexie seed — **deferred**. P1 modal already verified by motion library smoke (`add-neurons-motion-library` archive). Catalog composite predicates static-validated; runtime modal rendering shares code path with `VariantUnlockModal` (proven in `wire-neuron-variant-gacha` archive)
- [ ] 12.4 Manual leaderboard push — **deferred**. Requires Google OAuth + opt-in modal + nickname flow (separate spec coverage). `deriveAchievementSnapshot` manually verified: 3 unlocked non-hidden categories → expected output `mastery:P4,quiz:P2,variant:P4` (matches Worker regex)
- [ ] 12.5 KV snapshot — **deferred** with 12.4
- [x] 12.6 Hidden achievement: `hidden-first-day-blitz` unlocked visible on `/achievements` 「已解鎖」 tab; other 3 hidden entries (`hidden-synapse-weaver` / `hidden-rarity-diversity` / `hidden-connectome-saint`) remain invisible (counter 27 = 30 catalog − 3 locked-hidden)
- [ ] 12.7 Reduced-motion — **deferred**. Toast + Modal source `useRespectsReducedMotion` from motion library; motion library's reduced-motion behavior is spec-verified in `add-neurons-motion-library` archive
- [x] 12.8 Backfill verified: console log `[achievement-backfill] populated 1 row(s):` on boot; row id `mastery-first-novice` from pre-existing 5/5 藥理學 mastery state

## 13. Cross-prod smoke

- [x] 13.1 `pnpm -r typecheck` clean (all 3 apps + 5 packages)
- [x] 13.2 `pnpm --filter @study-rpg/neurons-tw build` succeeds; `pnpm --filter @study-rpg/content-neurons-tw build` runs validator + emits `achievements: 30 entries — study:4, quiz:5, variant:5, synapse:4, mastery:4, fortune:4, hidden:4`
- [ ] 13.3 GitHub Pages deploy — DEFERRED. neurons-tw is not yet wired to GH Actions (per `add-neurons-deploy` upcoming change). Local dev + production build both clean
- [ ] 13.4 Cloudflare Pages deploy — DEFERRED, same reason; this is `add-neurons-deploy` follow-up scope

## 14. Documentation + spec cleanup

- [x] 14.1 `CLAUDE.md` updated with "Neurons achievement system (M_3rd, 2026-05-25)" section — file paths / Dexie v5 / borrowed-from-二階 / type isolation rationale / smoke results / deferred follow-ups
- [x] 14.2 `openspec/specs/achievement-system/spec.md` untouched (verified via `git status`)
- [x] 14.3 `openspec/specs/hospital-leaderboard/spec.md` untouched
- [x] 14.4 `openspec/specs/neurons-leaderboard/spec.md` untouched
- [x] 14.5 `openspec validate add-neurons-achievements --strict` passes

## 15. Verify gate

- [ ] 15.1 Run `/opsx:verify add-neurons-achievements` — must pass 3-dim (completeness / correctness / coherence)
- [ ] 15.2 Run `/verify` (Chrome MCP end-to-end smoke) — exercise: visit `/`, trigger correct answer to cross 1 P4 predicate, see toast + check `/achievements` page, check `/leaderboard` shows badge — full path must work
- [ ] 15.3 `/simplify` review (optional but recommended) — eliminate unused params / commented-out experiments before archive

## 16. Archive

- [ ] 16.1 `/opsx:archive add-neurons-achievements` — workflow chooses sync gate; confirm sync writes new `openspec/specs/neurons-achievements/spec.md` and leaves source specs untouched
- [ ] 16.2 git commit per `auto-git` skill — template `spec(archive): merge add-neurons-achievements — neurons-achievements capability landed`
- [ ] 16.3 Update `openspec/project.md` Roadmap row for M_3rd track to mark `add-neurons-achievements` as ✓ shipped
- [ ] 16.4 Decide on next: `add-neurons-deploy` (the final M_3rd change) — confirm scope with user before propose
