## Why

`add-neurons-mode-scaffold` 把 neurons-tw track 的骨架立起來（2 個空 package + 1 個 placeholder app + `neurons-mode` umbrella capability spec），但所有 content / theme 內容仍是空 placeholder。要讓 `apps/neurons-tw/` 真正可玩，下一步必須**填**：

1. **content-neurons-tw 內容**：10 個 一階 國考 subject 重新命名為 Linnean phylogenetic taxonomy 上的 neuron family（科學嚴謹度 lock 在 grill Facet 4 = 「走真實 connectome」）+ 4 NT branch 分配（DA / 5-HT / GABA / Glu）+ `statSchema` 覆蓋 + 題庫複用策略（直接共用 medexam-tw 題庫 JSON 檔，subject id 不變、僅 displayName 換）
2. **theme-pixel-neurons 內容**：CSS palette（4 NT 顏色 + synapse 狀態色 + rarity frame 色）+ item catalog 結構（ion channel / receptor / 神經傳導物質 ~20 項 × 5 rarity）+ cosmetic catalog 結構（5 categories × ~4 entries：soma 形狀 / dendrite 樣式 / myelin 顏色 / axon 裝飾 / 突觸小泡）+ skill tree 4 NT branch × 9 node 結構
3. **Sprite assets 仍 placeholder**（透明 PNG）— sprite 美術拆給 `generate-neurons-sprites`，本 change 只立 structure、不畫圖

對標 `2026-05-15-ingest-medexam2-tw-corpus` + `wire-hospital-tycoon-engine` 這類「填 scaffold 內容」change 的 cadence。

設計收斂依據：`~/.claude/scratch/grilled-neurons-tw-spec-prep-2026-05-25.md`（Facet 4 / 5 + 對映候選表）+ `openspec/specs/neurons-mode/spec.md`（umbrella spec 內 4 NT + Linnean taxonomy 已 lock）。

## What Changes

- **content-neurons-tw 填充**：
  - `dist/meta.json`：實際 `id` / `displayName` / `locale` / `credits`（陽明 CC-BY-NC + neurons reskin attribution）+ `statSchema` 覆蓋（4 NT 鍵 + 雙語 labels）+ `examMeta.supportsMockExam: true`
  - `dist/subjects.json`：**11 個 subjects**（9 直送 + `微生物學` + `免疫學` 由 split 而來；醫學倫理不在 medexam-tw 不收）；9 直送 id 維持與 medexam-tw 完全相同；`displayName` 改為 neuron family 名稱 + persona + `group` 改為 NT branch + `color` 對齊 NT branch palette token
  - `dist/questions.json`：9 直送 subjects 的題目從 `apps/medexam-tw/public/content/medexam-tw/questions.json` verbatim copy；`微生物暨免疫學` 的題目 build 階段重新從 source markdown `**科目**：<tag>` 重新分類為 `微生物學` / `免疫學`
  - `src/index.ts` 改為實際 fetch loader（不再 empty stub）
  - `scripts/build.ts` 新增：從 medexam-tw build artifacts 複製 questions.json + 重新生成 subjects.json + meta.json
- **theme-pixel-neurons 填充**：
  - `src/index.ts`：補全 `cssVars`（4 NT 顏色 + synapse state 色 + rarity frame 色 + 通用 background / ink）+ `fonts` 陣列（Cubic 11 + Press Start 2P + VT323，沿用既有 self-host pipeline）+ catalog wiring
  - `src/items.ts`（新）：~20 個 ion channel / receptor / NT item catalog × 5 rarity（artKey 全 placeholder）
  - `src/cosmetics.ts`（新）：~20 個 cosmetic × 5 categories
  - `src/skillTree.ts`（新）：`SKILL_TREE_PIXEL_NEURONS` 4 NT branch × 9 node 結構
  - `src/sprites.ts` 仍維持 5 個 contract-required key 用 transparent placeholder（real sprite asset 等 `generate-neurons-sprites`）
  - `styles/global.css`：對齊 medical theme 的 @font-face + base layout vars，加 neuron-specific 漸層 / glow effects 預備
  - `DESIGN.md` 從 stub 擴充到 full spec（palette / tree layout / synapse animation guidance）
- **`apps/neurons-tw/` 接通 content + theme**：
  - `src/App.tsx` 從 placeholder 改為呼叫 `getContentPack()`、顯示 ContentPack metadata（家族 list + 題目總數 + statSchema labels）以驗證 wiring
  - `public/content/neurons-tw/` 建立並放置 build 後的 meta / subjects / questions JSON（vite copy strategy 對齊 medexam-tw `prebuild` hook）
