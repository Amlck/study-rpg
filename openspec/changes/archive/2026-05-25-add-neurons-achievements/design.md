## Context

`apps/neurons-tw` 已具備四個主要 subsystem（connectome / variant gacha / family mastery / leaderboard），但缺少統合的成就回饋層。同時 `neurons-leaderboard` 從 day 1 就預留了 `badges_csv` column，至今一直是空字串 — 公開 surface 等著被填。

本 change 借鏡 二階 `achievement-system`（2026-05-24 ship）的 pattern 但全部換 neurons 語意。底層 `Achievement` / `AchievementTier` / `AchievementCategory` types 在 二階 ship 時已經發進 `@study-rpg/core` 並 published，本 change 直接 consume 不再重寫；neurons-specific 的 categories enum 是新的且**只在** neurons content pack 內定義，**不**寫進 core（mirror `theme-pack-contract` 哲學：core 提供 contract 不寫死 domain）。

**借鏡自 二階 `achievement-system`**，semantic mappings per `neurons-mode` Req 5：

| 二階 source 概念 | neurons-tw 對應概念 |
|---|---|
| 學習 (`study`) | 學習 (`study`) — 同名，sentry `total_study_min` |
| 答題 (`quiz`) | 答題 (`quiz`) — 同名 |
| 招募 (`recruit`) | **變體收集** (`variant`) — semantic shift: gacha 對象從醫師改成 neuron variant |
| 醫院經營 (`hospital`) | **連線** (`synapse`) — semantic shift: hospital tier / room → synapse state machine |
| 時運 (`fortune`) | 時運 (`fortune`) — 同名，sentry slot 4/5 pity / natural P1 |
| 隱藏 (`hidden`) | 隱藏 (`hidden`) — 同名 |
| 科別精通 (`subject`) | **家族精通** (`mastery`) — semantic shift: 14 醫學科 → 11 neuron family |

7 → 7 category 同 count；4 tier (P1 鑽石 / P2 金 / P3 銀 / P4 銅) 同邏輯。**獨立 spec**（`specs/neurons-achievements/spec.md`）— 不修改 `openspec/specs/achievement-system/spec.md` 任何一個字（per `neurons-mode` Req 5 borrowing rule「The follow-up change SHALL NOT modify the 二階 source capability spec」）。

## Goals / Non-Goals

**Goals:**

- 為 neurons-tw 提供 ~30 entry catalog 跨 7 個 category × 4 tier，覆蓋既有 4 個 subsystem 的所有自然 milestone（含跨 family 的 capstone）
- 立刻填充 `neurons-leaderboard` 既有但空白的 `badges_csv` field，讓玩家 nickname 旁邊出現有意義的 badges
- 提供建制 catalog 的 declarative pattern — 加一個成就 = 加一條 catalog entry（不需動 engine code）
- Build-time validator 保證 P1 鑽石 entry 必為 composite（≥ 2 of 量/質/持續/廣度）
- 純 client-side trigger pipeline，無新 backend code / 無 D1 migration / 無 Supabase migration
- 為 cross-device 與既有 progression 預留 silent backfill 路徑（app boot 跑一次；sync `onPullComplete` 由 `add-neurons-deploy` 接）
- TypeScript 型別系統拒絕未來 contributor 加 equipment / ticket / 新貨幣的 reward kind（discriminated union 只開 2 channel）

**Non-Goals:**

- ❌ 不 wire cloud sync `onPullComplete` 整合（neurons-tw sync engine 還沒建 — defer 到 `add-neurons-deploy`）
- ❌ 不 wire reading-timer 達成 `study` category（reading-timer 本身 absence 是另一個 follow-up；catalog 仍 ship `study` predicate 等 timer 上線自動 trigger）
- ❌ 不引入 cosmetic system（neurons 還沒 cosmetic pipeline — TS type 鎖死 reward kind 只允 `leaderboard` + `title`）
- ❌ 不影響既有 4 個 capability 的 spec（純 additive new capability）
- ❌ 不寫 D1 migration（沿用既有 `leaderboard_neurons.badges_csv`）
- ❌ 不寫 Supabase migration（本 change 完全不碰 Supabase）
- ❌ 不影響 二階 / 一階 achievement-system（純 neurons scope）

