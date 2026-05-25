# study-rpg — Project Instructions

> Project-level Claude Code memory. Loaded by every session in this repo (and overrides global `~/.claude/CLAUDE.md` where they conflict).

<!-- BEGIN: spec skill (OpenSpec wrapper) — managed block, edit between markers OK -->
## OpenSpec Workflow（本專案）

@openspec/project.md

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for spec-driven development. Lifecycle gates are wrapped by the global `spec` skill (`~/.claude/skills/spec/`). Above `@openspec/project.md` import pulls the project-level context（tech stack、roadmap、out-of-scope）automatically into every session — avoids re-loading via `/spec resume`.

### Retreat rules

If any of the following are detected, **stop OpenSpec workflow immediately** and route to the correct skill:

- `research_plan.json` present in this dir → use `research-plan` skill instead
- `01_protocol/` + `09_qa/` present → use `ma-end-to-end` skill instead

These exist because OpenSpec is wrong tool for statistical analyses and meta-analyses (those have their own structured workflows).

### Recommended pipeline

For non-trivial changes, prefer this order over ad-hoc edits:

```
/opsx:propose <change>      # write proposal.md / design.md / tasks.md
/opsx:apply                 # implement per tasks.md
/simplify                   # code-quality review (global skill)
/opsx:verify                # OpenSpec 3-dim check (completeness / correctness / coherence)
/verify                     # end-to-end check (global skill, e.g. Chrome MCP for web apps)
/opsx:archive               # merge delta into main specs (slash workflow has sync gate)
auto-git commit             # only after archive — see auto-git skill rules
```

**Skip steps only when**:
- Trivial typo / one-line fix → just edit, no propose
- User explicitly says "skip verify" / "just commit"

### Dual-worktree development (M_2nd parallel track)

M2（一階）+ M_2nd（二階 hospital mode）並行用 git worktree 隔離。完整 workflow / naming convention / sync protocol / git ops policy 詳見 `openspec/project.md` § Development Workflow。

- **一階 session**: `cd ~/coding-scratch/study-rpg` (main branch)
- **二階 session**: `cd ~/coding-scratch/study-rpg-m2` (track-m2 branch)
- **Merge 二階 → main**: `cd ~/coding-scratch/study-rpg && git merge track-m2` (post-archive; needs explicit confirm)

### Curator rules (hard)

- **Never** `git commit` without explicit user confirmation
- **Never** auto-write spec content — every requirement / scenario needs user-confirmed wording
- **Never** run `openspec archive --yes` raw CLI — always use `/opsx:archive` slash (it has a sync gate the raw CLI skips)
- Engine API surface (`packages/core/src/types.ts`) is the third-party fork contract; breaking changes need a CHANGELOG entry
- `packages/core/` stays content-agnostic — medical terms belong in theme / content packs, never in core
<!-- END: spec skill -->

## Deploy targets (in-flight migration)

Two parallel deploys during the 2–4 week migration bake (started 2026-05-22, change `add-med-study-rpg-domain-migration`):

| Target | URL — 一階 | URL — 二階 | URL — 神經元 (M_3rd) | Pipeline |
|---|---|---|---|---|
| **GitHub Pages** (legacy) | `https://fireman333.github.io/study-rpg/` | `https://fireman333.github.io/study-rpg/hospital/` | — (neurons-tw NOT published to GH Pages; spec `neurons-deploy` Req 1) | `.github/workflows/deploy.yml`; sets `VITE_DEPLOY_TARGET=gh-pages` so `DomainMigrationBanner` surfaces |
| **Cloudflare Pages** (new home) | `https://med-study-rpg.com/1st/` | `https://med-study-rpg.com/2nd/` | `https://med-study-rpg.com/neurons/` | CF Pages dashboard GitHub integration; build = `pnpm install && VITE_DEPLOY_BASE=/1st/ pnpm --filter @study-rpg/medexam-tw build && VITE_DEPLOY_BASE=/2nd/ pnpm --filter @study-rpg/medexam2-hospital-tw build && VITE_DEPLOY_BASE=/neurons/ pnpm --filter @study-rpg/neurons-tw build && node scripts/build-cf-pages-dist.mjs`; output = `dist-cf/` |

Both deploys hit the same Cloudflare Worker `study-rpg-sync-worker` via two URLs (same backend, no traffic split):

- Legacy: `https://study-rpg-sync-worker.tony85314.workers.dev` (GH Pages clients)
- New: `https://api.med-study-rpg.com` (CF Pages clients; Custom Domain binding)

OAuth redirect URI allowlist + Supabase Site URL inventory is in [docs/AUTH_REDIRECT_URIS.md](docs/AUTH_REDIRECT_URIS.md). Bake-end follow-up change will flip GH Pages to redirect-only and remove the legacy entries.

## Repo-specific build / dev quick reference