- **root `package.json`**：加 `build:neurons-content` script alias

**Out of scope**（punt 給後續 changes）：

- Sprite 美術 → `generate-neurons-sprites`
- Connectome 譜系視覺實作（看到實際譜系樹）→ `add-connectome-collection`
- Game event 串接（answer correct → stat increment / family affinity）→ `add-connectome-collection`
- Variant gacha / mastery / leaderboard / achievement → 各自獨立 change
- Deploy（CF Pages on `med-study-rpg.com`）→ `add-neurons-deploy`
- Cross-app sync engine wiring → 永久 out of scope per grill Facet 1

## Capabilities

### New Capabilities

（無 — 本 change 不引入新 contract。所有實作要求都已在 `neurons-mode` umbrella capability spec 內 cover；本 change 是兌現該 spec 的部分 requirement（4 NT stat schema / Linnean taxonomy 結構 / 跨 app 資料隔離的 package boundary）。）

### Modified Capabilities

- `neurons-mode`: 補一條跨 app 資料完整性的 invariant — neurons-tw 的題庫透過共享 subject id 與 medexam-tw 對齊（保證 `question.subject` reference 跨 content pack 解析正確）。這是 design-time 決策中**真正需要在 spec-level lock 的長期 invariant**（未來 change 不該破壞 subject id 對齊，否則 ~3505 題 reference 全斷）。

（不動 `content-pack-contract` / `theme-pack-contract`。兩個 contract 既有欄位足以容納本 change 所需的所有資料：`statSchema` optional / `displayName` 自由命名 / sprite key pattern open / `itemCatalog` 任意內容。）

## Impact

- **Files**:
  - `packages/content-neurons-tw/`：`src/index.ts` 改寫（empty stub → fetch loader）、`scripts/build.ts`（新）、`dist/meta.json` / `subjects.json` / `questions.json`（build 產生，gitignored）、`package.json` 加 build script
  - `packages/theme-pixel-neurons/`：`src/index.ts` 大改（補 cssVars + fonts + catalog）、`src/items.ts`（新）、`src/cosmetics.ts`（新）、`src/skillTree.ts`（新）、`styles/global.css` 擴充、`DESIGN.md` 擴充
  - `apps/neurons-tw/`：`src/App.tsx` 改（接 content + theme）、`public/content/neurons-tw/`（新目錄，build 後填）、`package.json` 加 prebuild hook
  - 根 `package.json`：加 `build:neurons-content`
  - 預估 ~15-20 個新檔 + 5-8 個 modified、~600-900 行新 code（多數是 catalog 資料）
- **APIs**: 無破壞性變更；`getContentPack()` signature 不變、`THEME_PIXEL_NEURONS` 仍滿足 ThemePack contract、subject id 與 medexam-tw 完全對齊（保證 question.subject reference 仍 resolve）
- **Dependencies**: 無新 third-party。Build script 可能用 `tsx`（已既有）
- **Tests / verify**:
  - `openspec validate wire-neurons-content-and-theme` passes
  - `pnpm --filter @study-rpg/content-neurons-tw build` 跑成功，produces `dist/meta.json` + `dist/subjects.json` + `dist/questions.json`，且 `questions.length === medexam-tw questions.length`
  - `pnpm -r typecheck` 跨 12 workspaces 全綠
  - `pnpm --filter @study-rpg/neurons-tw dev` 啟動 → Chrome MCP 驗證主畫面顯示 10 個 neuron family + 4 NT branch labels + 4 NT stat keys + 題目總數匹配 medexam-tw
  - 既有 一階 / 二階 apps 跑 regression check（dev boot + 主畫面 render OK）
- **Risk**:
  - **中**：subject id 必須與 medexam-tw 完全一致，否則 questions.json 中 `question.subject` 找不到 subject 條目；本 change 在 build script 加 assertion 保證
  - 命名爭議：10 個 family 對映的科學嚴謹度可能引起 review；對映表會在 design.md 內逐項列 PubMed/OE 文獻佐證 + 標出 lit confidence level；apply 階段保留快速調整空間（subject displayName 是純文字、不涉及任何 id reference）
  - License attribution：本 change 必須保留 陽明 CC-BY-NC credit（per content-pack-contract Requirement: Attribution is non-removable）
  - Sprite placeholder vs real：theme catalog 結構填了但 artKey 全指向 transparent PNG，dev mode 視覺空白；接受此 trade-off（sprite 在下個 change 補）
