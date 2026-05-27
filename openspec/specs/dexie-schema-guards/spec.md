# dexie-schema-guards Specification

## Purpose

Defines CI lint enforcement that prevents Dexie schema bumps from shipping without a matching Vitest upgrade fixture. The 2026-05-26 `add-doctor-retire-cloud-resurrection` prod incident (Dexie 4.x `.upgrade()` cannot change primary key — broke `med-study-rpg.com/2nd/` + `fireman333.github.io/study-rpg/hospital/` for every existing v18 user; required emergency revert) demonstrated that Vitest with `fake-indexeddb` and local Chrome MCP smoke both miss the upgrade path when tests start fresh at version N instead of seeding v(N-1) first. This capability mechanizes the rule documented in `~/.claude/imports/dexie_pk_change_pitfall.md` so the rule cannot be silently skipped: every `.version(N)` declaration that lands on `main` MUST be accompanied by a sibling `__tests__/upgrade-v<N>.test.ts` fixture that exercises the upgrade path from v(N-1), and CI fails the PR with an actionable error message if the fixture is missing.

## Requirements

### Requirement: Schema version bumps require Vitest upgrade fixture

When a pull request or push to `main` introduces a new `.version(N)` declaration to any Dexie schema file in the monorepo (anywhere under `apps/**/*.ts` or `packages/**/*.ts` containing both `this.version(` and `.stores(`), the change SHALL be accompanied by a Vitest fixture in the schema's sibling `__tests__/` directory that opens an explicit `v(N-1)` Dexie instance with representative seed data, then reopens with the full schema chain and asserts `.open()` does not throw.

The CI workflow `dexie-fixture-lint` SHALL detect missing fixtures by comparing the schema file's `.version()` set in the head ref against the base ref, and SHALL fail with a clear error message naming the schema file, the new version, the expected test directory, and the path to the canonical pattern reference.

The lint check SHALL accept the bypass environment variable `SKIP_DEXIE_FIXTURE_LINT=1` for emergency overrides, but SHALL emit a prominent banner to stderr in such cases so that the bypass is visible in CI logs.

#### Scenario: Schema bump with matching fixture passes the lint

- **GIVEN** the head ref adds `this.version(21).stores({ retirementLog: '++id, retiredAt, doctorId, _updatedAt' })` to `apps/medexam2-hospital-tw/src/db/schema.ts`
- **AND** the head ref adds a file `apps/medexam2-hospital-tw/src/__tests__/upgrade-v21.test.ts` containing the literal text `dbV20.version(20).stores(`
- **WHEN** the lint script runs with `BASE_REF=origin/main HEAD_REF=HEAD`
- **THEN** the script SHALL exit 0
- **AND** stdout SHALL include the line `[lint:dexie] apps/medexam2-hospital-tw/src/db/schema.ts v20 → v21: fixture FOUND`

#### Scenario: Schema bump without matching fixture fails the lint

- **GIVEN** the head ref adds `this.version(21).stores({ ... })` to `apps/medexam2-hospital-tw/src/db/schema.ts`
- **AND** no test file under `apps/medexam2-hospital-tw/src/__tests__/` contains the literal text `.version(20).stores(`
- **WHEN** the lint script runs with `BASE_REF=origin/main HEAD_REF=HEAD`
- **THEN** the script SHALL exit 1
- **AND** stderr SHALL include a `::error::` annotation naming the schema file, the new version, and the expected test directory
- **AND** stderr SHALL include a link or reference to `docs/DEXIE_UPGRADE_FIXTURE_RULE.md`

#### Scenario: PR with no schema change passes the lint

- **GIVEN** a PR that edits TypeScript source files under `apps/**` or `packages/**` but does not modify any `this.version(` declaration
- **WHEN** the lint script runs with `BASE_REF=<pr.base.sha> HEAD_REF=<pr.head.sha>`
- **THEN** the script SHALL exit 0
- **AND** stdout SHALL include `[lint:dexie] OK`

#### Scenario: Bypass via environment variable produces visible banner

- **GIVEN** the head ref adds `this.version(99).stores({ ... })` without a fixture
- **WHEN** the lint script runs with `SKIP_DEXIE_FIXTURE_LINT=1`
- **THEN** the script SHALL exit 0
- **AND** stderr SHALL include a banner of at least 3 lines containing the phrase `BYPASS` or `SKIP` in uppercase
- **AND** the banner SHALL reference the follow-up obligation to either add the fixture or fix the lint regex

#### Scenario: Newly added schema file with v1 only does not require a v0 fixture

- **GIVEN** the head ref adds a brand-new schema file `apps/new-app/src/db/schema.ts` containing only `this.version(1).stores({ ... })`
- **WHEN** the lint script runs
- **THEN** the script SHALL exit 0 (v0 is not a real Dexie version; baseline schemas need no upgrade fixture)

### Requirement: Lint script is invokable locally via pnpm

The root `package.json` SHALL expose a script alias `lint:dexie-fixtures` that invokes `scripts/lint-dexie-fixtures.sh` with sensible defaults (`BASE_REF=origin/main HEAD_REF=HEAD`).

#### Scenario: Local invocation produces the same verdict as CI

- **GIVEN** the working tree is in the same state as a hypothetical PR head
- **WHEN** the developer runs `pnpm lint:dexie-fixtures`
- **THEN** the script SHALL produce the same exit code and message as the CI workflow would for the equivalent PR
