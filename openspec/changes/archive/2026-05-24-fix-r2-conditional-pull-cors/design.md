## Context

The R2 bundle-pull path in both apps was implemented (per Phase 2 of `add-r2-cloud-sync-migration`) using HTTP conditional GET semantics: `pullBundle(bundle, {conditional, force})` issues a `GET <presignedUrl>` with `If-None-Match: <lastEtag>` when the engine has a cached etag and `conditional !== false`. On a cache hit, R2 returns `304 Not Modified` with no body; the engine treats that as `noChange`. On a cache miss, R2 returns `200 OK` with the gzipped snapshot body; the engine unzips, applies via the standard LWW path, and stores the new etag.

This was the textbook S3-compatible approach. It works server-to-server. It does not work in a browser making a cross-origin request to R2: **R2's 304 responses do not carry the `Access-Control-Allow-Origin` header**, and the browser's cross-origin policy enforces that a CORS-headerless response is not exposed to JS. The `fetch()` Promise rejects with `TypeError: Failed to fetch` instead of resolving with `response.status === 304`. The engine cannot distinguish this from a real network failure, marks the pull as failed, and the user sees the sync error toast on every visibility-change pull cycle.

The bug was masked during the dual-write bake because reads still routed through Supabase. It surfaced after the Phase 3 cutover landed (reads moved to R2). Verified live against `med-study-rpg.com` 2026-05-24 with a hand-crafted reproducer: identical fetch issued with non-matching `If-None-Match` returns 200 cleanly; with matching `If-None-Match` returns `TypeError: Failed to fetch` 3/3 times. R2 CORS rules (`wrangler r2 bucket cors list study-rpg-saves`) look correct — origins / methods / expose-headers all present. The 304 path is simply not covered by R2's response-side CORS plumbing.

