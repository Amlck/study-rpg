## Context

`add-connectome-collection` shipped `ConnectomeToastHost.tsx` (file path: `apps/neurons-tw/src/components/SynapseFormationToast.tsx` — file named after first use case but the default export is the host) implementing toast notification for synapse-formation / synapse-strengthening events. Implementation uses:

- A queue (`useState<ToastEntry[]>`)
- Per-entry mount via `.map()` with stable `id` keys
- Inline CSS `animation: connectomeToastIn 0.3s ease-out` referencing a `@keyframes` rule defined in the global stylesheet
- `window.setTimeout` for 8s auto-dismiss
- Fixed top-right positioning with `flexDirection: column` for vertical stacking

`add-neurons-motion-library` shipped a reusable primitives layer providing:

- `<Toast>` primitive (single-instance, top-center, with close button)
- `useRespectsReducedMotion()` hook
- `TOAST_AUTO_DISMISS_MS` constant
- Framer Motion variants pattern

The two designs are deliberately distinct: `<Toast>` is for one-off achievement reveals; `ConnectomeToastHost` is for an event-driven queue. Wrapping `<Toast>` would compromise the queue / multi-toast layout.

## Goals / Non-Goals

**Goals:**

- Replace CSS keyframe animation with Framer Motion `motion.div` variants so `prefers-reduced-motion` can be honored at runtime via React state, not just media-query-level CSS overrides
- Source `TOAST_AUTO_DISMISS_MS` from motion library instead of local 8000 literal (single-source-of-truth for toast timing)
- Demonstrate the partial-consumption pattern for future consumers whose use case doesn't fit `<Toast>` primitive (e.g., future leaderboard rank-up notification stack)
- Keep all behavior visible to user unchanged except: (a) reduced-motion users see fade-only entry; (b) slide direction conceptually equivalent (right→0)

**Non-Goals:**

- **不** wrap with `<Toast>` primitive (queue + top-right layout incompatible with single-instance top-center primitive)
- **不**動 `ConnectomeToastHost` 的 queue / layout / event subscription / copy
- **不**動 motion library spec / API
- **不**加 close button to connectome toast (host design is intentionally pure auto-dismiss + non-blocking)
- **不**改 8000ms 時長值（only sourcing changes — local → imported constant）
- **不**做 visual style 大改（border / background / emoji 都保留）
- **不**處理 toast queue overflow（host 目前無限堆疊；若 > 5 同時可見會擠出畫面，是 separate concern，留 follow-up）

## Decisions

### Decision 1: Per-entry `motion.div` instead of wrapping with `<Toast>` primitive

**Choice**: Each toast entry in the queue renders as `motion.div` with Framer Motion variants directly, not wrapped in `<Toast>` from motion library.

**Why**:
- `<Toast>` is `position: fixed; top: 1.2rem; left: 50%; transform: translateX(-50%);` — top-center single instance
- ConnectomeToastHost stacks multiple toasts vertically at top-right with `flexDirection: column; gap`
- Wrapping `<Toast>` would force every connectome toast to top-center, breaking the stack visualization
- Per-entry `motion.div` preserves the host's layout authority while still consuming motion library's hook + constant
- Validates the "partial consumption" pattern — motion library primitives don't have to be all-or-nothing

**Alternative considered**:

- Wrap each entry with `<Toast>` and override position via prop — would need extending `<Toast>` API (rejected per refactor scope: only-consume-not-extend)
- Wrap each entry with `<Toast>` accepting current top-center placement — breaks stack UX (rejected)
- Refactor host into single-toast mode and route events through a queue → display-one-at-a-time → would change UX (rejected, separate decision)

### Decision 2: Slide-from-right (x: +400 → 0) instead of slide-from-top

**Choice**: Framer Motion `initial={{ x: 400, opacity: 0 }}` `animate={{ x: 0, opacity: 1 }}`.

**Why**:
- Existing CSS keyframe `connectomeToastIn` slides from right (`transform: translateX(100%) → translateX(0)`)
- Preserve user's existing visual expectation; this refactor should be visually equivalent + a11y-improved, not visually disruptive
- Top-right anchored toast naturally slides from right (off-screen edge nearest)
- `<Toast>` primitive's slide-from-top is for top-center context — direction depends on edge proximity

**Alternative considered**:

- Slide from top (match `<Toast>` primitive) — visually inconsistent for top-right anchor (rejected)
- Scale-in only — less directional cue (rejected)
- Fade-only always — loses motion polish (rejected; reserved for reduced-motion fallback)

### Decision 3: Reduced-motion fallback = opacity fade only (no x translation)

**Choice**: When `useRespectsReducedMotion()` returns true, set `initial={{ opacity: 0 }}` `animate={{ opacity: 1 }}` (drop the `x` axis).