## Decisions

### Decision 1: Category set = 7 個 neurons-specific（不複用 二階 字面值）

**Choice**: 7 個 category 的 string literal 全部 neurons-specific：`'study' | 'quiz' | 'variant' | 'synapse' | 'mastery' | 'fortune' | 'hidden'`。

**Alternatives considered**:

- **A. 複用 二階 字面值**（'recruit' / 'hospital' / 'subject'） — 字面 cleaner 但語意 misleading（玩家在 neurons-tw 看到「招募達人」會困惑），且違反 `neurons-mode` Req 5「MUST rename all domain-specific terms (no "doctor" / "醫師" / "醫院" / "tycoon" / "room" in neurons spec)」字面要求
- **B. 用本 change 字面值**（'variant' / 'synapse' / 'mastery'）— neurons 玩家立刻看得懂，與 二階 也 trivially distinguishable，符合 borrowing rule

**Rationale**: 共用底層 type `AchievementCategory` 是 string union 寫進 `@study-rpg/core`，但 neurons content pack 內 declare 自己的 `NEURONS_ACHIEVEMENT_CATEGORIES` constant 並取用 union of 7 literal strings。Core 端的 `AchievementCategory` 是 base-permissive string；neurons-side 用 stricter literal 限定 — 這個 widening / narrowing pattern 跟 `content-pack-contract` 的 `statSchema` override 規則一致。

**Implication**: Core types 改用 `AchievementCategory = string`（已是 `@study-rpg/core` 公開 API — 須確認當前 union 已包含 neurons literal 或退讓 string）。Apply 階段先檢查 — 若當前 core 把 union hard-code 為 7 個醫療字面值，本 change 需 propose 一筆 ADDED Requirement 進 `core-npm-package` 把 union 改成 string base type。否則純 neurons-side declaration 即可。

### Decision 2: Tier system 4 階完全 mirror 二階

**Choice**: `'P1' | 'P2' | 'P3' | 'P4'` 完全沿用，連 zh-TW 顯示名（鑽石 / 金 / 銀 / 銅）都不改。

**Alternatives considered**:

- **A. 改用 5 階（P1–P5 套用 priority_levels.md 「夯 / 頂級 / 人上人 / NPC / 拉完了」）** — 跟 variant-gacha 的 P1–P5 rarity 系統字面對齊更乾淨，但成就場景下「拉完了」是負面詞，不適合慶祝 milestone
- **B. 4 階沿用 PSN Trophy 慣例（mirror 二階）** — 玩家對 Trophy 系統熟悉，跨 二階 / neurons 一致

**Rationale**: 成就是正向回饋；priority_levels.md 的「拉完了」P5 是「**很差**」語意，跟成就的 highest-merit 邏輯反向。鑽石/金/銀/銅 在所有遊戲文化中都是 ascending merit，零學習曲線。

**Implication**: `AchievementTier` type 直接 import 自 `@study-rpg/core`（二階 已 published）。priority_levels.md tier 沿用在 variant rarity 不受影響。

### Decision 3: Catalog 起步 30 entries，留空間 dogfood 後加

**Choice**:

| Category | Count | P1 | P2 | P3 | P4 |
|---|---|---|---|---|---|
| study | 4 | 1 | 1 | 1 | 1 |
| quiz | 5 | 1 | 2 | 1 | 1 |
| variant | 5 | 1 | 2 | 1 | 1 |
| synapse | 4 | 1 | 1 | 1 | 1 |
| mastery | 4 | 1 | 1 | 1 | 1 |
| fortune | 4 | 1 | 1 | 1 | 1 |
| hidden | 4 | 1 | 1 | 1 | 1 |
| **Total** | **30** | **7** | **9** | **7** | **7** |