Cloudflare has not shipped a fix. Community workarounds either accept the bandwidth hit (always-unconditional GET) or silently swallow the TypeError (conflate with real network errors). Neither is acceptable for a daily-driver app — the first burns bandwidth at the snapshot's scale (~6 KB / bundle × 3 bundles × pull cadence × user count), the second violates the project's "no silent errors" principle (Karpathy #5).

## Goals / Non-Goals

**Goals:**
- Eliminate the spurious `Failed to fetch` errors on R2 cache-hit pulls in both apps.
- Preserve the optimization: don't transfer the full bundle body when the snapshot hasn't changed.
- Keep the engine's external contract (`pullBundle` return shape) unchanged so call sites in `engine-r2.ts`/`bundles.ts` need no modification.
- Stay debuggable: a real network failure on HEAD still surfaces as an error (via fallback path's actual GET attempt), not silently swallowed.

**Non-Goals:**
- Fixing R2's 304-CORS bug (Cloudflare-side; no client-side leverage).
- Rewriting the sync engine's retry / debounce / error-toast logic.
- Unifying 一階 and 二階's parallel R2 engine implementations (independent concern; would belong in a refactor change).
- Adding telemetry on cache-hit vs cache-miss rates (separate concern).
- Eliminating R2 itself (`add-r2-cloud-sync-migration` decided R2 is the right backend for cost/egress reasons; this fix preserves that decision).

## Decisions

### D1: HEAD-then-conditional-GET (Option B) over alternatives

**Decision**: Replace `GET + If-None-Match` with `HEAD` (peek server etag) then **unconditional** `GET` only when etags differ.

**Alternatives considered**:

| Option | Cache-hit cost | Cache-miss cost | Correctness | Verdict |
|---|---|---|---|---|
| A. Always unconditional GET | full body (~6 KB) | full body (~6 KB) | ✅ works | ❌ wastes bandwidth at pull cadence × user count |
| B. **HEAD then unconditional GET on diff** | HEAD only (~200 B) | HEAD (~200 B) + GET (~6 KB) | ✅ works | ✅ chosen |
| C. Catch `TypeError` as 304 | original 304 path | original GET | ❌ conflates real network failures with "no change" — violates "no silent errors" | ❌ rejected |
| D. Worker-proxied conditional GET | unchanged | unchanged | ✅ works | ❌ adds Worker latency to every pull + Worker code change + cross-cutting with `add-r2-cloud-sync-migration` |

Option B's net cost is ~200 bytes HEAD per pull (cache-hit case) vs effectively 0 bytes (304 with no body). Cache-miss case adds one round-trip (HEAD + GET) instead of one (GET). At the engine's pull cadence (visibility-change + cold-start; not background-polling) this is negligible. Pull-error elimination is worth far more than the few hundred bytes per pull.

**Why HEAD specifically**: HEAD requests never return 304 (per HTTP/1.1 spec — 304 is only emitted in response to conditional requests). R2 returns HEAD with full response headers (including `ETag`) and a 200 status code. The 304-CORS bug therefore cannot manifest on HEAD.

### D2: Defensive fallback when HEAD throws

**Decision**: If the HEAD request itself throws (network error, CORS misconfig on HEAD, unexpected non-ok status), the engine SHALL fall back to an unconditional GET rather than fail the pull. The unconditional GET path never hits the 304 bug.

**Rationale**: We don't want a transient HEAD failure (which the engine genuinely needs to be alerted to if it persists) to cascade into a pull failure when the fallback (always-fetch-body) is still correct. The HEAD throw is logged so it remains visible to bug reports / diagnostics, but the pull itself succeeds.

**Trade-off**: a persistent HEAD failure (e.g., misconfigured CORS that blocks HEAD method) would silently degrade to Option A (always-unconditional) and lose the cache-hit optimization. We accept this — correctness over efficiency. If telemetry later shows HEAD failure rates above baseline, that's a separate signal worth investigating.

### D3: Preserve existing `force=true` and `blobMissing` semantics

**Decision**: When the caller passes `{force: true}` (used by the cold-start force-pull per the existing requirement at `cloud-sync` spec L345), the engine SHALL skip the HEAD probe and issue an unconditional GET immediately. The HEAD optimization is only valuable when the engine has a cached `lastEtag` to compare against; force-pull explicitly invalidates that cache.

`HEAD` returning 404 maps to the existing `{kind: 'blobMissing'}` return shape — same observable as the old GET 404 path.

### D4: Mirror the fix in both apps; don't unify engines

**Decision**: Apply the same change to `apps/medexam-tw/src/lib/sync/r2/engine-r2.ts` and `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts` independently. Don't extract a shared helper as part of this fix.

**Rationale**: The two engines diverged historically (一階 has SRS / item adapters; 二階 has hospital / leaderboard / achievement adapters). Unifying them is a 100s-of-LOC refactor that risks churn far beyond this CORS fix. The pullBundle change itself is local (~30 LOC per file) and easy to keep in sync by hand. A future change can extract `packages/core/src/sync/r2-engine.ts` if the duplication becomes painful.

### D5: Test coverage only on 一階 side

**Decision**: Add vitest unit tests for the new pullBundle flow in `apps/medexam-tw/src/lib/sync/r2/__tests__/engine-r2.test.ts` only. 二階 lacks vitest infrastructure; setting it up is out of scope.

**Rationale**: The 5 test cases (cache hit / cache miss / blobMissing / HEAD throw fallback / force bypass) exercise the new logic at the unit level. Both apps share the same code shape; verifying one side is sufficient for this fix. Production smoke (Chrome DevTools network panel + console error count) covers the 二階 side end-to-end.

## Risks / Trade-offs

- **[Risk] HEAD response missing `ETag` header**: if R2 ever omits the ETag from HEAD, the engine can't compare and falls into the "etag differs" branch every time → degrades to Option A (always-unconditional GET). → **Mitigation**: assert ETag presence in test; production fallback is the same as Option A (correct, just less efficient).
- **[Risk] Browser caches HEAD response with stale ETag**: if a CDN / browser cache returns a stale HEAD response, etag comparison could miss a real cloud update. → **Mitigation**: presigned URLs include time-bound query string parameters that already act as cache busters; R2 responses include `Last-Modified` but no `Cache-Control: max-age`. Empirically not observed in dogfood; revisit if pull-staleness reports surface.
- **[Risk] HEAD adds latency on cache-miss path**: cache-miss path is now HEAD + GET (two round-trips). → **Mitigation**: HEAD is small + fast (<100 ms typical); this is acceptable given the alternative is a broken cache-hit path.
- **[Risk] Concurrent push between HEAD and GET races to a new etag**: HEAD returns etag E1, another client pushes new bundle (now etag E2), GET fetches the E2 body and stores E2 as `lastEtag`. → **Mitigation**: this is correct behavior — the client ends up with the freshest snapshot. No data loss.
- **[Trade-off] 200-byte HEAD on every cache-hit pull**: see D1 table for the cost comparison. Accepted.
- **[Trade-off] Code duplication between 一階 and 二階 engines**: see D4 rationale. Accepted, with refactor deferred.

## Migration Plan

1. Land both engine changes + tests in a single commit on `hotfix/fix-r2-conditional-pull-cors`.
2. `pnpm --filter @study-rpg/medexam-tw test` to verify vitest passes (5 new cases + existing engine-r2 tests).
3. `pnpm -r typecheck && pnpm -r build` (or per-app build) to confirm no type regression.
4. Merge `hotfix/fix-r2-conditional-pull-cors` → `main` via standard archive workflow (`/opsx:verify` → `/opsx:archive` → merge).
5. Push to `main` triggers GH Pages + CF Pages auto-deploy (Worker NOT redeployed — no `cloudflare/sync-worker/**` changes).
6. After deploy, smoke-test on both `https://med-study-rpg.com/1st/` and `https://med-study-rpg.com/2nd/`:
   - Sign in with a known account that has cloud state.
   - Open Chrome DevTools → Console.
   - Force a visibility-change cycle (switch tabs and back).
   - Confirm zero `[sync:pull:r2:m1]` / `[sync:pull:r2:m2]` / `[sync:pull:r2:bookmarks]` error entries.
   - In the Network panel, confirm HEAD requests to `*.r2.cloudflarestorage.com` are present and that subsequent GETs are unconditional (no `If-None-Match` request header).
7. Optionally cherry-pick the two engine files to `track-m2` to keep that worktree's R2 path in sync with main (二階 development continues there).

**Rollback**: revert the single merge commit on `main` and redeploy. The change is self-contained to two files plus one test file; no schema / worker / config changes need rolling back.

## Open Questions

- Whether to extract a shared `packages/core/src/sync/r2-engine.ts` after this fix lands — defer to a follow-up change once the duplicated patch has shipped.
- Whether to add per-pull telemetry (HEAD success rate, etag-match rate) so we can monitor the fix's behavior post-deploy — deferred; the existing `recentErrors` ring buffer is sufficient for surfacing regressions via bug reports.
