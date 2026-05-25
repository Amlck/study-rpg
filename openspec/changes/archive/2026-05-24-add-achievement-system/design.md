## Context

二階 hospital mode 既有 [cosmetic milestone pattern](../../../packages/core/src/lib/cosmetic.ts) 是「predicate → diff → unlock」純資料驅動的成就藍本，已經 ship 且 stable。新成就系統設計直接 mirror 它、不發明新架構。

關鍵約束：
1. **R2 migration (`add-r2-cloud-sync-migration`) 進度**：Phase 3.1-3.15 已 ship、reads 已 cut R2，[LEADERBOARD_PROFILE adapter](../../../apps/medexam2-hospital-tw/src/lib/sync/tables.ts) (commit `cfaaa32`, 2026-05-21) 已建立「新表 R2-only、不碰 Supabase」 precedent
2. **CF Pages 雙部署**：今天 (2026-05-23) 才 archive 的 `align-cf-pages-deploy-with-gh-actions` codify 了 GH Pages + CF Pages 並行部署
3. **Equipment PR #7**：user 明確要求 defer、本 change 完全不依賴
4. **遊戲時程**：speedrun 1 月、longplay 6 月——tier 門檻必須校準到「P4 銅 everyone 拿、P1 鑽石不是每人都拿得到」
5. **業界藍本**：OSS 參考含 Cataclysm DDA / SuperTuxKart / Wesnoth / TNNT / Awards mod / Habitica（plan 內詳）；4-tier 對齊 PlayStation Trophy

## Goals / Non-Goals

**Goals:**
- 建立長期承諾 ritual + 玩家差異化身份信號 + 隱藏玩法 hook，**不破壞現有 economy**
- 一份成就 JSON 改動即新增條目（零 engine code）— M3 fork-friendly
- Leaderboard 勳章顯示在 nickname 旁，視覺**一眼**辨識玩家 progression style
- 新表走 R2-only sync，**不增加** Supabase 端後續 cleanup 負擔
- 走既有部署 pipeline（GH Pages + CF Pages + CF Worker auto-deploy），無新 workflow

**Non-Goals:**
- 不發裝備獎勵（PR #7 defer，不耦合）
- 不發 achievement points / gamerscore 累計 currency
- 不做一階 (`apps/medexam-tw/`) — 只做二階
- 不做朋友 social leaderboard achievement 顯示（M6 範圍）
- 不做跨 app 成就（一階達成解二階）
- 不為每個成就客製 sprite — 共用「類別 × tier」 + 「subject icon × P2 金」兩張 atlas

## Decisions

### D1: 4-tier 制（P1 鑽石 / P2 金 / P3 銀 / P4 銅）對齊 PSN Trophy

**Decision**: 採 4-tier 而非既有 priority_levels.md 的 5 階通用程度語意（P1 夯 / P2 頂級 / P3 人上人 / P4 NPC / P5 拉完了）。本 change 內 P1-P4 是 local 重定義成 4 階獎牌 tier；文件其他地方不受影響。

**Rationale**:
- PSN Trophy 是 game-industry standard，玩家直覺對應銅銀金鑽
- 4 階給「P1 不是每人都拿得到」明確分層空間
- 既有 priority_levels.md 5 階是程度光譜（NPC = 平庸、拉完了 = 拉跨），不適合「成就稀有度」語意

**Alternatives considered**:
- 3-tier (銅/銀/金): 拒——少了「終局稀有」分層，speedrun vs longplay 差異感不夠
- 5-tier 沿用 priority_levels: 拒——「拉完了」級成就語意矛盾
- Steam-like 0-100 gamerscore: 拒——破壞「不發新 currency」原則

### D2: R2-only sync (mirror LEADERBOARD_PROFILE precedent)，**不**碰 Supabase

**Decision**: 新 `ACHIEVEMENTS` TableAdapter 只註冊在 `M2_ADAPTERS`（**不**放 `HOSPITAL_ADAPTERS`）。不開 Supabase migration、不改 `upsert_lww` whitelist、不加 RLS policy。

