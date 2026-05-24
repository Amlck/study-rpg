## Why

`apps/medexam-tw`（一階國考遊戲，M2 已 ship）目前是醫學生 → 醫師養成 RPG 主題。owner（dogfood 玩家本人 + 一階考生）希望保留全部 ~3505 題題庫 / 答案 / 詳解，但把整套主題敘事換成以 Long-term potentiation（LTP）為核心隱喻的神經元收集遊戲（"Neurons that fire together, wire together"）—— Hebbian metaphor 跟 spaced-repetition 的真實神經機制天然同調，且像素風可愛神經元角色比「醫學生養成」更有持續收集動機。

設計收斂依據：`~/.claude/scratch/grilled-neurons-tw-spec-prep-2026-05-25.md`（grill quick 6 條決策）+ `~/.claude/plans/long-term-potentiation-neurons-that-fir-dynamic-sundae.md`（plan 全文）。本 change 範圍**只到 scaffold** —— 建 2 個新 packages + 1 個新 app 空骨架、定義 `neurons-mode` capability spec、更新 roadmap row。Content ingestion / theme catalog / connectome viz / 借鏡自 二階 的 gacha / mastery / leaderboard / achievement 各拆獨立 changes。

對標 `2026-05-15-add-hospital-mode-scaffold` 的 cadence（scaffold-only + 1 umbrella spec + punt 細節）。

## What Changes

- 新增 **2 個 package + 1 個 app**（**scaffold-only，無 game logic**）：
  - `packages/content-neurons-tw/` — 神經元主題 content pack target（empty placeholder ContentPack）
  - `packages/theme-pixel-neurons/` — 神經元主題 theme pack（fork minimal scaffold from `theme-pixel-medical`）
  - `apps/neurons-tw/` — Vite + React app shell（一行 placeholder title，不接 sync / auth / game logic）
- 新增 capability `neurons-mode`，定義神經元遊戲的 Hebbian game loop、4-NT stat schema、Linnean taxonomy 視覺路線、跟 二階 設計借鏡聲明
- 更新 `openspec/project.md` Roadmap：新增「M_3rd track（neurons-tw dogfood）」row，與 M_2nd 並行；更新 medexam-tw 進入 maintenance mode 的聲明
- Root `package.json` 加 `dev:neurons` / `build:neurons` alias（一階仍 5173 port、二階 5174、神經元 5175）
- `pnpm install` + `pnpm -r typecheck` 兩個新 packages + app 跑通（empty exports 即可）

**Out of scope**（明確留給後續 changes，不在此 change 完成）：

- 神經元 content pack 填充：subject id → neuron family displayName 改名、statSchema 覆蓋（4 NT）、build script wiring → 拆 `wire-neurons-content-and-theme`
- Theme catalog 填充：item / cosmetic / skill tree 4 NT 分支結構 → 拆 `wire-neurons-content-and-theme`
- Connectome 譜系視覺 + Hebbian synapse formation 機制 → 拆 `add-connectome-collection`
- Neuron variant gacha（借鏡 二階 `recruitment-gacha` + `affinity-specialty-bonus`）→ 拆 `wire-neuron-variant-gacha`
- Neuron family mastery 追蹤（借鏡 二階 `hospital-mastery`）→ 拆 `wire-neuron-family-mastery`
- Neurons leaderboard（借鏡 二階 `hospital-leaderboard` 的 D1 + KV + Worker pattern）→ 拆 `add-neurons-leaderboard`
- Neurons achievement system（借鏡 二階 `achievement-system` 的 4-tier badge + atlas pattern）→ 拆 `add-neurons-achievements`
- Sprite 美術（neuron family × 5 rarity variant 等 ~200 張 sprite via codex CLI）→ 拆 `generate-neurons-sprites`
- Deploy（Cloudflare Pages target on `med-study-rpg.com`、auth OAuth allowlist 加 neurons-tw origin、medexam-tw 加 banner 指向 neurons-tw）→ 拆 `add-neurons-deploy`
- 跨 app 資料共享 / save migration / cross-app recognition（grill 已 lock 為「完全獨立」）— **永久 out of scope**

## Capabilities

### New Capabilities

- `neurons-mode`: 神經元主題遊戲 mode 的高層 contract — Hebbian game loop、4 NT stat schema（DA / 5-HT / GABA / Glu）、Linnean taxonomy 視覺路線、跟 二階 4 個 capability 的設計借鏡關係聲明、跨 app 資料完全隔離聲明

### Modified Capabilities

（無 —— 既有 `content-pack-contract` / `theme-pack-contract` / `engine-rewards` / `loot-mechanics` 等都保留不動。已驗證兩個 contract 的既有欄位足以容納神經元主題的 displayName 改名 + statSchema 覆蓋 + 新 sprite key，不需 delta。本 change 是 contract 的第二個 dogfood fork（M_2nd 是第一個），不是 contract 變更。）

## Impact

- **Files**: 純 scaffold + spec — 2 新 packages 的 `package.json` / `tsconfig.json` / `src/index.ts` / `README.md` + 1 新 app 的 Vite shell（`vite.config.ts` / `index.html` / `src/main.tsx` / `src/App.tsx`） + 1 新 capability spec + roadmap row。預估 < 15 個新檔案、< 400 行新 code（多數是 boilerplate）。
- **APIs**: 無破壞性變更；新 packages 各自 export `getContentPack()` / `theme` 等符合既有 contract 的 placeholder。`@study-rpg/core` 介面零變更。
- **Dependencies**: 無新 third-party。新 packages 依賴 `@study-rpg/core@workspace:*` + `react ^18` + `vite ^5` + `typescript ^5.4`，全部既有。
- **Branch / worktree**: 本 change 落在新 worktree `~/coding-scratch/study-rpg-neurons/`（branch `track-neurons`，從 main 分出），對標 二階 `track-m2` worktree pattern。dual-worktree → triple-worktree。
- **Tests / verify**:
  - `openspec validate add-neurons-mode-scaffold` passes
  - `pnpm install` workspace 認到 8 個 workspace（既有 5 + 新 3）
  - `pnpm -r typecheck` 全綠（包含 empty exports）
  - `pnpm --filter @study-rpg/neurons-tw dev` Vite boot 成功在 port 5175，瀏覽器看到 placeholder title
  - `pnpm --filter @study-rpg/medexam-tw dev` 一階 app regression check 通過（5173）
  - `pnpm --filter @study-rpg/medexam2-hospital-tw dev` 二階 app regression check 通過（5174）
- **Risk**:
  - **低** — scaffold-only，沒動 core engine、既有 themes、既有 contents、既有 apps、橫向 sync / auth / leaderboard / bug-report 等子系統
  - License 風險：neurons content pack 跟一階共用同一份題庫 + 詳解（陽明 CC-BY-NC 來源），credits 在 `wire-neurons-content-and-theme` 階段完整 wire 入 meta.json + App footer
  - Monorepo 三 app 並行建議 build time 增加；M_3rd 後期評估是否要拆 repo（M3 npm publish 是合流點，已驗證 fork-from-registry 可行）
