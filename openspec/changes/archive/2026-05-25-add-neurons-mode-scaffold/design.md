## Context

study-rpg monorepo 目前有兩條 fork track：

| Track | App | Theme | Content | Worktree / Branch |
|---|---|---|---|---|
| M2 一階 | `apps/medexam-tw` | `theme-pixel-medical` | `content-medexam-tw` | `~/coding-scratch/study-rpg` / `main` |
| M_2nd 二階 | `apps/medexam2-hospital-tw` | `theme-pixel-hospital` | `content-medexam2-tw` | `~/coding-scratch/study-rpg-m2` / `track-m2` |

兩條 track 共用 `@study-rpg/core@^0.2.0`（已 publish 至 npm 並由 M_2nd fork 驗證 registry-resolved 可行）。Engine API 完全 content-agnostic：gacha / SRS / streak / mentor / cosmetic milestone / boss / skill tree fallback 等都 stable，無醫學主題假設。

`content-pack-contract` 與 `theme-pack-contract` 均允許：
- `Subject.displayName` 自由命名（neuron family 名稱可直接寫入，無需 contract delta）
- `ContentPackMeta.statSchema` 可選覆蓋（4 NT stat schema 走此管道）
- 任意 sprite key（neuron sprite 加入 `cosmetic-*` / `character-base` / 自訂 key 都符合既有 sprite map 規則）

本 change（M_3rd track 起手式）建立第三條 fork track：神經元主題 + 借鏡 二階 4 個 capability 設計 pattern。Cadence 對標 `2026-05-15-add-hospital-mode-scaffold`（scaffold-only + 1 umbrella capability + punt 細節）。設計收斂依據：`~/.claude/scratch/grilled-neurons-tw-spec-prep-2026-05-25.md`。

## Goals / Non-Goals

**Goals:**

- 建立 `track-neurons` 分支與 `~/coding-scratch/study-rpg-neurons/` worktree，作為後續所有 `*-neurons-*` / `*-connectome-*` changes 的開發 base
- 用 **最小 scaffold** 證明三條 fork track 在同一 monorepo 內並行可行（5 → 8 workspace packages）
- 定義 `neurons-mode` umbrella capability，描述 Hebbian game loop / 4 NT stat schema / Linnean taxonomy 視覺路線 / 借鏡 二階 4 個 capability 的 design pattern 關係 / 跨 app 完全隔離聲明
- 維持 一階 + 二階 完全可用（regression check 通過）

**Non-Goals:**

- **不**填充任何 game content（題庫對映、subject 改名、stat schema 覆蓋值 → 拆 `wire-neurons-content-and-theme`）
- **不**填充任何 theme catalog（item / cosmetic / skill tree 結構 → 拆 `wire-neurons-content-and-theme`）
- **不**實作 connectome 譜系視覺或 synapse 機制（→ 拆 `add-connectome-collection`）
- **不**接 sync / auth / leaderboard / bug-report / achievement（→ 拆給後續 4 個 changes）
- **不**生 sprite（→ 拆 `generate-neurons-sprites`）
- **不**設定 deploy / CF Pages binding / OAuth allowlist / medexam-tw deprecation banner（→ 拆 `add-neurons-deploy`）
- **不**支援從 medexam-tw 匯入存檔（grill 已 lock 為「不處理」）
- **不**做 cross-app data sync / cross-app achievement recognition（grill 已 lock 為「完全獨立」）

## Decisions

### Decision 1: 第三條 fork track 用獨立 worktree + branch（不嘗試在 main 內直接做）

**Choice**: 新建 `~/coding-scratch/study-rpg-neurons/` worktree on `track-neurons` branch，從 `main` 分出。

**Why**:
- 對標 `track-m2` 既有的 dual-worktree pattern（已驗證的 multi-agent git safety convention，見 `~/.claude/imports/multi_agent_git_safety.md`）
- 神經元 track 將是長期 active development target（neurons 為主、medexam-tw 凍結），需獨立 branch 累積 commits 後 merge 回 main
- 避免 main branch 同時混 一階 hotfix / 二階 sync / 神經元 in-progress 三類變動
- Sync protocol：`cd ~/coding-scratch/study-rpg && git merge track-neurons`（post-archive），跟 `git merge track-m2` 同 cadence

