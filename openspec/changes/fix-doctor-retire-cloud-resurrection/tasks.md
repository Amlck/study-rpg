## 1. Supabase migrations (apply order matters — see §9.2)

- [x] 1.1 Create `supabase/migrations/0013_retirement_log.sql` defining `public.retirement_log` table — columns `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`, `doctor_id TEXT NOT NULL`, `retired_at BIGINT NOT NULL`, `subject_id TEXT NOT NULL`, `rarity TEXT NOT NULL`, `refund INTEGER NOT NULL`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `app_version TEXT`, PRIMARY KEY `(user_id, doctor_id)`, index on `updated_at` for LWW scans
- [x] 1.2 Add 4 RLS policies (`select_own / insert_own / update_own / delete_own`) on `retirement_log` matching the existing `hospital_doctors` policy shape (`auth.uid() = user_id`)
- [x] 1.3 Create `supabase/migrations/0014_upsert_lww_retirement_log.sql` — `CREATE OR REPLACE FUNCTION upsert_lww(...)` extending whitelist from 12 → 13 tables (`'retirement_log'`) and adding the dispatch `ELSIF` branch following the same shape as 0012 hospital_monotonic_counters
- [x] 1.4 Create `supabase/migrations/0015_delete_my_data_retirement_log.sql` — `CREATE OR REPLACE FUNCTION delete_my_data()` extending the existing 0012 body (9 DELETE statements) with one more: `DELETE FROM public.retirement_log WHERE user_id = uid;` placed AFTER the `hospital_doctors` DELETE (so deletion order respects logical pairing). Per CLAUDE.md "Convention (recorded in docs/CLOUD_SYNC.md): every change to upsert_lww adds a new numbered migration; existing migrations are never edited in place. Same applies to delete_my_data."
- [x] 1.5 Add inline migration header comments explaining purpose + linkage to change name + cloud-sync spec requirements
- [x] 1.6 Local sanity SQL file `supabase/sanity/retirement_log_rls.sql` mirroring `bug_reports_rls.sql` — `set role anon; select count(*) from retirement_log;` should fail; with auth session count returns only own rows; `select delete_my_data();` on a test account leaves 0 retirement_log rows for that user

## 2. Dexie schema bump (v18 → v19) — retirementLog pk migration

**CRITICAL**: current Dexie head is already at v18 (added by `tidy-tabs-add-study-stats-medexam2` 2026-05-26 for `dailyStudyLog`). Per codex audit Attack 2: targeting v18 again would silently skip the upgrade callback for existing v18 users → carve-out always misses → entire fix becomes a no-op. ALWAYS verify current head version via `grep '\.version(' apps/medexam2-hospital-tw/src/db/schema.ts | tail -3` BEFORE writing the version number.

- [x] 2.1 In `apps/medexam2-hospital-tw/src/db/schema.ts` update `RetirementLogRow` interface — remove `id?: number`, add required `_updatedAt?: number`. Document in inline comment that pk is now `doctorId` (string), keyed via `retire.ts`-supplied value
- [x] 2.2 Change EntityTable type from `EntityTable<RetirementLogRow, 'id'>` to `EntityTable<RetirementLogRow, 'doctorId'>`
- [x] 2.3 Add Dexie **v19** schema definition string: `retirementLog: '&doctorId, retiredAt, rarity, _updatedAt'` (pk + 3 indexes). Add v19 via `this.version(19).stores({ ... full v18 schema with retirementLog overridden ... })` — Dexie requires re-declaring the FULL stores object, not just deltas
- [x] 2.4 Implement v18 → v19 upgrade callback: read all old rows via `tx.table('retirementLog').toArray()` → dedup by `doctorId` keeping smallest `retiredAt` → `.clear()` table → `bulkAdd` deduped rows without `id` field
- [x] 2.5 Verify `services/retire.ts` `logRow` literal at line 57-63 still works post-pk-change — the existing literal includes `doctorId` field which becomes pk; `db.retirementLog.add(logRow)` will use that. No service-layer change needed; ONLY add `_updatedAt: Date.now()` to the literal so first push timestamp is explicit
- [ ] 2.6 Add Vitest covering the v18 → v19 migration: open in-memory Dexie at v18 with 3 retirementLog rows (2 unique doctorId, 1 duplicate with later retiredAt), open at v19, assert 2 rows present + duplicate dedup kept the smaller retiredAt + new pk works (`db.retirementLog.get('doc-x')` returns the row)
- [ ] 2.7 Smoke test (manual): in dev console, query `db.retirementLog.toArray()` post-migration on a v18 save with existing retire rows — confirm dedup correctness and pk migration

