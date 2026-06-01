## 1. Preflight & test scaffold (一階)

- [x] 1.1 Confirm `apps/medexam-tw/src/lib/sync/r2/__tests__/` exists; if not, create the directory.
- [x] 1.2 Confirm vitest is wired in `apps/medexam-tw/package.json` (`scripts.test` runs vitest). If missing, document why fix proceeds without coverage on 一階 too (not expected — vitest is present in repo).
- [x] 1.3 ~~Create~~ **Extend** existing `apps/medexam-tw/src/lib/sync/r2/__tests__/engine-r2.test.ts` (5685 bytes, already covers pushBundle 412 recovery) — reuse its mock infrastructure (`mocks.etagMap`, `mocks.gunzipBundle`, `mocks.applyBundleSnapshot`, `vi.mock` for `client`/`bundles`/`etag`, `makeResponse(status, body, etag)` helper) by adding a new `describe('pullBundle HEAD-then-unconditional-GET path', …)` block plus `import { pullBundle }`.

## 2. Implement HEAD-then-conditional-GET in 一階 engine

- [x] 2.1 In `apps/medexam-tw/src/lib/sync/r2/engine-r2.ts`, update the file-header comment block to describe the HEAD-then-unconditional-GET pull pattern + the R2 304 CORS bug it works around.
- [x] 2.2 Refactor `pullBundle(supabase, db, adapters, bundle, opts)`:
  - On entry: resolve presigned URL via `requestPresign(supabase, bundle, 'get')`.
  - If `opts.force === true` OR no cached `lastEtag` (`getEtag(bundle) === null`): skip HEAD, go straight to unconditional GET path.
  - Otherwise: issue `fetch(url, {method: 'HEAD'})`. On 404 → return `{kind: 'blobMissing'}` (preserve existing shape). On non-ok non-404 OR thrown error → log to recent-errors ring buffer (preserve existing logging convention used by other R2 paths) and fall back to unconditional GET path.
  - If HEAD returns 200: read `ETag` response header. If absent → fall back to unconditional GET. If present AND equals cached `lastEtag` → return `{kind: 'noChange', etag: cached}` (preserve existing `notModified: true` shape; map equivalently). If present AND differs → proceed to unconditional GET path.
  - Unconditional GET path: `fetch(url)` with NO `If-None-Match` header. Handle responses per existing logic (200 → decompress → applyToLocal; non-200 → existing error paths; gunzip failure → existing `decodeFailed: true` recovery shape).
- [x] 2.3 Ensure the returned `PullBundleResult` shape (`{etag, notModified, blobMissing, applied, decodeFailed?}`) is unchanged so call sites in `bundles.ts` / `engine.ts` need no edits. The new "noChange via HEAD" case maps to `{etag: cached, notModified: true, blobMissing: false, applied: null}`.
- [x] 2.4 Ensure `pushBundle`'s 412/409 recovery path (which calls `pullBundle(..., {conditional: false})`) still works — `conditional: false` should skip HEAD and go straight to unconditional GET (same as `force: true`).
- [x] 2.5 `pnpm --filter @study-rpg/medexam-tw typecheck` passes.

## 3. Write vitest cases (一階)

- [x] 3.1 Test: `pullBundle returns noChange (notModified: true) when HEAD etag matches cached lastEtag` — mock HEAD returns 200 + matching ETag header; assert no body-fetching GET issued; assert returned `{notModified: true}` + cached etag preserved.
- [x] 3.2 Test: `pullBundle returns changed (applied) when HEAD etag differs` — mock HEAD returns 200 + different ETag; mock GET returns 200 + valid gzip body; assert HEAD then GET sequence; assert GET request headers contain no `If-None-Match`; assert `applied` is non-null.
- [x] 3.3 Test: `pullBundle returns blobMissing on HEAD 404` — mock HEAD returns 404; assert no GET issued; assert returned `{blobMissing: true}`.
- [x] 3.4 Test: `pullBundle falls back to unconditional GET when HEAD throws` — mock HEAD rejects with `TypeError('boom')`; mock GET returns 200 + valid body; assert GET issued (no If-None-Match); assert `applied` non-null; assert HEAD failure logged via `console.warn` with `[sync:pullR2:m2]` channel.
- [x] 3.5 Test: `pullBundle with force=true skips HEAD and issues only unconditional GET` — mock with cached lastEtag set; call with `{force: true}`; assert HEAD never called; assert single GET issued without `If-None-Match`.
- [x] 3.6 Test: `pullBundle with no cached etag skips HEAD on first call` — clear cached etag; mock GET returns 200; assert HEAD never called; assert single GET issued.
- [x] 3.7 Test: `pullBundle never sends If-None-Match on body-fetching GET in any scenario` — parameterized assertion covering 5 scenarios (cache-miss-after-HEAD-diff, HEAD-throws fallback, force=true bypass, no-cached-etag, conditional=false pushBundle-recovery path); assert request headers in all GET calls contain no `If-None-Match`.
- [x] 3.8 `pnpm --filter @study-rpg/medexam-tw test` passes (10/10: 3 existing pushBundle tests + 7 new pullBundle tests).

