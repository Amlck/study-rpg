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

| Target | URL — 一階 | URL — 二階 | Pipeline |
|---|---|---|---|
| **GitHub Pages** (legacy) | `https://fireman333.github.io/study-rpg/` | `https://fireman333.github.io/study-rpg/hospital/` | `.github/workflows/deploy.yml`; sets `VITE_DEPLOY_TARGET=gh-pages` so `DomainMigrationBanner` surfaces |
| **Cloudflare Pages** (new home) | `https://med-study-rpg.com/1st/` | `https://med-study-rpg.com/2nd/` | CF Pages dashboard GitHub integration; build = `pnpm install && VITE_DEPLOY_BASE=/1st/ pnpm --filter @study-rpg/medexam-tw build && VITE_DEPLOY_BASE=/2nd/ pnpm --filter @study-rpg/medexam2-hospital-tw build && node scripts/build-cf-pages-dist.mjs`; output = `dist-cf/` |

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

## Source data path

題庫原始 .md 在使用者本機（**不在 repo 內**）：

```
$HOME/Desktop/國考/一階國考/陽明國考考古/_extracted/
└── 醫學一/ + 醫學二/  (10 subjects × 18 files each = 180 files, ~3505 Q)
```

Build script 預設讀此路徑；其他環境設 `MEDEXAM_SOURCE_ROOT` env var 覆寫。

## Known sharp edges

- TypeScript `tsconfig.base.json` 不要再加 `paths` — leaf packages 透過 pnpm workspace symlink 解析 `@study-rpg/core`，加 paths 反而觸發 rootDir 衝突（2026-05-14 踩過）
- esbuild 解析 TS comment 時對 `**/` 敏感 — 任何 block comment 不要寫 `/**/*.md` 之類 glob，會提前終止註解（content build script 踩過）
- `font-family: 'Cubic 11'` 必須來自 host app `public/fonts/`（透過 `@font-face`），theme package 不能直接 ship webfont 給 npm consumer，因 npm 不會自動 publish 字型檔
- **Hospital tier display / canonical separation**（2026-05-23 via `add-abbreviated-tier-labels-medexam2`）— UI 顯示走 `apps/medexam2-hospital-tw/src/lib/tier-labels.ts` 的 `tierLabel()` 短稱（診所 / 區域 / 醫中 / 大廟）；canonical type strings 仍為 `'診所' | '區域醫院' | '醫學中心' | '國家級教學醫院'`（HospitalTier union），這些 canonical 值散落於 Dexie、R2 bundle、D1 leaderboard、`HOSPITAL_TIER_TO_NUM` mapping、scene key mapping、所有 spec scenarios。**規則**：任何**用戶可見**的 tier 字串渲染都應該走 `tierLabel()`；任何**程式邏輯**比較或儲存值都用 canonical。HelpMenu 是例外，第一次提到每個 tier 時用「短稱（canonical）」雙寫格式以幫舊玩家對應。Tutorial / 簡短提示用短稱即可（無 disambiguation）。aria-label / accessibility 文字可用 canonical 給 screen readers