```bash
# Re-build 題庫 (defaults to all 10 subjects, ~3291 imported / 309 上游 OCR 缺欄位 skip;
# set MEDEXAM_SUBJECTS=藥理學 for vertical-slice fast iteration)
MEDEXAM_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam-tw build

# Copy built questions.json to app public/
cp packages/content-medexam-tw/dist/*.json apps/medexam-tw/public/content/medexam-tw/

# Cold checkout 第一次跑前要先 build packages/core (main/exports 已指向 dist/，不再走 src/.ts on-the-fly)。
# core src/index.ts 改動後也要再跑一次。`pnpm -r build` 會 topo-sort 自動處理，
# 但只跑 `pnpm dev` 時不會：
pnpm --filter @study-rpg/core build  # 必要 cold checkout 或 core 改動後

# Dev server (http://localhost:5173/study-rpg/)
pnpm --filter @study-rpg/medexam-tw dev

# medexam-tw `build` 已加 prebuild hook 會自動 rebuild core，CI deploy.yml 走這條路徑

# Typecheck everything
pnpm -r typecheck
```

## Cloud sync (M4 + R2 migration in-flight)

`apps/medexam-tw` and `apps/medexam2-hospital-tw` mirror gameplay state to cloud via opt-in Google OAuth. IndexedDB stays source of truth; cloud is additive.

**Backend is mid-migration** (started 2026-05-19, change `add-r2-cloud-sync-migration`): moving data plane from Supabase Postgres (500 MB DB cap + 5 GB egress/月 ceiling) to Cloudflare R2 object storage (10 GB + zero egress) via auth-bridging Worker. Sync unit per-row LWW → per-bundle blob LWW (3 bundles: `m1` 一階 / `m2` 二階 / `bookmarks` 跨 app). Currently **dual-write (Supabase + R2), reads still Supabase**. Phase 3 cuts reads to R2 after 14-day bake. Supabase Auth (Google OAuth) + `bug_reports` table stay on Supabase indefinitely (latter needs server-side SQL for owner dashboard). Migration banner in 一階 + 二階 surfaces for M4-era users with Supabase rows but no R2 blobs.

Key handles for R2 path:
- Worker: `https://study-rpg-sync-worker.tony85314.workers.dev` (source at `cloudflare/sync-worker/`)
- Blob layout: `users/<user_id>/<bundle>-snapshot.json.gz` (gzipped JSON, schema_version 1)
- Migration banner: `apps/<app>/src/components/MigrationBanner.tsx`
- R2 client adapter: `apps/<app>/src/lib/sync/r2/{client,bundles,engine-r2,migrate-from-supabase}.ts`
- Reconcile script: `scripts/reconcile.ts` (run via `pnpm reconcile --session <path>`)

### Project + env

| Resource | Value |
|---|---|
| Project ref | `jakdyjxojokyqxeiuukx` (Tokyo `ap-northeast-1`, free tier) |
| Dashboard | https://supabase.com/dashboard/project/jakdyjxojokyqxeiuukx |
| Anon key format | `sb_publishable_*` (new format, replaces legacy anon JWT; both supported by `@supabase/supabase-js@^2.105.4`) |
| OAuth provider | Google only (Client ID `554492800193-1gp4...`, scope `study-rpg-web`) |

Env vars (`.env.local` per app, gitignored; `.env.example` committed):

```
VITE_SUPABASE_URL=https://jakdyjxojokyqxeiuukx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_eWafgmt2wbELXnnIAYENOg_pL0aE5yN
VITE_CLOUD_SYNC_ENABLED=true        # set 'false' to disable client-side (kill switch)
VITE_SYNC_DEBOUNCE_MS=3000          # debounce window for batched push

# R2 migration (per add-r2-cloud-sync-migration; safe to omit until dogfood)
VITE_CLOUD_SYNC_BACKEND=dual         # supabase | dual | r2 (default supabase if unset)
VITE_CLOUD_SYNC_READ_BACKEND=supabase  # supabase | r2 (only honored when BACKEND=dual)
VITE_SYNC_WORKER_URL=https://study-rpg-sync-worker.tony85314.workers.dev
```

GH Actions secrets: 
- **Supabase (required)**: `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` exposed to `.github/workflows/deploy.yml`
- **R2 app build (optional, Phase 3+ flip)**: `VITE_CLOUD_SYNC_BACKEND` (`supabase`/`dual`/`r2`) + `VITE_CLOUD_SYNC_READ_BACKEND` (`supabase`/`r2`) + `VITE_SYNC_WORKER_URL`. Already wired into `deploy.yml` build steps; unset = empty string = safe default (`supabase`/`supabase`/prod Worker URL) per backend-config nonEmpty guard. Owner adds them only when ready to flip Phase 3 or 4.
- **R2 Worker deploy (one-time)**: `CF_API_TOKEN` + `CF_ACCOUNT_ID` for Worker deploy via `.github/workflows/deploy-worker.yml` (see `cloudflare/sync-worker/README.md` for scopes)
- Owner manually adds these in repo Settings → Secrets and variables → Actions

### Schema (9 sync tables + 4 RPCs)

Migrations live in `supabase/migrations/`:

