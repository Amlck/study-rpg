## Context

`apps/neurons-tw` 在 `add-connectome-collection` ship 完後有了 minimal app baseline：`<BrowserRouter>` + `<Routes>` + 2 個 route（`/` overview + `/connectome` stub + debug panel）+ Dexie v1 + 5 個 connectome engine module。但動畫元件貧弱：`SynapseFormationToast.tsx` 走 mirror 二階 `AchievementUnlockToast` 的 inline 實作（純 React + CSS class、零 Framer Motion）。

Roadmap 後續 5 個 change（`wire-neuron-variant-gacha` / `wire-neuron-family-mastery` / `add-neurons-leaderboard` / `add-neurons-achievements` / 未來 `wire-quiz-runner-neurons`）都需要 modal / toast / reveal 動畫；若每條 change 自己實作會走樣，sister worktree（`medexam2-hospital-tw`）的元件目前完全沒 Framer Motion 是現成反例（沒有共用 library 結果動畫全部缺席）。

設計收斂依據：本 session 跑 `grill-me` Quick mode 5 facets + 派 Explore agent 掃 8 個開源 web 動畫 repo（Framer Motion / react-spring / Popmotion / Rive / melonJS / Crafty / rc-animate / Valtio），詳見 `~/.claude/scratch/grilled-neurons-ui-animation-2026-05-25.md`。

## Goals / Non-Goals

**Goals:**

- 提供 5 個 reusable motion primitive（Toast / RarityRevealModal / AchievementUnlockModal / NumberTickUp / ReducedMotionAware）供未來 5+ change 直接 consume
- per-rarity timing tokens（ms 為單位）讓 gacha / achievement consumer 統一節奏，不靠各自 magic number
- `useRespectsReducedMotion` hook + soft mode 預設（fade + scale 保留，particle / shake / parallax 砍掉）
- Self-verify demo route（`/motion-demo`）讓本 change apply 不依賴 future capability ship 即可驗證
- 維持 vibe-coding 親和：純 Framer Motion + CSS keyframes、零新 npm dep、bundle delta < 50KB

**Non-Goals:**

- **不**做任何 capability 的 wiring（gacha / achievement / connectome / leaderboard 各自 own consumption）
- **不**下沉到 `packages/theme-pixel-neurons/`（per Decision 1）
- **不**裝 lottie-react / canvas-confetti / GSAP / Rive / Popmotion / Valtio
- **不**處理 P1 抽卡的 confetti 爆破（若 future gacha capability 需要再開 micro-change 加 canvas-confetti 4KB）
- **不**做 mobile haptic feedback / sound cue（純視覺）
- **不**處理 SVG/Canvas 連線動畫（connectome 的 polished tree view 由 follow-up `add-neurons-connectome-tree-view` own）
- **不** own connectome 的 `SynapseFormationToast.tsx` 元件本身（已 land、connectome capability 範圍）

## Decisions

### Decision 1: Motion library 住 `apps/neurons-tw/src/lib/motion/`，不下沉到 `packages/theme-pixel-neurons/`

**Choice**: 元件 + hook 全部住 app 層子目錄 `lib/motion/`。

**Why**:
- `packages/theme-pixel-neurons/` 目前是純 data package（cssVars + items + cosmetics + sprites + skillTree），沒 React peerDep
- 加 React component 進去意味著 package 變成 hybrid data + UI lib，需要加 react / framer-motion 兩個 peerDep，違反「theme package = design token + data only」既有慣例（`theme-pixel-medical` / `theme-pixel-hospital` 都是純 data）
- Mirror `apps/neurons-tw/src/lib/connectome/` app-layer 慣例（connectome 設計時也基於相同理由不下沉 core）
- YAGNI：目前只 neurons-tw consume；未來若 medexam-tw / medexam2-hospital-tw 也想用同一套 motion library，再開 change 抽到 `packages/study-rpg-motion-primitives/`

**Alternative considered**:
- `packages/theme-pixel-neurons/src/motion/` — theme + motion 同源、未來 fork 友善；但污染 theme package（拒絕）
- `packages/core/src/motion/` — 違反 core content-agnostic 鐵律（拒絕）
- `apps/neurons-tw/src/components/motion/` — components 目錄是 page-specific UI 慣例，motion library 是更底層 primitive，住 lib/ 更對（拒絕）

### Decision 2: Framer Motion v11 + CSS keyframes only, zero new dep

**Choice**: 只用 `framer-motion@^11.11.0`（其他 2 app 已用同版本）+ 純 CSS keyframes（透過 className）。不裝 lottie-react / canvas-confetti / GSAP / Rive / Popmotion / Valtio。

