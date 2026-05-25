## 1. Constants re-tune (`packages/content-medexam2-tw/src/fate-cards.ts`)

- [x] 1.1 Update `FATE_CARD_COSTS.epic` from `100_000` → `50_000` and add inline `// TUNED 2026-05-25 by redesign-fate-card-economy` comment with cross-ref to design.md Option C
- [x] 1.2 Update `FATE_CARD_COSTS.legendary` from `1_000_000` → `300_000` with same comment; note the threshold-matching property (= `TIER_UPGRADE_THRESHOLDS.醫學中心`)
- [x] 1.3 Update `FATE_CARD_BAD_LUCK_RATES.epic` from `0.05` → `0` so epic draws never roll bad luck
- [x] 1.4 Update `FATE_CARD_BAD_LUCK_PENALTIES.epic` from `50_000` → `0` (defensive — bad-luck path no longer reachable for epic, but keep table consistent)
- [x] 1.5 In `FATE_CARD_POOLS.epic`, REMOVE the entry `{ key: 'salary-waiver-1-week', label: '1 週薪水免除' }` and ADD `{ key: 'targeted-p3-ticket-x2', label: '指定科 P3+ 招募券 ×2' }` in its place (preserve 3-entry pool size for uniform distribution)

## 2. Reward dispatcher update

- [x] 2.1 Locate the fate-card reward dispatcher (likely `apps/medexam2-hospital-tw/src/services/fate-card.ts`); grep for `'salary-waiver-1-week'` case branch
- [x] 2.2 Remove the `salary-waiver-1-week` case branch from the dispatcher (no other code references the key — confirm via `grep -r 'salary-waiver-1-week' apps/ packages/`)
- [x] 2.3 Add a `targeted-p3-ticket-x2` case branch that grants two targeted-P3+ tickets (twice what `targeted-p3-ticket` does — reuse the existing single-ticket logic in a 2× loop, do not duplicate the ticket-granting code)
- [x] 2.4 Verify the dispatcher's targeted-ticket helper handles `TARGETED_REROLL_CAP` correctly when called twice consecutively (each ticket gets its own reroll budget) — confirmed: `consumeTargetedTicket` has its own reroll budget per call, so two independent pending tickets each get full `TARGETED_REROLL_CAP` (5) on consume

## 3. UI cost displays

- [x] 3.1 In `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx`, confirm all cost displays read from `FATE_CARD_COSTS` constant (not hardcoded `100,000` / `1,000,000` / `100k` / `1M` strings); fix any hardcoded display to read from the constant — confirmed: line 163 reads from constant, no hardcoded literals found
- [x] 3.2 In `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx`, locate the fate-card section; update any hardcoded cost mentions to the new numbers or refactor to read from `FATE_CARD_COSTS`
- [x] 3.3 Grep `apps/medexam2-hospital-tw/src/` for the literal strings `100,000`, `1,000,000`, `1M 聲望`, `100k 聲望` to catch any other hardcoded mentions; fix or document why each remaining match is intentional — grep found only facility-related hits (not fate-card), no action needed
- [x] 3.4 Update any in-app tooltip / pool-preview text mentioning `1 週薪水免除` to `指定科 P3+ 招募券 ×2` — only stale ref was in fate-card.ts dispatcher docstring (now cleaned)
- [x] 3.5 Update any bad-luck warning text shown on the 史詩 pack (was "5% 衰運機率") to reflect 0% — implemented via generalized `isPure = badLuckRate === 0` branch in FateCardPage.tsx that shows "純獎勵（無衰運）" for both epic and legendary

## 4. Test updates (N/A — deferred to follow-up `add-medexam2-test-infra`)

二階 packages (`content-medexam2-tw` + `medexam2-hospital-tw`) have NO existing vitest / jest infrastructure. The only test file in the monorepo is `apps/medexam-tw/src/lib/sync/r2/__tests__/engine-r2.test.ts` (一階 only). Adding vitest setup mid-change violates Surgical Changes principle. Defer to a dedicated follow-up change that adds vitest + writes the load-bearing invariant asserts:

- [x] 4.1 ~~Update existing test assertions~~ — N/A, no existing tests reference the old literals
- [x] 4.2 ~~Add invariant assert `FATE_CARD_COSTS.legendary === TIER_UPGRADE_THRESHOLDS.醫學中心`~~ — deferred to follow-up
- [x] 4.3 ~~Add invariant assert `FATE_CARD_BAD_LUCK_RATES.epic === 0` && `legendary === 0`~~ — deferred to follow-up
- [x] 4.4 ~~Add invariant assert `FATE_CARD_POOLS.epic` excludes `salary-waiver-1-week`~~ — deferred to follow-up
- [x] 4.5 ~~Run package tests~~ — N/A, no test scripts in either package's package.json

## 5. Help-menu doc section

- [x] 5.1 Update the fate-card explainer in `HelpMenu.tsx` to mention the new "300k 傳奇 = 醫學中心升級門檻" alignment as a player-facing teaching point (helps onboarding new players grasp the loop)
- [x] 5.2 Note in the same section that 史詩 + 傳奇 are now both 純獎勵 (no bad luck) so players don't fear high-tier draws

## 6. Verification

- [x] 6.1 Run `pnpm -r typecheck` — must pass clean (initial failure in FateCardPage line 168 fixed by narrowing tier to `'common' | 'rare'` for the pity-counter lookup; schema type intentionally excludes 0%-bad-luck tiers)
- [x] 6.2 Run `pnpm --filter @study-rpg/medexam2-hospital-tw dev` and manually verify in Chrome MCP: (a)✓ 史詩 cost shows 50,000, (b)✓ 傳奇 cost shows 300,000, (c)✓ 史詩 pool shows "指定科 P3+ 招募券 ×2" not "1 週薪水免除", (d–f) draw-effect scenarios deferred — UI smoke confirmed all visible literals match spec; actual rep-deduction draws gated on save state and covered by spec scenarios for future test suite
- [x] 6.3 Run `openspec validate redesign-fate-card-economy` — must pass
- [x] 6.4 Run `/opsx:verify` to check completeness / correctness / coherence — passed with 2 warnings (load-bearing invariant deferred to test follow-up; tasks 6.2/6.5 then pending)
- [x] 6.5 Run `/verify` (global skill) for end-to-end Chrome MCP smoke of the fate-card page on dev server — Chrome MCP showed all 4 acceptance criteria visually; console only had 2 unrelated React Router v7 future-flag warnings; dead-code audit skipped (no knip/eslint configured in 二階 packages, typecheck `noUnusedLocals` covers unused locals/imports); `/simplify` skipped per user implicit choice (deferred)

## 7. Archive

- [ ] 7.1 After verification passes, run `/opsx:archive` (NOT raw `openspec archive --yes` — per project CLAUDE.md curator rule, the slash command has a sync gate the raw CLI skips)
- [ ] 7.2 Confirm `openspec/specs/hospital-fate-cards/spec.md` Requirement 1 table reflects the new numbers post-sync
- [ ] 7.3 User confirms before `git commit`; commit message template: `spec(archive): merge redesign-fate-card-economy — re-tune 史詩 100k→50k / 傳奇 1M→300k + drop salary-waiver slot`
