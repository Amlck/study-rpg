## Context

二階題庫共 6080 題、跨民國 106~115（106-114 各 640 題、115 僅 320 題 — 上游 OCR 只有第一次考試）。現有 quiz launcher（HomePage 上的 14 個 RecruitmentBanner，每張卡有「📚 學習」按鈕）一路通到 `QuizModal`，picker 路徑：

```
HomePage → setActiveQuizSubject → QuizModal
  ├─ loadNextQuestion
  │   ├─ getNextDueCardForSubject(subjectId, consumedIds)  // SRS due 優先
  │   └─ pickRandomQuestion(subjectId, seenIds)            // 無 due 走 random
  └─ ER consult / TrainingPage 也呼叫 pickRandomQuestion
```

題池快取在 `lib/quiz.ts:loadPack()`（singleton promise，過濾掉 `hasOptionImages: true` 後存進 `bySubject` map）。

設計語言參照已 ship 的 PR #3 (`Better screeners for roster and training screens`)：
- `.filter-bar` 容器、`.filter-bar__group` 區段、`.filter-bar__label` 標題、`.filter-bar__count` 結果計數
- `.filter-chip-group` + `.filter-chip[aria-pressed]` 多選 pill；「全部」按鈕 = `aria-pressed={filters.length === 0}` + `onClick={() => setFilters([])}`
- PR #3 的 filter state 是 in-page React `useState`（DoctorRoster / TrainingPage 都不持久化）；本次年份 filter 跨頁、跨 modal 共享 → 改走 Dexie 持久化 + `useLiveQuery` 訂閱

## Goals / Non-Goals

**Goals:**
- 玩家可在 HomePage 用熟悉的 PR #3 chip 群組多選/取消年份，左右 chevron 切兩頁
- 偏好寫進 Dexie `meta` 表（沿用 `quiz.companionDoctorId` precedent），跨 session 同 device 記住
- 所有用戶可見的 picker（HomePage 「📚 學習」、QuizModal 「下一題」、TrainingPage 進修挑戰、SRS due queue）AND 同一份年份偏好
- 0 題保護：篩到 0 題明確 disable + 中文說明，不靜默 fall through（coding_principles 原則 5）
- ER consult 事件 spawn pool **不受** 年份 filter 影響，避免事件靜默 starve
- Dogfood-first：先在 二階 ship，一階套用視覺驗收 OK 再說

**Non-Goals:**
- ❌ 一階 medexam-tw、模擬考、`/bookmarks` 跨 app 頁面（本次完全不動）
- ❌ Cloud sync 進雲端（per-device UI 偏好；mirror `quiz.companionDoctorId` 的不上雲設計）
- ❌ 年份 + 科目矩陣熱圖／可視化（過度設計；只在 0 題時 inline 提示放寬）
- ❌ 「最近 N 年」preset 快選按鈕（v1 維持純多選 chip，preset 是 v2 再說）
- ❌ 民國年 vs 西元年文字呈現切換（題庫 + 玩家心智模型都是民國年；直接 `115` `114` 三位數）
- ❌ 自動建議「點了某年永遠 0 題」的智慧排除（提案 facet 4 已 reject「智慧 fallback」option）

## Decisions

### D1. Filter 持久化載體：Dexie `meta` table KV（不是 player_state column / 不是新表）

選 **Dexie `meta` table KV**（key `quiz.yearFilter`、value `number[]`）。

**Rationale**：
- `meta` table v5 已存在、已有先例 `quiz.companionDoctorId` 走同樣 pattern（`apps/medexam2-hospital-tw/src/services/quiz-companion.ts:3`）
- 完全 local-only、不進 cloud sync bundle，schema bump 純加版本不加 store
- 不需要 query 索引（單 row read/write）
- 加 column 到 `gameCounters` 會污染 LWW-merged 狀態，且需要 schema 升級 + upgrade hook backfill

**Alternative considered**：新開 `uiPreferences` table — 過度設計，目前只有 1 個 UI 偏好需要存。未來若 UI 偏好超過 3 個（年份 + 排序 + 主題 +...），再開 dedicated 表更合理；現在 KV 夠用。