**Alternative considered**: 直接在 main worktree 做 — 拒絕，因為長期混 三 track 變動會撞 multi-agent git safety race（已有 m2 + hotfix worktree 同時在跑）。

### Decision 2: 不動 content-pack-contract 與 theme-pack-contract

**Choice**: 已 read 兩個 contract spec（openspec/specs/content-pack-contract/spec.md + theme-pack-contract/spec.md），確認既有欄位足以容納神經元主題的所有需求（displayName 自由命名 / statSchema optional override / sprite key pattern open）。

**Why**:
- 修改 contract 影響三個 fork（medexam-tw / medexam2 / neurons-tw），改動成本高、必要性低
- 既有 contract 已 dogfood 過 二階 fork（M_2nd 把 statSchema / sprite key / scenes / doctorSlotPositions 都加進來），證明 extension point 充足
- 神經元 track 的設計差異（4 NT stat / Linnean taxonomy / 譜系樹視覺 / Hebbian synapse）都在 content + theme + app code 層解決，不需動 contract 介面

**Alternative considered**: 加 `ContentPackMeta.neuronFamilyMap` 之類 neurons-specific 欄位 — 拒絕，因為這會讓 contract 渲染成 neurons-specific，違反 content-agnostic 原則。neuron family 對映表放 `content-neurons-tw/src/index.ts` 內部就好。

### Decision 3: Umbrella capability spec `neurons-mode` 採高層 contract，所有實作細節 punt

**Choice**: `specs/neurons-mode/spec.md` 對標 `hospital-management-mode` 格式，只寫 capability-level requirement + GIVEN/WHEN/THEN scenario，不寫 component name / DB schema / 數值 threshold。所有實作細節在後續 wire-* / add-* changes 的 design.md 階段補。

**Why**:
- Capability spec 是長期 contract（archive 後寫進 `openspec/specs/`），改動成本高；實作細節變化快
- 二階 `hospital-management-mode/spec.md` 已驗證此格式可用（236 行寫高層 contract、所有具體 mechanics 都 punt 到 wire-hospital-tycoon-engine / wire-recruitment-gacha 等）
- 後續 8 個 follow-up changes 各自負責一個 sub-capability spec（connectome-collection / neuron-variant-gacha / neuron-family-mastery / neurons-leaderboard / neurons-achievements），避免 umbrella spec 變成倉庫式包山包海

**Alternative considered**: Umbrella spec 直接寫死所有 mechanics — 拒絕，理由同上。

### Decision 4: 借鏡 二階 capability 設計 pattern 但建立獨立 neurons-* capability spec

**Choice**: 神經元 track 的 gacha / mastery / leaderboard / achievement 各建立自己的 capability spec（`neuron-variant-gacha` / `neuron-family-mastery` / `neurons-leaderboard` / `neurons-achievements`），不重用 `recruitment-gacha` / `hospital-mastery` 等 二階 capability。

**Why**:
- 二階 capability 的 spec wording 充滿醫院 / 醫師 / 病房等語意（`hospital-mastery` 描述「14 科 mastery 計數」），直接套用會語意錯亂
- 借鏡的是**設計 pattern**（P1-P5 rarity + 保底機制 + affinity gate + D1 + KV cron + 4-tier badge atlas），不是 spec 文字
- 獨立 capability 讓 三 track 的 spec 可獨立演進（例：未來 二階 改 6-tier rarity 不會影響 neurons）
- 每個 wire-* change 在 design.md 明引「借鏡自 二階 `<cap>`」+ 語意差異對映表（doctor → neuron variant / room → NT branch / 醫院 tier → mastery level）

**Alternative considered**: 嘗試 generalize 既有 `recruitment-gacha` spec 讓 neurons 共用 — 拒絕，因為 generalization 會打破 二階 既有 spec 的 stability，且 spec dedup 不是 OpenSpec 的目標（spec 是 contract 不是 code）。

### Decision 5: Vite dev port 5175（5173 = 一階、5174 = 二階）

**Choice**: 神經元 dev server 用 port 5175，跟既有兩 app 並行不衝突。

**Why**: 既有 port allocation 慣例（per `openspec/project.md`），三 app 同機開發 dev mode 不撞。

### Decision 6: 命名 `theme-pixel-neurons` 沿用 `theme-pixel-*` 慣例