**Rationale**:
- `LEADERBOARD_PROFILE` (commit `cfaaa32`, 2026-05-21) 已確立此 pattern：`apps/medexam2-hospital-tw/src/lib/sync/tables.ts:658` 注解明白寫「lives only in M2_ADAPTERS (passenger of the R2 m2 bundle)」
- R2 migration 文件明寫「Dropping Supabase sync tables 是 separate change after 2-week soak post-cutover」；新表進 Supabase = 給未來 cleanup change 增加負擔
- Reads 已 cut R2（per `add-r2-cloud-sync-migration` task 進度），新表寫 Supabase 不會被讀

**Alternatives considered**:
- Dual-write (Supabase per-row + R2 bundle): 拒——overdesign、增加 cleanup 負擔、不跟最新 precedent 一致
- 純 IndexedDB 不 sync: 拒——多裝置玩家失去成就跨裝置同步

### D3: 單張 atlas + tier 配色，**不**為每個成就客製 sprite

**Decision**: 主 atlas 6 類別 × 4 tier = 24 cells (512×768)；subject atlas 7×2 = 14 cells (896×256)。任何 P3 銀的學習成就都共用「銀書盾」、任何 P1 鑽石的招募成就都共用「鑽石卡」。

**Rationale**:
- 49 條成就客製 sprite = 49 張獨立美術 = 完全不可行（成本爆炸 + 風格難一致）
- Atlas 共用 sprite 仍能傳達 symbolic 表徵：「該玩家曾解過該類別該 tier 的成就」
- 一次 codex 生 24 cells (~4-5 min wall, ~40K tokens) 走 [image_gen_routing.md](../../../../.claude/imports/image_gen_routing.md) routing

**Alternatives considered**:
- 每個成就客製 art: 拒——成本不可行
- 純文字 chip (無 sprite): 拒——leaderboard 顯示沒視覺信號、無法快速辨識
- 三 tier 共用 + 隱藏類別獨立: 拒——破壞「類別 × tier」二維格的對稱

### D4: P1 鑽石採 composite hard，**不**採 capstone「全成就解才解」

**Decision**: P1 鑽石條件是 composite (量 × 質 / 量 × 持續 / 量 × 廣度)，例「答對 3000 題 **且** accuracy ≥ 80%」。**例外**：隱藏類最後一枚採 capstone「達其他 5 類別 P1 才解」做彩蛋。

**Rationale**:
- Composite hard 讓玩家**為內容本身努力**（衝累積唸書 + 衝連續登入是兩件好事疊加），不會為了一枚鑽石去解 trivial 成就
- Pure capstone「全解才解 platinum」會反向激勵 — 玩家為湊勳章去做沒意義的 hidden 成就（半夜 3 點故意上線）
- PSN Platinum 沒官方定義（Sony 留給 developer discretion），社群慣例是 capstone，本 plan 選 composite 也合法

**Alternatives considered**:
- 純 capstone: 拒——破壞核心激勵
- 純 single threshold (像 P4-P3-P2 那樣只比數值)：拒——P1 跟 P2 失去明確分層、TNNT 4 軸分離精神也支持 composite

### D5: 14 科精通閾值採 100% 全題（**不**降到 80%）

**Decision**: 「該科 fresh attempts ≥ 該科題庫總數 100%」才解該科 P2 金。Speedrun 1 月 (3000 題) 拿不到任何 subject badge 是設計取捨；6 月 longplay (~6300 題) 才剛好涵蓋 14 科。

**Rationale**:
- 100% 是 ritual moment — 跨越「最後 1 題」那刻有完滿感；降到 80% 失去儀式感
- Subject mastery = 「給長期承諾玩家的專屬獎章」；speedrun 玩家自然拿 main 6 類別 P1-P2 為主、subject 全部 0
- 不同 badge profile 反而強化差異化動機

**Alternatives considered**:
- 80% 降低門檻: user 提過後又改回 — 失去 ritual moment
- 多階梯 (50% / 80% / 100% 分 P3/P2/P1): 拒——分階失去「全寫完」的單一 ritual moment

