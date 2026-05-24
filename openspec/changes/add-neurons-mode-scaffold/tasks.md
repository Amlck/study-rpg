## 1. Preflight verification (worktree + branch exist)

- [x] 1.1 Verify `~/coding-scratch/study-rpg-neurons/` worktree exists on `track-neurons` branch via `git worktree list`
- [x] 1.2 Verify `pnpm install` from new worktree root completes without error (workspace recognized)
- [x] 1.3 Verify existing 一階 / 二階 still typecheck before any scaffold work: `cd ~/coding-scratch/study-rpg-neurons && pnpm -r typecheck` (baseline snapshot)

## 2. Create `packages/content-neurons-tw/` scaffold

- [x] 2.1 Create directory `packages/content-neurons-tw/` with `src/`, `dist/` (empty, gitignored), `README.md`
- [x] 2.2 Add `packages/content-neurons-tw/package.json` declaring `@study-rpg/content-neurons-tw` workspace package; deps `@study-rpg/core` (workspace:^); scripts `build` + `typecheck`
- [x] 2.3 Add `packages/content-neurons-tw/tsconfig.json` extending repo base config
- [x] 2.4 Add `packages/content-neurons-tw/src/index.ts` with placeholder `getContentPack()` export that returns a stub `ContentPack` satisfying `content-pack-contract` minimums (empty subjects + empty questions + meta with locale/credits placeholder)
- [x] 2.5 Add `packages/content-neurons-tw/README.md` (one paragraph describing intent; pointer to follow-up `wire-neurons-content-and-theme` change for actual ingestion)
- [x] 2.6 Add `packages/content-neurons-tw/.gitignore` excluding `dist/` + `node_modules/`

## 3. Create `packages/theme-pixel-neurons/` scaffold

- [x] 3.1 Create directory `packages/theme-pixel-neurons/` with `src/`, `sprites/` (empty), `styles/`, `README.md`
- [x] 3.2 Add `packages/theme-pixel-neurons/package.json` declaring `@study-rpg/theme-pixel-neurons` workspace package; deps `@study-rpg/core` (workspace:^); scripts `build` + `typecheck`
- [x] 3.3 Add `packages/theme-pixel-neurons/tsconfig.json` extending repo base config
- [x] 3.4 Add `packages/theme-pixel-neurons/src/index.ts` exporting placeholder `THEME_PIXEL_NEURONS` satisfying `theme-pack-contract` minimums (meta with id/displayName/style:'pixel'; empty cssVars / fonts / sprites / itemCatalog; designMd stub)
- [x] 3.5 Add `packages/theme-pixel-neurons/src/sprites.ts` with empty `SPRITES_MAP` registry (Vite glob pattern stubbed, no sprite files yet)
- [x] 3.6 Add `packages/theme-pixel-neurons/styles/global.css` with neutral fallback CSS variables (no neuron-specific palette yet — deferred to `wire-neurons-content-and-theme`)
- [x] 3.7 Add `packages/theme-pixel-neurons/DESIGN.md` stub (header + section placeholders; will be expanded in follow-up changes)
- [x] 3.8 Add `packages/theme-pixel-neurons/README.md` (one paragraph; pointer to follow-up changes)
- [x] 3.9 Add `packages/theme-pixel-neurons/.gitignore` excluding `dist/` + `node_modules/`

## 4. Create `apps/neurons-tw/` Vite shell