**Choice**: 新 theme package 取名 `@study-rpg/theme-pixel-neurons`，不用 `@study-rpg/theme-neurons` 或 `@study-rpg/neurons-theme`。

**Why**: 既有 `theme-pixel-medical` + `theme-pixel-hospital` 慣例已 lock，加 `pixel` 強調風格 + 為未來可能的 `theme-modern-neurons` 留 namespace。

## Risks / Trade-offs

- **[Worktree 數量爆炸]** → triple-worktree（main / m2 / neurons）+ 偶發 hotfix worktree，clone 多份 → 接受成本（pnpm symlink 共享 node_modules 透過 pnpm store，磁碟用量可控；每 worktree 約 200 MB 新 install）
- **[Merge conflict 頻度]** → `openspec/project.md` Roadmap 一檔三 track 同時改，常 conflict → mitigate: 每次 sync 前先 `git status` + `git diff main..track-neurons -- openspec/project.md` 預看；conflict 一律以時間順序 manual 解（不用 ours / theirs）
- **[一階 medexam-tw 同時收 bug fix vs 凍結聲明衝突]** → 「凍結」≠「不修 bug」，但「凍結」意味不接新 feature；mitigate: 在 spec 明寫「medexam-tw enters maintenance mode but continues to receive critical bug fixes via L1 hotfix worktree」
- **[Sprite gen quota 風險]** → ~200 sprite via codex CLI 估 ~10 hr wall + reasoning token 用量大 → 拆 `generate-neurons-sprites` 後再評估；scaffold 階段不碰
- **[CF Pages 帳號 / 域名變動風險]** → med-study-rpg.com 已 owner own + CF Pages 已驗證 一階 + 二階 deploy 可行（per `add-med-study-rpg-domain-migration`）→ 風險低，但 deploy 細節留 `add-neurons-deploy` 階段對齊 OAuth allowlist + Worker custom domain

## Migration Plan

本 change scaffold-only，無 production migration。Steps：

1. 在新 worktree 內建 2 package + 1 app 空骨架（檔案清單見 tasks.md）
2. Root `package.json` 加 `dev:neurons` / `build:neurons` script alias
3. `pnpm install` 從 monorepo root 跑（在 study-rpg-neurons worktree 內），認到 8 個 workspace
4. `pnpm -r typecheck` 全綠（empty exports 也算過）
5. 三個 app 各跑一次 `pnpm --filter @study-rpg/<app> dev` 確認 boot（5173 / 5174 / 5175）
6. `openspec validate add-neurons-mode-scaffold` passes
7. **不**做 deploy / 不 push（push 留給 archive 階段，owner confirm）

**Rollback**: 刪除 worktree（`git worktree remove ~/coding-scratch/study-rpg-neurons`）+ 刪除 branch（`git branch -D track-neurons`）+ 刪除新增 packages / apps 資料夾。本 change 無 schema migration / 無 production write。

## Open Questions

- **Subject id ↔ neuron family 對映表的最終確定**：grill 已 lock「走真實 connectome + Linnean taxonomy」但具體 10 個科目對映到哪個 neuron family，需要查神經科學文獻交叉驗證。Punt 到 `wire-neurons-content-and-theme` change 的 design.md（建議用 `/grill quick` 跑一輪命名審視 + WebSearch 神經科學文獻）。
- **CF Pages 路徑 slug**：`/neurons/` vs `/3rd/`（前者語意、後者數列）vs root `/` 取代 一階（neurons 主導後 medexam-tw 推到 `/1st/` 並保持凍結）。本 change 不決定，留 `add-neurons-deploy` 階段 grill clarify 後 lock。
- **譜系樹 vs Hebbian synapse 兩層視覺的具體互動**：譜系是 static taxonomy、synapse 是動態跨 cluster 連線；UX prototype 在 `add-connectome-collection` change 階段試做後決定。
- **Achievement atlas 是否獨立**：sprite atlas pattern 跟 二階 共用還是 neuron-themed 獨立？偏好獨立，但留 `add-neurons-achievements` 階段決定。
- **Cosmetic 跟 character base sprite 是否復用 二階 doctor sprite 的繪製 pipeline**：codex CLI gpt-image-2 + nearest-neighbor + 16-color quantize 既有 pipeline 適用，但 character base 是否要做（neurons-tw 的「角色」是 connectome 譜系，不是 character）— 留 `wire-neurons-content-and-theme` 階段釐清。
