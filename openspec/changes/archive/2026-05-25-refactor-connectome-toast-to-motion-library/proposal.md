## Why

`add-connectome-collection` shipped `ConnectomeToastHost` (`apps/neurons-tw/src/components/SynapseFormationToast.tsx`) with an inline pure-CSS animation (`@keyframes connectomeToastIn`) and a hardcoded `TOAST_DURATION_MS = 8000` literal, predating the `neurons-motion-library` capability. Now that the motion library is in place, the connectome toast host is the first natural in-app consumer and should align with the shared animation conventions so that:

1. `prefers-reduced-motion` is respected (current CSS keyframe ignores OS a11y setting)
2. The auto-dismiss timing (8000ms) is sourced from `TOAST_AUTO_DISMISS_MS` instead of a magic number — keeps future re-tuning in one place
3. The slide animation uses Framer Motion (consistent with library convention; future consumers learn the same pattern)

The host's outer architecture (top-right fixed position + vertical stack + queue-based multi-toast handling) is deliberately retained — those are layout choices distinct from the motion library's single-`<Toast>` `top-center` primitive design. This refactor is **not** a wrap of `<Toast>`; it is a consumption of the library's hook + constant + Framer Motion `motion.div` primitive at the per-entry level.

## What Changes

- Replace `@keyframes connectomeToastIn` CSS keyframe with Framer Motion `motion.div` slide-from-right variant in `apps/neurons-tw/src/components/SynapseFormationToast.tsx`
- Replace local `const TOAST_DURATION_MS = 8000` with imported `TOAST_AUTO_DISMISS_MS` from `apps/neurons-tw/src/lib/motion`
- Add `useRespectsReducedMotion()` hook consumption — when active, toast enters with opacity fade only (no x translation) so vestibular-sensitive users can still see state change without sliding motion
- Update `connectome-collection` capability spec with a MODIFIED requirement clarifying that the toast host consumes motion library primitives
- No engine / Dexie / event API changes — purely UI-layer refactor

**不做**：

- 不改 `ConnectomeToastHost` 的 top-right + stacked layout
- 不改 toast 觸發來源（still `subscribeConnectomeEvents`）
- 不改 8000ms 持續時間值（only sourcing changes — local literal → imported constant）
- 不加 close button（motion library `<Toast>` 有，但 connectome host 設計是純 auto-dismiss、不擋互動，保持原樣）
- 不引入 motion library `<Toast>` primitive 本身（host 是 stacked-multi-toast 場景、不符合單一 toast use case；保留 hook + constant + raw motion primitive 消費）
- 不動 `add-neurons-motion-library` 的已發佈 capability spec

## Capabilities

### Modified Capabilities

- `connectome-collection`: Toast rendering requirement (Requirement 8) gets one MODIFIED requirement clarifying motion library primitive consumption + 3 new scenarios（standard motion / reduced-motion / timing-constant 對齊）

### New Capabilities

- 無

## Impact

- **Code**:
  - `apps/neurons-tw/src/components/SynapseFormationToast.tsx` — 改用 Framer Motion + motion library imports（重寫 ~25 行 inline style → motion variants）
- **APIs**: 無 — `subscribeConnectomeEvents` / `decodePairKey` / event payload shapes 都不動
- **Dependencies**: 無新增 npm dep（framer-motion 已在 neurons-tw via `add-neurons-motion-library`）
- **Data**: 無 Dexie / R2 / event schema 變動
- **Backwards compat**: 純 additive at API surface；end-user 看到動畫從 CSS slide-in 變成 Framer Motion slide-from-right + 多了 reduced-motion fallback；toast 觸發頻率 + 時長 + 訊息 copy 全部不變
- **Sync**: 不碰
- **Spec touched**: `openspec/specs/connectome-collection/spec.md`（MODIFIED 1 requirement，+3 scenarios）