- `0001_init_cloud_sync.sql` — 一階 (`player_state` / `srs_cards` / `item_instances` / `mentor_backlog`) + 二階 (`hospital_state` / `hospital_doctors` / `hospital_mastery` / `hospital_question_history`) tables + 32 RLS policies (`auth.uid() = user_id`)
- `0002_account_lifecycle.sql` — RPCs `delete_my_data()` / `delete_my_account()` / `export_my_data()` (SECURITY DEFINER, scoped to caller's `auth.uid()`)
- `0003_upsert_lww.sql` — RPC `upsert_lww(table_name, rows)` with 8-table whitelist + server-side LWW (`ON CONFLICT WHERE cloud.updated_at < incoming.updated_at`)
- `0005_question_bookmarks.sql` — 二階 `question_bookmarks` table (composite PK `(user_id, question_id)`, immutable `added_at` + LWW `updated_at`) + 4 RLS policies. Backs the `/bookmarks` page in `medexam2-hospital-tw`.
- `0006_upsert_lww_bookmarks.sql` — `CREATE OR REPLACE` of `upsert_lww` extending whitelist to 9 tables + new dispatch branch. Convention: every future `upsert_lww` change ships as a new numbered migration; never edit existing migrations in place.

### Architecture pointers

| Concern | Location |
|---|---|
| Sync engine factory | `apps/medexam-tw/src/lib/sync/engine.ts` |
| Table adapters (per-table snapshot + apply) | `apps/medexam-tw/src/lib/sync/tables.ts` |
| Migration / conflict gate state machine | `apps/medexam-tw/src/lib/sync/migration.ts` |
| React hook wiring | `apps/medexam-tw/src/lib/sync/useSync.ts` |
| Auth context + Supabase client singleton | `apps/medexam-tw/src/lib/auth/{AuthContext,client}.ts` |
| Sign-in resolution modals | `apps/medexam-tw/src/components/{MigrationUploadPrompt,ConflictChooserModal,SettingsPanel}.tsx` |
| Dexie schema (v4 with `localBackup` table) | `packages/core/src/lib/db.ts` |

二階 app (`apps/medexam2-hospital-tw`) is fully wired (M4 shipped 2026-05-17 + R2 dual-write shipped 2026-05-19, Phase 2). Both apps share the same backend-config flag matrix.

### DEV-only debug handles

When the engine is running (authed + gate state ∈ `fresh-start` / `silent-pull` / `resolved` / non-keep-separate):

```js
globalThis.__sync   // SyncEngine instance — getStatus(), pushNow(), pullNow(), pushAllNow(), pullAllNow(), pause(), resume()
globalThis.__db     // StudyRpgDB Dexie instance
```

Both gated by `import.meta.env.DEV`; stripped from prod build.

### RLS sanity check (run in dashboard SQL editor)

```sql
-- Should return only your own rows under any active session
select count(*), user_id from player_state group by user_id;

-- Should fail (no auth context) — confirms RLS is enforced
set role anon;
select count(*) from player_state;
reset role;
```

## Bug reporting (M4.5)

`apps/medexam-tw` and `apps/medexam2-hospital-tw` both ship an in-app **`💬 回報問題 / 建議`** flow:

- 一階 entry: `SettingsPanel.tsx` new section.
- 二階 entry: `HelpMenu.tsx` 9th accordion section.

Submissions land in Supabase table **`public.bug_reports`** (migration `supabase/migrations/0004_bug_reports.sql`). RLS = `auth.uid() = user_id` per row; owner reads via `service_role` (dashboard SQL editor today, future `/bug-reports` skill after the follow-up change).

Shared types: `@study-rpg/core` exports `BUG_REPORT_CATEGORIES`, `BUG_REPORT_SEVERITIES`, `BugReportRow`, etc. Per-app `services/bug-report.ts` builds the snapshot from each app's Dexie shape; per-app `services/console-error-buffer.ts` keeps a ring buffer of the last 5 `window.error` + `unhandledrejection` events.

Env vars (split from cloud-sync section above): `VITE_APP_VERSION` (npm `package.json` version; CI fills via `npm_package_version` automatically) and `VITE_COMMIT_SHA` (CI sets to `github.sha`). Local dev falls back to `'dev'`.

Force sign-in gate: modal shows a login CTA instead of the form when `useAuth().user` is null. No anon submit path.

Apply the migration manually once: `supabase db push` or paste `0004_bug_reports.sql` into the dashboard SQL editor. Sanity SQL in `supabase/sanity/bug_reports_rls.sql`. Full reference: `docs/BUG_REPORTING.md`.

## Hospital leaderboard (M_2nd ext)

`apps/medexam2-hospital-tw` ships an opt-in global leaderboard for 二階 — 5 public fields (hospital tier / reputation / doctor count / total study minutes / 2–12 codepoint nickname). Backend is **Cloudflare D1 + KV via the existing sync Worker**, not Supabase (chosen for zero egress at ~1k-player scale and to keep `add-r2-cloud-sync-migration` cutover unblocked).

Worker module: `cloudflare/sync-worker/src/leaderboard.ts` (endpoints + hourly cron). Endpoints:

| Method | Path | Purpose |
|---|---|---|
| POST | `/leaderboard/upsert` | JWT verify → sanity bounds → D1 UPSERT (LWW on `updated_at`) |
| GET | `/leaderboard/:filter` | Public read of pre-computed KV snapshot; `filter ∈ {composite, reputation, doctor, study}` |
| GET | `/leaderboard/nickname-check?n=<candidate>` | JWT verify → NFKC + lowercase D1 lookup |
| POST | `/leaderboard/opt-out` | JWT verify → flip `is_public = 0`, bump `updated_at` |
| DELETE | `/leaderboard/me` | JWT verify → hard delete D1 row (account-reset flow) |

| Resource | Value |
|---|---|
| D1 database | `study-rpg-leaderboard` (id `365a3809-4960-4373-8b0f-f864b2323c65`) |
| KV namespace | `LEADERBOARD_KV` (id `f0afc16989654688b5c98d420d468e28`) |
| Migration | `cloudflare/sync-worker/migrations/0001_leaderboard.sql` (NOT in supabase/migrations/ namespace) |
| Hourly cron | `0 * * * *` → `runLeaderboardCron` writes 4 KV snapshot keys `leaderboard:m2:top100:<filter>` |
| Daily cron (existing) | `0 0 * * *` → `runBackupCron` (R2-to-R2 backup, unrelated) |
| Active Worker version | `3be17865-1d80-4110-aa03-913c3fc28e81` |

Client side: opt-in push hooked into sync engine's `onPushComplete` (only fires when `firstError === null && !anyOffline`). Per-user profile lives in Dexie v14 `leaderboardProfile` table (`user_id` PK, `nickname / opted_in / is_public / dismissed_at / last_pushed_at`). Push helper `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` clamps 國家級教學醫院 tier → 3 to match Worker's `TIER_MAX`.

Apply D1 migration:

```bash
cd cloudflare/sync-worker
wrangler d1 migrations apply study-rpg-leaderboard --local   # dev
wrangler d1 migrations apply study-rpg-leaderboard --remote  # prod
```

Full reference: `docs/LEADERBOARD.md`.

## Achievement system (M_2nd ext, 2026-05-24)

`apps/medexam2-hospital-tw` ships a milestone-recognition system: 7 categories × 4 tiers (P1 鑽石 / P2 金 / P3 銀 / P4 銅, aligned with PSN Trophy convention) = ~42 catalog entries. New achievement = one entry in `packages/content-medexam2-tw/src/achievements.ts`; zero engine code change. P1 entries MUST set `composite: true` — build-time validator (`validateAchievementCatalog`) rejects pure-grind P1 (single-dimension threshold). 14 科精通 entries use 100% fresh-attempts coverage (per-subject totals from `subjects.json` snapshot, hardcoded for now). Speedrun (1 月) 玩家拿不到任何 subject mastery — intentional differentiation from longplay (6 月).

Engine (`packages/core/src/lib/achievement.ts`) mirrors cosmetic milestone pattern:
- `checkAchievementUnlocks(prev, prevStats, next, nextStats, catalog)` → diff-based unlock detection
- `listUnlockedAchievements` / `listLockedAchievements` / `visibleAchievements` helpers

Types in `@study-rpg/core`:
- `Achievement` interface, `AchievementTier = 'P1' | 'P2' | 'P3' | 'P4'`, `AchievementCategory` (7 options)
- `AchievementReward` discriminated union: `cosmetic` | `title` | `badge` (equipment/ticket/pity intentionally absent — TypeScript rejects)
- `AchievementStats` permissive shape — assembled per-call from Dexie state

Persistence (Dexie v15): new `achievements` table (PK `id`, indexed `unlockedAt`). Extended `MonotonicCountersRow` (5 new MAX-merge counters: `totalDoctorsRecruited` / `totalP1DoctorsRecruited` / `maxDailyStreak` / `tierUpgradeCount` / `maxQuizCorrectStreak`). Extended `GameCountersRow.currentQuizCorrectStreak` (LWW, resets on wrong answer). Extended `LeaderboardProfileRow.selectedTitle`.

Sync: `ACHIEVEMENTS` TableAdapter in `M2_ADAPTERS` only (mirror `LEADERBOARD_PROFILE` precedent commit `cfaaa32`). R2-only path — no Supabase migration, no `upsert_lww` whitelist entry. Cross-device pull does NOT trigger unlock toast (apply path skips queue).

Trigger hooks (5 sites): `services/quiz-rewards.ts` (also handles streak counter), `lib/tick.ts` (tier upgrade + study minutes), `services/recruitment.ts` (totalDoctorsRecruited / P1 counter), `services/fate-card.ts`, `services/training.ts` + `services/retire.ts`. All use dynamic import + post-tx try/catch so achievement check never breaks game action.

Reward dispatcher (`services/achievement-reward.ts`): `dispatchReward` branches on reward.kind (cosmetic intent log / title persists to Dexie meta key `achievement-titles-unlocked` / badge no-op). `checkAndUnlockAchievements` orchestrator: idempotent persist + dispatch + queue toast.

UI: `/achievements` route (AchievementsPage with 2 sub-tabs + 3 filters + strict hidden filter), `BadgeSprite` / `SubjectBadgeSprite` CSS atlas sprites, `AchievementUnlockToast` (P2-P4, 8s auto-dismiss), `AchievementUnlockModal` (P1 full-screen, dismiss-required), `AchievementTitleSelector` embedded in `LeaderboardSettingsControls`. Toast queue: `lib/achievement-toast-queue.ts` singleton + `useAchievementToasts` hook.

Atlases: `apps/medexam2-hospital-tw/src/assets/achievements/badge-atlas.png` (512×768, 6×4 cells, category × tier) + `subject-atlas.png` (896×256, 7×2 cells, 14 科 unique icons). Generated via codex CLI: `cd /tmp && codex exec --sandbox workspace-write --skip-git-repo-check "..." < /dev/null` (note: `--skip-git-repo-check` required by codex 1.x; the 0.128.0 recipe in `~/.claude/imports/codex_image_gen.md` is outdated).

Leaderboard integration: D1 migration `cloudflare/sync-worker/migrations/0002_add_badges.sql` adds `badges_csv TEXT DEFAULT ''` + `subject_mastery_count INTEGER DEFAULT 0` to `leaderboard_m2`. Worker `POST /leaderboard/upsert` validates against regex `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` (≤ 6 entries, ≤ 60 chars) + integer 0-14. `SNAPSHOT_COLUMNS` extended so cron + KV snapshots auto-include. Client derives per-category max-tier in `lib/sync/leaderboard.ts` `deriveAchievementSnapshot()`; `LeaderboardPage` renders inline 20px badges + `🩺 X/14` subject chip via `NicknameWithBadges` helper.

Apply migration 0002 manually (sustain 0001 discipline):

```bash
cd cloudflare/sync-worker
wrangler d1 migrations apply study-rpg-leaderboard --remote
```

Full change reference: `openspec/changes/add-achievement-system/` (proposal / design / specs / tasks).

## Hospital equipment (M_2nd ext, 2026-05-24)

`apps/medexam2-hospital-tw` ships a capital-investment revenue sink: 10 named equipment items (CT / MRI / 內視鏡 / 達文西 / 心導管室 / PET-CT / LINAC / ECMO / 複合式手術房 / NGS) × 3-level upgrade ladder. Total L1 buy-all ~24M; full L3 buy-all ~244M (~6 weeks dedicated grind at 國家級 default revenue). Costs in `packages/content-medexam2-tw/src/equipment-catalog.ts`, types in `@study-rpg/core` (`EquipmentId` / `EquipmentDef` / `OwnedEquipmentRow`). UI = `EquipmentPanel` mounted on Hospital page below room-extension section (responsive grid, collapsible header).

Each equipment level grants additive bonuses (formula `1 + Σ`, level value REPLACES lower):
- Reputation gain: L1 +1% / L2 +3% / L3 +7% (uniform across all 10 items)
- Patient throughput: L1 +2% / L2 +5% / L3 +12% (same)

Owning 5 L3 + 5 L1 → 1.40 reputation multiplier (+40%) + 1.70 throughput multiplier (+70%). Additive on purpose (not multiplicative) to keep math predictable.

Multiplier wiring (4 sites):
- `lib/tick.ts` — equipment throughput multiplier applied to `idleAdjustedThroughput` (affects revenue + tick-time reputation accrual via throughput→reputation coupling)
- `services/quiz-rewards.ts` — equipment reputation multiplier wraps `reputationDelta` for correct-answer reward
- `services/er-consultation.ts` — same wrap on ER quiz correct-answer reputation
- `services/event.ts` `resolveEmergencyShift` — wraps `EMERGENCY_SHIFT_REPUTATION_BONUS` constant at call site

Equipment does NOT generate idle/AFK reputation — multiplier amplifies *active-play* reputation only (per design D3, preserves the fate-card cost-gate strategic tension).

T4 upgrade gate triple condition (new third gate from this change):
1. Reputation ≥ 300,000 (bumped from 150,000 same change — see `clinic-tiers.ts` `TIER_UPGRADE_THRESHOLDS.醫學中心`)
2. 10 distinct P2+ subjects + ≥ 1 P1 doctor (unchanged)
3. **≥ 3 unique equipment installed at level ≥ 1** (new — `lib/tick.ts` T3→T4 evaluation calls `computeUniqueEquipmentCount`)

Pre-existing T4 saves (`gameCounters.tier === '國家級教學醫院'` before this change ships) are **grandfathered** — tier monotonicity per `clinic-level-up` Req 1 means no regression even with 0 equipment + reputation < 300k. T3 players in flight face both new conditions simultaneously.

Persistence (Dexie v16): new `hospitalEquipment` table (PK `equipmentId`, indexed `updatedAt`). Row shape `{ equipmentId, level: 1|2|3, purchasedAt, upgradedAt, updatedAt }`. Schema-only upgrade — no row backfill, starts empty for everyone. v15 was claimed by `add-achievement-system` for `achievements` table.

Sprites: `packages/theme-pixel-hospital/sprites/equipment/<id>.png` (10 files, ~200 KB total, 384×384 16-color quantize PNG). Sprite registry in `packages/theme-pixel-hospital/src/sprites.ts` glob extended to register equipment subfolder with `equipment-` prefix in `SPRITES_MAP`. Generated via codex CLI per `~/.claude/imports/codex_image_gen.md` recipe (Gemini was unavailable at apply time; codex became primary path).

Sync (R2 m2 bundle passenger pattern): bundle schema_version bump 1 → 2 + new `hospitalEquipment` array key. **NOT yet wired** — `add-r2-cloud-sync-migration` §9 R2 cutover (estimated 2026-05-29) gates this. Equipment §1–§8 + §10–§11 are R2-independent and shipped now; §9 sync wiring blocks until R2 reads flip.

Known follow-ups (deferred):
- V6MigrationModal intro modal explaining 150k→300k recalibration (UX polish per tasks.md §8.5)
- audit-event pass branch could also use equipment multiplier (currently event.ts only wires emergency-shift; see equipment design D3 logic for why audit was excluded — penalty-and-reward dual-path) — revisit if telemetry shows uneven application

Full change reference: `openspec/changes/add-hospital-equipment-medexam2/` (proposal / design / specs / tasks).

## Neurons achievement system (M_3rd, 2026-05-25)

`apps/neurons-tw` ships a milestone-recognition system borrowed from 二階 `achievement-system` pattern: 7 categories × 4 tiers = 30 catalog entries. Borrowed per `neurons-mode` Req 5 (independent capability spec; no modification of 二階 source).

**Category set** (string union locally declared, NOT imported from `@study-rpg/core`'s 二階-shaped `AchievementCategory`): `study | quiz | variant | synapse | mastery | fortune | hidden`. Semantic mappings: 二階 recruit → variant; hospital → synapse; subject → mastery.

**Catalog** = `packages/content-neurons-tw/src/achievements.ts` (30 entries: 4 study + 5 quiz + 5 variant + 4 synapse + 4 mastery + 4 fortune + 4 hidden). Tiers `P1 鑽石 / P2 金 / P3 銀 / P4 銅` (mirror PSN Trophy convention). Build-time validator at `packages/content-neurons-tw/src/achievement-validator.ts` enforces: (a) every P1 entry MUST declare `composite: true`, (b) non-P1 entries MUST NOT declare composite, (c) all required fields populated, (d) ids unique, (e) every category has ≥ 1 entry. Smoke covered by `scripts/verify-validator.ts` (6 fixtures pass).

**Types declared LOCALLY** at `packages/content-neurons-tw/src/achievement-types.ts` — not in `@study-rpg/core`. Reasoning: core's `AchievementCategory` is a strict 7-literal union containing 二階 字面值 (`'recruit'|'hospital'|'subject'`); `AchievementStats` references `SubjectId` + `totalDoctorsRecruited` + `currentHospitalTier`; `AchievementReward` includes `'cosmetic'`. Widening core to fit both 二階 + neurons would invasively break published `@study-rpg/core@0.4.x` API contract. Neurons uses `NeuronsAchievement` / `NeuronsAchievementStats` / `NeuronsAchievementReward` / `NeuronsAchievementCategory` and re-implements the 5-line `checkAchievementUnlocks` diff function locally at `apps/neurons-tw/src/lib/services/achievement.ts`. Apply-phase decision in `add-neurons-achievements/tasks.md` §1.2.

**Reward channels = 2** (TS union locked): `{kind:'leaderboard'}` (implicit — every unlock contributes to `badges_csv`) + `{kind:'title';title:string}` (appends to `leaderboardProfile.unlockedTitles`, selectable via `TitleSelector` in `LeaderboardSettingsControls`). `cosmetic` / `equipment` / `ticket` / `currency` are TypeScript-rejected at catalog declaration site.

**Persistence** (Dexie v5): new `achievements` table (PK `id`, indexed `unlockedAt`). v4 → v5 is additive. Extended `LeaderboardProfileRow` with `unlockedTitles?: string[]` + `selectedTitle?: string | null` (no schema migration; Dexie tolerates undefined for existing rows).

**Streak counter** persisted in `meta` table: `meta['currentQuizCorrectStreak']` (LWW, +1 correct / reset 0 wrong) + `meta['maxQuizCorrectStreak']` (MAX-merge). Co-commits with `recordCorrectAnswer` / `recordIncorrectAnswer` Dexie transaction.

**Trigger hooks** (3 sites — `apps/neurons-tw/src/lib/services/`):
- `connectome.ts` `recordCorrectAnswer` collapse-point — captures `prevStats` pre-tx, calls `triggerAchievementCheck` post-commit
- `connectome.ts` `recordIncorrectAnswer` — streak reset + post-commit check
- `variant-gacha.ts` `handleSlotUnlock` — capture pre-state if non-silent; trigger check after persist

Each hook wrapped in try/catch (`[achievement]` channel) so failure doesn't break originating game action. `study` category predicates evaluate against `totalStudyMinutes: 0` placeholder (reading-timer not yet wired in neurons-tw); catalog ships ready for when timer ships.

**Backfill** at app boot via `backfillAchievementsFromCurrentStats()` in `App.tsx` `useEffect`: builds stats from Dexie, finds predicates already true, `bulkPut` missing rows with `notificationShown: true`, dispatches NO rewards / NO toasts / NO modals. Idempotent. Same function shape ready for future `onPullComplete` sync hook (post `add-neurons-deploy`).

**UI** components: `BadgeSprite` (placeholder SVG + emoji glyph + tier-color ring — atlas swap deferred to follow-up `generate-neurons-achievement-atlases`), `AchievementCard`, `AchievementsPage` at `/achievements` (sub-tabs 「全部 / 已解鎖」 + category/tier filter dropdowns + strict hidden filtering), `AchievementToastHost` (wraps motion library `<Toast>` + `TOAST_AUTO_DISMISS_MS`), `AchievementUnlockModal` (wraps motion library `<AchievementUnlockModal>` primitive). Toast/modal queue singleton at `lib/achievement-toast-queue.ts`.

**Leaderboard integration**: `deriveAchievementSnapshot(unlocked)` + `deriveBadgesCsvFromDexie()` in `lib/services/neurons-leaderboard.ts` produce max-tier-per-category CSV with hidden category excluded (fits Worker regex `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$` since 7 categories − 1 hidden = 6 max entries). `LeaderboardPage` renders inline 20px badges via `NicknameWithBadges` helper. `D1 leaderboard_neurons.badges_csv` column was reserved by `add-neurons-leaderboard` Req 11 — **no D1 migration** needed. Title display on leaderboard rows deferred to a separate follow-up (would need Worker schema addition for `selected_title`).

**Smoke results** (2026-05-25 Chrome MCP end-to-end): boot backfill populated `mastery-first-novice` row silently; 10× +5 答對 on 藥理學 fired `variant-first-pull` toast + `quiz-streak-10` queued + `hidden-first-day-blitz` queued; `/achievements` page rendered 4 unlocked + 26 locked silhouettes + 3 hidden-locked invisible. Console clean (only pre-existing React Router future warnings).

**Deferred follow-ups**:
- Atlas asset generation (60–90 min codex CLI batch × 2 atlases) → separate `generate-neurons-achievement-atlases` change
- Title display on leaderboard rows (needs Worker `selected_title` D1 column + KV)
- `study` category active triggers (needs reading-timer follow-up)

Full change reference: `openspec/changes/archive/2026-05-25-add-neurons-achievements/`.

## Source data path

題庫原始 .md 在使用者本機（**不在 repo 內**）：

```
$HOME/Desktop/國考/一階國考/陽明國考考古/_extracted/
└── 醫學一/ + 醫學二/  (10 subjects × 18 files each = 180 files, ~3505 Q)
```

Build script 預設讀此路徑；其他環境設 `MEDEXAM_SOURCE_ROOT` env var 覆寫。

## Bookmarks filters + 歷史曾錯 + grace toast (M_2nd ext, 2026-05-25)

`apps/medexam2-hospital-tw` `/bookmarks` route gains: (1) year × subject multi-select chip filter shared across all sub-tabs (visually mirrors `YearFilterBar` + `DoctorRoster` rarity filter — `.filter-bar` / `.filter-chip[aria-pressed]` / `.filter-bar__pager*` / `.filter-bar__count` reused as-is), (2) persistent `everWrong` flag on `questionHistory` (Dexie v17) — 「錯題」 tab splits into 「目前未答對」 (existing `lastResult='wrong'`) + 「歷史曾錯」 (`everWrong=true`, never auto-leaves), (3) 10-second grace toast on local wrong→correct transition with ⭐ promote action.

Key handles:
- Filter component: `src/components/BookmarkFilterBar.tsx` (local React state, NO interaction with `services/year-filter.ts` gameplay filter)
- Filter helper: `src/lib/bookmarks-filter.ts` — pure `matchesFilter()` function, unit-tested
- Grace toast: `src/lib/grace-toast.ts` (pub-sub queue + 10s auto-dismiss + `useSyncExternalStore` hook) + `src/components/GraceToastContainer.tsx` (fixed bottom-right, max 3 visible)
- Wrong-answer query: `src/services/wrong-answers.ts` — `useWrongAnswers()` (current) + `useEverWrongAnswers()` (history)
- 50-row pagination unified across all 3 list surfaces (手動收藏 / 目前未答對 / 歷史曾錯) — pager reuses `.filter-bar__pager*` CSS

**Critical sync semantics — `everWrong` uses monotonic-OR merge, NOT LWW.** `apps/medexam2-hospital-tw/src/lib/sync/r2/tables.ts` `HOSPITAL_QUESTION_HISTORY.applyToLocal` carries the carve-out: after LWW resolves all other fields, `finalRow.everWrong = local.everWrong || incoming.everWrong`. This neutralizes the v1↔v2 cross-version race (v1 client drops `everWrong` field → reads then writes back v1 bundle → would silently overwrite local `true` to `false` under naive LWW). The R2 m2 bundle `SCHEMA_VERSION` bumps 1 → 2 in lockstep. v1 clients tolerate v2 bundles (drop unknown field), v2 clients tolerate v1 bundles (default to false). **DO NOT 'fix' the monotonic-OR by removing it** — it's intentional, called out in inline doc, and locked by Vitest test `question-history-merge.test.ts`.

`recordCorrectAnswer` in `src/lib/mastery.ts` takes a `CorrectAnswerOpts` 3rd arg with `onTransitionToCorrect?: (questionId) => void` — every call site (currently `QuizModal` + `er-consultation.ts`; future game modes too) MUST wire this to `emitGraceToast`. Code review enforces; TS doesn't force it (optional opts keep tests / helpers ergonomic).

Migration discipline: v17 schema upgrade does NOT backfill `everWrong` on existing wrong-answer rows. Helper banner on 錯題 tab explicitly notes 「歷史紀錄從升級當下開始累積」 to manage user expectations. Pre-existing rows naturally migrate forward on next answer.

Dexie versions claimed in flight: v15 = `add-achievement-system`, v16 = `add-hospital-equipment-medexam2`, v17 = `add-bookmarks-filters-and-wrong-history-medexam2`.

Test coverage: `apps/medexam2-hospital-tw/src/__tests__/{mastery,bookmarks-filter,question-history-merge}.test.ts` — 13 Vitest unit tests (mastery writes + filter logic + bundle round-trip + monotonic-OR). Run via `pnpm --filter @study-rpg/medexam2-hospital-tw test`.

Full change reference: `openspec/changes/add-bookmarks-filters-and-wrong-history-medexam2/` (proposal / design / specs / tasks).

## Neuroscience design verification (M_3rd track / neurons-tw)

設計 / 編寫 neurons-tw 相關內容（content pack 對映、design.md 的科學 anchor、spec 描述機制的文字、UI 文案中的神經學 metaphor）時，**任何對神經解剖學 / 神經生理學的疑問都應先走 OpenEvidence 查實證，不要憑記憶或泛用 LLM 知識 lock 決定**。

具體流程：
- 直接 `/oe <臨床問題>` 或 `/oe-triangulate` 查文獻；需要正反面證據時走 triangulate
- 設計級的「這個 family 屬於哪 NT branch / 解剖位置 / 功能機制」由 PubMed-anchored 證據支持；persona 視覺 / 故事 hook 可以較自由，但**神經學 fact 必須嚴謹**（per `wire-neurons-content-and-theme` design.md Decision 1 「neuron 本身的 NT 識別 / 解剖位置 / 功能必須科學嚴謹」原則）
- 把找到的 PubMed citation 附進 design.md 對應 decision 的 anchor 表格（mirror `wire-neurons-content-and-theme` 11-subject mapping 的 PMID anchor cadence）
- 不適用：純 UI / 程式架構決策、game-loop 數值平衡（如 N=5 / 7 天 decay / AP threshold ladder — 這些是 game design 直覺 + dogfood telemetry，非神經科學 fact）

為什麼這條規則重要：
- Owner 是醫學生 + 即將 RA，產品定位是「教科書級臨床戲劇」，使用者群是同儕醫學生，神經學細節錯了立刻被看穿
- 2026-05-25 `wire-neurons-content-and-theme` persona design 過程已示範：4 個 persona（寄生蟲 Toxoplasma / 免疫 anti-NMDAR / 倫理 DRN / 微生物 olfactory）就是透過 OpenEvidence 從「生物背景」升級為「臨床戲劇」，每個附 2-3 篇 PMID anchor
- LLM generic 神經知識常見錯誤模式：把 receptor 跟 ion channel 搞混、解剖位置半對半錯、機制方向反掉 — OE 查證能擋掉這些

## Known sharp edges

- TypeScript `tsconfig.base.json` 不要再加 `paths` — leaf packages 透過 pnpm workspace symlink 解析 `@study-rpg/core`，加 paths 反而觸發 rootDir 衝突（2026-05-14 踩過）
- esbuild 解析 TS comment 時對 `**/` 敏感 — 任何 block comment 不要寫 `/**/*.md` 之類 glob，會提前終止註解（content build script 踩過）
- `font-family: 'Cubic 11'` 必須來自 host app `public/fonts/`（透過 `@font-face`），theme package 不能直接 ship webfont 給 npm consumer，因 npm 不會自動 publish 字型檔
- **Hospital tier display / canonical separation**（2026-05-23 via `add-abbreviated-tier-labels-medexam2`）— UI 顯示走 `apps/medexam2-hospital-tw/src/lib/tier-labels.ts` 的 `tierLabel()` 短稱（診所 / 區域 / 醫中 / 大廟）；canonical type strings 仍為 `'診所' | '區域醫院' | '醫學中心' | '國家級教學醫院'`（HospitalTier union），這些 canonical 值散落於 Dexie、R2 bundle、D1 leaderboard、`HOSPITAL_TIER_TO_NUM` mapping、scene key mapping、所有 spec scenarios。**規則**：任何**用戶可見**的 tier 字串渲染都應該走 `tierLabel()`；任何**程式邏輯**比較或儲存值都用 canonical。HelpMenu 是例外，第一次提到每個 tier 時用「短稱（canonical）」雙寫格式以幫舊玩家對應。Tutorial / 簡短提示用短稱即可（無 disambiguation）。aria-label / accessibility 文字可用 canonical 給 screen readers