## 4. Mirror fix in 二階 engine

- [x] 4.1 In `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts`, apply the same refactor as Task 2.1–2.4. Confirmed 二階 engine is byte-identical to 一階 (`diff` returned empty pre- and post-cp), so `cp` from 一階 was used as the application mechanism. No 二階-specific divergence existed to preserve.
- [x] 4.2 Confirm shape identity: `PullBundleResult` unchanged (file is byte-identical to 一階, same interface declaration); call sites in 二階 `bundles.ts` / `engine.ts` need no edits.
- [x] 4.3 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` passes. (Initial false-alarm 13× TS7006 errors in `packages/content-medexam2-tw/src/achievements.ts` were a stale `packages/core/dist/index.d.ts` artifact from cold-checkout of this hotfix worktree — once `pnpm --filter @study-rpg/medexam-tw build` ran its `prebuild` hook and rebuilt `@study-rpg/core`, contextual typing on `Achievement.predicate` was restored and all errors disappeared. Matches project CLAUDE.md "Known sharp edges" entry: cold checkout requires `pnpm --filter @study-rpg/core build` before any 二階 typecheck.)
- [x] 4.4 二階 has no vitest coverage; production smoke covers it. (Already documented in `design.md` D5.)

## 5. Verify & build

- [x] 5.1 Run `/opsx:verify` against this change (completeness / correctness / coherence pass) — clean: 0 critical, 0 warnings, 0 suggestions; all 7 spec scenarios covered by vitest cases; all 5 design decisions reflected in code.
- [x] 5.2 `pnpm -r typecheck` across the monorepo passes (verified — 8/8 packages: core, sync-worker, content-medexam-tw, content-medexam2-tw, theme-pixel-medical, theme-pixel-hospital, medexam-tw, medexam2-hospital-tw all green after core rebuild).
- [x] 5.3 `pnpm --filter @study-rpg/medexam-tw build` succeeds (verified — 793.66 kB bundle built; only the standard large-chunk warning, no errors).
- [x] 5.4 `pnpm --filter @study-rpg/medexam2-hospital-tw build` succeeds (verified — 1033.68 kB bundle built; only the standard large-chunk warning, no errors).

## 6. Archive & deploy

- [x] 6.1 `/opsx:archive fix-r2-conditional-pull-cors` (merges delta into `openspec/specs/cloud-sync/spec.md`).
- [ ] 6.2 Commit via auto-git skill (template: `spec(archive): merge fix-r2-conditional-pull-cors — HEAD-then-unconditional GET pulls to dodge R2 304 CORS bug`). Confirm with user before committing.
- [ ] 6.3 `git push origin hotfix/fix-r2-conditional-pull-cors` (or merge to `main` first per project workflow, then push `main`). Triggers GH Pages + CF Pages auto-deploy. Worker NOT redeployed (no `cloudflare/sync-worker/**` changes).
- [ ] 6.4 Decide whether to cherry-pick the 2 engine files to `track-m2` (parallel session may already have its own work in flight on those files — coordinate with user before cherry-picking).

## 7. Production smoke

- [ ] 7.1 On `https://med-study-rpg.com/1st/` (一階): sign in with known account that has cloud state. Open DevTools Console. Trigger visibility-change cycle (tab switch). Confirm zero `[sync:pull:r2:m1]` / `[sync:pull:r2:bookmarks]` error entries over 3 pull cycles.
- [ ] 7.2 On `https://med-study-rpg.com/2nd/` (二階): same procedure. Confirm zero `[sync:pull:r2:m2]` / `[sync:pull:r2:bookmarks]` error entries.
- [ ] 7.3 In DevTools Network panel: filter `cloudflarestorage`. Confirm HEAD requests are present on visibility-change pulls. Confirm subsequent GETs (if any) carry no `If-None-Match` request header (use Performance API per `~/.claude/imports/chrome_mcp_preflight.md` if Network panel filtering misses them due to the same cross-origin write-bug class).
- [ ] 7.4 Trigger a real cloud-side update (push from another device or browser profile) and verify the next pull cycle on the first device fetches the new body (cache-miss path works end-to-end).
- [ ] 7.5 If any smoke step fails, document in handoff note and propose follow-up change (do NOT amend this change post-archive).
