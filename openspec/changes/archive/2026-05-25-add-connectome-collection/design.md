## Context

`add-neurons-mode-scaffold` 與 `wire-neurons-content-and-theme` 已 archive，11 個 neuron family / 4 NT branch / 4 NT stat schema 全部 lock。`apps/neurons-tw` 目前可 boot 但 quiz 答題完只有屬性 / affinity 累積，無 Hebbian 機制可見。

`neurons-mode` umbrella spec Requirement 1 末段明寫「the exact N value, decay rates, and synapse state machine are deferred to `add-connectome-collection`」— 本 change 兌現這層 punt。Requirement 1 同時聲明「LTD applies gradually via decay, not punitively per answer」+「Incorrect answer does not rupture synapse」，這兩條是 spec-level 鎖定的，本層 design 只決定具體數字。

設計收斂依據：本 session 對 owner 跑 4 題 AskUserQuestion 鎖定：
- N=5 correct answers per family / session
- 3 states synapse depth (dormant / weak / strong)
- Calendar day reset for co-fire window
- Scope = data + state machine + minimal stub view（polished SVG/Canvas tree 留 follow-up）

## Goals / Non-Goals

**Goals:**

- 兌現 `neurons-mode` Requirement 1 末段所有 deferred mechanics（N / state machine / decay rules / AP counter）
- 提供可運行的 Hebbian 閉環：quiz 答對 → AP++ → 跨 family 達 N → synapse 形成 → 視覺可見
- 為後續 `neurons-leaderboard` / `neurons-achievements` 提供穩定 event surface（不重新發明訂閱機制）
- 為後續 `wire-neuron-variant-gacha` 提供「variant slot 已可解鎖」訊號（AP threshold ladder），但不實作 gacha 本身
- 保持 `@study-rpg/core` content-agnostic 鐵律（synapse / AP 名詞只出現在 app 層）

**Non-Goals:**

- **不**做 polished Linnean phylogenetic tree SVG / Canvas 渲染（留 `add-neurons-connectome-tree-view` follow-up）
- **不**實作 variant gacha 抽卡邏輯（留 `wire-neuron-variant-gacha`）
- **不**接 R2 cloud sync（neurons-tw R2 wiring 留 `add-neurons-deploy`）
- **不**接 leaderboard event 訂閱（emit hook 在，subscriber 留 `add-neurons-leaderboard`）
- **不**接 achievement unlock 訂閱（emit hook 在，subscriber 留 `add-neurons-achievements`）
- **不**做 synapse 視覺動畫（toast 出新 synapse 就夠，動畫留 polished tree view follow-up）
- **不**動 `packages/core/` —— 所有新模組住 app 層

## Decisions

### Decision 1: Co-firing N = 5 correct answers per family per calendar day

**Choice**: 同一 calendar day（local TZ）內，某個 neuron family 累積 ≥ 5 個 correct answer 才算「fired」。當 ≥ 2 個 family 在同一天都達 fired 狀態，這些 family 兩兩之間檢查 / 創建 / 強化 synapse。

**Why**:
- N=5 mirror 一個典型 SRS / 短 pomodoro session 的題數（owner 跑 grill-style 直覺檢驗 vs 3 / 7 / 10）
- Calendar day 對標 owner 的「pomodoro 唸書 + 寫題目都應該累積」直覺 — 不限制同一坐次，跨整天活動都算
- 5 比 3 更「值得 commit 一個 family」，比 7 / 10 friendlier；avoid the "synapse 永遠長不出來" failure mode
- 失敗模式分析：N=5 + Calendar day + 11 family → 玩家若每天唸 2-3 個 family、每 family ≥ 5 題，理論上每天可長 1-3 條新 synapse；10 天內 connectome 可從 0 → ~15 條 synapse（55 max pairs），有明顯漸進感

**Alternative considered**:
- N=3 — 太快、synapse 失去意義（拒絕）
- N=10 — 太慢、casual player 一週看不到第一條（拒絕）
- App-foreground session — 對 pomodoro user 不友善（晚上再開 app 寫題不接續上午唸的書）（拒絕）
- Rolling 30 min — 嚴格、要求兩 family 在 30 min 內各 5 題，跟混科練習不符（拒絕）