### D6: Streak (連續答對) reset 規則寫死

**Decision**:
| 情境 | streak counter |
|---|---|
| 答對 (fresh + 非 fresh) | +1 |
| 答錯 | 重置為 0 |
| 跳題 (送分題退費) | 不動 |
| `isDisputed` 送分題 | 視同對、+1 |
| Session 結束 / refresh page | 不重置 (跨 session 持續) |

**Rationale**:
- 「答同一題第二次仍 +1」 vs 「只算 fresh」: 選前者，簡化邏輯——理論上玩家連對 20 題只用 1 題刷不合常理（每題 fresh 與否 client-side 透明、不會被 exploit）
- 跨 session 不重置：streak 是「連續答題不答錯」、不是「連續答題不中斷」

**Alternatives considered**:
- 只算 fresh attempts: 拒——複雜化 + 玩家難理解何時 break
- Session 結束自動重置: 拒——玩家中途休息會喪失努力

### D7: 5 處 trigger hook 注入點 vs new event bus

**Decision**: 在既有 5 處 service call site 直接呼叫 `checkAchievementUnlocks(prev, next, stats, catalog)`，**不**建新 event bus。Hook 點：`quiz-rewards.ts` / `tick.ts` / `recruitment.ts` / `fate-card.ts` / `training.ts`。

**Rationale**:
- 既有 cosmetic milestone 也用同樣 pattern (`checkMilestoneUnlocks`)、無 event bus
- 5 處小編輯（每處 ~5 行）比 event bus 基礎建設小
- M2_ADAPTERS / cosmetic.ts pattern 全 codebase 一致

**Alternatives considered**:
- New event bus (mediator pattern): 拒——overengineer for 5 個 call site
- Dexie hook on table write: 拒——副作用不可預期、難測試

### D8: Leaderboard 顯示 6 枚 category badges + `🩺 X/14` subject chip（**不**展開全 14 枚）

**Decision**: LeaderboardPage 在 nickname 旁顯示「6 枚 category badges (按固定 category 順序、各取該玩家最高 tier) + 1 枚 subject mastery chip (`🩺 5/14` 形式)」。完整 14 枚 subject badges 只在個人 `/achievements` 頁顯示。

**Rationale**:
- 14 枚 × 48px = 672px 撐爆 leaderboard row 寬度
- Chip 顯示計數 sufficient signal、又不占太多空間
- 玩家想看詳細自己去 `/achievements` 頁、社交場合的 leaderboard 只展示 summary