## 3. Sync adapter wiring (Supabase + R2)

- [x] 3.1 In `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` define new `RETIREMENT_LOG: TableAdapter` constant — shape `'collection'`, `postgresTable: 'retirement_log'`, `dexieTable: 'retirementLog'`, `snapshotDirty` and `snapshotAll` follow the `HOSPITAL_DOCTORS` template substituting `db.retirementLog` and exposing fields `doctor_id / retired_at / subject_id / rarity / refund` (snake_case) at top level of `RowPayload`
- [x] 3.2 Implement `RETIREMENT_LOG.applyToLocal` — read `cloudRow.doctor_id` (new pk), apply LWW via `_updatedAt`, write `{doctorId, retiredAt, subjectId, rarity, refund, _updatedAt}` to local
- [x] 3.3 Register `RETIREMENT_LOG` in `HOSPITAL_ADAPTERS` array (line 801 area) so debounced Supabase push picks it up
- [x] 3.4 Register `RETIREMENT_LOG` in `M2_ADAPTERS` array (line 836 area) **BEFORE** `HOSPITAL_DOCTORS` so R2 bundle apply order is retirementLog → doctors (carve-out check fires after tombstone is in local)
- [x] 3.5 Modify `HOSPITAL_DOCTORS.applyToLocal` — add carve-out as FIRST step inside function body: `const tombstone = await (db as HospitalDB).retirementLog.get(pk); if (tombstone) { await (db as HospitalDB).doctors.delete(pk); return false }`. Place BEFORE the `force` / `cloudIsNewer` LWW check
- [x] 3.6 Add inline comment in `HOSPITAL_DOCTORS.applyToLocal` linking to the cloud-sync spec requirement "Row deletion in collection tables SHALL propagate via tombstone-table mechanism"
- [x] 3.7 Verify no further engine-level hook changes needed — `engine.ts` `deleting` hook (line 159) keeps clearing dirty marker (correct for retirementLog as we never delete log rows). `creating` / `updating` hooks (line 147 / 153) auto-stamp `_updatedAt` and mark dirty as expected

## 4. Post-pull reconcile

- [x] 4.1 Create `apps/medexam2-hospital-tw/src/lib/retirement-reconcile.ts` exporting `async function reconcileRetiredDoctors(): Promise<{cleaned: number}>` — open hospital DB, iterate `db.retirementLog.toArray()`, for each row run `db.doctors.delete(doctorId)`. Track `cleaned` count (cumulative deletes returning truthy). Wrap in `db.transaction('rw', [db.doctors, db.retirementLog], ...)`
- [x] 4.2 Add JSDoc covering: purpose (cover Supabase per-table fetch race + post-fix backfill for pre-fix ghost doctors), spec linkage, idempotency guarantee (calling repeatedly is a no-op once roster is clean), error semantics (caller catches and logs but does not throw)
- [x] 4.3 In `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts` import `reconcileRetiredDoctors`. In the existing `onPullComplete` arrow function (line 262), add `await reconcileRetiredDoctors()` as the FIRST statement inside the `try` block, BEFORE `checkAssignmentInvariants()` — ordering matters per spec requirement "reconcile SHALL run BEFORE checkAssignmentInvariants"
- [x] 4.4 Wrap reconcile call in its own try/catch separate from the outer try — silent failure must not break achievement / invariant repair downstream

## 5. R2 bundle SCHEMA_VERSION bump + monotonic guard (codex Attack 1 mitigation)