### Decision 2: Synapse 3-state machine — dormant / weak / strong

**Choice**: 三個離散狀態：

| State | 進入條件 | 視覺 hint (stub view) |
|---|---|---|
| `dormant` | 兩 family 在同一天首次同時達 N fired → 建立 dormant synapse | 灰色 dotted line / `· · ·` |
| `weak` | dormant synapse 後續再次同日 co-fire | 淡色 dashed line / `– – –` |
| `strong` | weak synapse 後續再次同日 co-fire | 飽和 solid line / `———` |

LTD decay（見 Decision 3）逆向降級：strong → weak → dormant，**永不 remove**（per umbrella spec「Incorrect answer does not rupture synapse」精神延伸到 decay 也不 rupture）。

**Why**:
- 3 states 對應 LTP early phase (E-LTP) / late phase (L-LTP) / consolidated 的科學直覺，又不過度顆粒
- 2 states 太 binary、無 progression feel；4 states 視覺難分；continuous bar 難 spec 化 / 難測試
- "never remove" 規則跟 umbrella spec 「LTD 不 rupture」+「incorrect 不 downgrade > 1 level」哲學一致 — 玩家投入的 wiring 永久保留為 dormant 狀態

**Alternative considered**:
- 2 states — 失去 LTP 早/晚期語意（拒絕）
- 4 states (dormant / weak / moderate / strong) — 視覺 4 種線型難辨（拒絕）
- Continuous 0.0-1.0 strength bar — testability 差、persist 易飄移（拒絕）
- Allow synapse removal at full decay — 違反 umbrella spec 精神（拒絕）

### Decision 3: LTD decay — 7 天無 co-fire 降一級，永不 remove

**Choice**: 每日 00:00 local TZ 跑 decay check job：

- 對每條現存 synapse，若 `lastCoFireDate` 距今 > 7 天 → 降一級（strong → weak → dormant；dormant 維持 dormant）
- Decay 後 `lastCoFireDate` **不重置**，所以連續 14 天沒 co-fire 的 strong → weak (day 8) → dormant (day 15)（注意：每次 decay 都會重設 7 天計時器以避免一天降兩級。為避免歧義，**規範改為**：每次 decay 後將 `lastCoFireDate` 設為 `decayDate`，下次 decay 至少要再過 7 天）
- Incorrect 答案不觸發 decay（per umbrella spec）

**Why**:
- 7 天 ≈ 一週 study cycle；如果一週都沒同時 fire 這兩 family，視覺上降一級給玩家「忘記回來練」訊號
- 不 remove 兌現 umbrella spec「LTD 不 rupture」+ 「玩家投入永久保留」哲學
- 7 天太短 → 玩家壓力大；太長（30 天）→ decay 形同無 effect。7 天是合理中點，可後續 dogfood telemetry 微調

**Alternative considered**:
- 3 天 decay — 太頻繁、玩家壓力大（拒絕）
- 30 天 decay — 形同 no decay（拒絕）
- Per-correct-answer decay reset（任一 family 答對就 reset） — 違反 spec「LTD applies gradually via decay, not punitively per answer」反向（拒絕）
- Allow remove at full decay — 違反 spec（拒絕）

### Decision 4: Action Potential (AP) counter — per family, monotonic, threshold ladder for variant slot

**Choice**: 每個 family 有獨立 `actionPotential` 計數器：

- **每答對 1 題 → AP += 1**（per family）
- **AP 永不重置**（單調遞增 monotonic counter）
- **AP threshold ladder for variant slot unlock**：

| Slot | 累積 AP 門檻 | Slot count |
|---|---|---|
| Slot 1 (first variant) | 10 | 1 |
| Slot 2 | 30 | 2 |
| Slot 3 | 80 | 3 |
| Slot 4 | 200 | 4 |
| Slot 5 | 500 | 5 |