P1 = 7 個 = 1 個 / category（覆蓋所有面向最頂的玩家），完美對齊 PSN Platinum 邏輯（每 category 各一頂）。

**Alternatives considered**:

- **A. ~42 entries 像 二階** — entry 量多但 neurons-tw 子系統較少（不像 二階 還有 mentor / event / fate-card 等），dogfood window 沒人 grind 用不到太多
- **B. ~20 entries 更精簡** — 容易讓某些 category 變單 P 落單，玩家 sub-collection 不爽
- **C. 30 entries（this choice）** — sweet spot，每個 category 都至少 4 entries 形成 ladder，total 落在 PSN 平均 trophy count（28-50）

**Rationale**: 玩家心理：rotation 30 个跑完是 healthy goal（dogfood ~2-3 month window 內可達成多數），不會 burnout；同時每個 category 都 ladder 全（P4 入門 + P1 capstone）。

### Decision 4: P1 composite enforcement — 走 metadata flag 而非 source parsing

**Choice**: `Achievement` entry 加 `composite?: true` flag。Validator 規則：「`tier === 'P1'` 必須 `composite === true`，否則 build 失敗」。Composite 的定義由作者在 catalog comment / description 自我 audit，**不**靜態分析 predicate function source 來推斷。

**Alternatives considered**:

- **A. 靜態分析 predicate 函式 source**（mirror 二階 validator approach if it does this） — 太脆，TypeScript AST 解析容易誤判 `||` `&&` `Math.min` 等 boolean composition，且重構 predicate 後 validator 也要跟著改
- **B. Composite metadata flag**（this choice） — 信任作者 audit、validator 只檢查 flag 存在；catalog comment 必須明寫 composite 的兩個 dimension 是什麼（自我 documentation）

**Rationale**: 二階 spec 雖然要求 validator 拒絕 pure-grind P1，但實作層面如何「自動偵測」是脆弱問題。Metadata flag 把責任放在 catalog 作者，validator 只負責「P1 必須宣告 composite」。如果作者寫 `composite: true` 但其實 predicate 是 pure grind，那是 PR review 該抓的問題，不是 validator。

**Implication**: 二階 `achievement-system` spec 的 composite 規則仍適用 — neurons 這邊不弱化規則，只是換 enforcement mechanism。spec 文字會明說「validator SHALL check `composite` flag on P1 entries」。

### Decision 5: Backfill 走 app-boot pass（不走 onPullComplete 因 sync engine 尚未存在）

**Choice**: app boot 完成 content pack load 後跑一次 `backfillAchievementsFromCurrentStats()`：

1. 讀 Dexie 所有 relevant tables 組 `AchievementStats`
2. Call `listUnlockedAchievements(stats, catalog)` 取現在 should-be-unlocked 的 entries
3. Diff vs `db.achievements.toArray()`
4. `bulkPut()` 缺的、`notificationShown: true`，**不** dispatch reward、**不** push toast / modal
5. Catch error log `[achievement-backfill]` channel，不破壞 boot

**Alternatives considered**:

- **A. 等 sync engine wire 後 onPullComplete 接**（mirror 二階 add-backfill-achievements-on-sign-in） — neurons-tw sync engine 還沒建（per `add-neurons-deploy` follow-up），等 sync engine 才 ship achievements 等於 chicken-and-egg；同時當前 single-device dogfood 也需要 backfill（已 ship variants / mastery 的玩家 reload app 後 catalog 上線時，現有狀態應該立刻 unlock）
- **B. App boot pass + 未來 sync engine 也接同一函數**（this choice） — 一個函數兩條 trigger path（boot 一次 + sync 完一次），單次 caller 都 idempotent；變動最小、未來 `add-neurons-deploy` 只加 `engine.onPullComplete(backfillAchievementsFromCurrentStats)` 一行
- **C. 純 sync engine 接，不做 boot pass** — 違反 single-device dogfood 場景的需求

