## 0. Prerequisites

- [x] 0.1 Verify clean git working tree on `track-m2` branch — pre-existing 1-line `apps/medexam2-hospital-tw/public/content/medexam2-tw/meta.json` modification is owner's unrelated work; using explicit `git add` paths so it stays out of my commits (multi-agent safety).
- [x] 0.2 Skipped pull — `git fetch origin track-m2` shows remote not ahead; no parallel session flagged on this branch.
- [x] 0.3 Re-verified source pointers live: LeaderboardPage.tsx:364+494 ✓, leaderboard.ts:109 ✓, Worker TIER_MAX:39 + bound check:209 ✓, 0001_leaderboard.sql:29 CHECK ✓, migrations `0001 + 0002` only (0003 reserved for in-flight change).

## 1. Phase A — Display fix (frontend-only)

- [x] 1.1 Edited `apps/medexam2-hospital-tw/src/lib/tier-labels.ts`: added `NUM_TO_TIER: Record<number, HospitalTier>` map + new helper `tierLabelFromNumber(n: number): string` that wraps the lookup + `console.warn` + fallback to 診所 (chose helper over call-site `??` ternary per design D4「via a tiny guard wrapper (or inline)」; centralises fallback logic + keeps both call sites identical).
- [x] 1.2 Edited `apps/medexam2-hospital-tw/src/pages/LeaderboardPage.tsx:41`: added `import { tierLabelFromNumber } from '../lib/tier-labels'`.
- [x] 1.3 Edited `apps/medexam2-hospital-tw/src/pages/LeaderboardPage.tsx:365` (formerly :364, shifted by import): replaced `T{row.hospital_tier}` with `{tierLabelFromNumber(row.hospital_tier)}`.
- [x] 1.4 Edited `apps/medexam2-hospital-tw/src/pages/LeaderboardPage.tsx:495` (formerly :494): identical replacement to 1.3.
- [x] 1.5 `pnpm -r typecheck` — 0 errors across all 8 packages (core / 2 content / 2 theme / 2 apps / Worker).
- [x] 1.6 Chrome MCP smoke on `http://localhost:5174/study-rpg/hospital/#/leaderboard` (port 5174, not 5173 — 5173 occupied). No real rows on localhost (unauth + can't hit prod Worker), so verified helper directly via ESM module import: `tierLabelFromNumber(1/2/3/4)` → `診所/區域/醫中/大廟` ✓; fallback `tierLabelFromNumber(0/5)` → `診所` + `console.warn` ✓. Page shell loaded with no React crash. Full table render verification deferred to live tasks 1.10/1.11.
- [x] 1.7 Owner confirmed via AskUserQuestion → commit `6c30596` on track-m2. Exactly 2 files staged via explicit paths; staging clean per `multi_agent_git_safety.md`.
- [x] 1.8 Pushed: `7041868..6c30596 track-m2 -> track-m2`.
- [x] 1.9 Owner ran `cd ~/coding-scratch/study-rpg && git pull && git merge track-m2 → fb7ae50 → push origin main`. Both workflows triggered: deploy.yml (26355243580) + deploy-cf-pages.yml (26355243572) both green within ~60s. (Original tasks plan said track-m2 push auto-deploys — incorrect; main is the deploy branch. Documented for future Wave-style changes.)
- [x] 1.10 Live verify `https://med-study-rpg.com/2nd/#/leaderboard` via Chrome MCP: zero `T1/T2/T3/T4` literals; tier cells render 醫中×2, 區域×1, 診所×7 (10 data rows + 1 header). Real prod data — no 大廟 row because owner's T4 account currently clamped to 3 in D1 (fixes in Wave B).
- [x] 1.11 Live verify `https://fireman333.github.io/study-rpg/hospital/#/leaderboard`: identical render (both frontends serve same KV snapshot from same Worker).

## 2. Phase B — Worker + D1 schema (T4 distinction)

- [x] 2.1 Wrote `cloudflare/sync-worker/migrations/0004_bump_tier_to_4.sql`. Uses BEGIN TRANSACTION + canonical CREATE-NEW + INSERT-SELECT + DROP + RENAME + recreate-4-indexes + COMMIT. 5 CHECK constraints preserved (only `hospital_tier` widened to `BETWEEN 1 AND 4`).
- [x] 2.2 Cross-checked 0004 against 0001 + 0002. **Corrected 3 inaccuracies from design D2**: (a) actual indexes are `composite/reputation/doctor_count/study_min` (4 indexes), not `rank/nickname_lower` as written; (b) `nickname_lower UNIQUE` is column constraint, not separate named index; (c) no `CHECK (subject_mastery_count BETWEEN 0 AND 14)` in D1 schema (only enforced at Worker level). All 11 columns from post-0002 reality replicated.
- [x] 2.3 Edited `cloudflare/sync-worker/src/leaderboard.ts:39`: `const TIER_MAX = 3 → 4`. Worker typecheck `pnpm --filter @study-rpg/sync-worker typecheck` ✓ zero errors. Bound check at :209 inherits new max.
- [x] 2.4 No Worker tests directory exists — task is no-op.
- [x] 2.5 Ran `wrangler d1 migrations apply --local` ✓ 9 commands. Local schema verified `BETWEEN 1 AND 4`.
- [x] 2.6 `wrangler d1 execute --remote SELECT COUNT(*)` → N_PRE = 10.
- [x] 2.7 First `wrangler d1 migrations apply --remote` **failed** — D1 rejects raw `BEGIN TRANSACTION` / `COMMIT` (error 7500: must use state.storage.transaction() JS API). Migration atomically rolled back; prod schema + 10 rows untouched (verified). Removed BEGIN/COMMIT from 0004 (D1 wraps each migration atomically per its own docs). Re-applied ✓ 9 commands in 3.80ms.
- [x] 2.8 Post-count = 10 ✓ matches N_PRE. Zero data loss.
- [x] 2.9 Prod schema verified `CHECK (hospital_tier BETWEEN 1 AND 4)`. All 4 indexes recreated. No `leaderboard_m2_new` orphan.
- [x] 2.10 Committed `d45fecb` on track-m2 — exactly 2 files staged (migration + Worker code).
- [x] 2.11 Pushed track-m2 → cross-worktree merge `fb7ae50..64e0d62` to main → deploy-worker.yml run `26355668644` ✓ complete.
- [x] 2.12 T4 sanity round-trip on prod D1: INSERT `hospital_tier=4` row → SELECT confirms `test-t4-verify-18804 / tier 4` → DELETE → final count back to 10. Zero leak.

## 3. Phase B — Client unclamp

- [x] 3.1 Edited `leaderboard.ts:109`: `國家級教學醫院: 3 → 4`.
- [x] 3.2 Deleted the 5-line `// Worker enforces tier ∈ [1, 3] ... Phase 4 follow-up` comment block above the map.
- [x] 3.3 `pnpm -r typecheck` ✓ zero errors across 8 packages.
- [x] 3.4 Skipped — Phase A's Chrome MCP helper test (`tierLabelFromNumber(1/2/3/4)` end-to-end ESM check) already proved client-side render path works for all 4 tiers. Phase 3 only changes the integer sent on push; doesn't touch render.
- [x] 3.5 Staged `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` only — clean staging.
- [x] 3.6 Committed `3f761d2` on track-m2.
- [x] 3.7 Pushed track-m2 → cross-worktree merge `64e0d62..cee8b49` to main → deploy.yml run `26355735443` + deploy-cf-pages.yml run `26355735435` both ✓ complete. Client unclamp now live on both prod URLs.
- [x] 3.8 Live T4 visual demo **deferred per owner decision** — current D1 has no real T4 player (max ㄚㄚㄚ rep 282k is T3); owner's signed-in account on this device is genuinely T1 診所 in Dexie state. Technical verification accepted in lieu: D1 sanity INSERT `tier=4` ✓ (task 2.12), Worker TIER_MAX=4 deployed ✓, client TIER_TO_NUMBER unclamped + deployed ✓. The next real T4 player sync will trigger natural end-to-end verification with no further code change needed.
- [x] 3.9 Cleanup skipped — owner's 康勞德 row in D1 is correctly T1 (matches device's actual game state). No stale-row anomaly to fix.

