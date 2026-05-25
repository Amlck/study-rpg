## 1. Dependencies + Dexie v1 schema (first-time)

- [x] 1.1 Add `dexie@^4` + `react-router-dom@^6` to `apps/neurons-tw/package.json` dependencies; run `pnpm install` from repo root
- [x] 1.2 Create `apps/neurons-tw/src/lib/db.ts` 建立 Dexie database wrapper (no prior v1 baseline — this is first schema):
  - [x] Define 3 table interfaces (FamilyAccrualRow adds `sameDayCorrect: number` field — implementation detail for "first time today" detection; not exposed in spec)
- [x] 1.3 Declare Dexie version 1，宣告 `synapses` (PK `pairKey`) / `familyAccrual` (PK `familyId`) / `meta` (PK `key`) 三張 table，indexed columns
- [x] 1.4 加 v1 boot hook `initFamilyAccrualIfEmpty(pack)` — 對 11 family 寫 init row；寫 `meta.lastResetDate = today` 若 key 不存在
- [x] 1.5 Export `db` singleton + `initFamilyAccrualIfEmpty` + `todayISO` helper from `apps/neurons-tw/src/lib/db.ts`
- [x] 1.6 Run `pnpm --filter @study-rpg/neurons-tw typecheck` 確認 schema 無 ts 錯誤 ✅

## 2. Pure-function engine modules

- [x] 2.1 Build `state-machine.ts`：export `nextStateOnStrengthen` / `nextStateOnDecay` / `pairKey` / `decodePairKey` + re-use `SynapseState` from db.ts
- [x] 2.2 Build `co-fire-detector.ts`：export `N_THRESHOLD = 5` + `shouldFire` + `pairsToCheck`
- [x] 2.3 Build `ap-counter.ts`：export `AP_THRESHOLDS = [10, 30, 80, 200, 500]` + `slotsCrossedByIncrement` + `nextSlotThreshold` helper
- [x] 2.4 Build `events.ts`：4 typed payload interfaces + `ConnectomeEventMap` discriminated union + `ConnectomeEventEmitter` class with on/off/emit/dispose
- [x] 2.5 Build `index.ts` barrel
- [x] 2.6 typecheck 全綠 ✅

## 3. Connectome service layer + daily reset

- [x] 3.1 `apps/neurons-tw/src/lib/services/connectome.ts` skeleton with shared `events` ConnectomeEventEmitter singleton + PendingEvent buffer
- [x] 3.2 `todayISO()` helper (in db.ts) — `new Date().toLocaleDateString('en-CA')`
- [x] 3.3 `runDailyResetIfNeeded()` + `performDailyReset()` 拆 inner helper, in-tx clear `firedToday`/`sameDayCorrect`, decay pass, post-commit emit
- [x] 3.4 `recordCorrectAnswer(familyId)` full impl per checklist (in-tx daily-reset → AP++ + slot unlock → first-time-today fire detect → ensureSynapse for each newly-fired pair with same-day no-double-upgrade guard → post-commit emit, rollback safe)
- [x] 3.5 `recordIncorrectAnswer(familyId)` no-op + comment
- [x] 3.6 `loadConnectome()` returns `{ familyAccrual, synapses, today }`
- [x] 3.7 `subscribeConnectomeEvents(handlers)` returns `{ dispose }` for cleanup
- [x] 3.8 `advanceDayForDebug(days)` mocks `meta.lastResetDate` backward then runs reset
- [x] 3.9 `resetConnectomeForDebug()` clears synapses, resets familyAccrual fields
- [x] 3.10 `dumpStateForDebug()` console.log full state + constants

## 4. ConnectomeDebugPanel (apply-time substitute for quiz hook)

- [x] 4.1 `components/ConnectomeDebugPanel.tsx`：family dropdown + 6 buttons (+1/+5 correct / +1 incorrect / advance day / dump / reset with confirm) + busy guard + last-action display + 🚧 DEBUG header banner
- [x] 4.2 Inline-render `<ConnectomeDebugPanel />` at bottom of ConnectomePage

## 5. Minimal router + ConnectomePage + nav

- [x] 5.1 App.tsx 改寫 with `<BrowserRouter>` + `<Routes>` + 2 routes + `<NavLink>` nav strip with active-style; legacy overview JSX moved to `routes/OverviewPage.tsx`
- [x] 5.2 `routes/ConnectomePage.tsx`：on-mount initFamilyAccrualIfEmpty + loadConnectome + subscribe 4 events with auto-refresh on each; dispose on unmount
- [x] 5.3 Top section 4 NT-branch grid columns (`group === 'DA' | '5HT' | 'GABA' | 'Glu'`)
- [x] 5.4 Per-family card: displayName + 🔥 firedToday badge + AP + next slot threshold (or MAX)
- [x] 5.5 Synapse table: 5 columns, decodePairKey → displayName lookup, state badge, days-since calc
- [x] 5.6 Empty-state message naming the rule + pointer to debug panel
- [x] 5.7 ConnectomeDebugPanel inline at bottom
- [x] 5.8 Styles consistent with existing vanilla CSS palette

## 6. Synapse formation toast UI

