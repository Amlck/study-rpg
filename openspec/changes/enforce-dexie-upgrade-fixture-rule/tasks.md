# Tasks — enforce-dexie-upgrade-fixture-rule

## 1. Lint script

- [ ] 1.1 Create `scripts/lint-dexie-fixtures.sh` (bash, ~80 lines) following Decisions 1–5:
  - Read `BASE_REF` (default `origin/main`) and `HEAD_REF` (default `HEAD`) from env
  - Honour `SKIP_DEXIE_FIXTURE_LINT=1` escape hatch (emit loud banner, exit 0)
  - Discover schemas via `git ls-files 'apps/**/*.ts' 'packages/**/*.ts' | xargs grep -l "this\.version("` (also require `.stores(` co-presence)
  - For each schema file: extract base + head version numbers (`grep -oE 'this\.version\(([0-9]+)\)' | grep -oE '[0-9]+' | sort -nu`), compute set diff via `comm -23`
  - For each new version N: resolve test dir (`<schema_parent>/__tests__/` after stripping `/db` or `/lib` suffix), require any `*.test.ts` containing literal `.version(N-1).stores(`
  - Exit 1 with `::error::` annotation + actionable message listing schema file + version + expected test pattern + path to `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`
  - Exit 0 with `[lint:dexie] OK` on success
- [ ] 1.2 Make script executable: `chmod +x scripts/lint-dexie-fixtures.sh`
- [ ] 1.3 Self-test the script locally on current `main` HEAD (no diff from `origin/main`) → expect exit 0 with "OK"
- [ ] 1.4 Self-test: synthetic schema bump scenario
  - Temporarily append `this.version(21).stores({})` to `apps/medexam2-hospital-tw/src/db/schema.ts`
  - Run `BASE_REF=HEAD HEAD_REF=<unstaged-tip-or-stash-ref> bash scripts/lint-dexie-fixtures.sh` against the dirty state via stash + `git stash show -p` flow OR just modify and run against unstaged using `git diff` directly
  - Expect exit 1 with violation pointing at v20 → v21 missing fixture
  - Revert the synthetic bump (clean up)
- [ ] 1.5 Self-test: synthetic schema bump + matching fixture scenario
  - Same as 1.4 but also add a test file `apps/medexam2-hospital-tw/src/__tests__/upgrade-v21.test.ts` containing `dbV20.version(20).stores({ ... })` literal
  - Expect exit 0
  - Revert both changes

## 2. CI workflow

- [ ] 2.1 Create `.github/workflows/dexie-fixture-lint.yml`:
  - Trigger on `push` to `main` (paths-filter: `apps/**/*.ts`, `packages/**/*.ts`) AND `pull_request` to `main` (same filter)
  - Single job `lint` on `ubuntu-latest`
  - Checkout with `fetch-depth: 0` (need full history for `git show $BASE_REF:`)
  - Compute BASE_REF: PR event → `${{ github.event.pull_request.base.sha }}`; push event → `${{ github.event.before }}` falling back to `HEAD~1` if `0000000`
  - Compute HEAD_REF: PR event → `${{ github.event.pull_request.head.sha }}`; push event → `${{ github.sha }}`
  - Run `BASE_REF=$BASE_REF HEAD_REF=$HEAD_REF bash scripts/lint-dexie-fixtures.sh`
- [ ] 2.2 Verify workflow YAML syntax with `actionlint` if available (`brew install actionlint`), or eyeball against existing `.github/workflows/deploy.yml` structure for parity
- [ ] 2.3 Confirm workflow does NOT run when no `.ts` files changed (e.g., docs-only commit) by checking the `paths:` filter is correct

## 3. Package script alias

- [ ] 3.1 Add to root `package.json` `scripts`:
  ```json
  "lint:dexie-fixtures": "BASE_REF=origin/main HEAD_REF=HEAD bash scripts/lint-dexie-fixtures.sh"
  ```
- [ ] 3.2 Verify `pnpm lint:dexie-fixtures` exits 0 on clean `main` HEAD

## 4. Documentation

