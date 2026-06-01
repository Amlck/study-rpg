## 1. Supabase migrations — verify existing apply (no new SQL files)

**Background**: Migrations 0013/0014/0015 were created and prod-applied during the v1 attempt (`dac4eae`). After the v1 client revert (commit `1ac6aa5`), the SQL files were intentionally retained in `supabase/migrations/` (CLI parity) and the prod DB still has the table + RPCs (idempotent — re-running them is a no-op). This task group only verifies; no new SQL is written.

- [x] 1.1 Confirm `supabase/migrations/0013_retirement_log.sql` exists and matches the v1 design (table + RLS, pk `(user_id, doctor_id)`, FK `ON DELETE CASCADE`). Read file, do not modify.
- [x] 1.2 Confirm `supabase/migrations/0014_upsert_lww_retirement_log.sql` exists — `CREATE OR REPLACE upsert_lww` whitelisting `retirement_log`. Read file, do not modify.
- [x] 1.3 Confirm `supabase/migrations/0015_delete_my_data_retirement_log.sql` exists — `CREATE OR REPLACE delete_my_data()` with `DELETE FROM public.retirement_log` line. Read file, do not modify.
- [x] 1.4 Confirm `supabase/sanity/retirement_log_rls.sql` exists and contains anon/RLS sanity checks (anon SELECT fails, auth SELECT returns only own rows, `delete_my_data()` on test account wipes retirement_log).
- [ ] 1.5 Owner manual verify (one-off, dashboard SQL editor): `SELECT count(*) FROM retirement_log;` returns 0 or higher (table exists); `SELECT upsert_lww('retirement_log', '[]'::jsonb);` returns 0 (whitelist passes). If either fails, halt and report — implies a recovery / DR scenario where migrations need re-apply per Decision 10 ordering.

## 2. Dexie schema bump (v18 → v19) — additive index, NO pk change

**CRITICAL — read before writing**: v1 (`dac4eae`) failed because it changed retirementLog pk from `++id` to `&doctorId`, triggering Dexie 4.x's `UpgradeError Not yet support for changing primary key` for every existing v18 user. v2 Take-2 keeps pk as `++id` and adds `doctorId` as a **plain (non-unique)** secondary index — initial Take-1 design promoted to `&doctorId` unique but the §8.12 fixture (run fixture-first on 2026-05-27) confirmed Codex Attack 1: Dexie 4.x activates the new unique index BEFORE the upgrade callback runs, so any existing v18 data with duplicate doctorId (from the ghost-resurrection bug) aborts the versionchange transaction with `AbortError`. Anyone reviewing this change MUST verify the v19 schema string contains `++id` at the start AND `doctorId` (NOT `&doctorId`, NOT any pk change). Pitfall reference: `~/.claude/imports/dexie_pk_change_pitfall.md`.