- Slot unlock 達到後 emit `connectome.variantSlotUnlocked` event；`wire-neuron-variant-gacha` 會訂閱此 event 觸發抽卡 UI（**本 change 不實作抽卡邏輯**）
- Stub view 顯示「Family X：AP 47 / next slot 80」chip

**Why**:
- 5 slot ladder mirror P1-P5 rarity scheme（umbrella spec 已聲明 P1-P5），但 AP 不決定 rarity（rarity 由 gacha 決定），AP 只決定**槽位開放**
- 10 / 30 / 80 / 200 / 500 = 約等比 2.5 倍增長，前期 friendly、後期長期 commit
- 500 AP per family ≈ 100 題 / family × 5 family = 500 題；對 medexam-tw ~3505 題池，達成是長期目標但可見終點
- AP monotonic 不重置 → 玩家投入永久保留，跟 synapse「不 remove」哲學一致

**Alternative considered**:
- Per-day AP reset → 違反「永久保留」哲學（拒絕）
- AP 直接 = 變體稀有度（拒絕 — gacha rarity 是 gacha capability 的事）
- 線性 ladder（每 50 AP 解一槽）→ 後期太容易（拒絕）
- 指數 ladder（10 / 100 / 1000）→ 中期 stuck（拒絕）

### Decision 5: Pair key 排序 — `[familyId1, familyId2].sort().join('|')` lexicographic

**Choice**: synapse 的 primary key 為 `<smallerFamilyId>|<largerFamilyId>`（lexicographic sort）。

**Why**:
- Synapse 是無向（undirected）的；A-B 跟 B-A 是同一條
- Sorted join string 容易 hash / 容易在 Dexie 當 PK / log 出來易讀
- Alternative: 用 surrogate UUID — 拒絕，因 dedup check 變慢且 debug 不友善

### Decision 6: Daily reset job — 走 `lastResetDate` lazy check，不依賴 background scheduler

**Choice**: 不建立 setInterval / background worker；改在每次 `recordCorrectAnswer` / `loadConnectome` 入口檢查 `meta.lastResetDate` ≠ 今天 → 跑：
1. Reset `familyAccrual.firedToday` flag 全部清零
2. 對所有 synapse 跑 decay check（per Decision 3）
3. 更新 `meta.lastResetDate = today`

**Why**:
- neurons-tw 是 SPA，沒持續執行 server-side scheduler；setInterval 在頁面關閉時失效
- Lazy reset 在 user 下次互動時觸發，sufficient for daily-granularity correctness
- 不依賴 service worker（簡化部署 / 不需 push notification）
- 跨日跨度長（user 一週沒開 app）→ 一次 catch-up 處理所有 missed days（loop 跑多次 decay check）
- Mirror 二階 既有 `lib/tick.ts` 的 lazy daily reset pattern

**Alternative considered**:
- setInterval(daily, 24hr) — 頁面關了就死（拒絕）
- Service worker scheduled — 部署複雜度高、過度工程（拒絕）
- Server-side cron via Worker — 還沒接 R2 sync，無法 server-side 觸發（拒絕，等 `add-neurons-deploy`）

### Decision 7: Engine 模組住 `apps/neurons-tw/src/lib/connectome/`，不下沉到 `packages/core/`

**Choice**: 所有 synapse / AP / co-fire 程式碼住 app 層子目錄 `connectome/`：

```
apps/neurons-tw/src/lib/connectome/
├── state-machine.ts   # 純函式 synapse state transitions
├── co-fire-detector.ts # 純函式 N-threshold detection
├── ap-counter.ts       # 純函式 AP slot threshold check
├── events.ts          # tiny EventEmitter for synapseFormed / synapseStrengthened / variantSlotUnlocked / synapseDecayed
└── index.ts           # public API surface
```

Service layer `apps/neurons-tw/src/lib/services/connectome.ts` 包這些 pure functions + Dexie persistence + event emission。

**Why**:
- `packages/core/` 必須 content-agnostic（CLAUDE.md curator rule + spec rule 雙確認）
- "Synapse" / "Action Potential" / "Hebbian" 是 neurons-domain 名詞，不可下沉
- 後續 fork（例：考研機構想做「概念連結」reskin）可參考本層作 reference implementation，但 core 不被污染
- Pure function 設計 → testable 不依賴 Dexie；service layer 才接 storage

