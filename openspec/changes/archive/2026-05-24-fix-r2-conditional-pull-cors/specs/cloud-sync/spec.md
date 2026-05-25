## ADDED Requirements

### Requirement: R2 conditional bundle pull SHALL use HEAD-then-unconditional-GET to work around R2 304 CORS bug

The sync engine's `pullBundle(bundle, opts)` SHALL NOT issue a body-fetching `GET` with an `If-None-Match: <lastEtag>` request header against a cross-origin R2 presigned URL. When the caller requests a conditional pull (`opts.conditional !== false`) AND the engine has a cached `lastEtag` for the bundle AND `opts.force !== true`, the engine SHALL first issue a `HEAD` request against the presigned URL, extract the server's current `ETag` response header, and compare it byte-for-byte against the cached `lastEtag`. The engine SHALL issue a body-fetching `GET` ONLY when the etags differ or no cached etag is available; the body-fetching `GET` SHALL NOT carry an `If-None-Match` request header (so R2 SHALL respond with `200 OK` and a body, never `304`).

**Rationale**: Cloudflare R2's S3-compatible `304 Not Modified` responses omit the `Access-Control-Allow-Origin` response header. When a browser receives a 304 from a cross-origin presigned R2 URL, the cross-origin policy treats the CORS-headerless response as inaccessible and surfaces it to JavaScript as `TypeError: Failed to fetch`. The sync engine cannot distinguish this from a real network failure. Switching to HEAD avoids the 304 path entirely (HEAD never returns 304 per HTTP/1.1 RFC 9110 §15.4.5). The `GET` issued on cache-miss carries no `If-None-Match` header so R2 cannot produce a 304 response.

#### Scenario: Cache hit — HEAD etag matches lastEtag, body never fetched

- **GIVEN** the engine has a cached `lastEtag` of `"a2686478f3307e2fc6f6393d0b1ae279"` for bundle `m2`
- **AND** the R2 blob's current ETag is `"a2686478f3307e2fc6f6393d0b1ae279"` (unchanged)
- **WHEN** `pullBundle('m2', {conditional: true, force: false})` is invoked
- **THEN** the engine SHALL issue exactly one `HEAD` request against the presigned R2 URL
- **AND** the HEAD response SHALL be `200 OK` with an `ETag` header matching `lastEtag`
- **AND** the engine SHALL return `{kind: 'noChange'}` without issuing any body-fetching `GET`
- **AND** no `If-None-Match` request header SHALL appear on any request issued by this call

#### Scenario: Cache miss — HEAD etag differs, unconditional GET fetches new body

- **GIVEN** the engine has a cached `lastEtag` of `"oldetag"` for bundle `m1`
- **AND** the R2 blob's current ETag is `"newetag"` (server-side updated since last pull)
- **WHEN** `pullBundle('m1', {conditional: true, force: false})` is invoked
- **THEN** the engine SHALL first issue a `HEAD` request and read `ETag: "newetag"`
- **AND** the engine SHALL then issue a `GET` request against the presigned URL
- **AND** the `GET` request SHALL NOT carry an `If-None-Match` request header
- **AND** the `GET` response SHALL be `200 OK` with the gzipped snapshot body
- **AND** the engine SHALL unzip the body, return `{kind: 'changed', snapshot: <parsed>, etag: '"newetag"'}`
- **AND** the call site SHALL update its `lastEtag` cache to `"newetag"`

#### Scenario: Blob does not exist — HEAD returns 404

- **GIVEN** the user has no prior cloud snapshot for bundle `bookmarks` (first-ever sign-in OR account-reset)
- **WHEN** `pullBundle('bookmarks', {conditional: true, force: false})` is invoked
- **THEN** the engine SHALL issue a `HEAD` request
- **AND** R2 SHALL respond `404 Not Found`
- **AND** the engine SHALL return `{kind: 'blobMissing'}` without issuing any `GET`

#### Scenario: HEAD throws — defensive fallback to unconditional GET

- **GIVEN** the engine has a cached `lastEtag` of `"someEtag"` for bundle `m2`
- **AND** the `HEAD` request rejects (network error, CORS misconfig on HEAD, or unexpected non-ok status)
- **WHEN** `pullBundle('m2', {conditional: true, force: false})` is invoked
- **THEN** the engine SHALL emit a visible warning (e.g., `console.warn` with the `[sync:pullR2:<bundle>]` channel prefix matching the existing `[sync:pushR2:...]` convention) so the HEAD failure is not silently swallowed
- **AND** the engine SHALL fall back to issuing an unconditional `GET` (no `If-None-Match` header) against the presigned URL
- **AND** if the fallback `GET` succeeds with `200 OK`, the engine SHALL return `{kind: 'changed', snapshot, etag}` as in the cache-miss path
- **AND** if the fallback `GET` itself fails, the engine SHALL surface the error normally (the call SHALL throw, which the engine.ts call-site catches and feeds into `recentErrors` via `recordError`)

#### Scenario: Force pull skips HEAD probe entirely

- **GIVEN** the caller invokes `pullBundle('m1', {conditional: true, force: true})` (e.g., from `pullAllNow({force: true})` cold-start path per the existing `Cold-start force-pull bypasses incremental cursor` requirement)
- **WHEN** the engine evaluates the request
- **THEN** the engine SHALL NOT issue a `HEAD` request
- **AND** the engine SHALL issue a single unconditional `GET` (no `If-None-Match` header) and process the response per the cache-miss path

#### Scenario: No cached etag — first conditional pull skips HEAD

- **GIVEN** the engine has no cached `lastEtag` for bundle `m2` (e.g., first pull after a fresh engine `start()`)
- **WHEN** `pullBundle('m2', {conditional: true, force: false})` is invoked
- **THEN** the engine SHALL skip the HEAD probe (no etag to compare against)
- **AND** the engine SHALL issue a single unconditional `GET` (no `If-None-Match` header)
- **AND** on `200 OK` the engine SHALL store the returned ETag as `lastEtag` for subsequent calls

#### Scenario: No If-None-Match header ever sent on body-fetching GET

- **GIVEN** any invocation of `pullBundle(bundle, opts)` for any bundle and any opts
- **WHEN** the engine issues a body-fetching `GET` request
- **THEN** the request headers SHALL NOT include `If-None-Match`
- **AND** R2 SHALL therefore never respond with `304 Not Modified` to a body-fetching `GET` issued by this engine