**Value 序列化**：`number[]`（e.g. `[115, 114, 113]`），不是 `Set` — IndexedDB 不直接存 Set，且 JSON 化更可控。Reader 收到後轉 `Set<number>` for O(1) membership check。

**Default**：`getYearFilter()` 在 `meta` table 沒有 row 時回 `null`，呼叫端把 `null` 解讀為「全選 10 年」（zero-friction 預設，符合 grilled facet 2）。第一次玩家點 chip 動 selection 時才 INSERT row。

### D2. Picker 插入點：function param（不是 module-level state、不是 loadPack 過濾）

選 **每個 picker 新增 optional `opts.yearFilter?: Set<number>` 參數**：

```ts
// lib/quiz.ts
export async function pickRandomQuestion(
  subjectId: SubjectId,
  seenIds: Set<string>,
  opts?: { yearFilter?: Set<number> },
): Promise<Question | null>

export async function loadSubjectQuestionIds(
  subjectId: SubjectId,
  opts?: { yearFilter?: Set<number> },
): Promise<string[]>

// lib/srs-scheduler.ts
export async function getDueQueueAllSubjects(
  now?: number,
  opts?: { yearFilter?: Set<number> },
): Promise<Map<SubjectId, QuestionHistoryRow[]>>
```

**Rationale**：
- `loadPack()` cache 是 immutable singleton — 過濾 pack 會強迫 cache invalidation 每次 filter 變動 → re-fetch questions.json（750 KB+）→ 卡頓
- Module-level state 跟 `useLiveQuery` 訂閱模型不合（subscriber 拿不到 stale state 通知）
- Optional param 保持「沒傳 = 全題池」backward compatibility，ER consult / 未來 caller 不需要修改
- 過濾邏輯集中在 picker 函式內，testable

**Filter logic**：picker 在 `bySubject.get(subjectId)` 結果上 `.filter(q => !yearFilter || yearFilter.has(q.meta.year))`。當 `yearFilter === undefined` 或 `yearFilter.size === 0` 都視為「無 filter」。

**SRS scheduler 細節**：`getDueQueueAllSubjects` 內已經有 `loadQuestionsByIdMap()` for `hasOptionImages` filter；同一個 hydration step 順便讀 `q.meta.year` 做年份 filter，零額外 lookup 成本。

### D3. UI placement：HomePage 頂部全域 `.filter-bar`

選 **HomePage 上方放一條全域 `.filter-bar`**（在歡迎區與 14 個 RecruitmentBanner 中間），不是放在每張 banner 裡、也不是放在 QuizModal 裡。

**Rationale**：
- 年份 filter 是跨科目的全域偏好（玩家不會「外科要 113-115、內科要 106-108」），放在 banner 級會重複 14 次冗餘
- HomePage 是 quiz 唯一入口（QuizModal 只是 overlay），玩家行為動線「先挑年份 → 再點科目」自然
- QuizModal 內加 filter UI 會跟現有「科目下拉 + 跳過 SRS toggle + 換醫師 picker」擠 partner card 區域
- 容許後續 `QuizModal` 顯示「目前年份偏好」唯讀 chip 提示（next-iteration），但不在這次 scope

### D4. 兩頁切換的 chevron 元件：純 CSS button（不引 lib、不用 react-router）

選 **2 個 `<button>` (`‹` / `›`) + 中間 `<span>` 顯示 `1 / 2`**，純 inline state（`useState<0 | 1>(0)` for page index）。

**Rationale**：
- PR #3 既有 `.filter-bar` 視覺已優，加入分頁是純 visual / interaction 層
- 不引 swipe / carousel lib（過度設計，10 個年份只有 2 頁、靜態 layout）
- Page index 是純 UI state，不持久化（每次回 HomePage 預設 Page 1 = 近 5 年；玩家換頁後不記住）
- Mobile：chevron 按鈕 ≥ 44×44 px touch target；指示器「1 / 2」用 13px monospace 字
- Disabled 狀態：在 Page 1 時 `‹` disabled，在 Page 2 時 `›` disabled（沒有 wrap-around）

**Alternative considered**：「全部 10 chip 一字排開、用 horizontal scroll」— mobile 上 hidden scroll affordance 差、桌機 hover 不明顯；分頁更明確、與 PR #3 chip 風格一致。