**Alternative considered**:
- 抽 generic `pair-bond` primitive 到 core — 過度工程（YAGNI；目前只有 neurons-tw 用）（拒絕）
- 全塞進 `services/connectome.ts` 單檔 — 違反 separation of pure-function vs side-effect（拒絕）

### Decision 8: Stub view = grouped family list + synapse table，不畫 SVG tree

**Choice**: `ConnectomePage.tsx` route `/connectome` 顯示：

1. **Top section: 4 NT branches**（DA / 5-HT / GABA / Glu）為 column header
2. **Per column: family list**（每 family 一張小 card 顯示 displayName / sprite key / AP / next slot threshold / firedToday badge）
3. **Bottom section: synapse table**（rows = synapse；columns = family A / family B / state / lastCoFireDate / daysSinceCoFire）
4. **Empty state**: 「尚無 synapse — 同一天在兩個 family 各答對 5 題就會 wire」

無 SVG / Canvas / 動畫 / 連線渲染。Synapse formation 純靠 toast 通知。

**Why**:
- Owner 選 scope 「Data + minimal stub view」（per AskUserQuestion Q4）
- 拆 polished tree view 出去能讓本 change shippable + 後續 view 改動不影響 spec
- Stub view 已足夠驗證 data model 正確（玩家可看到 synapse 在長、AP 在累積）

**Alternative considered**:
- 直接 ship SVG tree — 範圍爆炸、wall time 多 1-2 天（拒絕，per Q4）
- 純文字 console log — UI 沒回饋（拒絕，per Q4）

### Decision 9: Toast on synapse formation/strengthening — neurons-themed copy + 8s auto-dismiss

**Choice**: 走 `SynapseFormationToast.tsx` 元件（mirror 二階 `AchievementUnlockToast`）：

- 觸發於：`connectome.synapseFormed` event（dormant → first creation）+ `connectome.synapseStrengthened` event（weak / strong 升級）
- Copy 範本（dormant）：「✨ 新連線形成：「Family A」⇌「Family B」 — 兩個 neuron family 在今天同時 fire，wire together」
- Copy 範本（strengthened）：「⚡ 連線強化：「Family A」⇌「Family B」現為 weak/strong 狀態」
- 8 秒自動消失（mirror 二階 P2-P4 achievement toast cadence）
- 不對 decay 出 toast（避免負面回饋疲勞，玩家看 synapse table 就能發現）

**Why**:
- Mirror 二階既有 toast pattern 減少新 UX 認知負擔
- Synapse 形成是正向時刻、值得突出
- Decay 是 quiet 訊號，view 內顯示即可

### Decision 11: 用 `ConnectomeDebugPanel` 取代 quiz hook 作為 apply-time engine trigger

**Choice**: Apply-time 偵測到 `apps/neurons-tw` 尚無 quiz UI / Dexie v1 baseline / router（`wire-neurons-content-and-theme` 只 ship 靜態 content overview）。**不擴 scope 去 build 整個 quiz loop**，改在 `/connectome` 路由內 inline `ConnectomeDebugPanel.tsx`，提供以下按鈕：

- `+1 correct → <family-select>`（dropdown 11 family）
- `+5 correct → <family-select>`（一鍵打到 fired today threshold）
- `advance day +1`（mock today += 1 觸發 LTD decay pass — 透過 service `advanceDayForDebug(days)` 內部改 `meta.lastResetDate` + 跑 reset）
- `reset connectome save`（清空 3 個 Dexie table 重灌初始 row）
- `dump state to console`（debug console.log Dexie 全 row + 當前 in-memory event queue）

Panel 在 UI 上明確標 `🚧 DEBUG — temp until real quiz loop lands`。本 panel 由 future change `wire-neurons-quiz-loop`（或同等）刪除，real quiz handler 取而代之。