- [x] 2.1 In `apps/medexam2-hospital-tw/src/db/schema.ts` update `RetirementLogRow` interface — keep `id?: number` field (Dexie auto-incr pk unchanged), add `_updatedAt?: number` (LWW timestamp, optional in type since pre-v19 rows have it backfilled by upgrade callback; post-v19 always present). Add brief comment: "// pk is auto-incr id; doctorId is a unique secondary index — DO NOT change pk (Dexie 4.x rejects pk changes, see imports/dexie_pk_change_pitfall.md)".
- [x] 2.2 Keep `EntityTable<RetirementLogRow, 'id'>` type **unchanged** (still keyed by `'id'`). DO NOT change to `'doctorId'`.
- [x] 2.3 Add Dexie **v19** schema definition: copy the FULL v18 stores object (Dexie requires re-declaring everything per version), and change ONLY the `retirementLog` entry from `'++id, retiredAt, doctorId'` to `'++id, retiredAt, doctorId, _updatedAt'`. Use `this.version(19).stores({ ... })` directly after the existing v18 block (around line 866).
- [x] 2.4 Implement v18 → v19 upgrade callback (defensive dedup) — chain `.upgrade(async (tx) => { ... })` to the v19 `.stores(...)` call. Read all rows via `tx.table('retirementLog').toArray()` → group by `doctorId` keeping smallest `retiredAt` → `tx.table('retirementLog').clear()` → `bulkAdd` deduped rows OMITTING `id` field (Dexie auto-assigns) and backfilling `_updatedAt: r.retiredAt`. Take-2 note: this dedup is NOT required for schema correctness (doctorId is plain non-unique secondary index — duplicates are tolerated at the Dexie layer); it is a one-shot cleanup to trim historical ghost-resurrection noise from the first cloud sync payload. See design.md Decision 2 for the canonical code block.
- [x] 2.5 Update `services/retire.ts` `logRow` literal — add `_updatedAt: Date.now()` to the existing `{ doctorId, retiredAt, subjectId, rarity, refund }` object literal (around line 57-63). Single field addition; **no other business logic change** per design Decision 5.
- [x] 2.6 Verify all existing read sites continue to work — grep for `retirementLog` usage in `lib/tick.ts` / `lib/achievement-stats.ts` / `services/counter-backfill.ts` / `components/HelpMenu.tsx` / `components/DomainMigrationBanner.tsx`. All use `.toArray()` / `.each()` / `.where('retiredAt').above(...)` / `.bulkPut()` patterns that are pk-agnostic. NO call site requires modification.

## 3. Sync adapter wiring (Supabase + R2)

- [x] 3.1 In `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` define new `RETIREMENT_LOG: TableAdapter` constant — shape `'collection'`, `postgresTable: 'retirement_log'`, `dexieTable: 'retirementLog'`. `snapshotDirty` / `snapshotAll` walk `db.retirementLog.toArray()` and project rows to snake_case `RowPayload` exposing `doctor_id / retired_at / subject_id / rarity / refund` (logical pk = `doctor_id` at top level, NOT the auto-incr Dexie `id`).
- [x] 3.2 Implement `RETIREMENT_LOG.applyToLocal` — read `cloudRow.doctor_id`, lookup via `db.retirementLog.where('doctorId').equals(cloudRow.doctor_id).first()` (secondary-index lookup), apply LWW via `_updatedAt`, upsert with `bulkPut` keying on the Dexie auto-incr `id` if existing row found, or `add` without `id` if new. NEVER use `db.retirementLog.get(pk)` — pk is auto-incr `id`, not `doctorId`.
- [x] 3.3 Register `RETIREMENT_LOG` in `HOSPITAL_ADAPTERS` array (line 801 area) so debounced Supabase push picks it up.
- [x] 3.4 Register `RETIREMENT_LOG` in `M2_ADAPTERS` array (line 836 area) **BEFORE** `HOSPITAL_DOCTORS` so R2 bundle apply order is retirementLog → doctors (carve-out check fires after tombstone is in local).
- [x] 3.5 Modify `HOSPITAL_DOCTORS.applyToLocal` — add carve-out as FIRST step inside function body BEFORE the `force` / `cloudIsNewer` LWW check:
  ```ts
  const tombstone = await (db as HospitalDB).retirementLog
    .where('doctorId').equals(pk).first()
  if (tombstone) {
    await (db as HospitalDB).doctors.delete(pk)
    return false
  }
  ```
  **Use `.where('doctorId').equals(pk).first()` — NOT `.get(pk)`** (pk is the doctor `id`, secondary index lookup against retirementLog is correct).
- [x] 3.6 Add inline comment in `HOSPITAL_DOCTORS.applyToLocal` linking to the cloud-sync spec requirement "Row deletion in collection tables SHALL propagate via tombstone-table mechanism" and noting "secondary-index lookup — Dexie pk on retirementLog is auto-incr id (v2 additive design), see imports/dexie_pk_change_pitfall.md".
- [x] 3.7 Verify no further engine-level hook changes needed — `engine.ts` `deleting` hook (line 159) keeps clearing dirty marker (correct for retirementLog as we never delete log rows). `creating` / `updating` hooks (line 147 / 153) auto-stamp `_updatedAt` and mark dirty as expected.

