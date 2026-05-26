## 1. Motion library — SYNAPSE_TIMINGS export

- [x] 1.1 Add `SYNAPSE_TIMINGS` const to `apps/neurons-tw/src/lib/motion/index.ts` (or wherever `RARITY_TIMINGS` lives) with default values `{ formation: 600, strengthen: 400, decay: 600, slotUnlock: 500 }`
- [x] 1.2 Export the new const from the motion library barrel file
- [x] 1.3 Run `pnpm --filter @study-rpg/neurons-tw typecheck` — no regressions

## 2. Pure layout function (no React)

- [x] 2.1 Create `apps/neurons-tw/src/components/connectome/layout.ts` with `computeLayout({ subjects, mode })` returning `{ rootPos, branchPos, leafPos, edgePathBetween }`
- [x] 2.2 Constants for spacing (root-to-branch radius, branch-to-leaf radius, leaf-stride) tunable at top of file
- [x] 2.3 Edge path generator returns cubic Bézier path string for any (familyId, familyId) cross-NT-branch pair
- [x] 2.4 Unit-test mentally: pump 11 subjects through both modes, verify branches don't overlap, leaves stay inside viewBox

## 3. SVG components (leaf-first build order)

- [x] 3.1 `FamilyNode.tsx` — accepts `{ family, ap, unlockedSlots, firedToday, pos }`; renders `<g>` with sprite (via `artKey`), text label, AP chip, firedToday halo
- [x] 3.2 `BranchRoot.tsx` — accepts `{ ntBranch, color, pos }`; renders `<g>` with sub-root label + small color marker
- [x] 3.3 `SynapseEdge.tsx` — accepts `{ pathD, state, eventKey }`; renders `<motion.path pathLength="1">` with state-driven stroke styling; uses `useRespectsReducedMotion()` to short-circuit `transition.duration` to 0
- [x] 3.4 `ConnectomeTreeSvg.tsx` — outer component: subscribes to `connectome.*` events, calls `loadConnectome()` on mount + on event, computes layout, maps snapshot.synapses → `<SynapseEdge>` and pack.subjects → `<FamilyNode>`
- [x] 3.5 ConnectomeTreeSvg wires SVG `viewBox` + container CSS media query to switch between horizontal (≥ 768px) and vertical (< 768px) layouts without React conditional re-mount

## 4. Route integration

- [x] 4.1 In `apps/neurons-tw/src/routes/ConnectomePage.tsx`, render `<ConnectomeTreeSvg pack={pack} />` at the top of the page (above the existing branch grid + table sections)
- [x] 4.2 Keep the existing branch grid + synapse table + debug panel untouched — they sit below the tree as supplemental detail
- [x] 4.3 Adjust top-level page header / padding so the tree has breathing room above the supplemental section

## 5. Animation wiring

- [x] 5.1 SynapseEdge: when `eventKey` matches `connectome.synapseFormed`, set initial `pathLength: 0`, animate to `1` over `SYNAPSE_TIMINGS.formation` ms with ease-out
- [x] 5.2 SynapseEdge: when state transitions `weak → strong` or `strong → weak`, animate stroke width + color over `SYNAPSE_TIMINGS.strengthen` (up) or `SYNAPSE_TIMINGS.decay` (down) ms
- [x] 5.3 SynapseEdge: when state transitions `weak → dormant`, animate opacity 1 → 0 over `SYNAPSE_TIMINGS.decay` ms; use `onAnimationComplete` to remove edge from React-rendered list
- [x] 5.4 FamilyNode: when `connectome.variantSlotUnlocked` event fires for matching `familyId`, trigger a one-shot scale pulse 1 → 1.15 → 1 + halo expand over `SYNAPSE_TIMINGS.slotUnlock` ms
- [x] 5.5 All animation handlers wrap in `useRespectsReducedMotion()` check — reduced motion = set `transition.duration: 0` (instant) but state styling still applies

## 6. /motion-demo route — Synapse tree section