**Why**:
- Per `grilled-neurons-ui-animation-2026-05-25.md` Facet 5 收斂
- Framer Motion v11 內建 `animate()` / `stagger` / `AnimatePresence` / `layoutId` 已 cover 全部 moment 需求
- Particle burst 用 12–20 absolutely-positioned `<motion.span>` + Framer stagger 實現，無需 canvas
- Bundle 預算：framer-motion ~45KB gzipped（其他 apps 已付這成本）+ 本 library 自身 ≤ 5KB（純元件 + variants 配置）
- 若未來 P1 抽卡 batch 10-pull 需要全螢幕 confetti，可獨立 micro-change 加 `canvas-confetti@^1.9` (~4KB)，走 capability spec proposal 流程

### Decision 3: Per-rarity timing tokens 集中在 `timings.ts`

**Choice**: 所有 rarity-aware 元件吃同一份 token：

```typescript
// timings.ts
export const RARITY_TIMINGS = {
  P5: { total: 250, envelope: 100, flip: 100, glow: 0, hold: 50 },
  P4: { total: 400, envelope: 150, flip: 150, glow: 0, hold: 100 },
  P3: { total: 600, envelope: 200, flip: 200, glow: 100, hold: 100 },
  P2: { total: 1200, envelope: 300, flip: 300, glow: 300, hold: 300 },
  P1: { total: 2800, envelope: 400, flip: 600, glow: 500, particle: 800, hold: 500 },
} as const

export const SKIP_THRESHOLD_MS = 1000  // 動畫 > 1s 才提供 skip button
export const TOAST_AUTO_DISMISS_MS = 8000  // mirror 二階 8s 慣例
```

**Why**:
- 集中 token 讓 future change skip 邏輯 / consumer dismiss UX 對齊（gacha consumer 可預估 batch wall time）
- 純 ms 數字，無 RxJS / theme 耦合，YAGNI

### Decision 4: `useRespectsReducedMotion` hook 包 matchMedia + SSR-safe + live update

**Choice**:

```typescript
export function useRespectsReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return prefersReduced
}
```

**Why**:
- WCAG 2.1 recommended pattern
- SSR-safe `typeof window` guard（study-rpg 雖 CSR-only 但好習慣）
- Live update（user 切系統 a11y 設定無需 reload）
- Soft mode 由 consumer 元件實作：reduced 時砍 particle / shake / parallax variant、保 fade + scale

### Decision 5: `<Toast>` primitive 是 connectome `SynapseFormationToast` 的 future wrap target，但本 change 不直接 own SynapseFormationToast

**Choice**: 本 library 提供 generic `<Toast>` primitive（fixed position、slide-in、auto-dismiss、reduced-motion-aware、close button、children slot）。connectome 的 `SynapseFormationToast` 由 connectome capability own（其 inline 實作或日後 refactor 包 `<Toast>` 由 connectome owner 決定）。

**Why**:
- Capability 邊界乾淨：本 library 只提供 generic primitive，不污染 connectome scope
- Connectome 已 land；若本 library 強行 own `SynapseFormationToast` 會撞 spec scope
- Future connectome refactor 為 minor change：把 `<div className="synapse-formation-toast">` 換成 `<Toast variant="celebratory">`，幾行 diff

### Decision 6: Particle burst 用 12–20 absolutely-positioned span + Framer stagger，不用 canvas

**Choice**: `<ParticleBurst count={16} />` 內部渲染 16 個 `<motion.span>` absolutely positioned，初始 scale 0 + opacity 0，stagger 50ms 進場、各自 random direction + 600ms fade out。

**Why**:
- Per perf budget（Facet 2）：禁用 canvas particle 之外的重手法，DOM stagger 走 GPU-accelerated transform / opacity
- 16 個 DOM 在桌機 / 手機都不爆 paint cost（< 30 同時 animated DOM 是 Facet 2 上限）
- `prefers-reduced-motion = reduce` 時整個元件 return null（不渲染 DOM 省 layout cost）

### Decision 7: 元件骨架 ship 後不 wire 進任何實際 flow；only `/motion-demo` route self-verify

**Choice**: 本 change 不修改任何 quiz handler / connectome handler / gacha handler。Only 新增 `MotionDemoPage` 內含 5 個按鈕分別 trigger 各元件、self-verify 動畫運作。

**Why**:
- 各 future capability owns 自己 consumption（gacha 的抽卡 flow、achievement 的 unlock detection）
- 本 change scope 收斂在「ship primitives + 驗證它們能跑」
- Demo page 用 Chrome MCP smoke 驗 SPA route + reduced-motion 切換、確保 primitive 落地

## Risks / Trade-offs