**Why**:
- Per WCAG 2.1 and motion library convention (Decision 4 in `add-neurons-motion-library/design.md`)
- Opacity fade still cues state change visually without vestibular-sensitive motion
- 200ms duration vs 300ms standard — slightly faster to feel "snappier" in reduced mode
- Auto-dismiss timing (8000ms) unchanged — only entry animation degrades

### Decision 4: Replace local `TOAST_DURATION_MS = 8000` with imported `TOAST_AUTO_DISMISS_MS`

**Choice**: Delete local const, import from `'../lib/motion'`.

**Why**:
- Single source of truth for toast auto-dismiss
- If future tuning needs (e.g., 6s or 10s) the motion library is the canonical place; all consumers update together
- Connectome-specific override would be possible via prop pattern, but YAGNI — current value matches library default

## Risks / Trade-offs

- **[CSS keyframe `connectomeToastIn` might be referenced from theme global.css and orphaned post-refactor]** → Audit theme-pixel-neurons global.css during apply; if the keyframe is defined there + unused after this refactor, delete it. Per `coding_principles.md` rule 3, orphan dead code I created vs existing — but this CSS keyframe was added by the previous change, not my code. I'll only flag it if found, not aggressively remove. → 接受
- **[Reduced-motion fallback timing differs from full animation]** → 200ms reduced-motion vs 300ms standard — barely perceptible difference; matches motion library convention (D4 in library design) → 接受
- **[Stack overflow: > 5 simultaneous toasts spill off-screen at small viewports]** → Pre-existing limitation, not introduced by refactor. If user reports, add `slice(-5)` to display. Out of scope. → 接受
- **[StrictMode double-mount + Framer Motion variant transitions]** → React 18 StrictMode unmounts → remounts in dev. Framer Motion handles this correctly per library convention. Existing `motion.div` consumers in motion library demo route confirmed working → 接受
- **[Visual regression — slide-from-right looks subtly different in Framer Motion vs CSS keyframe]** → Both go from off-screen-right to anchor; subjective polish difference. If owner sees regression, calibrate `duration` or `ease` in apply step before archive. → 接受 (foreground visual check will catch)

## Migration Plan

純 UI-layer refactor. Single file edit + spec update:

1. Edit `apps/neurons-tw/src/components/SynapseFormationToast.tsx`:
   - Add imports: `motion` from `framer-motion`; `useRespectsReducedMotion`, `TOAST_AUTO_DISMISS_MS` from `'../lib/motion'`
   - Replace `const TOAST_DURATION_MS = 8000` reference with `TOAST_AUTO_DISMISS_MS`
   - Replace inline `animation: connectomeToastIn 0.3s ease-out` style with `motion.div` variants
   - Wire `useRespectsReducedMotion()` for soft-mode variant dispatch
2. Update `openspec/specs/connectome-collection/spec.md` Requirement 8 (Synapse formation toast) with MODIFIED narrative + 3 new scenarios — done via change's specs/ delta
3. (Optional but recommended) Audit `packages/theme-pixel-neurons/styles/global.css` for orphaned `@keyframes connectomeToastIn` rule; delete if unused
4. Dev smoke: `pnpm --filter @study-rpg/neurons-tw dev` + visit `/connectome` + trigger toast via `ConnectomeDebugPanel` (+1 → +5 correct + advance day setup)
5. Chrome MCP SPA preflight (no full smoke needed since route + load already validated in earlier change)
6. typecheck (`pnpm --filter @study-rpg/neurons-tw typecheck`)
7. openspec validate add-neurons-motion-library — wait this is wrong, validate THIS change
8. `openspec validate refactor-connectome-toast-to-motion-library --strict`
9. `/verify` (user-driven)
10. `/opsx:archive refactor-connectome-toast-to-motion-library`

**Rollback**: revert single file edit + revert spec MODIFIED requirement. No data risk.

## Open Questions

- **Should the orphan CSS audit be aggressive (delete keyframe) or conservative (flag only)?** Proposal: conservative — flag in apply summary, let owner decide. Coding principle 3 says "無關 dead code 提一下別刪". The keyframe was added by another change, not mine, so it counts as "無關" by that rule.
- **Should we also bring in motion library Framer Motion `AnimatePresence` for exit animation when toasts auto-dismiss?** Currently toasts disappear without exit animation (just removed from React state → React unmounts → DOM removed). Adding `AnimatePresence` + `exit={{ opacity: 0, x: 100 }}` would be a polished bonus. Proposal: yes, add it — minor additional code, makes exit feel deliberate.
- **Should reduced-motion duration be 200ms or match standard 300ms?** Proposal: 200ms per motion library convention. If owner prefers consistency at 300ms, easy tuning in apply.
