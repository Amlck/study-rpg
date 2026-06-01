## 1. Refactor SynapseFormationToast.tsx (20 min)

- [x] 1.1 Add imports at top of file:
  - `import { motion } from 'framer-motion'`
  - `import { useRespectsReducedMotion, TOAST_AUTO_DISMISS_MS } from '../lib/motion'`
- [x] 1.2 Remove `const TOAST_DURATION_MS = 8000` local constant
- [x] 1.3 Inside `ConnectomeToastHost`, call `const reduced = useRespectsReducedMotion()` at hook position
- [x] 1.4 Replace `setTimeout(..., TOAST_DURATION_MS)` with `setTimeout(..., TOAST_AUTO_DISMISS_MS)`
- [x] 1.5 Replace `<div key={t.id} style={toastStyle}>` with `<motion.div key={t.id} initial={...} animate={...} transition={{ duration: reduced ? 0.2 : 0.3 }} style={{ ...toastStyle, animation: undefined }}>` — variants depend on `reduced`:
  - Standard: `initial={{ x: 400, opacity: 0 }}`, `animate={{ x: 0, opacity: 1 }}`
  - Reduced: `initial={{ opacity: 0 }}`, `animate={{ opacity: 1 }}`
- [x] 1.6 Remove `animation: 'connectomeToastIn 0.3s ease-out'` from `toastStyle` const (no longer needed)
- [x] 1.7 (Bonus per Open Question 2) Wrap toast list with `<AnimatePresence>` and add `exit={{ opacity: 0, x: reduced ? 0 : 100 }}` for exit animation

## 2. Spec sync (5 min)

- [x] 2.1 `openspec validate refactor-connectome-toast-to-motion-library --strict` ✅ pass

## 3. Verify (20 min)

- [x] 3.1 typecheck ✅ pass：`pnpm --filter @study-rpg/neurons-tw typecheck`
- [ ] 3.2 Dev smoke：`pnpm --filter @study-rpg/neurons-tw dev` + navigate `/connectome` + click ConnectomeDebugPanel buttons to trigger 1-2 synapse formations + observe toast slide-in from right
- [ ] 3.3 a11y verify (foreground only — Chrome MCP backgrounds tab + rAF-paused): Chrome devtools → Rendering → emulate `prefers-reduced-motion: reduce` → trigger another synapse → verify toast appears with opacity fade only, no x translation
- [x] 3.4 Audit `packages/theme-pixel-neurons/styles/global.css` for orphaned `@keyframes connectomeToastIn` — **finding: keyframe not defined anywhere in repo. Previous inline `animation:` reference was a no-op.** No cleanup needed; this refactor inadvertently fixes a non-functional animation by replacing it with real Framer Motion.

## 4. Archive (5 min)

- [ ] 4.1 `/verify` (user-driven; can skip if dev smoke already gave confidence)
- [ ] 4.2 `/opsx:archive refactor-connectome-toast-to-motion-library`
- [ ] 4.3 `openspec validate --all --strict` — confirm 54+ specs all valid post-merge

**Estimated total wall time**: 50 min

## Acceptance criteria

- [x] `apps/neurons-tw/src/components/SynapseFormationToast.tsx` no longer contains the literal `8000` or any local `TOAST_DURATION_MS` const (replaced by import)
- [x] `apps/neurons-tw/src/components/SynapseFormationToast.tsx` imports `motion` from `framer-motion` and uses `motion.div` in render
- [x] `apps/neurons-tw/src/components/SynapseFormationToast.tsx` consumes `useRespectsReducedMotion` hook
- [x] typecheck pass
- [x] `openspec validate refactor-connectome-toast-to-motion-library --strict` pass
- [ ] Visual: in foreground, toast slides from right (standard) or fades only (reduced-motion)
