## Phase 1 — Build-time version manifest

- [ ] **1.1** Verify `VITE_COMMIT_SHA` is already wired in both apps (`apps/medexam-tw` + `apps/medexam2-hospital-tw`) via existing bug-reporting integration. Should be no-op; grep `VITE_COMMIT_SHA` to confirm. If missing on either app, copy from the other.
- [ ] **1.2** Add `apps/medexam-tw/scripts/write-version-json.mjs` + identical `apps/medexam2-hospital-tw/scripts/write-version-json.mjs`. Each reads `process.env.VITE_COMMIT_SHA || 'dev'` + writes `{ commit, builtAt }` JSON to `dist/version.json`.
- [ ] **1.3** Edit each app's `package.json` `build` script to chain: `vite build && node scripts/write-version-json.mjs`. Verify `pnpm --filter <app> build` produces `dist/version.json`.
- [ ] **1.4** Confirm `.github/workflows/deploy.yml` already passes `VITE_COMMIT_SHA: ${{ github.sha }}` env to the build step (probably already set for bug reports; verify).
- [ ] **1.5** Document in `docs/AUTH_REDIRECT_URIS.md` or root CLAUDE.md that CF Pages dashboard build also passes the env override (already configured).
- [ ] **1.6** Set `Cache-Control: no-cache, max-age=0` for `/version.json` via deploy host config:
  - GH Pages: requires `_headers` file in dist/ → owner manual confirm GH Pages supports this (it doesn't by default; rely on cache-buster query string in Phase 2.4 if no header support)
  - CF Pages: add `_headers` file at `dist-cf/_headers` with `/version.json` → `Cache-Control: no-cache, max-age=0`. Confirm via curl post-deploy.

## Phase 2 — Core version-check function

- [ ] **2.1** Create `packages/core/src/lib/version-check.ts`:
  - `export type VersionCheckResult = { kind: 'match' | 'drift'; remote: string } | { kind: 'error'; reason: string }`
  - `export async function checkServerVersion(localSha: string, fetchImpl?: typeof fetch): Promise<VersionCheckResult>` — fetches `/version.json?t=<Date.now()>` with `cache: 'no-store'`, parses, returns discriminated result. Never throws.
  - Localdev short-circuit: if `localSha === 'dev'` return `{ kind: 'match', remote: 'dev' }` immediately (no fetch).
- [ ] **2.2** Export from `packages/core/src/index.ts` (`export { checkServerVersion } from './lib/version-check'` + type re-export).
- [ ] **2.3** `pnpm --filter @study-rpg/core build` + `pnpm --filter @study-rpg/core typecheck` pass.
- [ ] **2.4** Manual unit smoke (curl + node REPL or quick test file): verify fetch failure returns `{ kind: 'error' }`, mismatch returns `{ kind: 'drift' }`, match returns `{ kind: 'match' }`. (Skip vitest infra per project policy.)

## Phase 3 — Banner component + hook (一階 + 二階, mirror)

For BOTH `apps/medexam-tw` AND `apps/medexam2-hospital-tw`:

- [ ] **3.1** Create `apps/<app>/src/components/VersionUpdateBanner.tsx` — sticky top banner per design D4. Props: `{ remoteSha7?: string; onReload(): void; onDismiss(): void }`. DEV-mode shows `（<sha7>）` suffix per D7.
- [ ] **3.2** Create `apps/<app>/src/lib/use-version-check.ts` — React hook:
  - On mount: read `localSha = import.meta.env.VITE_COMMIT_SHA || 'dev'`, schedule visibilitychange handler + 30-min setInterval (reset interval on each visibilitychange to dedupe)
  - On check: call `checkServerVersion(localSha)`, set drift state if `kind === 'drift'`, ignore otherwise
  - Read/write `dismissedForSha` from localStorage key `study-rpg.version-banner.dismissed-for-sha`
  - Return `{ showBanner: boolean; remoteSha?: string; onReload(); onDismiss() }`
- [ ] **3.3** Mount `<VersionUpdateBanner />` in `App.tsx` root, gated on `useVersionCheck().showBanner`. Banner sits ABOVE all other content (highest z-index, sticky top).
- [ ] **3.4** Both apps `pnpm typecheck` + `pnpm build` pass.

## Phase 4 — Verify

- [ ] **4.1** Local dev sanity (both apps): `pnpm dev` → banner MUST NOT appear (short-circuit via `localSha === 'dev'`).
- [ ] **4.2** Manual smoke (一階):
  - Build `VITE_COMMIT_SHA=AAA pnpm --filter @study-rpg/medexam-tw build`
  - `npx serve apps/medexam-tw/dist`
  - Load page in browser → banner does NOT appear (localSha = AAA = remoteSha)
  - Edit `apps/medexam-tw/dist/version.json` to `{ "commit": "BBB", ... }`
  - Switch tab away + back → banner SHOULD appear with「重整」 + 「稍後提醒」 + DEV-mode sha suffix
  - Click 「稍後提醒」 → banner hides
  - Switch tab away + back → banner stays hidden (dismissedForSha = BBB matches remote)
  - Edit version.json to `{ "commit": "CCC" }`
  - Switch tab away + back → banner re-appears for CCC
  - Click 「重整」 → page reloads, banner gone
- [ ] **4.3** Same smoke 二階 (`@study-rpg/medexam2-hospital-tw`).
- [ ] **4.4** Chrome MCP preflight + smoke on prod after deploy: `list_connected_browsers` → navigate to `https://med-study-rpg.com/2nd/` → confirm no banner immediately (production state matches) → fetch `/version.json` directly via `javascript_tool` to confirm 200 with valid SHA shape → done.

## Phase 5 — Archive

- [ ] **5.1** `openspec validate add-version-check-banner --strict` pass.
- [ ] **5.2** `/opsx:verify` completeness/correctness/coherence pass.
- [ ] **5.3** Commit ticks + archive folder move (mirror today's existing archive ceremony pattern).
- [ ] **5.4** Merge `track-m2` → `main` (per project.md Sync protocol); push both. Hotfix worktree path optional if owner wants to ship from main directly.