## 4. Verification + Archive

- [x] 4.1 `/opsx:verify` ran ✓: 0 CRITICAL, 3 WARNING (W1 design.md BEGIN/COMMIT doc-only patch, W2 design.md index names doc-only patch, W3 live T4 demo deferred per owner accepting technical verification). Ready for archive.
- [x] 4.2 Skipped `/verify` end-to-end smoke — combined Wave A + Wave B smoke equivalents already captured during apply (Chrome MCP live verify on both prod URLs for Wave A short labels + D1 sanity INSERT round-trip for Wave B T4 acceptance). No real T4 player exists for end-to-end visual demo of T4 rank distinction (W3).
- [x] 4.3 Archive now — owner picked「立刻 archive」(no 24hr soak; tech verification already accepted).
- [ ] 4.4 Run `/opsx:archive fix-leaderboard-tier-display-and-t4`. The workflow syncs delta into `openspec/specs/hospital-leaderboard/spec.md` (updates the 2 modified requirements + adds the new T4-acceptance scenario), moves the change to `openspec/changes/archive/<date>-fix-leaderboard-tier-display-and-t4/`.
- [ ] 4.5 Owner confirms archive commit via auto-git skill. Template: `spec(archive): merge fix-leaderboard-tier-display-and-t4 — Wave A short labels + Wave B T4 distinction`.
- [ ] 4.6 Optional: merge `track-m2` → `main` if any other shipped changes ready to flow back (`cd ~/coding-scratch/study-rpg && git merge track-m2`).