- **[P1 cinematic 2.8s 在 batch 10-pull 重複播放疲勞]** → batch 模式預期由 gacha capability 提供「skip all」/「auto-play」flag、批次 wall time = 28s（接受性問題、不是 library 層問題）→ 接受
- **[framer-motion ~45KB gzipped + 本 library ~5KB ≈ 50KB bundle 增量]** → 跟 medexam-tw / medexam2-hospital-tw 一致；neurons-tw 第一次付這成本但是必要 → 接受
- **[Demo route 走 SPA，需 prod 驗 F5 + direct URL]** → 接受。Cloudflare Pages 部署 + `add-neurons-deploy` 階段會處理 SPA fallback（per `~/.claude/imports/chrome_mcp_preflight.md` SPA 三件套紀律）
- **[connectome 已 ship `SynapseFormationToast` inline 動畫，本 library land 後需 follow-up refactor]** → 接受。Follow-up minor change 預計 < 30 min diff（只換 wrapper 元件、不動 event subscription / copy）
- **[`useRespectsReducedMotion` 在 user 從未調過 a11y 設定情況下永遠 false]** → 預期行為；無 bug → 接受
- **[`<RarityRevealModal>` 的 envelope-flip-glow 序列尚未由實際 user 視覺驗收]** → demo page 提供 5 個 rarity button 讓 owner 親自跑一遍評分；不滿意可在 archive 前 calibrate `timings.ts` 數字 → 接受

## Migration Plan

本 change 純 client-side、無 server / Dexie / R2 變動。Steps：

1. `pnpm --filter @study-rpg/neurons-tw add framer-motion@^11.11.0`
2. `mkdir apps/neurons-tw/src/lib/motion/`
3. Implement `timings.ts`（per-rarity ms tokens + skip threshold + toast auto-dismiss ms）
4. Implement `useRespectsReducedMotion.ts`（matchMedia + SSR-safe + live update）
5. Implement `Toast.tsx`（slide-in / 8s auto-dismiss / reduced-motion-aware / close button / children slot）
6. Implement `ReducedMotionAware.tsx`（{ children, fallback } conditional render）
7. Implement `NumberTickUp.tsx`（from / to / duration props, count-up via Framer Motion）
8. Implement `RarityRevealModal.tsx`（rarity prop dispatch + AnimatePresence + envelope/flip/glow/particle stages + skip button when total > SKIP_THRESHOLD_MS）
9. Implement `AchievementUnlockModal.tsx`（P1 full-screen + staggered children variants + dismiss-required button）
10. Implement `index.ts`（public API surface）
11. Build `routes/MotionDemoPage.tsx`（5 button：Toast / NumberTickUp 0→100 / RarityRevealModal × P5–P1 / AchievementUnlockModal P1）
12. Wire `<Route path="/motion-demo">` + nav link to `App.tsx`（既有 `<BrowserRouter>` / `<Routes>` 由 connectome 已建立）
13. Dev smoke：`pnpm --filter @study-rpg/neurons-tw dev`、開 localhost / motion-demo、按 5 個按鈕看效果
14. Chrome MCP smoke：SPA 三件套（in-app nav / direct URL / F5）+ a11y reduced-motion 切換前後 visual diff
15. typecheck (`pnpm --filter @study-rpg/neurons-tw typecheck`)
16. Write `openspec/specs/neurons-motion-library/spec.md`（已在本 change 的 specs/ 子目錄）
17. `openspec validate add-neurons-motion-library`
18. `/verify` + `/opsx:archive`

**Rollback**: revert `apps/neurons-tw/src/lib/motion/` + `routes/MotionDemoPage.tsx` + `App.tsx` route 改動 + `package.json` framer-motion 移除 + `pnpm install`。Capability spec 走 `/opsx:propose revert-add-neurons-motion-library`。

## Open Questions

- **元件是否 export individual Framer Motion `variants` 物件供 caller customize？** 提案 yes（add `export const TOAST_VARIANTS = { ... }` 等）— 讓 future capability 想 tweak 入場方向不用 fork 整支元件
- **`timings.ts` token 單位用 ms 或 seconds？** 提案 ms（Framer Motion v11 兩種都支援，但 ms 跟 `setTimeout` / `requestAnimationFrame` 對齊）
- **`AchievementUnlockModal` 是否要支援 P2/P3/P4 縮小版（不全屏）？** 提案 no — Toast primitive 已 cover P2-P4 use case；P1 modal 是 full-screen-only specialist。Achievement consumer 自己決定 routing（P1 → modal、P2-P4 → toast wrap）
- **是否要 Storybook-style demo 而非單一 route？** 提案 no — Storybook 是新 dep（~30+ MB），demo page 純 React 已足夠 self-verify