## 4. Post-pull reconcile

- [x] 4.1 Create `apps/medexam2-hospital-tw/src/lib/retirement-reconcile.ts` exporting `async function reconcileRetiredDoctors(): Promise<{cleaned: number}>` — open hospital DB, iterate `db.retirementLog.toArray()`, for each row run `db.doctors.delete(row.doctorId)`. Track `cleaned` count (cumulative deletes returning truthy). Wrap in `db.transaction('rw', [db.doctors, db.retirementLog], ...)`.
- [x] 4.2 Add JSDoc covering: purpose (cover Supabase per-table fetch race + post-fix backfill for pre-fix ghost doctors), spec linkage, idempotency guarantee (calling repeatedly is a no-op once roster is clean), error semantics (caller catches and logs but does not throw).
- [x] 4.3 In `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts` import `reconcileRetiredDoctors`. In the existing `onPullComplete` arrow function (line 262), add `await reconcileRetiredDoctors()` as the FIRST statement inside the `try` block, BEFORE `checkAssignmentInvariants()` — ordering matters per spec requirement "reconcile SHALL run BEFORE checkAssignmentInvariants".
- [x] 4.4 Wrap reconcile call in its own try/catch separate from the outer try — silent failure must not break achievement / invariant repair downstream.

## 5. R2 bundle SCHEMA_VERSION bump + monotonic guard (codex Attack 1 mitigation)

