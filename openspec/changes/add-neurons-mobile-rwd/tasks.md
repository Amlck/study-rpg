## 1. Measure (before writing any CSS)

- [ ] 1.1 Confirm whether `apps/neurons-tw` already imports any CSS at entry (reset/index.css) — `grep -rn "import.*\.css" apps/neurons-tw/src/main.tsx apps/neurons-tw/src/App.tsx`
- [ ] 1.2 Chrome MCP (per chrome_mcp_preflight): boot dev (`localhost:5184`), open `OverviewPage`, run the class-override RWD probe at 375px on the top-nav → record which items overflow / clip and by how many px (quantify the actual failure, don't assume)
- [ ] 1.3 Read `apps/medexam2-hospital-tw/src/styles.css` — extract the verbatim nav-scroll + fade-mask + overscroll-lock + single-column rules to mirror

## 2. Stylesheet scaffold

- [ ] 2.1 Create `apps/neurons-tw/src/styles.css` with the 480 / 768 breakpoint structure (mirror 二階)
- [ ] 2.2 Import it once at the app entry (`main.tsx`); confirm it loads (dev network shows the css)

## 3. Nav (OverviewPage top-nav)

- [ ] 3.1 Add `className` to the nav strip; move the responsive properties (flex/wrap/overflow-x) from inline `THEME_PIXEL_NEURONS` into the CSS base rule; **delete those exact properties from the inline object** (inline beats CSS — Decision 1)
- [ ] 3.2 `@media (max-width: 480px)`: horizontal-scroll + `-webkit-mask-image` fade affordance + thin scrollbar
- [ ] 3.3 Verify via `getComputedStyle` that the CSS value (not the old inline) now applies at 375px

## 4. FamilyPicker cards

- [ ] 4.1 Add `className` to the card grid; move `gridTemplateColumns` out of inline into CSS base
- [ ] 4.2 `@media (max-width: 768px)`: `grid-template-columns: 1fr` (single column)

## 5. Overlays (4)

- [ ] 5.1 Confirm modals expose a `.modal-backdrop`-equivalent class; add one if absent
- [ ] 5.2 Add `body:has(.modal-backdrop){overflow:hidden}` + `overscroll-behavior-y:none` to styles.css
- [ ] 5.3 QuizModal / DmnDrawModal / VariantUnlockModal: className + `max-width:100vw` (minus margin) + inner `overflow-y:auto; max-height` so long content scrolls inside; move responsive width props out of inline
- [ ] 5.4 Achievement toast: ensure it fits 375px viewport with margins (no horizontal overflow)

## 6. Verify (Chrome MCP class-override probe — per chrome_mcp_rwd_probe.md, NOT resize_window)

- [ ] 6.1 Probe at 375 / 414 / 600: nav no overflow + all items reachable; family cards single-column; QuizModal/DmnDrawModal/VariantUnlockModal fit + scroll internally; toast fits
- [ ] 6.2 Desktop-unchanged check: at ≥ 768px (1024px), `getComputedStyle` + visual confirm nav/cards/overlays render identically to pre-change (the `@media` rules don't apply)
- [ ] 6.3 `read_console_messages onlyErrors` clean
- [ ] 6.4 typecheck: `pnpm --filter @study-rpg/neurons-tw typecheck`
- [ ] 6.5 build: `pnpm --filter @study-rpg/neurons-tw build` (styles.css bundles)
- [ ] 6.6 `openspec validate add-neurons-mobile-rwd --strict`

## 7. Archive

- [ ] 7.1 `/verify` (optional, user-driven)
- [ ] 7.2 `/opsx:archive add-neurons-mobile-rwd`
- [ ] 7.3 `openspec validate --all --strict` confirm specs valid post-merge

## Acceptance criteria

- [ ] `apps/neurons-tw/src/styles.css` exists + imported at entry
- [ ] At 375px: OverviewPage has no horizontal page overflow; nav items all reachable; FamilyPicker single-column
- [ ] At ≤ 480px: nav horizontal-scrolls with fade affordance
- [ ] All 4 overlays fit 375px without horizontal overflow; body locks scroll when a modal is open
- [ ] Desktop (≥ 768px) layout visually unchanged from pre-change
- [ ] Only media-sensitive properties migrated out of inline (no full rewrite); connectome + list pages untouched
- [ ] typecheck + build green; `validate --strict` passes