- [x] 6.1 Add a new section to `apps/neurons-tw/src/routes/MotionDemoPage.tsx` titled `Synapse tree animations`
- [x] 6.2 Render a 2-leaf static SVG demo with one edge between them
- [x] 6.3 Add 4 trigger buttons: `formation` / `strengthen` / `decay` / `slotUnlock`, each pumping the demo state through the corresponding animation
- [ ] 6.4 Verify reduced-motion gating: with browser DevTools "Emulate prefers-reduced-motion: reduce" toggled on, each trigger results in instant state change with no animation

## 7. Smoke verification (Chrome MCP, per CLAUDE.md preflight)

- [ ] 7.1 `mcp__Claude_in_Chrome__list_connected_browsers` — preflight (no fallback to computer-use per CLAUDE.md)
- [ ] 7.2 Start dev server `pnpm --filter @study-rpg/neurons-tw dev`
- [ ] 7.3 `/connectome` route — verify tree renders 4 branches + 11 leaves at desktop width; resize viewport to < 768px and verify vertical layout takes over without DOM remount
- [ ] 7.4 Use `ConnectomeDebugPanel` to fire `formSynapse('藥理學', '解剖學')` — verify edge draws in with pathLength animation
- [ ] 7.5 Fire `strengthenSynapse` — verify stroke morph
- [ ] 7.6 Fire `decaySynapse` weak→dormant — verify fade-out + edge removed from DOM
- [ ] 7.7 Fire `unlockVariantSlot('藥理學', 0)` — verify leaf pulse
- [ ] 7.8 Toggle browser DevTools "Emulate prefers-reduced-motion: reduce" → repeat 7.4–7.7 → verify all animations skip but state styling still updates
- [ ] 7.9 `/motion-demo` route — verify Synapse tree section renders + all 4 triggers work + reduced-motion fallback works
- [ ] 7.10 Check browser console — no React warnings, no SVG warnings, no Framer Motion warnings

## 8. Build verification

- [x] 8.1 `pnpm --filter @study-rpg/neurons-tw build` — clean build no errors
- [x] 8.2 `pnpm -r typecheck` — no regressions across packages
- [x] 8.3 Verify CF Pages workflow file is **NOT modified** (this change does NOT add a new app — same-app polish only — per design.md D8); confirm `git diff` does not touch `.github/workflows/deploy-cf-pages.yml` or `scripts/build-cf-pages-dist.mjs`

## 9. SPA route 三件套 (per CLAUDE.md astro_layout_pitfalls.md / SPA route guidance)

- [ ] 9.1 In-app navigation to `/connectome` works (click from Overview)
- [ ] 9.2 Direct URL navigation to `/connectome` works (F5 reload — Vite SPA fallback)
- [ ] 9.3 Direct URL navigation in production behavior — verify via Cloudflare Pages preview (last in prod after merge per CLAUDE.md rule)

## 10. Pre-archive checklist

- [ ] 10.1 `openspec validate add-connectome-svg-tree --strict` — passes
- [ ] 10.2 `/simplify` skill run (global skill) — no obvious over-engineering or duplication
- [ ] 10.3 `/verify` skill run — end-to-end Chrome MCP verification
- [ ] 10.4 Owner-confirmed commit via auto-git skill (template: `spec(impl): add-connectome-svg-tree — polished Linnean tree + 4 animation kinds + SYNAPSE_TIMINGS token`)
- [ ] 10.5 Push and confirm BOTH GH Pages + CF Pages workflows green via `gh run list --branch track-neurons --limit 5`
- [ ] 10.6 Merge track-neurons → main via curator-confirmed `git merge track-neurons`
- [ ] 10.7 Run `/opsx:archive add-connectome-svg-tree` and confirm delta merges into `openspec/specs/connectome-collection/spec.md` + `openspec/specs/neurons-motion-library/spec.md`
- [ ] 10.8 Update `openspec/project.md` Roadmap row for M_3rd (or note new ext milestone) if needed