**Alternative considered**：「Tab `近 5 年` / `早 5 年`」— grilled facet 5 已 reject（chevron 是首選；tab 雖明確但占 header 寬度）。

### D5. 0 題保護：HomePage 層 + QuizModal 層雙閘門

選 **兩層閘門**：

1. **HomePage 層**（事前阻擋）：每張 banner 用 `useLiveQuery` 計算 `effectivePoolSize(subjectId, yearFilter)`：
   - `> 0` → 「📚 學習」按鈕 enabled，旁顯示計數（e.g. `📚 學習 (47 題)`，視 UI 空間決定是否露）
   - `= 0` → 按鈕 disabled，banner 底部 inline 小字：「此組合 0 題，請放寬篩選」

2. **QuizModal 層**（事中保險）：玩家在 modal 中途打開 chip group 縮緊篩選導致現 subject 0 題時：
   - 「下一題」按鈕 disabled
   - Result region 取代為訊息：「此組合 0 題，請放寬篩選或切換科目」
   - 科目下拉仍可換到 pool 還有的 subject

**Rationale**：
- HomePage 層阻止「按了沒題」的挫折感（grilled facet 4 選項 A）
- QuizModal 層 cover edge case：玩家可能在 HomePage 打開 modal 後，回到 HomePage 縮緊 chip 又回 modal —— 不能讓 modal silently `pickRandomQuestion` 回 `null`
- 兩層共享 `effectivePoolSize` 函式（in `services/year-filter.ts`），單一邏輯來源

**Performance**：`effectivePoolSize` 是 in-memory pool filter + count，O(pool.length) ≈ O(640)，每次 chip 點擊 14 個 banner 重算 = O(14 × 640) ≈ 9000 ops，遠低於單次 React render 預算。

### D6. ER consult 排除：spec 顯式禁止 + comment

選 **`services/er-consultation.ts` 不傳 `yearFilter`**，並在 pick 函式上方 inline comment 註明「ER consult 不受年份 filter 影響，避免事件 spawn pool starve」。

**Rationale**：
- ER consult 是 event-driven spawn（背景 tick 隨機觸發），不是玩家主動 quiz；玩家年份偏好「只想練近 5 年」不該讓 ER 一直 starve（玩家會以為事件 bug）
- Grilled facet 7 雖選 AND，但 user 描述是「藥理學 × 近 3 年 × SRS due」三項都是玩家主動篩選的軸；ER consult 不屬於那條鏈
- Spec MODIFIED `er-consultation` 加一段「ER consult picker SHALL NOT consult year-filter preference」明確化

### D7. Schema 升級：v12 → v13 純版號 bump，無 upgrade hook

選 **加 `this.version(13).stores({ ...同 v12 })`** 不改 stores（`meta` table 已在 v5+），不寫 `.upgrade()`。

**Rationale**：
- 新增 KV row 是 runtime INSERT，不是 schema 改動
- `getYearFilter()` 遇到 missing row 回 `null` → caller 視為「全選」，舊存檔自然升級到 default 行為
- 無 backfill 需求（不需要把現有玩家 default 寫進 row；lazy write 在第一次 selection 變動時才落地）
- v13 stub 主要為了標記「這版本理解 quiz.yearFilter key」（debug 時看 schema 版本史可追溯）

### D8. CSS 命名沿用 PR #3 + 加分頁子類

extend `.filter-bar` 家族（HomePage、DoctorRoster、TrainingPage 共用）：

```css
.filter-bar__pager { display: flex; align-items: center; gap: 4px; }
.filter-bar__pager-btn { /* chevron < > 按鈕 */ }
.filter-bar__pager-btn[aria-disabled="true"] { opacity: 0.3; cursor: not-allowed; }
.filter-bar__pager-indicator { /* 「1 / 2」 monospace span */ }
.filter-bar__year-page { display: contents; /* 整頁切換用 conditional render */ }
```

