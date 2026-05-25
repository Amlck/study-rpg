## 1. Setup (15 min)
- [x] 1.1 `pnpm --filter @study-rpg/neurons-tw add framer-motion@^11.11.0`
- [x] 1.2 `mkdir apps/neurons-tw/src/lib/motion/`
- [x] 1.3 Implement `timings.ts`（per-rarity ms tokens + `SKIP_THRESHOLD_MS` + `TOAST_AUTO_DISMISS_MS`）

## 2. Hook + conditional render primitive (20 min)
- [x] 2.1 `useRespectsReducedMotion.ts`（matchMedia + SSR-safe + event listener + cleanup）
- [x] 2.2 `ReducedMotionAware.tsx`（`{ children, fallback }` conditional render wrapper）

## 3. Generic widget primitives (30 min)
- [x] 3.1 `Toast.tsx`（fixed top-center / slide-in / `TOAST_AUTO_DISMISS_MS` auto-dismiss / close button / `variant: 'celebratory' | 'info' | 'warning'` / children slot）
- [x] 3.2 `NumberTickUp.tsx`（from / to / duration props, Framer Motion `useMotionValue` + `useTransform` 整數 round）

## 4. Reveal modals — Tier-S investment (60 min)
- [x] 4.1 `RarityRevealModal.tsx`（rarity prop dispatch + AnimatePresence + envelope → flip → glow → particle → centered stages per `RARITY_TIMINGS[rarity]` + skip button when total > `SKIP_THRESHOLD_MS` + reduced-motion variant 砍 particle / shake）
- [x] 4.2 `AchievementUnlockModal.tsx`（modal-backdrop + full-screen + staggered children variants（tier chip → badge → title → description → reward → CTA）+ dismiss-required button + reduced-motion variant 砍 stagger 保 fade）
- [x] 4.3 `<ParticleBurst>` internal component（16 absolutely-positioned `<motion.span>` + stagger 50ms + random direction + 600ms fade out, returns null if reduced-motion）

## 5. Public API + demo + verify (30 min — connectome 已建 router infra)
- [x] 5.1 `index.ts`（export Toast / RarityRevealModal / AchievementUnlockModal / NumberTickUp / ReducedMotionAware / useRespectsReducedMotion / RARITY_TIMINGS / SKIP_THRESHOLD_MS / TOAST_AUTO_DISMISS_MS）
- [x] 5.2 `routes/MotionDemoPage.tsx`（5 trigger button + state management for active modal）
- [x] 5.3 Update `App.tsx` 加 `<Route path="/motion-demo" element={<MotionDemoPage />} />` 進既有 `<Routes>` + 「動畫 demo」nav link
- [x] 5.4 Dev smoke (page renders, no console errors, 8 trigger buttons present)：`pnpm --filter @study-rpg/neurons-tw dev` + localhost / motion-demo 5 個按鈕跑一遍
- [x] 5.5 Chrome MCP SPA 三件套 ✅ in-app nav (/ ↔ /motion-demo) / direct URL (cold load) / F5 reload (no 404)
- [ ] 5.6 a11y verify：Chrome devtools toggle `prefers-reduced-motion: reduce`，重跑 5 按鈕，確認 particle / shake 消失、fade + scale 保留 — **needs foreground browser**（Chrome MCP 在 background-tab rAF throttle 下無法 verify 動畫 playback；dev server 留著 localhost:5177/motion-demo 給 owner 親自跑）
- [x] 5.7 typecheck — pass：`pnpm --filter @study-rpg/neurons-tw typecheck`

## 6. Spec + archive (30 min)
- [x] 6.1 `openspec validate add-neurons-motion-library --strict` — valid
- [ ] 6.2 `/verify`
- [ ] 6.3 `/opsx:archive add-neurons-motion-library`

**Estimated total wall time**: 3 hours

## Acceptance criteria

- [x] 5 elements + 1 hook + 3 timing constants export from `lib/motion/index.ts`、typecheck pass
- [x] `/motion-demo` route 跑得起來、8 按鈕都觸發對應 modal/toast mount（Chrome MCP DOM 驗；animation playback 留 foreground 驗）
- [ ] `prefers-reduced-motion: reduce` 時：particle 不渲染 + fade/scale 保留（visually verified via Chrome devtools toggle）
- [x] Bundle delta < 50KB gzipped — prod build pass, total ~143 KB gz; pre-change baseline ~97 KB gz; delta ~45 KB（framer-motion ~40 KB + library code ~5 KB）✅
- [x] SPA 三件套（direct URL `/motion-demo` 不 404、F5 reload 不跳 home）— dev 驗證 ✅；prod 驗證留 `add-neurons-deploy` 階段