**Alternatives considered**:
- 展開全 14 枚: 拒——行寬不足
- 只顯示已解 3 枚最新: 拒——「最新」順序需 timestamp、不夠 stable

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **R2 adapter pattern 漂移** — `LEADERBOARD_PROFILE` precedent 2026-05-21 才 ship、`m2 bundle` 含它 2026-05-22 才 ship | 實作前必跑 `git log --since="2 weeks ago" apps/medexam2-hospital-tw/src/lib/sync/` 對齊最新 shape；對齊 `M2_ADAPTERS` + `migration.ts` 對 fresh-start 路徑處理 |
| **Atlas 一次性生成失敗代價高** (~4-5 min × 2 張 = 8-10 min wall, ~90K tokens) | Codex first; 卡牆 fallback 改 gemini 平行生小張 + magick 拼接 (per [image_gen_routing.md](../../../../.claude/imports/image_gen_routing.md)) |
| **Subject icon 24px 縮圖辨識度** — 「眼科 = 眼鏡」「家醫 = 家+十字」GBA 16 色下易撞 | 出圖後驗 24/48/64px 三 size 並排、user 一眼能辨認；不行就走 fallback 加中文字邊框 |
| **二階題庫各科題數不對等** (內科 600+、皮膚 200) | 100% threshold 從 `questions.json` 動態算各科題數、不 hardcode；validator build-time 把 expected count 寫進 catalog metadata |
| **Streak counter cloud sync 邊界** — `currentQuizCorrectStreak` LWW 可降 → device A 連對 10、device B 答錯 0、A sync 後變 0 | 接受 trade-off：max 由 `maxQuizCorrectStreak` (MAX-merge) 守住、current 只是 transient UI 顯示 |
| **答題大師類別 8 cards 撐爆分頁** (4 累計 + 4 streak) | UI 分 sub-section 標題「累計」「連續」；個人 `/achievements` 頁該類別內分兩個 segment |
| **Hidden achievement leak** | `/achievements` 嚴格 filter `!c.hidden \|\| isUnlocked`；tooltip / placeholder / search 都不漏 |
| **Cosmetic art conflict** | 成就 cosmetic 用 `achievement-*` sprite key prefix；既有 dorm 用 `dorm-*`、不撞 catalog |
| **Speedrun 玩家拿不到 subject mastery 是 feature not bug** | 文檔明寫：subject badge = 長期承諾玩家專屬；speedrun 拿 main 6 類別 P1-P2 為主，差異化是 intentional |
| **D1 ALTER TABLE ADD COLUMN nullable 規則** | `badges_csv TEXT DEFAULT ''` + `subject_mastery_count INTEGER DEFAULT 0`，符合 D1 限制 |
| **Dexie v15 fresh-start vs upgrade path** | Mirror v14 `leaderboardProfile` migration pattern；measureseed 初始化空 achievements 表 |
| **CF Pages 部署延遲跟 GH Pages 不同步** | PR merge 後等 3 條 workflow 都 green 才算 prod ready；SPA 三件套 smoke 在兩個 prod URL 各跑一輪 |

## Migration Plan

**Sequential**:
1. **PR-prep**: 確認 `add-r2-cloud-sync-migration` adapter pattern 沒漂移、`LEADERBOARD_PROFILE` shape 仍是 R2-only
2. **Engine + catalog 建立**: `packages/core/src/lib/achievement.ts` + `packages/content-medexam2-tw/src/achievements.ts` + types + validator
3. **Atlas 兩張生成**: 走 codex CLI single-call 各一次；尺寸驗證；落地 `apps/medexam2-hospital-tw/src/assets/achievements/`
4. **Dexie v15 schema bump**: 新表 + 擴充欄位 + migration 路徑（fresh-start + upgrade-from-v14）+ sync adapter
5. **5 處 trigger hook 注入**: 每處 ~5 行
6. **UI 全套**: AchievementsPage / Card / UnlockToast / BadgeSprite / SubjectBadgeSprite / HomePage 入口 / SettingsPanel title selector
7. **Cloudflare 後端**: D1 migration `0002_add_badges.sql` 寫好 → owner 手動 apply (`wrangler d1 migrations apply study-rpg-leaderboard --remote`) → Worker leaderboard.ts 加 endpoint
8. **Leaderboard 顯示**: LeaderboardPage 加 badges + subject chip
9. **Verify**: Chrome MCP SPA 三件套 × dual prod URL (GH Pages + CF Pages)

**Rollback strategy**:
- Code: `git revert` 該 change merge commit；GH Pages + CF Pages 下一次 push 自動回滾
- D1: 加的兩個 column nullable + DEFAULT，舊 Worker 讀新 column 也不會壞；如需完全 rollback 跑 `ALTER TABLE leaderboard_m2 DROP COLUMN badges_csv; ALTER TABLE leaderboard_m2 DROP COLUMN subject_mastery_count;`
- Dexie v15: 用戶端 IndexedDB version 已升、無法降版；但 v15 新欄位皆 optional `?:`、v14 code 路徑讀 v15 db 不會壞（forward-compat）

## Open Questions

無——plan 已 cover all（user 已經三輪 grill 釐清 scope / tier / reward / threshold）。實作期間若遇 atlas codex 一次出圖不到位，走 Risk 表「Mitigation」欄方案；若 R2 adapter shape 漂移，走 PR-prep 對齊步驟。