**Rationale**: backfill 函數是 idempotent + side-effect-free（除了 `bulkPut`），多次呼叫只會在 diff non-empty 時寫一次。app boot + future sync hook 兩路徑共用零風險。

**Implication**: `services/achievement.ts` 直接 export `backfillAchievementsFromCurrentStats()`，App 元件 `useEffect(() => { backfillAchievementsFromCurrentStats() }, [])` 在 root layout 或 OverviewPage mount 時觸發一次（用 `useState` flag 防止 StrictMode double mount fire 兩次 — `bulkPut` 是 idempotent 所以即使 fire 兩次也無害，但 console.warn 訊息可能重複）。

### Decision 6: Reward channels = 2（leaderboard 勳章 + title），暫無 cosmetic

**Choice**: TypeScript discriminated union `AchievementReward = { kind: 'leaderboard' } | { kind: 'title'; title: string }`。`leaderboard` kind 是 implicit（所有成就都會走 `badges_csv`），`title` kind 顯式聲明要授予的稱號文字。

**Alternatives considered**:

- **A. mirror 二階 完整 3 channel（cosmetic + title + leaderboard）** — neurons-tw 還沒 cosmetic pipeline，cosmetic kind 會 silent-fail-as-log-intent，等於假承諾 reward
- **B. 純 leaderboard 一個 channel** — 失去 title 的 surface（玩家答 P1 鑽石 capstone 卻只多一個 csv tag 沒成就感）
- **C. 2 channel（leaderboard + title）**（this choice） — title 給 P1 / P2 大 milestone 加文字徽號（顯示在 SettingsPanel 可選），leaderboard 自動全覆蓋

**Rationale**: TypeScript 鎖死 union 才能保證 contributor 不會偷偷加 `cosmetic` / `equipment` / `ticket`。未來 neurons cosmetic 上線時 propose ADDED Requirement extend union，正當流程。

**Implication**: 30 entries 中約 7-10 個（P1 + 部分 P2）會帶 `reward: { kind: 'title', ... }`；其餘 entries 純 leaderboard 勳章。

### Decision 7: Streak counter shape — 沿用 二階 `currentQuizCorrectStreak` 字面（在 neurons Dexie meta table 內）

**Choice**: 在 neurons Dexie `meta` table 新增 2 個 row：

- `meta['currentQuizCorrectStreak']` — value 是 stringified number；LWW（correct +1 / wrong reset 0）
- `meta['maxQuizCorrectStreak']` — value 是 stringified number；MAX-merge（每次更新後檢查是否 > 既有）

**Alternatives considered**:

- **A. 新增獨立 `streakCounters` Dexie table** — overkill，2 個 scalar 用 table 太重
- **B. 沿用 meta key-value table**（this choice） — meta table 已存在，schema 不需動；型別保留 string 是 Dexie 慣例

**Rationale**: 2 個 scalar counter 沒必要單獨建 table；既有 meta key-value pattern（`lastResetDate` 已是 string-valued）是 idiomatic。

**Implication**: `services/connectome.ts` `recordCorrectAnswer` 收尾 +1 `current`、檢查並更新 `max`；`recordIncorrectAnswer` 收尾 reset `current` 為 0 但**不**動 `max`。讀取時 `parseInt(meta.get(key)?.value ?? '0')` parse 一次。

### Decision 8: Atlas 走 11×5 family-mastery grid（不是 二階 7×2 14-科 grid）

**Choice**: 2 張 atlas asset：

- `badge-atlas.png` 7×4 grid（7 category × 4 tier，128px cell → 896×512）— neurons category 換但結構 mirror 二階
- `family-mastery-atlas.png` 11×5 grid（11 family × 5 mastery tier P1-P5，128px cell → 1408×640）— **與** 二階 7×2 differ；neurons family 數量 = 11，且 mastery tier 是 5 階（per `neuron-family-mastery` spec）而非 二階 的 P2-only flat 圖