**Why**:
- Spec 對 `recordCorrectAnswer` 的 contract 是 trigger-agnostic — spec 不在乎是 quiz handler 還是 debug button 觸發；scenario 全部用「player answers correctly」抽象描述
- Debug panel = engine end-to-end dogfood 路徑；不靠 quiz UI 也能驗 N=5 fired / 跨日 strengthening / 7-day decay / AP slot unlock 全鏈路
- Owner 跑 dogfood 用 debug panel 比 polished quiz UI 更快（不用每次答 5 題）
- 拆出 real quiz loop 成獨立 change 讓 scope 不爆炸（quiz UI + reading timer + tick scheduler + boss 至少 60 task）

**Alternative considered**:
- 整 scope 進本 change build quiz UI — 拒絕（120+ task，需 grill 多輪）
- 只 build engine 不 build view / panel — 拒絕（dogfood 路徑斷掉、Chrome MCP 無法 smoke）
- 用 dev console 手 type 呼叫 service function — 拒絕（friction 高、debug 流程不直觀）

### Decision 12: 引入最小化 `react-router-dom` v6，2 個 route 起手

**Choice**: 在 `apps/neurons-tw/package.json` 加 `react-router-dom@^6`，改寫 `App.tsx` 用 `<BrowserRouter>` + `<Routes>` + `<Route>` 包既有 content overview 為 `/`、新增 `/connectome`。頂端加 nav strip 兩 link。

**Why**:
- neurons-tw 既無 router，無法為 connectome 加新 route；隨便用 conditional render 切換是技術債（無 deep-link / 無瀏覽器 back button / SPA 三件套 F5 測 不適用）
- react-router v6 是 React 生態事實標準；medexam-tw + medexam2-hospital-tw 兩 sibling app 都用同套（沿用降低 cognitive load）
- 引入 2 個 route 起手是 minimum viable router；後續 follow-up change 可在 router 上 append 不需重新引入

**Alternative considered**:
- 不引 router，把 ConnectomePage 當 conditional render 在 App.tsx 內切 — 拒絕（瀏覽器 nav 失效、F5 重整無法直接到 `/connectome`、違反 CLAUDE.md「SPA Route 驗證」三件套）
- 引 `wouter` 或 `@tanstack/router` 等替代 — 拒絕（兩 sibling app 已 lock react-router，不分裂技術棧）
- 用 hash routing (`/#/connectome`) 避開 SPA fallback 問題 — 拒絕（URL 醜、跟 sibling apps 不一致）

注意：deploy 階段（`add-neurons-deploy`）需在 Cloudflare Pages 端設 SPA fallback（per CLAUDE.md SPA route 驗證 pitfalls）；本 change 只動 dev 端，prod fallback 留 deploy 階段。

### Decision 10: Event emission via tiny EventEmitter，不引入 RxJS / mitt

**Choice**: 在 `connectome/events.ts` 寫一個 ~20 行的 typed EventEmitter（Map<eventName, Set<listener>> + emit / on / off），不引入第三方 lib。

**Why**:
- 4 個 event type、每個 < 5 listener，無需 RxJS / mitt 級別 abstraction
- 避免新 npm dependency
- 純 TypeScript 型別安全可達（discriminated union event type）

## Risks / Trade-offs

