## Why

5 個 future change（`wire-neuron-variant-gacha` / `wire-neuron-family-mastery` / `add-neurons-leaderboard` / `add-neurons-achievements`）+ 已 land 的 `connectome-collection` 的 `SynapseFormationToast`，全部都需要 modal / toast / reveal 動畫元件。若各自實作會走樣 + 重工：sister worktree（`apps/medexam2-hospital-tw`）的 `AchievementUnlockToast` / `AchievementUnlockModal` / `StarterPullModal` 目前完全沒用 Framer Motion，動畫貧弱，正是「各自實作」走樣的證據。

集中成一層 reusable motion library 讓 future change 直接 `import { Toast, RarityRevealModal, AchievementUnlockModal, useRespectsReducedMotion } from '@study-rpg/neurons-tw/lib/motion'`，避免一條條 retrofit。

設計收斂依據（per `~/.claude/scratch/grilled-neurons-ui-animation-2026-05-25.md`，跑 grill-me Quick 模式 5 facets）：

- **Budget**: variable per rarity（P5/P4 200–400ms、P3 600ms、P2 1.2s rim shimmer、P1 2–3s cinematic skippable）
- **Perf ceiling**: desktop 60fps + iPhone 12+ 60fps + Pixel 6a 45fps+
- **a11y**: soft `prefers-reduced-motion`（砍 particle / shake / parallax、保 fade + scale）
- **Top-2 投資**: 抽卡 modal + 解鎖 modal；通用層 = toast / number tick-up
- **Dep policy**: 零新 dep（只 Framer Motion + CSS keyframes）

## What Changes

- 新增 `apps/neurons-tw/src/lib/motion/` 子目錄（mirror `apps/neurons-tw/src/lib/connectome/` app-layer 慣例）：
  - `timings.ts` — per-rarity ms tokens + skip threshold + toast auto-dismiss ms
  - `useRespectsReducedMotion.ts` — matchMedia hook（SSR-safe）
  - `Toast.tsx` — generic primitive（slide-in、auto-dismiss、reduced-motion-aware、close button、children slot）
  - `ReducedMotionAware.tsx` — `{ children, fallback }` conditional render wrapper
  - `NumberTickUp.tsx` — count-up animation（AP chip / stat 增加用）
  - `RarityRevealModal.tsx` — per-rarity dispatch（envelope → flip → glow → particle → centered）+ skip button when total > SKIP_THRESHOLD_MS
  - `AchievementUnlockModal.tsx` — P1 full-screen + staggered children + dismiss-required
  - `index.ts` — public API surface
- 新增 `framer-motion@^11.11.0` 進 `apps/neurons-tw/package.json` dependencies（其他 2 app 已用同版本）
- 新增 `apps/neurons-tw/src/routes/MotionDemoPage.tsx` + `<Route path="/motion-demo" element={<MotionDemoPage />} />` 進既有 `<Routes>`（connectome 已建立 `<BrowserRouter>` + `<Routes>` infra）+ nav link「動畫 demo」
- 新增 `neurons-motion-library` capability spec（6 Requirements）

**不做**：

- 不 wire 進任何 capability 實際 flow（gacha / achievement / connectome `SynapseFormationToast` / leaderboard 各自 future change own consumption）
- 不下沉到 `packages/theme-pixel-neurons/`（理由見 design.md Decision 1）
- 不裝 lottie-react / canvas-confetti / GSAP / Rive / Popmotion / Valtio
- 不修改既有 quiz handler / Dexie schema / R2 bundle
- 不 own `SynapseFormationToast.tsx`（已 land、connectome capability 範圍；本 library 只提供 `<Toast>` primitive 供其日後 wrap）
- 不引入 `react-router-dom`（connectome 已加 `^6`、本 change reuse）

## Capabilities

### New Capabilities

- `neurons-motion-library`: Reusable Framer Motion 動畫 primitives + per-rarity timing tokens + reduced-motion awareness hook + 5 component（Toast / RarityRevealModal / AchievementUnlockModal / NumberTickUp / ReducedMotionAware）+ self-verify demo route

### Modified Capabilities

- 無（純 additive）

## Impact

- **Code**:
  - `apps/neurons-tw/src/lib/motion/{timings,useRespectsReducedMotion,Toast,ReducedMotionAware,NumberTickUp,RarityRevealModal,AchievementUnlockModal,index}.{ts,tsx}`（新子目錄、8 檔）
  - `apps/neurons-tw/src/routes/MotionDemoPage.tsx`（新 demo route）
  - `apps/neurons-tw/src/App.tsx`（加 `<Route path="/motion-demo" />` + nav link 一行；既有 `<BrowserRouter>` / `<Routes>` 由 connectome change 已建立、本 change 不重 wrap）
  - `apps/neurons-tw/package.json`（加 `framer-motion: ^11.11.0`）
- **APIs**: `@study-rpg/core` 不動；`@study-rpg/theme-pixel-neurons` 不動
- **Dependencies**: `framer-motion@^11.11.0` 新增到 `apps/neurons-tw`（lockfile 已有此版，pnpm install 不會新下載）。`react-router-dom` 由 connectome 已加、本 change 不重複
- **Data**: 無 Dexie schema 變動、無 R2 bundle 變動
- **Backwards compat**: 純 additive；一階 / 二階 / connectome 完全不受影響
- **Sync**: 不碰
- **Spec touched**: 新增 `openspec/specs/neurons-motion-library/spec.md`