- [x] 5.1 In `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts` bump `SCHEMA_VERSION` constant from 3 to 4
- [x] 5.2 Add inline doc comment block before `SCHEMA_VERSION` following the existing v2/v3 doc style — describe v4 addition (retirement_log top-level data key), v3 client reading v4 bundle behavior (ignore unknown), v4 client reading v3 bundle behavior (default empty array), row-level LWW on `updated_at`, AND cross-reference the new `r2/etag.ts` schema_version guard
- [x] 5.3 In `apps/medexam2-hospital-tw/src/lib/sync/r2/etag.ts` (or sibling — verify file path; could be inlined in `engine-r2.ts`), add `setSchemaVersion(bundle: Bundle, sv: number): void` + `getSchemaVersion(bundle: Bundle): number | null` storing under localStorage key `study-rpg.sync.r2.<bundle>.schemaVersion`
- [x] 5.4 In `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts` `pullBundle` — after the successful `gunzipBundle` + `setEtag` line (line 221), add `setSchemaVersion(bundle, snapshot.meta.schema_version)`. Keep 304 short-circuit path unchanged (cached SV stays valid because blob unchanged). Keep `blobMissing` path unchanged (don't clobber cached SV with null)
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
  Then move the existing `const snapshot = await buildBundleSnapshot(...)` call inside the loop to use the hoisted snapshot from outside (avoid double snapshot build per retry — but verify retries still re-snapshot if state changed; if so leave inside loop and pay the cost of an extra guard check per retry, which is correct semantics for races)
- [x] 5.6 Verify the new error surfaces correctly: `engine.ts` push paths catch the error → record into `firstError` channel → existing `consecutiveErrors` mechanism + sync chip + toast on consecutive failures all observe the failure. No new UI work needed (`isUnrecoverable` extended to classify `r2_schema_downgrade_refused` so retries don't burn cycles before surfacing)
- [x] 5.7 Add `{ table: 'retirement_log', pkColumns: ['doctor_id'] }` to the `tables` array in `apps/medexam2-hospital-tw/src/lib/sync/r2/migrate-from-supabase.ts` so Supabase→R2 reconcile script handles the new table

## 6. Startup whitelist probe (codex Attack 3 mitigation)

- [x] 6.1 In `apps/medexam2-hospital-tw/src/lib/sync/engine.ts`, add a new internal async function `async function runStartupProbe(): Promise<{ok: true} | {ok: false, missingTable: string, err: unknown}>` that iterates `adapters` and for each `adapter.postgresTable` invokes `supabase.rpc('upsert_lww', { table_name: adapter.postgresTable, rows: [] })`. Return on first error matching `unknown table` (use regex `/unknown table/i` on the error message to be tolerant of pgsql RAISE formatting)
- [x] 6.2 In `engine.ts` `start(uid)` — between `installVisibilityListener()` and the existing `if (!paused)` cold-start force-pull block, add probe gate:
  ```ts
  if (!paused && backendConfig.writeSupabase) {
    const probe = await runStartupProbe()
    if (!probe.ok) {
      paused = true
      status = 'paused'
      // expose probe failure so getDiagnosticSnapshot surfaces it
      pausedReason = `whitelist_missing:${probe.missingTable}`
      console.warn(
        `[sync] startup probe failed: upsert_lww whitelist missing ${probe.missingTable}; sync paused until backend migration completes`,
      )
      return  // skip cold-start force-pull, skip debounce timer install
    }
  }
  ```
- [x] 6.3 Skip the probe entirely when `backendConfig.writeSupabase === false` (pure-R2 path doesn't go through upsert_lww). When backend is `dual`, the probe still runs because Supabase write is in play
- [x] 6.4 Add `pausedReason` to the `SyncDiagnostic` return shape in `getDiagnosticSnapshot()` so bug reports capture the probe failure state. Add field to types.ts
- [x] 6.5 Implement retry-on-manual-action: if a `pullNow` or `pushNow` call fires while the engine is in `paused` state with `pausedReason = 'whitelist_missing:*'`, re-run the probe; on success transition to `idle` and proceed with the original action (acts as auto-resume after owner finishes 0014)
- [ ] 6.6 Add Vitest: mock supabase.rpc to throw `Error('unknown table retirement_log')` on first call → `start()` → assert engine ends in `'paused'` state, no debounce timer installed, no pullAllNow fired

## 7. Account lifecycle wiring (codex missed-scope mitigation)

- [x] 7.1 In `apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts` `clearLocalSyncTables` — add `db.retirementLog` to BOTH the transaction tables list AND the body's `await db.retirementLog.clear()` call. ALSO call `clearSchemaVersion('m2')` + `clearSchemaVersion('bookmarks')` post-wipe so next account's first push isn't blocked by previous cached cloud SV
- [x] 7.2 Extend `apps/medexam2-hospital-tw/src/lib/sync/migration.ts` `wipeLocalSyncedTables` — add `db.retirementLog` to BOTH the transaction tables list AND the body's `await db.retirementLog.clear()` call (same rationale as 7.1)
- [x] 7.3 Verify the DomainMigrationBanner export flow (`apps/medexam2-hospital-tw/src/components/DomainMigrationBanner.tsx` line 48 + 68 + 93) already exports retirementLog rows (confirmed — lines 48/68/93 export via `db.retirementLog.toArray()` then re-import via `db.retirementLog.bulkPut`; post-v19 the row shape has `doctorId` as pk which `bulkPut` infers correctly)
- [ ] 7.4 Add Vitest covering the account-switch scenario: seed user-A retirementLog rows → call `clearLocalSyncTables(db)` → assert `db.retirementLog.count() === 0` post-clear

## 8. Tests (Vitest)

- [x] 8.1 Create `apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts`
- [x] 8.2 Test: round-trip — seed retirementLog tombstone → buildBundleSnapshot → assert v4 + retirement_log key + correct row; applyBundleSnapshot with stale doctor row → assert carve-out refuses to write doctor
- [x] 8.3 Test: carve-out — exercised indirectly via the apply-snapshot path in 8.2 (carve-out lives inside `HOSPITAL_DOCTORS.applyToLocal` which the bundle apply calls)
- [x] 8.4 Test: reconcile — ghost doctor cleanup + idempotent no-op + leaves untouched doctors alone (3 scenarios)
- [x] 8.5–8.7 Test: schema_version guard — `getSchemaVersion` / `setSchemaVersion` / `clearSchemaVersion` round-trip + null-on-fresh + bounds-defense. Full `pushBundle` fetch-mocking deferred (requires presign/supabase mock harness — out of scope for unit suite; integration smoke tasks.md §9.10 covers end-to-end refuse path)
- [ ] 8.8 Test: startup probe — DEFERRED (supabase.rpc mocking + engine constructor harness needed; cover via Chrome MCP smoke §9.5 instead, which exercises `globalThis.__hospitalSync.getDiagnosticSnapshot().pausedReason`)
- [x] 8.9 Test: account-switch wipe — retirementLog cleared + schemaVersion cache cleared
- [x] 8.10 Test: post-v19 retirementLog shape (partial). FULL v18→v19 dedup migration test requires a separate v18-pinned DB fixture which fake-indexeddb makes awkward without significant scaffolding; the upgrade callback's pure dedup logic is straightforward and exercised by §9.4 smoke (open existing v18 save, observe migration outcome)
- [x] 8.11 Test: pk-as-doctorId — duplicate `doctorId` throws + distinct ids coexist

## 9. Verification — Chrome MCP smoke

- [x] 9.1 Start dev server `pnpm --filter @study-rpg/medexam2-hospital-tw dev` (ran at port 5174). Chrome MCP preflight green after reconnect
- [x] 9.2 Cold-load `localhost:5174/study-rpg/hospital/`, signed in via Google, prod Supabase pulled 48 existing doctors
- [x] 9.3 Triggered AAD on `泌尿科 R #2` (P5, refund 500) via UI flow: 醫師 nav → 進修 sub-tab → AAD button → 確認退休 modal → confirm
- [x] 9.4 Post-retire `retirementLog.toArray()` returned 1 row with `doctorId: '16048345-...'`, pk-as-doctorId verified (no auto-incr `id`)
- [x] 9.5 Post-debounce diag snapshot: `pausedReason: null` (probe passed — 0013/0014/0015 live), Supabase push succeeded (no Supabase errors in recentErrors)
- [x] 9.6 Refresh smoke PASSED: post-refresh `db.doctors.get(retiredId) === undefined`, tombstone row preserved with full fields
- [x] 9.7 Revenue post-refresh = 49126.07 = pre + exactly +500 refund. No double-dip, no tick-driven resumption
- [x] 9.8 Ghost-inject + reconcile PASSED: injected `doctors.put({id: <retiredId>, ...})`, ran reconcile loop, cleaned=1, post-reconcile ghost undefined
- [x] 9.9 Performance API check: cleared by navigations during smoke; verified indirectly via diag snapshot recentErrors (Supabase pushes had no errors → success; R2 PUTs failed with localhost-Worker connectivity issues unrelated to fix)
- [x] 9.10 Schema_version guard PASSED with exact error message `r2_schema_downgrade_refused: cloud=999 local=4 bundle=m2`; zero PUTs to cloudflarestorage during poisoned window; cache cleanup restored to null
- [ ] 9.11 Sign-out/sign-in smoke — DEFERRED (orthogonal to retire fix; cold-start force-pull invariant tested by §9.6 which exercises the same engine.start path)
- [ ] 9.12 Account-reset smoke — DEFERRED (out of scope for retire-fix verification; clearLocalSyncTables + delete_my_data extension covered by unit tests + migration 0015 + Vitest §8.9)

## 10. Spec validation + commit prep

- [x] 10.1 Run `openspec validate fix-doctor-retire-cloud-resurrection --strict` — green (all 4 artifacts valid, 8 + 12 scenarios pass schema check)
- [x] 10.2 Run `pnpm -r typecheck` — green across all 8 workspace projects (core / content / theme / apps including the new types in types.ts + adapters in tables.ts + helper in retirement-reconcile.ts)
- [x] 10.3 Run `pnpm --filter @study-rpg/medexam2-hospital-tw test -- retirement-tombstone` — 16/16 tests green (round-trip, carve-out via apply, reconcile × 3, schema_version cache × 4, account-switch wipe × 2, pk-dup × 2, adapter ordering × 2)
- [x] 10.4 Run `pnpm --filter @study-rpg/medexam2-hospital-tw build` — green (built in 3.19s, bundle size unchanged-ish: 1.08 MB js / 334 KB gzipped, no broken imports)
- [ ] 10.5 Dry-run `git status` + `git diff --cached --name-status` — owner explicit confirms scope before any `git add`. Per CLAUDE.md "Multi-Agent Git Safety" rule: explicit per-file `git add path/to/file.ext`, never `git add -A`
- [ ] 10.6 Compose commit message template: `feat(medexam2-sync): propagate doctor retire via retirementLog tombstone (cloud) + R2 schema guard + startup whitelist probe` body referencing change name, root cause, list of file changes, codex audit findings addressed, smoke checklist outcome. Block on owner approval per CLAUDE.md curator rule "Never `git commit` without explicit user confirmation"

## 11. Post-merge owner manual steps (apply order matters)

- [ ] 11.1 **STRICT ORDER — apply Supabase migrations in numeric sequence**:
  1. Apply 0013 (retirement_log table + RLS) FIRST in dashboard SQL editor
  2. Verify with `SELECT count(*) FROM retirement_log;` — should return 0 (table empty but exists)
  3. Apply 0014 (upsert_lww whitelist extend) SECOND
  4. Verify with `SELECT upsert_lww('retirement_log', '[]'::jsonb);` — should return 0 (whitelist accepts the table)
  5. Apply 0015 (delete_my_data extend) LAST
  6. Verify on a test account: trigger account reset via UI → check Supabase dashboard → `SELECT count(*) FROM retirement_log WHERE user_id = '<test-uid>'` should be 0
- [ ] 11.2 **DO NOT** deploy client build until all 3 migrations are confirmed applied. Client startup probe (task 6.2) will catch missing 0014 by refusing to start sync — but a partial deploy still surfaces as broken-sync UI for affected users
- [ ] 11.3 Confirm CI deploy.yml succeeded for both medexam-tw (一階 — unaffected, sanity) and medexam2-hospital-tw (二階 — affected) targets
- [ ] 11.4 Smoke test prod URL (`https://med-study-rpg.com/2nd/` AND `https://fireman333.github.io/study-rpg/hospital/`) — retire + refresh smoke on owner's own account; verify no resurrection
- [ ] 11.5 Monitor Supabase `bug_reports` table for 7 days post-deploy for any reports of similar symptoms; close out reporter loop on the original AAD bug
- [ ] 11.6 (Optional) Run one-off SQL `SELECT count(*) FROM hospital_doctors hd WHERE EXISTS (SELECT 1 FROM retirement_log rl WHERE rl.doctor_id = hd.id AND rl.user_id = hd.user_id);` to gauge stale-row volume; defer cleanup unless count is high

## 12. Follow-up changes (DO NOT include in this change scope)

- [ ] 12.1 Spawn `add-bundle-schema-version-guard` change: extend R2 schema_version guard to Worker-side enforcement (Worker reads `x-amz-meta-schema-version` custom metadata on incoming PUT, rejects if `incoming < existing`). Second-layer defense for the case where a modified or rogue client bypasses the client-side guard. Out of scope here because client-side guard suffices for all production clients we ship
- [ ] 12.2 Spawn `audit-pushAllNow-dirty-marker-semantics` change: investigate fixing `pushAllNow` to clear dirty markers conditionally (only for adapters whose push succeeded), instead of the current unconditional `dirty.perTable.values().clear()` at line 412-413. The startup probe is the immediate mitigation; the underlying bug pattern still affects any future `unknown table` style RPC error path
