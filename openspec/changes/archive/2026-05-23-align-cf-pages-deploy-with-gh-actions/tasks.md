## 1. Verify already-shipped artifacts match spec

These artifacts were direct-committed during the 2026-05-22 bake-period unblock; this change retroactively spec-aligns them. Each task confirms the existing file still matches what the delta spec says.

- [x] 1.1 `.github/workflows/deploy-cf-pages.yml` exists and matches `MODIFIED Requirement: Cloudflare Pages deploy target alongside GitHub Pages` (shipped in commits `5abc877` + `22c39c3`)
- [x] 1.2 Workflow uses `workingDirectory: cloudflare/sync-worker` + relative path `../../dist-cf` per the Scenario "Wrangler step runs from cloudflare/sync-worker subdirectory"
- [x] 1.3 Workflow declares `permissions: { contents: read }` + `concurrency: { group: deploy-cf-pages, cancel-in-progress: false }` per the new token-scope requirement
- [x] 1.4 Root `package.json` exposes `build:cf` + `deploy:cf` scripts per the new Local CF Pages deploy fallback requirement (shipped in commit `5abc877`)
- [x] 1.5 First successful run on `main` confirmed: workflow run `26301962134` (commit `5d8de8c`) → CF deployment `145206ee` at 2026-05-22 17:33; bundle hashes flipped to `index-Bdiws_Ot.js` (一階) + `index-CQJLXPR0.js` (二階)

## 2. Sync delta into main specs

- [ ] 2.1 Run `/opsx:archive align-cf-pages-deploy-with-gh-actions` (the slash command runs the sync gate first, asking explicitly before merging the delta into `openspec/specs/deploy-pipeline/spec.md`)
- [ ] 2.2 Verify `openspec/specs/deploy-pipeline/spec.md` post-sync now reads "via a GitHub Actions workflow at `.github/workflows/deploy-cf-pages.yml`" instead of "via the Cloudflare dashboard GitHub integration"
- [ ] 2.3 Verify the two ADDED Requirements ("Cloudflare Pages workflow uses minimum-required permissions and scoped CF API token" + "Local Cloudflare Pages deploy fallback via npm scripts") appear in the main spec
- [ ] 2.4 Run `openspec validate --all` and confirm `change/align-cf-pages-deploy-with-gh-actions` + `spec/deploy-pipeline` both pass

## 3. Document residual deferred work

These follow-ups are NOT in scope for this change but are flagged in design.md Risks/Trade-offs and should be tracked elsewhere:

- [ ] 3.1 Add a project memory note (or scratch handoff) capturing the `cloudflare/wrangler-action@v3` Node 20 deprecation warning — track for v4 upgrade when stable; check Dependabot PR backlog
- [ ] 3.2 Confirm with owner that the local wrangler version (currently 4.92.0 via Homebrew) and the CI wrangler version (auto-installed by `cloudflare/wrangler-action@v3`) drift is acceptable; reconsider if a deploy regresses behavior between local and CI

## 4. Commit + archive

- [ ] 4.1 `git add openspec/changes/align-cf-pages-deploy-with-gh-actions/`
- [ ] 4.2 Commit on `track-m2`: `spec(propose): align-cf-pages-deploy-with-gh-actions — codify shipped GH Actions workflow`
- [ ] 4.3 Owner-confirmed merge `track-m2` → `main` per dual-worktree sync protocol
- [ ] 4.4 Push main; no deploy side-effect expected (this commit only touches `openspec/changes/`)
- [ ] 4.5 After 2.1 syncs the delta into `openspec/specs/`, second commit `spec(archive): merge align-cf-pages-deploy-with-gh-actions` brings the main spec into the archive flow