- **[Slot threshold ladder 失衡]** → Owner dogfood 一週後依 telemetry（每 family 多久解第 N slot）微調 AP threshold；後續走 micro-change 而非全 capability 改寫 → 接受
- **[Calendar day boundary 在跨時區 user 上不一致]** → MVP 鎖 local TZ midnight，與 streak 規則一致；後續若有跨時區 user 抱怨再考慮 server TZ override → 接受
- **[Stub view 太陽春讓玩家失望]** → 接受。Stub view 是 enabler 不是 destination；polished tree view 已寫進 roadmap follow-up
- **[Lazy daily reset 在 user 長期不開 app 後第一次 load 跑很慢]** → 一次處理 N 天 decay 為 O(synapseCount × missedDays)，55 max synapse × 30 missed days = 1650 ops < 50 ms，acceptable
- **[Quiz answer hook 跟 affinity / streak 三方寫 Dexie tx 順序]** → 用 single Dexie transaction 包 `recordCorrectAnswer` 內所有 write（AP / firedToday / synapse / lastCoFireDate / 觸發 event 在 tx commit 後），mirror 二階 quiz answer tx scope hotfix lessons learned（commit `e085876`）
- **[Event listener 沒清乾淨造成 memory leak]** → service layer 提供 `dispose()` 在 ConnectomePage unmount 時呼叫，清掉本 page 訂閱
- **[Synapse 數量上限 11C2 = 55 過多時 stub view 表格擁擠]** → 11 family / 55 pair 是設計極限，預期 active user 1-2 個月內達 ~20-30 synapse、不會塞滿；若塞滿則 stub view 加 filter chip（state / NT branch）— 留 follow-up
- **[Variant slot unlocked event 沒有 subscriber 直到 wire-neuron-variant-gacha 落地]** → 接受。emit hook 是 forward-compat 設計；無 subscriber 時 event 飄走無害
- **[新增 3 個 Dexie table 與後續 R2 sync schema 不對齊]** → 在 design.md 預先聲明 R2 bundle schema 草稿（見下方 Migration Plan），`add-neurons-deploy` 階段以此為 baseline，避免事後 schema 不一致需 v→v+1 migration

## Migration Plan

本 change 純 client-side、無 production server change。Steps：

1. Implement `apps/neurons-tw/src/lib/connectome/` 4 pure-function modules + events
2. Dexie schema v1 → v2：加 3 table `synapses` / `familyAccrual` / `meta`（已有則加 column）
3. Implement service layer `services/connectome.ts` 與 daily lazy reset
4. Wire quiz answer flow（找既有 quiz handler hook 點）
5. Build `ConnectomePage.tsx` + `SynapseFormationToast.tsx`
6. Add route `/connectome` 到既有 router
7. Dev smoke：手寫 25 個 mock answer 跨 3 family 觸發 ≥ 1 synapse；驗證 toast 出現、view 顯示
8. Chrome MCP smoke：跑 `pnpm --filter @study-rpg/neurons-tw dev`、navigate `/connectome` 看 SPA route 解析 + F5 reload 不 404
9. typecheck / unit test（pure function modules）
10. Spec validate + `/verify`

**Future R2 bundle schema 草稿**（給 `add-neurons-deploy` 參考、本 change 不實作）：

```jsonc
// users/<user_id>/neurons-snapshot.json.gz schema_version 1
{
  "schema_version": 1,
  "synapses": [
    { "pairKey": "胚胎學|藥理學", "state": "weak", "lastCoFireDate": "2026-05-30", "createdAt": "2026-05-26" }
  ],
  "familyAccrual": [
    { "familyId": "藥理學", "ap": 47, "firedToday": false, "lastFireDate": "2026-05-30" }
  ],
  "meta": { "lastResetDate": "2026-05-31" }
}
```

**Rollback**: revert app 層改動 + Dexie schema 回退 v2 → v1（Dexie 允許 schema 降級透過 delete database + recreate；本 change 沒接 cloud sync，無資料外洩風險）。Capability spec 走 `/opsx:propose revert-add-connectome-collection` 流程。

## Open Questions

- **AP threshold ladder 數字 (10/30/80/200/500)** 是 grill-style 直覺，無 dogfood telemetry 支持。Owner 跑一週後 review；如需調整則 micro-change 而非全 capability 改寫
- **Decay 7 天門檻** 同上，dogfood 後 review
- **Calendar day TZ 處理跨時區 user** 暫鎖 local TZ；跨時區行為留 Open
- **Polished SVG/Canvas Linnean tree view** 何時 ship — 預定下一條 follow-up `add-neurons-connectome-tree-view`（暫定名）、但 owner 決定優先序
- **Variant slot unlock event payload 設計**（要不要 carry slot index + family + AP snapshot 給 gacha subscriber） — 提案 payload 含 `{ familyId, slotIndex, apAtUnlock }`，留 `wire-neuron-variant-gacha` 階段對齊