不另開新 CSS module / 不用 CSS-in-JS — 沿用 `styles.css` 集中管理慣例。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| 玩家全 deselect 10 個 chip 後 confused → 以為壞了 | 進 0 題狀態時 inline 訊息明示「請放寬篩選」+ 提供「全部」按鈕（PR #3 既有 pattern）一鍵回全選 |
| SRS due × 年份 AND 後 due card 驟降 → 玩家「我每天 due 變很少」 | Dogfood 看 telemetry；如果 dogfood 期間發現問題，後續可加 SRS 模式內「Override：忽略年份」toggle（v2 增補） |
| Page index 不持久化導致每次回 HomePage 預設 Page 1（玩家若常用 Page 2 會煩） | v1 可接受（grilled facet 6 確認 115-111 是「最常挑」）；v2 看 telemetry 決定是否要記憶 page index |
| 115 年只有 320 題（106-114 是 640） → 玩家只選 115 時 pool 小、seenIds 很快全掃到觸發 exhaustion toast | `pool-exhausted toast` 既有機制 cover；115 半年的事實在 changelog / UI 不特別 surface（避免分心） |
| `Question.meta.year` 是 number 還是 string？ | `dist/questions.json` 已驗證是 number 106-115，type alignment OK；spec 寫死 `number` |
| 預設「全選」對 9999 個 device 來說等同沒有 default 寫入 → 第一次 chip 點擊才會 INSERT KV → 第一次寫入若失敗會靜默 fail | `setYearFilter` 用 Dexie put 的同步 error path；失敗時 console.error + UI 不更新（玩家看得到沒生效） |
| 跟 in-flight change `add-r2-cloud-sync-migration` 撞 schema 版本（他可能加 v13） | Apply 前 `git pull` + `cat schema.ts` 看當下最新版本號；若衝突改成下一個可用版號（v14）。本 change 純加版號，不挑數字 |

## Migration Plan

**Phase 1：實作 + 本機 dogfood**
1. Schema bump v12 → v13
2. 寫 `services/year-filter.ts` + `YearFilterBar.tsx` + extend `styles.css`
3. Plumb optional `yearFilter` param 進 `lib/quiz.ts` + `lib/srs-scheduler.ts`
4. HomePage + QuizModal 接 `useLiveQuery` 訂閱 + 0-題 gate
5. `pnpm --filter @study-rpg/medexam2-hospital-tw dev` 本機驗收（Chrome MCP 走 `/verify` 模式 — 三件套：in-app navigation / direct URL / F5）

**Phase 2：ship + observe**
1. `/opsx:archive` 後 push 到 `track-m2`
2. Owner 自行 dogfood 一週，觀察：
   - 是否玩家會主動用此功能（或仍全選不動）
   - 0-題 gate 是否觸發過於頻繁
   - SRS due 因年份 filter 是否變得太少
3. Telemetry：本次不加埋點（owner 自身 dogfood + 用 `globalThis.__db` 手動查 meta 表觀察）

**Rollback strategy**：
- 若 dogfood 發現 critical bug → 直接 revert commit，schema v13 留著（empty meta row 不影響任何邏輯）
- Production 既有玩家若已 INSERT 年份偏好 row → revert 後該 row 留在 IndexedDB 但無人讀，無害

## Open Questions

1. **是否在 HomePage banner 上顯示「該 subject × 年份」題數計數**（e.g. 「📚 學習 (47 題)」 vs 純按鈕）？
   - Pro：玩家直觀知道剩多少題
   - Con：14 個 banner 都加計數會視覺擁擠
   - 留到 implement 階段看 PR #3 banner 排版決定，預設**不加**（與 PR #3 風格一致 — DoctorRoster 也只在 filter-bar 層顯示計數，不在卡片層）

2. **Chevron 圖示用 unicode `‹›` 還是 SVG icon 還是 theme-pixel 字型**？
   - PR #3 用了 unicode `‹›` 嗎？需在 implement 時 grep `styles.css` 找慣例
   - 預設用 unicode `‹›` 配 `:hover` filter 變色（最輕量）

3. **115 半年的 UX 提示要不要加**？
   - 玩家若只勾 115、pool 只有 320 而非 640，沒提示時可能誤以為 bug
   - 預設**不加**（避免分心；exhaustion toast 已 cover），但若 dogfood 抱怨再補

4. **是否允許「Shift+Click 範圍多選」**（e.g. 點 113 再 Shift+點 109 = 全選 109-113）？
   - 桌機 power user 友善、mobile 無 Shift 鍵
   - 預設**不加**（v1 純單擊 toggle，符合 PR #3 一致性）