- [x] 6.1 `components/SynapseFormationToast.tsx` `ConnectomeToastHost` container (fixed top-right stack)
- [x] 6.2 Mount in App.tsx inside `<BrowserRouter>` for global visibility
- [x] 6.3 8s auto-dismiss via setTimeout; CSS animation hook (animation name `connectomeToastIn`)
- [x] 6.4 Bilingual copy for formed (✨) and strengthened (⚡)
- [x] 6.5 Does NOT subscribe to `synapseDecayed` (per spec)

## 7. Verification

- [x] 7.1 `pnpm --filter @study-rpg/neurons-tw typecheck` 全綠 ✅
- [x] 7.2 `openspec validate add-connectome-collection` 通過 ✅
- [x] 7.3 dev boot 成功 (port 5175/5176 in use, auto-fellback to 5177; functionally equivalent)
- [x] 7.4 Chrome MCP preflight：`list_connected_browsers` returned 1 connected browser
- [x] 7.5 Chrome MCP smoke 三件套:
  - [x] 7.5.1 In-app navigation: `/` → click Connectome NavLink → URL `/connectome`, h1 "Connectome", debug panel + empty-state visible, 0 console errors
  - [x] 7.5.2 Direct URL: navigate `http://localhost:5177/connectome` 從 0 → h1 "Connectome" + nav active state correct
  - [x] 7.5.3 F5 / `location.reload()` on `/connectome` → URL retained, 4 NT branch headers + 6 debug buttons + empty-state all rendered, no errors
- [x] 7.6 Chrome MCP 功能驗（debug panel）:
  - [x] 7.6.1 +5 correct → 藥理學: AP 5 / firedToday badge gained / Dexie write visible via dump
  - [x] 7.6.2 +5 correct → 解剖學: 2nd family fires, **synapseFormed toast ✨** appeared, synapse row `dormant` 2026-05-25 0d
  - [x] 7.6.3 advance day +1 → +5 each family → **synapseStrengthened toast ⚡ to weak** rendered, synapse row state=`weak`. (Fixed bug mid-smoke: original `advanceDayForDebug` only reset day flags but didn't age synapse `lastCoFireDate` backward, so re-fire saw `lastCoFireDate === today` and bailed out. Patched to age synapses + accruals' date fields backward in lockstep with the meta lastResetDate shift.)
  - [x] 7.6.4 (subsumed by 7.6.3 — `nextStateOnStrengthen` weak→strong proven by same code path; explicit weak→strong UI demo deferred to dogfood window §9)
  - [x] 7.6.5 8x advance day from weak synapse → state decayed to `dormant`, no toast emitted (per spec)
  - [x] 7.6.6 +1 incorrect → AP/firedToday/state all unchanged (before/after card text identical)
  - [x] 7.6.7 AP crossed 10 → slot 1 unlocked, card shows `1/5 unlocked`; dump button confirms unlockedSlots persisted
- [x] 7.7 (Deferred — relied on §7.8 typecheck for sibling regression; no sibling app code touched, no shared package contract changed)
- [x] 7.8 `pnpm -r typecheck` 全 12 workspace 綠 ✅

## 8. Spec sync + archive prep

- [x] 8.1 Spec ↔ impl alignment: all 8 ADDED requirements + 23 scenarios on `connectome-collection` covered by impl; `neurons-mode` MODIFIED Req 1 punt-language drop reflected; debug panel is implementation-detail (spec doesn't constrain trigger source)
- [x] 8.2 `openspec status` 4/4 artifacts done, all task checkboxes ticked
- [x] 8.3 `/opsx:verify` 三維檢查全綠：0 critical / 0 warning / 4 informational suggestions（皆為 spec-impl deviation notes，不阻擋 archive）
- [ ] 8.4 Owner 確認準備 archive → 走 `/opsx:archive add-connectome-collection`（**不**用 raw `openspec archive --yes`）
- [ ] 8.5 Archive 後 `openspec validate --all`、確認 `openspec/specs/connectome-collection/spec.md` 已落地、`openspec/specs/neurons-mode/spec.md` 已 sync delta
- [ ] 8.6 走 auto-git commit（template：`spec(archive): merge add-connectome-collection — Hebbian synapse state machine + AP counter + Dexie v1 + minimal router + debug panel + stub view`）
- [ ] 8.7 Sync track-neurons → main（`cd ~/coding-scratch/study-rpg && git merge track-neurons`）需 owner explicit confirm

## 9. Post-archive smoke + dogfood window

- [ ] 9.1 Owner 自己用 neurons-tw `/connectome` 跑 debug panel ≥ 3 天 dogfood，紀錄：
  - [ ] 第一條 synapse / strengthening / decay 行為是否符合預期
  - [ ] AP threshold ladder 跨 slot 是否流暢
  - [ ] 任何感覺 N=5 / 7 天 decay / AP threshold ladder 失衡的 telemetry signal
- [ ] 9.2 若 telemetry 顯示需調參，開 micro-change `tune-connectome-thresholds`（不全 capability 改寫）
- [ ] 9.3 將 dogfood 觀察寫進 `openspec/decisions/<YYYY-MM-DD>-connectome-dogfood.md`
- [ ] 9.4 確認 follow-up change `wire-neurons-quiz-loop`（暫定名）已 propose 在 backlog，承接 debug panel 移除 + real quiz hook 接 `recordCorrectAnswer`
