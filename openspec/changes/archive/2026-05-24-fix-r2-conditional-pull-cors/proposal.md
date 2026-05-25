## Why

Cloudflare R2's S3-compatible `304 Not Modified` responses omit the `Access-Control-Allow-Origin` header. When the sync engine sends a cross-origin conditional GET with `If-None-Match: <lastEtag>` and the etag matches, R2 returns a CORS-headerless 304 that the browser surfaces to JS as `TypeError: Failed to fetch`. The sync engine cannot distinguish this from a real network failure, treats every successful cache-hit pull as a sync error, and the user sees recurring 「同步失敗」 toast notifications on every tab focus / visibility-change pull cycle. Affects both 一階 (`apps/medexam-tw`) and 二階 (`apps/medexam2-hospital-tw`) R2 pull paths. Surfaced after the R2 reads cutover landed (Phase 3 of `add-r2-cloud-sync-migration`).

The R2-side fix is not available — it is a known Cloudflare bucket-edge bug that we cannot patch from the app. The client must work around it.

## What Changes

- Replace the conditional `GET` with `If-None-Match` in `pullBundle()` with a HEAD-then-unconditional-GET pattern: issue a `HEAD` request first (which returns headers including `ETag` and is unaffected by the 304 CORS bug because it never returns 304); compare the server etag against the locally cached etag; only issue a body-fetching unconditional `GET` when the etags differ. On a cache hit (etags match), the engine returns `noChange` without ever fetching the body.
- Mirror the fix in both apps: `apps/medexam-tw/src/lib/sync/r2/engine-r2.ts` and `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts` use parallel R2 engine code; both must change.
- Preserve `force=true` semantics: when the caller (e.g., cold-start force-pull) requests `force`, skip the HEAD probe and go straight to unconditional GET.
- Preserve `blobMissing` semantics: HEAD returning 404 maps to the same `blobMissing` result the old GET produced.
- Defensive fallback: if HEAD itself throws (network error, unexpected status), fall back to unconditional GET rather than failing the pull. The unconditional GET path never hits the 304 bug.
- Add vitest coverage in 一階 (`apps/medexam-tw/src/lib/sync/r2/__tests__/engine-r2.test.ts`); 二階 lacks vitest infrastructure so one-side test coverage is accepted as adequate for this fix.

## Capabilities

### New Capabilities

None — this change adds a new requirement to an existing capability.

### Modified Capabilities

- `cloud-sync`: adds a new requirement specifying the R2 conditional-pull wire protocol (HEAD-then-unconditional-GET) and documenting the R2 304 CORS bug as the rationale. Existing requirements about pull behavior (cold-start force-pull, visibility-change incremental cursor, LWW reconciliation) remain unchanged at the behavioral level — this delta only constrains the underlying HTTP request shape.

## Impact

- **Code**: `apps/medexam-tw/src/lib/sync/r2/engine-r2.ts` (pullBundle rewrite, ~30 LOC), `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts` (mirror rewrite). New test file in 一階.
- **APIs**: `pullBundle()` external contract (return shape: `{kind: 'noChange'}` | `{kind: 'changed', snapshot, etag}` | `{kind: 'blobMissing'}`) unchanged. Internal call pattern changes from 1 round-trip on cache hit (304 small body) to 1 round-trip on cache hit (HEAD ~200 bytes) + 1 round-trip on cache miss (GET full body). Net bandwidth impact: cache-hit path ~200 bytes per pull (HEAD response) vs prior ~0 bytes (304 with no body); cache-miss path unchanged.
- **Dependencies**: none — uses built-in `fetch` API only.
- **R2 / CORS config**: no change. Existing CORS rules (origins / methods / headers / expose-headers / max-age) remain as-is; the workaround is purely client-side.
- **Worker**: no change. `/presign` endpoint unchanged.
- **Out of scope**: fixing the R2 304 CORS bug (Cloudflare-side, can't); sync retry telemetry redesign; unifying 一階/二階 engine implementations.