- [x] 4.1 Create directory `apps/neurons-tw/` with `src/`, `public/`, `index.html`
- [x] 4.2 Add `apps/neurons-tw/package.json` declaring `@study-rpg/neurons-tw` private app; deps `@study-rpg/core` + `@study-rpg/content-neurons-tw` + `@study-rpg/theme-pixel-neurons` (all `workspace:*`) + `react ^18` + `react-dom ^18` + `vite ^5` + `typescript ^5.4`; scripts `dev` (port 5175) + `build` + `typecheck`
- [x] 4.3 Add `apps/neurons-tw/tsconfig.json` extending repo base config
- [x] 4.4 Add `apps/neurons-tw/vite.config.ts` with port 5175 + base path placeholder (deferred actual deploy base in `add-neurons-deploy`)
- [x] 4.5 Add `apps/neurons-tw/index.html` with placeholder title `neurons-tw — Long-term Potentiation Edition (scaffold)`
- [x] 4.6 Add `apps/neurons-tw/src/main.tsx` importing React + ReactDOM + `@study-rpg/theme-pixel-neurons/styles/global.css` + mounting `<App />`
- [x] 4.7 Add `apps/neurons-tw/src/App.tsx` returning a single `<h1>` placeholder displaying app title + a paragraph linking to the umbrella `neurons-mode` spec in openspec/specs/ (no game logic, no routes, no Dexie, no auth)
- [x] 4.8 Add `apps/neurons-tw/README.md` (one paragraph; pointer to follow-up changes for actual content / theme / game wiring)
- [x] 4.9 Add `apps/neurons-tw/.gitignore` excluding `dist/` + `node_modules/`

## 5. Wire root package.json + workspace

- [x] 5.1 Add `dev:neurons` script to root `package.json` aliasing `pnpm --filter @study-rpg/neurons-tw dev`
- [x] 5.2 Add `build:neurons` script aliasing `pnpm --filter @study-rpg/neurons-tw build`
- [x] 5.3 Verify root `pnpm-workspace.yaml` glob `packages/*` + `apps/*` already covers new entries (no edit expected, just verify)
- [x] 5.4 Run `pnpm install` from worktree root and confirm 8 workspace packages recognized (5 existing + 3 new)

## 6. Update `openspec/project.md` Roadmap + maintenance-mode declaration

- [x] 6.1 Add new Roadmap row "M_3rd — neurons-tw dogfood track" parallel to M_2nd; state status 🚧 起步 (scaffold landed)
- [x] 6.2 Add Roadmap row note: medexam-tw enters maintenance mode (no new features, critical bug fixes continue via L1 hotfix worktree)
- [x] 6.3 Update Development Workflow section: dual-worktree → triple-worktree; add `study-rpg-neurons` / `track-neurons` row to worktree table
- [x] 6.4 Add Sync protocol entry: `git merge track-neurons` for post-archive sync to main
- [x] 6.5 Update Naming convention section: changes targeting neurons app SHALL contain `neurons` / `connectome` keyword in change id

## 7. Smoke verify

- [x] 7.1 Run `pnpm -r typecheck` from worktree root, confirm 0 errors across 8 packages
- [x] 7.2 Run `pnpm --filter @study-rpg/neurons-tw dev` in background, navigate Chrome MCP to `http://localhost:5175/` (per `~/.claude/imports/chrome_mcp_preflight.md`), confirm placeholder title renders + 0 console errors
- [x] 7.3 Run `pnpm --filter @study-rpg/medexam-tw dev` in background, confirm 一階 still boots at `http://localhost:5173/study-rpg/` with no regression
- [x] 7.4 Run `pnpm --filter @study-rpg/medexam2-hospital-tw dev` in background, confirm 二階 still boots at `http://localhost:5174/study-rpg/hospital/` with no regression
- [x] 7.5 Run `openspec validate add-neurons-mode-scaffold` and confirm passing
- [x] 7.6 Run `openspec validate --strict` for repo-wide check (no cross-spec breakage from the new umbrella capability)

## 8. Pre-archive review

- [x] 8.1 Review every new file ≤ 50 lines (scaffold should be tiny — flag any larger as scope creep)
- [x] 8.2 Grep new files for accidental game-logic leakage (`gacha` / `synapse` / `connectome` / `LTP` etc. should appear ONLY in spec / README / proposal; should NOT appear in actual code beyond placeholder names)
- [x] 8.3 Confirm `apps/medexam-tw/` and `apps/medexam2-hospital-tw/` source trees are unchanged from baseline (regression-safety)
- [x] 8.4 Stage files for commit explicitly (per `~/.claude/imports/multi_agent_git_safety.md`); confirm `git diff --cached --name-status` shows only intended new paths; user confirm before commit