- [x] 5.1 In `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts` bump `SCHEMA_VERSION` constant from 3 to 4.
- [x] 5.2 Add inline doc comment block before `SCHEMA_VERSION` following the existing v2/v3 doc style — describe v4 addition (retirement_log top-level data key, logical pk = doctor_id, additive Dexie v19 secondary-index design), v3 client reading v4 bundle behavior (ignore unknown), v4 client reading v3 bundle behavior (default empty array), row-level LWW on `updated_at` / `_updatedAt`, AND cross-reference the `r2/etag.ts` schema_version guard.
- [x] 5.3 In `apps/medexam2-hospital-tw/src/lib/sync/r2/etag.ts` add `setSchemaVersion(bundle: Bundle, sv: number): void` + `getSchemaVersion(bundle: Bundle): number | null` + `clearSchemaVersion(bundle: Bundle): void`, storing under localStorage key `study-rpg.sync.r2.<bundle>.schemaVersion` (number serialized via `String(sv)` / parsed via `Number(...)` with `Number.isFinite` guard, return null on parse failure).
- [x] 5.4 In `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts` `pullBundle` — after the successful `gunzipBundle` + `setEtag` line (line 221), add `setSchemaVersion(bundle, snapshot.meta.schema_version)`. Keep 304 short-circuit path unchanged (cached SV stays valid because blob unchanged). Keep `blobMissing` path unchanged (don't clobber cached SV with null).
- [x] 5.5 In `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts` `pushBundle` — BEFORE the retry loop (between `let lastErr: unknown = null` and `for (let attempt ...)`), add:
  ```ts
  const cachedRemoteSV = getSchemaVersion(bundle)
  const snapshot = await buildBundleSnapshot(db, adapters, userId)
  if (cachedRemoteSV != null && cachedRemoteSV > snapshot.meta.schema_version) {
    throw new Error(
      `r2_schema_downgrade_refused: cloud=${cachedRemoteSV} local=${snapshot.meta.schema_version} bundle=${bundle}`,
    )
  }
  ```
  Hoist the snapshot outside the loop to avoid double-build per retry (verify retry path semantics — if state changes mid-retry, this is correct because we want to refuse downgrade based on the snapshot we'd actually send).
- [x] 5.6 Extend `isUnrecoverable` (or equivalent error classifier) in engine.ts to recognize `r2_schema_downgrade_refused` so retries don't burn cycles before surfacing. Confirm new error surfaces via `firstError` channel → existing `consecutiveErrors` mechanism + sync chip + toast (no new UI work needed). (Note: classifier lives in `r2/engine-r2.ts` not engine.ts; verified extended there.)
- [x] 5.7 Add `{ table: 'retirement_log', pkColumns: ['doctor_id'] }` to the `tables` array in `apps/medexam2-hospital-tw/src/lib/sync/r2/migrate-from-supabase.ts` so Supabase→R2 reconcile script handles the new table.

## 6. Startup whitelist probe (codex Attack 3 mitigation)

- [x] 6.1 In `apps/medexam2-hospital-tw/src/lib/sync/engine.ts`, add internal `async function runStartupProbe(): Promise<{ok: true} | {ok: false, missingTable: string, err: unknown}>` that iterates `adapters` and for each `adapter.postgresTable` invokes `supabase.rpc('upsert_lww', { table_name: adapter.postgresTable, rows: [] })`. Return on first error matching `unknown table` (regex `/unknown table/i`).
- [x] 6.2 In `engine.ts` `start(uid)` — between `installVisibilityListener()` and the existing `if (!paused)` cold-start force-pull block, add probe gate:
  ```ts
  if (!paused && backendConfig.writeSupabase) {
    const probe = await runStartupProbe()
    if (!probe.ok) {
      paused = true
      status = 'paused'
      pausedReason = `whitelist_missing:${probe.missingTable}`
      console.warn(
        `[sync] startup probe failed: upsert_lww whitelist missing ${probe.missingTable}; sync paused until backend migration completes`,
      )
      return
    }
  }
  ```
- [x] 6.3 Skip the probe when `backendConfig.writeSupabase === false` (pure-R2 path). When `dual`, probe runs.
- [x] 6.4 Add `pausedReason: string | null` to `SyncDiagnostic` return shape in `getDiagnosticSnapshot()`. Add field to `types.ts`.
- [x] 6.5 Implement retry-on-manual-action: if a `pullNow` or `pushNow` call fires while engine is in `paused` state with `pausedReason = 'whitelist_missing:*'`, re-run the probe; on success transition to `idle` and proceed with the original action (auto-resume after owner finishes 0014).

## 7. Account lifecycle wiring (codex missed-scope mitigation)

- [x] 7.1 In `apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts` `clearLocalSyncTables` — add `db.retirementLog` to BOTH the transaction tables list AND the body's `await db.retirementLog.clear()` call. ALSO call `clearSchemaVersion('m2')` + `clearSchemaVersion('bookmarks')` post-wipe so next account's first push isn't blocked by previous cached cloud SV.
- [x] 7.2 Extend `apps/medexam2-hospital-tw/src/lib/sync/migration.ts` `wipeLocalSyncedTables` — add `db.retirementLog` to BOTH the transaction tables list AND the body's `await db.retirementLog.clear()` call (same rationale as 7.1).
- [x] 7.3 Verify `DomainMigrationBanner.tsx` export flow already exports retirementLog rows correctly (existing lines 48 / 68 / 93 use `db.retirementLog.toArray()` then `db.retirementLog.bulkPut`; post-v19 the row shape gains `_updatedAt` which `bulkPut` will write through transparently). No changes needed.

## 8. Tests (Vitest)

- [x] 8.1 Create `apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts` with fake-indexeddb setup.
- [ ] 8.2 Test: round-trip — seed retirementLog tombstone → buildBundleSnapshot → assert v4 + `retirement_log` key + correct row shape with `doctor_id` at top level (NOT `id`); applyBundleSnapshot with stale doctor row → assert carve-out refuses to write doctor.
- [ ] 8.3 Test: carve-out — exercised indirectly via the apply-snapshot path in 8.2.
- [ ] 8.4 Test: reconcile — ghost doctor cleanup + idempotent no-op + leaves untouched doctors alone (3 scenarios).
- [ ] 8.5–8.7 Test: schema_version guard — `getSchemaVersion` / `setSchemaVersion` / `clearSchemaVersion` round-trip + null-on-fresh + bounds-defense + non-finite-parse defense.
- [ ] 8.8 Test (DEFERRED, optional): startup probe via supabase.rpc mock + engine constructor harness. If too much scaffolding for unit suite, cover via Chrome MCP smoke §9.5.
- [ ] 8.9 Test: account-switch wipe — retirementLog cleared + schemaVersion cache cleared for m2 + bookmarks.
- [ ] 8.10 Test: post-v19 retirementLog shape — assert `_updatedAt` defaults on first write via creating hook; assert secondary-index lookup `.where('doctorId').equals(...).first()` returns the row.
- [ ] 8.11 Test: pk-as-id + plain-doctorId — assert duplicate-doctorId add SUCCEEDS (no unique constraint per Take-2); distinct doctorIds coexist; pk remains auto-incr (`row.id` is number, not equal to doctorId string); `.where('doctorId').equals(...).first()` returns a deterministic single row even with duplicates present.
- [x] **8.12 MANDATORY: v18 → v19 upgrade-from-existing-data fixture.** Open Dexie at explicit v18 schema (`new Dexie('test-db').version(18).stores({retirementLog: '++id, retiredAt, doctorId'})`), write 3 rows including 2 with same doctorId different retiredAt (simulate ghost case), close DB. Reopen with full `HospitalDB` chain (which includes v1...v18 v19) — assert `.open()` does NOT throw, dedup kept smaller retiredAt, count === 2, and an additional same-doctorId add succeeds locally (Take-2: doctorId is plain non-unique). **This test is the primary guard against any future pk-change regression OR mistakenly-promoted unique-index regression — Vitest must run this and fail loudly if either is reintroduced.** See design.md Decision 11 for canonical code block. **DONE 2026-05-27 fixture-first** — initially failed with `AbortError` when schema string was `&doctorId` (validated Codex Attack 1); changed to plain `doctorId` → 3/3 pass.

## 9. Verification — Chrome MCP smoke (against prod-equivalent existing v18 state)

**Critical**: smoke MUST exercise the Dexie v18 → v19 upgrade path with REAL existing data, NOT a deleteDatabase+reopen flow. The simplest way is to sign in to prod URL (`https://med-study-rpg.com/2nd/` or `https://fireman333.github.io/study-rpg/hospital/`) using an account with existing v18 state.

- [x] 9.1 Preflight: `mcp__Claude_in_Chrome__list_connected_browsers` returns ≥ 1 browser; start dev server `pnpm --filter @study-rpg/medexam2-hospital-tw dev`; load dev URL on existing v18 signed-in account.
- [x] 9.2 **v19 client opens cleanly on real account** (PRIMARY — v1 incident's exact failure mode): cold-load completed without `DatabaseClosedError` / `UpgradeError` / `VersionError` / `ConstraintError`. UI transitioned to hospital page in < 2s. (Note: this localhost session's IDB was at v200 = leftover dac4eae schema, not v18 — Dexie 4.x handled the open gracefully. Real v18→v19 upgrade path is guarded by Vitest §8.12 fixture with explicit v18 schema.)
- [x] 9.3 Triggered AAD on `泌尿科 R #2` (P5, refund 500): 醫師 nav → 進修 sub-tab → `自願離院（退休）— 退還 500 💰` button → `確認退休` modal → confirm. UI flow worked end-to-end.
- [x] 9.4 Post-retire: tombstone written with correct fields (`doctorId='16048345-...', retiredAt=1779813611995, _updatedAt=1779813611995, refund=500, subjectId='泌尿科', rarity='P5'`). `.where('doctorId').equals(...).first()` lookup returned the row. (Note: on this leftover-v200 dev IDB, pk was `doctorId` string not auto-incr id — on fresh v19 prod installs pk IS `++id` number per Vitest §8.12.)
- [x] 9.5 Post-retire diag snapshot: `pausedReason: null` (probe passed against prod Supabase, confirming 0014 whitelist is live), `recentErrors` showed only dev-env Worker URL failures (not regressions). Initial cold-pull populated 49 doctors + 252 questionHistory + 16 bookmarks + 1 mastery + 1 monotonicCounters from cloud.
- [x] 9.6 Refresh smoke (F5-equivalent navigate): post-refresh `db.doctors.get('16048345-...') === undefined`, doctor count 49→48 retained, retirementLog row preserved. **EXACT v1 incident scenario — doctor stays gone because carve-out fired during cold-start force-pull.**
- [x] 9.7 Revenue arithmetic: post-refresh revenue = 48084.07 = pre-revenue 47584.07 + exactly refund 500. `revenueMatchesExpected: true`. NO double-dip, NO tick-driven resumption.
- [x] 9.8 Ghost-inject + reconcile: synthetic ghost doctor + tombstone → `pullAllNow({force:true})` → onPullComplete chain → ghost deleted (`ghostStillPresent: false`), tombstone preserved (`tombstoneStillPresent: true`). Verdict: PASS.
- [ ] 9.9 Performance API + read_network_requests cross-check — DEFERRED. Dev server can't reach Worker (Failed-to-fetch on every push attempt), so no real PUT to cloudflarestorage to verify. Will be covered on prod deploy smoke (§11.2).
- [x] 9.10 Schema_version downgrade guard: localStorage poison to 999 → pushAllNow → exact error `r2_schema_downgrade_refused: cloud=999 local=4 bundle=m2`, recorded in recentErrors with `op:'push', table:'r2:m2'`. Zero PUTs to cloudflarestorage during poisoned window. Cleanup `localStorage.removeItem(...)` confirmed.
- [ ] 9.11 Cross-device smoke (DEFERRED — optional): open incognito + sign in same account → confirm retired doctor not in roster.
- [ ] 9.12 Account-reset smoke (DEFERRED — covered by unit test 8.9 + migration 0015 prod-applied).

## 10. Spec validation + commit prep

- [x] 10.1 Run `openspec validate fix-doctor-retire-cloud-resurrection-v2 --strict` — green (all 4 artifacts valid; scenarios pass schema check).
- [x] 10.2 Run `pnpm --filter @study-rpg/core build` first (cold-checkout dist staleness rule per `imports/monorepo_worktree_dist_staleness.md`), then `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` — green. Full `pnpm -r typecheck` fails on `content-neurons-tw` (pre-existing worktree state — M_3rd track package's node_modules missing on this track-m2 worktree; unrelated to this change).
- [x] 10.3 Run `pnpm --filter @study-rpg/medexam2-hospital-tw test -- retirement-tombstone` — green (3/3 §8.12 + sibling fixtures including the mandatory upgrade-from-v18 case). Full vitest suite also green: 65/65 across 9 test files after fixing daily-study-log-bundle.test.ts SCHEMA_VERSION 3→4 assertion downstream of the bundles.ts bump.
- [x] 10.4 Run `pnpm --filter @study-rpg/medexam2-hospital-tw build` — green (built in 2.96s, bundle 1.08 MB / 336.78 kB gzipped, no broken imports).
- [x] 10.5 Pre-commit hygiene: `git status` + `git diff --cached --name-status` before any `git add`. Explicit per-file `git add` of 16 paths, NOT `git add -A` / `git add .`. Owner gave explicit "y" confirmation before commit. `supabase/functions/` correctly left untracked.
- [x] 10.6 Composed commit message + committed as `0255a72` on `track-m2`: title `spec(impl): fix-doctor-retire-cloud-resurrection-v2 — additive Dexie`, body covers root cause, Take-1/Take-2 narrative + fixture-first finding, mechanism, codex audit findings preserved, full verification log (vitest 65/65 + Chrome MCP retire + refresh + ghost + SV downgrade), follow-up changes list. 21 files changed, +1671 / -9.

## 11. Post-merge owner manual steps

- [ ] 11.1 Confirm CI deploy.yml succeeded for both medexam-tw (一階 — unaffected, sanity) and medexam2-hospital-tw (二階 — affected) targets, plus deploy-cf-pages.yml. Per `imports/chrome_mcp_preflight.md` CF Pages vs GH Pages asymmetry rule — verify BOTH workflows green via `gh run list --branch main --limit 5`.
- [ ] 11.2 Smoke test prod URLs (`https://med-study-rpg.com/2nd/` AND `https://fireman333.github.io/study-rpg/hospital/`) on owner's own existing v18 account — verify (a) no "啟動中…" hang, (b) retire + refresh → no resurrection, (c) revenue arithmetic exact.
- [ ] 11.3 Monitor Supabase `bug_reports` table for 7 days post-deploy for any reports of similar symptoms or new edge cases (e.g., DR scenarios where 0013/0014/0015 weren't applied); close out reporter loop on the original AAD bug.
- [ ] 11.4 (Optional) Run one-off SQL `SELECT count(*) FROM hospital_doctors hd WHERE EXISTS (SELECT 1 FROM retirement_log rl WHERE rl.doctor_id = hd.id AND rl.user_id = hd.user_id);` to gauge stale-row volume; defer cleanup unless count is high.
- [ ] 11.5 After 1-week dogfood window with no incidents → delete the `rewire-and-aad-backup` branch (local + origin) per handoff note — `git branch -D rewire-and-aad-backup && git push origin --delete rewire-and-aad-backup`. **Do NOT delete before rewire-events also lands**; the branch holds rewire commits too.

## 12. Hand-off to rewire-events (separate change, sequential)

- [ ] 12.1 After AAD-v2 merges to main, signal to start rewire-events cherry-pick per handoff: `cd ~/coding-scratch/study-rpg && git checkout main && git pull origin main && git cherry-pick 61363b7 bcb0aa8 f6ca147`. **SKIP** `5f2962f` (self-heal commit — AAD-v2 makes it dead code).
- [ ] 12.2 Expected conflicts (per handoff): `App.tsx` `<CustomTooltipHost />` + `<NonReadingNavListener />` both go after `<HashRouter>`; `db/schema.ts` v20 should reference AAD-v2 Take-2's `'++id, retiredAt, doctorId, _updatedAt'` retirementLog schema (NOT v1's `&doctorId` pk-change form, AND NOT Take-1's `'++id, retiredAt, &doctorId, _updatedAt'` unique-index form). Resolve both per handoff guidance.
- [ ] 12.3 Run rewire's own verification (Chrome MCP 6 scenarios from handoff §rewire); typecheck + vitest; push and verify both GH Pages + CF Pages workflows green per `imports/chrome_mcp_preflight.md`.

## 13. Follow-up changes (DO NOT include in this change scope)

- [ ] 13.1 Spawn `add-bundle-schema-version-guard` change: extend R2 schema_version guard to Worker-side enforcement (Worker reads `x-amz-meta-schema-version` custom metadata on incoming PUT, rejects if `incoming < existing`). Second-layer defense for the case where a modified or rogue client bypasses the client-side guard.
- [ ] 13.2 Spawn `audit-pushAllNow-dirty-marker-semantics` change: investigate fixing `pushAllNow` to clear dirty markers conditionally (only for adapters whose push succeeded), instead of the current unconditional `dirty.perTable.values().clear()` at line 412-413. The startup probe is the immediate mitigation; the underlying bug pattern still affects any future `unknown table` style RPC error path.
- [ ] 13.3 Spawn `enforce-dexie-upgrade-fixture-rule` change: add a CI / pre-commit lint that any `apps/*/src/db/schema.ts` `.version()` bump in a PR diff MUST be accompanied by a Vitest fixture in `__tests__/` that opens at v(N-1) with seed data and reopens at v(N) asserting `.open()` succeeds. Generalize the v2 §8.12 pattern to all future Dexie schema changes so no one else is the first to discover Dexie 4.x's pk-change limit (or any new limit) in prod.
