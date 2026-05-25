## Why

`neurons-mode` umbrella capability 已聲明 Hebbian 3-step game loop（learn-fire-wire），但把 synapse state machine、co-firing N threshold、LTD decay 規則、Action Potential (AP) 計數器與 connectome 視覺實作**全部 punt 到本 change**（umbrella spec Requirement 1 末段明寫）。`wire-neurons-content-and-theme` 也明確把「connectome 視覺 + game event triggers」列為 Non-Goals 並指名本 change 接手。沒這層落地，玩家在 neurons-tw 寫題目時不會看到任何 Hebbian 機制；neurons-mode 等於只剩美術皮跟題庫，沒有跟 一階 / 二階 區隔的核心 hook。

## What Changes

- 新增 `connectome-collection` capability spec：定義 synapse state machine（3 states：dormant / weak / strong）、co-firing detection（N=5 correct answers / family / calendar day）、LTD decay（7 天無 co-fire 降一級、不 rupture）、Action Potential 計數器與 variant slot unlock threshold ladder
- 新增 `apps/neurons-tw/src/lib/connectome/` 子目錄（`state-machine.ts` + `co-fire-detector.ts` + `ap-counter.ts` + `events.ts`），實作於 app 層而非 `packages/core/` — synapse / Action Potential 是 neurons-specific 語意，違反 core content-agnostic invariant 故不下沉。core 仍 export 既有 `affinity` / `streak` 機制供本層復用
- 擴 `apps/neurons-tw` Dexie schema 加 3 個新 table：`synapses`（PK 為 `(familyA, familyB)` 排序組合 string）、`familyAccrual`（per-family AP + 今日已 fire flag）、`coFireLog`（per-day audit trail，可選保留供 leaderboard / achievement 後續引用）
- 新增 `apps/neurons-tw` engine entry point `recordCorrectAnswer(familyId)`，內部處理 AP++、今日 fire 標記、潛在 synapse 創建 / 強化、unlock toast emit。**Trigger source 為臨時 `ConnectomeDebugPanel`**（apply-time 認知：neurons-tw 尚無 quiz UI / Dexie v1 / router 等 app baseline，由 `wire-neurons-content-and-theme` 之後的某個 future change 帶來；本 change 不擴 scope 去 build 整個 quiz loop，改用 debug panel 暴露 `recordCorrectAnswer` / `recordIncorrectAnswer` / `advanceDayForDebug` 給 owner 手動觸發以驗 engine 與 spec 完整性）
- 新增 `apps/neurons-tw` minimal router：引入 `react-router-dom` v6，定義 2 個 route — `/`（既有 content overview）+ `/connectome`（stub view + debug panel inline section）
- 新增 `apps/neurons-tw` stub Connectome view（route `/connectome`）：列出 11 個 neuron family 節點（grouped by 4 NT branches） + 一張 synapse 表（family-pair / 狀態 / 上次 co-fire 日期）+ inline debug panel。Polished SVG/Canvas Linnean tree 渲染**留給後續 follow-up change**
- 新增 daily reset job：每日 00:00 local TZ reset `familyAccrual.firedToday` flag、跑 LTD decay check
- 新增 cosmetic / passive integration hook（**僅佈線、不啟用**）：emit `connectome.synapseFormed` / `connectome.synapseStrengthened` 事件供 `neurons-achievements` / `neurons-leaderboard` 後續 change 訂閱
- Connectome view 中對每個 family 顯示「AP / 下個 slot 解鎖門檻」chip，但 **variant 實際抽卡 / 解鎖**邏輯 punt 到 `wire-neuron-variant-gacha`（本 change 只暴露「slot 已可解鎖」訊號）

## Capabilities

### New Capabilities

- `connectome-collection`: Hebbian synapse state machine、co-firing detection、LTD decay、per-family Action Potential 計數器、stub connectome view (route + data display)，連帶 daily reset job 與 event emission hooks 供其他 neurons-* capability 訂閱

### Modified Capabilities

- `neurons-mode`: 移除 umbrella spec Requirement 1 末段「the exact N value, decay rates, and synapse state machine are deferred to `add-connectome-collection`」這段 punt 語句（兌現後不再 defer）；加 1 scenario 聲明 connectome-collection capability 已 ship 並接手相關 mechanics

## Impact

- **Code**：
  - `apps/neurons-tw/src/lib/connectome/{state-machine,co-fire-detector,ap-counter,events,index}.ts`（新子目錄）
  - `apps/neurons-tw/src/lib/db.ts` Dexie schema 升版（v2，加 3 table）
  - `apps/neurons-tw/src/lib/services/connectome.ts`（新 service layer，wrap pure engine + Dexie persistence）
  - `apps/neurons-tw/src/routes/ConnectomePage.tsx`（新 route，含 inline debug panel section）
  - `apps/neurons-tw/src/components/SynapseFormationToast.tsx`（新 UI）
  - `apps/neurons-tw/src/components/ConnectomeDebugPanel.tsx`（新 UI，臨時 — 含 +1/+5 correct / advance-day / reset-save 按鈕）
  - `apps/neurons-tw/src/App.tsx` 改用 `<BrowserRouter>` + `<Routes>` 包既有 content overview，加 `/connectome` route + nav link
  - `apps/neurons-tw/package.json` 加 `react-router-dom` ^6 dependency
  - 既有 quiz handler 插入 `recordCorrectAnswer` **不適用**（neurons-tw 無 quiz UI）— 改由 debug panel 觸發；real quiz hook 留 future change
  - Daily reset：採 lazy check pattern（每次 `recordCorrectAnswer` / `loadConnectome` / debug `advanceDayForDebug` 入口檢查）— 不依賴 tick scheduler infra
- **APIs**：`@study-rpg/core` API 不動（純 app-layer 改動，避免污染 content-agnostic core；後續 fork 若想自建 Hebbian 機制可參考本層 pattern）
- **Dependencies**：`react-router-dom@^6` 新增到 `apps/neurons-tw`（minimal router 引入），`dexie@^4` 新增到 `apps/neurons-tw`（Dexie v2 schema 首次落地，無 v1 baseline 故不算 migration）
- **Data**：neurons-tw Dexie v1 → v2 schema bump，無破壞性 migration（v1 沒這 3 table）
- **Backwards compat**：純 additive。一階 + 二階 完全不受影響（不共用 Dexie / 不共用 R2 bundle）
- **Sync**：R2 sync 尚未 wired 進 neurons-tw（→ `add-neurons-deploy`）；本 change 只動 local Dexie，cloud bundle schema 留給 deploy change 階段對齊
- **Spec touched**：`openspec/specs/neurons-mode/spec.md`（小幅 modify）、`openspec/specs/connectome-collection/spec.md`（新增）