**Alternatives considered**:

- **A. Mirror 二階 11×P2-only grid** — 浪費 mastery 系統的 5 階信息（P5 Novice / P4 Familiar / P3 Proficient / P2 Expert / P1 Master），玩家看不出 family 達多少階
- **B. 11×5 full grid**（this choice） — 每個 family-mastery 組合都有獨立 art，玩家在 mastery chip / leaderboard 看到對應 tier 的視覺差異

**Rationale**: neurons 的 mastery 系統本來就 5 階（與成就 4 階不同），mastery badges 應該反映 mastery tier 而非 achievement tier。視覺信息密度更高且符合 mastery spec 預期。

**Trade-off**: 11×5 = 55 cells 都要 codex CLI 生圖，耗時較多。但 codex 一次 batch 可 60-90 分鐘搞定（按 codex_image_gen.md 每張 ~2-4 min），week 內可完成。Risk → mitigated by 開新 Gemini batch 平行做 fallback（per `image_gen_routing.md` routing — 簡單 icon 可走 Gemini 大幅提速）。

**Implication**: Achievement category atlas 跟 family-mastery atlas 是兩張獨立檔；render component 分別走 `<BadgeSprite category="..." tier="..." />` 和 `<FamilyMasteryBadgeSprite familyId="..." masteryTier="..." />`。

### Decision 9: Leaderboard `badges_csv` payload — 用 max-tier-per-category 序列化

**Choice**: client 端 `deriveAchievementSnapshot(unlocked: Achievement[]): string` 串聯邏輯：

1. group `unlocked` by `category`
2. each group take `min(tier)` （P1 < P2 < P3 < P4 ascending merit，所以「best」是 numerically min — 寫成 helper `tierRank('P1') === 1`）
3. sort by category name alphabetical（deterministic ordering）
4. format `"<category>:<tier>"` per group
5. join with `,`
6. 結果如 `"mastery:P2,quiz:P1,study:P3,synapse:P2,variant:P1"` — max 7 entries, max ~84 chars

**Regex validation**: Worker 已驗 `^([a-z]+:P[1-4])(,[a-z]+:P[1-4]){0,5}$`（per `neurons-leaderboard` Req 5）— 7 categories vs Worker 限 6 entries 超 1 個，**需驗**：

- 看 Worker 限 `{0,5}` = 1 + 5 = 6 entries max
- neurons categories 數 = 7，最壞情況超 1

**Mitigation options**:

- **A. Push 階段 drop hidden category**（永遠不出現在 leaderboard CSV，hidden 本來就 player-private） — neurons 7 → 6 categories on wire，fit Worker regex
- **B. Push 階段 drop fortune category**（fortune 信息對其他玩家較不關注） — arbitrary cut，A 更有 semantic justification
- **C. Patch Worker regex 改 `{0,6}`** — Worker 改 = 一行修，但需 Worker deploy + smoke

**Chosen**: A — hidden category **永不** 出現在 `badges_csv`（既保留現有 Worker regex，又 align 「hidden 是 player-private 慶祝」語意）；同時當前 spec 也保留 future-proof 注解。

**Implication**: `deriveAchievementSnapshot` filter out hidden category 後 max 6 entries — Worker regex 直接過。Hidden achievements 仍會 unlock + 進 Dexie + 進 AchievementsPage 顯示，只是不公開到 leaderboard。

### Decision 10: 解鎖 toast / modal 走 `neurons-motion-library` 既有 primitives

**Choice**:

- `AchievementUnlockToast`（P2-P4 trigger）— wraps `neurons-motion-library` 既有 `<Toast>` 或 `ConnectomeToastHost` pattern；auto-dismiss = `TOAST_AUTO_DISMISS_MS` import；entry animation `useRespectsReducedMotion` honor
- `AchievementUnlockModal`（P1 trigger）— full-screen overlay dismiss-required；mirror 既有 `VariantUnlockModal` shape

**Alternatives considered**:

- **A. 自寫 toast / modal component** — 違反 motion library single-source-of-truth；每個 toast 各自 timing 容易 drift
- **B. 沿用 motion library**（this choice）— 一致 timing + reduced-motion 統一處理

**Rationale**: `neurons-motion-library` 是專為這條 track 建的 primitive library（`add-neurons-motion-library` 已 ship）；achievement toast / modal 就是它預期的下游 consumer。

**Implication**: 兩個 component 都 import `TOAST_AUTO_DISMISS_MS` + `useRespectsReducedMotion` from `'../lib/motion'`。`AchievementUnlockModal` 額外 import `<NumberTickUp>` if 顯示成就數字（如 streak），mirror mastery chip pattern。

## Risks / Trade-offs

[**R1 — Validator 拒絕 P1 pure grind 走 metadata flag，contributor 可能 lie**] → 接受。Catalog file 在 review 時人眼看 `composite: true` 對 predicate 寫的合理性是低成本 check；自動化 source parsing 工程成本太高且容易誤判。

[**R2 — 30 entries 不夠 hardcore 玩家持續 chase**] → 接受。Catalog 設計成 declarative 加 entry trivial；dogfood 期間 telemetry 看 30 全部 unlock 的玩家 → 開 follow-up change 加第 31-50 entry。Pre-launch 不過度 over-engineer。

[**R3 — `badges_csv` Worker regex 上限 6 entries，neurons 7 category 超 1**] → mitigated by Decision 9（hidden 不進 leaderboard csv）。但 future 加 8th category 就要 patch Worker regex；不應在 hidden 之外再加 category。

[**R4 — atlas 共 55 + 28 = 83 cells，codex CLI 生圖耗時長**] → mitigated by batch strategy + Gemini MCP fallback per `image_gen_routing.md`。Apply 階段一張 atlas 走 single codex prompt 一次出（128×128 cell × 7×4 grid 在一張圖 1024×512），不分張，總時間 ~10 min / atlas。如果 codex 卡 sensitive word（neurons 詞應該安全）改 Gemini。

[**R5 — App-boot backfill 在 fresh-install 新玩家會跑 1 次 + state 全空 → 寫 0 entries**] → 接受，1 次 overhead < 50ms（catalog scan + 0 個 Dexie row）。可加 `if (await db.familyAccrual.count() === 0) return` 提前 short-circuit，但 marginal saving。

[**R6 — Reading-timer absence → study category 永不 trigger，玩家會困惑「為什麼 study 區永遠 0/4」**] → mitigated by AchievementsPage 在 study category header 加注解「※ 需 reading-timer feature（即將推出）」直到 reading-timer follow-up ship。同時 dogfood window 內 study 區會留白是事實。

[**R7 — Dexie v5 migration 對既有 v4 玩家 — 應該乾淨，因為 additive**] → 已驗證 v3→v4 (add leaderboardProfile) 是 pure additive，本 change 同 pattern 添加 `achievements: 'id, unlockedAt'`，risk ≈ 0。仍須在 apply 階段 dev console 驗證 indexeddb upgrade callback fire 一次。

[**R8 — TypeScript discriminated union 鎖死 reward kind 後，未來想加 cosmetic 需要 propose 新 change**] → 這是 intended feature，不是 risk。鎖死本身是 spec 強制要求（Req «No new currency»）。未來加 cosmetic 走正常 OpenSpec flow。

## Migration Plan

**Deploy steps（apply 階段 + post-archive）**:

1. Catalog + types + engine wire（content pack + core consume）
2. Dexie v5 migration（schema only, additive）
3. Trigger hooks（3 service call sites）
4. Streak counter persistence（meta table 2 keys）
5. UI shell（AchievementsPage + components + toast queue）
6. Leaderboard integration（`deriveAchievementSnapshot` + payload + LeaderboardPage render）
7. Atlas assets（codex CLI batch 2 張）
8. Backfill service + boot-time hook
9. Manual dual-prod smoke（dev + Cloudflare Pages staging）
10. Archive change

**Rollback strategy**:

- 純 client-side change，無 backend migration、無 D1 / Supabase change
- Rollback = revert commit + push；既有 Dexie v5 玩家會在 fallback 後跑 v4 schema：Dexie 不會 downgrade，會 keep v5 table 不動；只是新 deploy 的 code 不會 read/write `achievements` table，等於 silently disabled
- `badges_csv` 在 Worker side default to empty string，rollback 後 leaderboard 退回 nickname-only 顯示，無 negative impact

**No-go conditions（archive 前 fail 任一就不 archive）**:

- Worker `POST /leaderboard/neurons/upsert` 跑 `badges_csv: "mastery:P2,quiz:P1"` 回 200 + D1 row 真的有寫 csv
- Backfill 在 fresh install / state-rich 兩個 fixture 都不報錯
- `bulkPut(achievements)` 在 StrictMode double-mount 不噴 ConstraintError
- Validator catch 一筆 fake P1 pure-grind entry build fail（test fixture）
- AchievementsPage hidden filtering 真的 strict（locked hidden 完全不出現，不留 silhouette）

## Open Questions

- **Q1: 二階 `@study-rpg/core` 的 `AchievementCategory` 究竟是寬鬆 string 還是 strict union？**  
  → Apply 階段 first task = read `packages/core/src/types.ts` 確認；若 strict union 只含 7 個醫療字面值 → 同 change 加 1 個 ADDED Requirement 進 `core-npm-package` capability 把 union 改成 base string + neurons-side 自宣 literal narrowing
- **Q2: title reward 在哪裡 surface？**  
  → 預期 `LeaderboardSettingsControls` 加 dropdown 讓玩家從已解鎖 titles 選 1 個 display；apply 階段定 exact placement
- **Q3: 是否需要 toast queue throttle**（同一 push session 多個 trigger fire 同時）？  
  → 二階 既有 queue 是 sequential pump 8s 各跑一次；neurons 沿用同 pattern，預計 dogfood window 一次成就連發機率低
- **Q4: hidden 4 entries 的具體 predicate 內容 → 留 apply 階段 final design**  
  → Spec 描述 hidden 為 cross-cutting easter egg，留 catalog file 內 inline comment 詳述每個 trigger condition

## Borrow Reference Summary

借鏡自 二階 `achievement-system`（`openspec/specs/achievement-system/spec.md`）的設計 pattern：

- 7 category × 4 tier 結構 ✓
- Build-time composite validator for P1 ✓（換 metadata flag 實作）
- Diff-based unlock detection（`checkAchievementUnlocks`）✓
- Silent backfill on pull complete（adapted to boot pass）✓
- P1 full-screen modal + P2-P4 toast ✓
- Strict hidden filtering ✓
- TableAdapter R2 passenger（adapted: defer until `add-neurons-deploy` wires sync engine）✓
- atlas + sprite atom approach ✓

**Semantic mappings**:

- doctor → neuron variant
- 醫師招募 → variant gacha (AP slot unlock)
- 醫院 tier upgrade → synapse state machine transition
- subject_mastery_count → family_complete (5/5 variants) — 已 reserved 在 leaderboard schema，本 change 不需新 column
- recruitment_log → variant gacha history
- 14 科 → 11 family
- 3 reward channel → 2 reward channel（cosmetic kind 暫不開放）

**Independent capability spec** at `openspec/specs/neurons-achievements/spec.md` per `neurons-mode` Req 5 — **不**修改 `openspec/specs/achievement-system/spec.md`。