- [ ] 4.1 Create `docs/DEXIE_UPGRADE_FIXTURE_RULE.md` covering:
  - **What** the rule enforces (one paragraph + bullet list)
  - **Why** (link to v1 incident commit `dac4eae` revert `99eac9b`, link to `imports/dexie_pk_change_pitfall.md`, link to AAD-v2 archive folder)
  - **How to satisfy** — canonical fixture pattern with code snippet copied from `retirement-tombstone.test.ts:30–80` (verbatim or close)
  - **Where to put the fixture** — `<app-or-package>/src/__tests__/*.test.ts` with `.version(N-1).stores(` literal
  - **Local invocation** — `pnpm lint:dexie-fixtures`
  - **CI behaviour** — workflow trigger + base ref logic
  - **Escape hatch** — `SKIP_DEXIE_FIXTURE_LINT=1`, when to use (true emergency only), and follow-up obligation
  - **Known limitations** — strip rule for test dir resolution; literal `.version(N-1).stores(` regex (no constant-import support); forward-only (no historical backfill)
  - **Cross-reference** — `retirement-tombstone.test.ts:30` (canonical), `imports/dexie_pk_change_pitfall.md`, AAD-v2 §8.12 in `openspec/changes/archive/2026-05-27-fix-doctor-retire-cloud-resurrection-v2/tasks.md`
- [ ] 4.2 Add one paragraph to project `CLAUDE.md` "Known sharp edges" section (after the existing Dexie v17 / monorepo worktree dist staleness paragraphs):
  - One-sentence summary of the rule
  - Pointer to `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`
  - Pointer to canonical fixture (`apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts:30`)
- [ ] 4.3 (Optional) Cross-reference from `imports/dexie_pk_change_pitfall.md` "How to apply" section: when proposing schema bumps, mention this rule will enforce fixture presence in CI

## 5. Validation

- [ ] 5.1 Run `openspec validate enforce-dexie-upgrade-fixture-rule --strict` → expect pass
- [ ] 5.2 Run `pnpm typecheck` (no TS source changed; should be unaffected — only sanity check)
- [ ] 5.3 Run `pnpm lint:dexie-fixtures` locally → expect exit 0
- [ ] 5.4 Push a one-line scratch commit to a feature branch (NOT main) that adds a no-op comment to `apps/medexam2-hospital-tw/src/db/schema.ts` (no version bump) → expect CI lint to pass (no false positive on non-version-bump TS edit). Discard branch.

## 6. Verify (end-to-end smoke)

- [ ] 6.1 Document the synthetic test from 1.4 in a comment block at the top of `scripts/lint-dexie-fixtures.sh` so future authors can re-verify the script works
- [ ] 6.2 Confirm `pnpm lint:dexie-fixtures` is discoverable via `pnpm run` (i.e., appears in the list when user runs `pnpm run` with no args)
- [ ] 6.3 Update CLAUDE.md "Known sharp edges" section visible diff confirms rule pointer is present
- [ ] 6.4 Run `openspec validate --all --strict` → expect 0 failures, change shows in `openspec list`

## 7. Composing commit + archive

- [ ] 7.1 With user confirm: stage `scripts/lint-dexie-fixtures.sh`, `.github/workflows/dexie-fixture-lint.yml`, `package.json`, `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`, `CLAUDE.md`, `openspec/changes/enforce-dexie-upgrade-fixture-rule/` (all 4 files)
- [ ] 7.2 With user confirm: `git commit -m "spec(impl): enforce-dexie-upgrade-fixture-rule — CI lint + canonical fixture pattern"` (auto-git skill)
- [ ] 7.3 With user confirm: `/opsx:archive enforce-dexie-upgrade-fixture-rule` (workflow syncs delta + moves to archive/)
- [ ] 7.4 With user confirm: `git commit -m "spec(archive): merge enforce-dexie-upgrade-fixture-rule — CI lint + canonical fixture pattern"` (auto-git skill)
- [ ] 7.5 With user confirm: `git push origin main` — wait for CI green (deploy.yml + deploy-cf-pages.yml + the new dexie-fixture-lint.yml all pass)
- [ ] 7.6 Verify in GH Actions UI that the new workflow ran AND exited 0 (sanity check on first real run)

## 8. Follow-ups (DO NOT include in this change)

- [ ] 8.1 Spawn `add-bundle-schema-version-guard` (A1) — extends `dexie-schema-guards` capability with Worker-side `x-amz-meta-schema-version` enforcement on R2 PUT
- [ ] 8.2 (Optional, low priority) Consider relaxing the literal `.version(N-1).stores(` regex to also accept a constant-import pattern (e.g., `.version(20).stores(V20_SCHEMA)`), once an author actually needs it. Defer until concrete use case arises
- [ ] 8.3 (Optional) Backfill upgrade fixtures for selected historically-risky schema versions if a pattern of schema-related bugs emerges. Currently no evidence of need beyond v18 → v19 (which has §8.12 fixture)
