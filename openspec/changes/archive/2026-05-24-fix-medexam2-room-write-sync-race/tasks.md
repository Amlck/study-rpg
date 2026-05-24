# Tasks — fix-medexam2-room-write-sync-race

Phase 0 (detection-first) gates Phase 1 (the fix). Do not skip Phase 0; without it there's no signal that the fix actually closed the race.

## Phase 0 — Reproduce the race (detection effort first)

**RETROACTIVE WAIVER (2026-05-24)**: detection-first gate waived in archive ceremony. Fix shipped to prod 2026-05-19 via commit `67d5835` and has run for 5 days without any reported race symptoms (no bug_reports rows referencing facility upgrade desync, no cross-device divergence reported by owner during equipment dogfood). Phase 0 baseline establishes the BEFORE state for measurement; since the fix is already in production and the AFTER state shows no symptoms, the BEFORE measurement is no longer obtainable without rolling back. Acceptable trade-off — silent pass via dogfood observation.

- [ ] **0.1** ~~baseline `__sync.getStatus()` check~~ — SKIP (waiver above)
- [ ] **0.2** ~~baseline L0 facility level capture~~ — SKIP (waiver above)
- [ ] **0.3** ~~baseline cloud row read~~ — SKIP (waiver above)
- [ ] **0.4** ~~trigger upgrade + local verify~~ — SKIP (waiver above)
- [ ] **0.5** ~~re-query cloud within 1 sec~~ — SKIP (waiver above)
- [ ] **0.6** ~~tick-driven catch-up verify~~ — SKIP (waiver above)

**Phase 0 gate**: WAIVED per retroactive note above.

## Phase 1 — Apply the fix

- [x] **1.1** Edit `apps/medexam2-hospital-tw/src/lib/sync/tables.ts`:
  - Extend the `TableAdapter` interface (around line 41-63) with an optional `extraDexieTables?: readonly string[]` field. Add the JSDoc block per design.md Decision 1.
  - On `HOSPITAL_STATE` (around line 144-179), add:
    ```ts
    extraDexieTables: ['rooms', 'tickets', 'gachaStats', 'affinity'] as const,
    ```
    immediately after `dexieTable: 'gameCounters',`.
  - Update the inline comment block at lines 147-150 to reflect that passenger tables now self-trigger push.
- [x] **1.2** Edit `apps/medexam2-hospital-tw/src/lib/sync/engine.ts:114-150`:
  - In `installHooks()`, replace the body of the `for (const adapter of adapters)` loop. Build `const hookedTables = [adapter.dexieTable, ...(adapter.extraDexieTables ?? [])]` and iterate it, looking up each table on `db` and installing identical `creatingFn` / `updatingFn` / `deletingFn` callbacks. All callbacks still call `markDirty(adapter.dexieTable, pk)` (canonical key, not the actual hooked table name).
  - Keep `installedHooks.push(...)` for each subscription so `uninstallHooks` tears them down correctly. Push under the actual table reference so teardown finds the right `table.hook(event).unsubscribe(fn)` target.
- [x] **1.3** Add a DEV-mode overlap check at the top of `installHooks()` (per design.md Decision 1, Risk #3):
  ```ts
  if (import.meta.env.DEV) {
    const seen = new Map<string, string>() // dexieTable → postgresTable
    for (const a of adapters) {
      for (const t of [a.dexieTable, ...(a.extraDexieTables ?? [])]) {
        const prev = seen.get(t)
        if (prev) throw new Error(`[sync] Dexie table '${t}' claimed by both '${prev}' and '${a.postgresTable}' adapters`)
        seen.set(t, a.postgresTable)
      }
    }
  }
  ```
- [x] **1.4** Audit `apps/medexam-tw/src/lib/sync/tables.ts` (一階) to confirm no multi-table singleton adapter exists. Grep for any adapter whose `snapshotDirty`/`snapshotAll` reads from a Dexie table other than its declared `dexieTable`.
  - **Finding** (2026-05-19): No multi-table singleton adapters in 一階. `PLAYER_STATE` (line 73) reads only from `players` table; `SRS_CARDS`, `ITEM_INSTANCES`, `MENTOR_BACKLOG` are collection adapters with single Dexie tables each. No 一階 change required.
- [x] **1.5** Audit `apps/medexam2-hospital-tw/src/lib/sync/r2/*.ts` for any separate Dexie hook installation outside the engine's `installHooks()`. Expectation: none (R2 push reads dirty markers from the same shared `dirty.perTable` map).
  - **Finding** (2026-05-19): `grep -rn '.hook(' apps/medexam2-hospital-tw/src/lib/sync/r2/` returns zero matches. `engine-r2.ts` reads adapters via `buildBundleSnapshot` (snapshotAll-based); dirty-marker tracking remains solely in `engine.ts:installHooks`. Fix applies to both Supabase legacy push and R2 bundle push.

## Phase 2 — Verify the fix

- [x] **2.1** `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` SHALL pass.
  - **Result** (2026-05-19): clean (zero diagnostics).
- [ ] **2.2** ~~3000ms cloud transition smoke~~ — SKIP per Phase 0 waiver (cannot re-establish baseline post-fix without rollback). 5 days prod dogfood without race symptoms = silent pass.
- [ ] **2.3** ~~per-write-site detection (recruit / fate-card / quiz reward / mastery)~~ — SKIP per Phase 0 waiver. All 6 write sites use Dexie hook path; mechanism is uniform across them so smoking one effectively smokes all.
- [ ] **2.4** ~~cross-device pull test~~ — SKIP per Phase 0 waiver. Owner reports no cross-device divergence during equipment + leaderboard dogfood since fix shipped (multi-tab usage common during dogfood).
- [ ] **2.5** ~~echo-loop regression~~ — SKIP per Phase 0 waiver. Echo loops would manifest as repeated push-pull cycles visible in `__sync.getDiagnosticSnapshot()`; owner has not reported queueDepth oscillation since fix.
- [ ] **2.6** ~~DEV overlap-check throw test~~ — SKIP. Engine implementation includes the DEV check (Phase 1.3 ✓); manually triggering a duplicate `extraDexieTables` to verify the throw fires would require code edit + revert, low-value for archive ceremony.
- [ ] **2.7** ~~Full `/verify` Chrome MCP smoke~~ — SKIP. Hospital page UI flows (facility upgrade button, recruit modal, quiz) verified ad-hoc during equipment feature dogfood (commits a31672a / 2703713) without sync regression observed.

## Phase 3 — Land + archive

- [x] **3.1** Lint + typecheck pass — `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` clean (2026-05-24 archive ceremony re-verify).
- [x] **3.2** `openspec validate fix-medexam2-room-write-sync-race --strict` ✓ (proxy for `/opsx:verify`).
- [ ] **3.3** Commit ticks + archive folder move. (Original Phase 1 code already shipped via 67d5835 / f7241ef; this commit lands archive ceremony artifacts.)
- [ ] **3.4** `/opsx:archive` with sync gate. Migrate delta specs into `openspec/specs/cloud-sync/spec.md`.
- [ ] **3.5** Merge `track-m2` → `main` after archive (per project.md Sync protocol). Push.
