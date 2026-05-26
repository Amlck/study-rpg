## Context

二階 app (`apps/medexam2-hospital-tw`) 經過 M_2nd ext 多個 change（achievement-system / hospital-equipment / hospital-leaderboard / bookmarks-filters）累積，頂層 tab 已長到 8 個（首頁 + 7 個分頁），玩家動線觀察兩件事：

1. **進修 與 醫師名冊 在不同 tab**：玩家想對某位醫師「進修升 rarity」要先記住他在哪、開醫師 tab 看，再切回頂層、進進修 tab、再找一次同一個醫師。這是同個物件兩個入口的 UX bug。
2. **無學習趨勢視圖**：`monotonicCounters.totalStudyMinutes` 是 lifetime 單值；`questionHistory.lastAnsweredAt` per-row 存在但沒人 group-by 過。Owner 自己 dogfood 想看「最近 30 天答題進度」沒辦法做。

OpenSpec workflow recon（[grilled-tab-tidy-stats-subtab-2026-05-26.md](../../../../.claude/scratch/grilled-tab-tidy-stats-subtab-2026-05-26.md)）已收斂 7 個關鍵設計題；本 design.md 把這些決議轉技術方案，並補上前期沒問到的實作細節（NavBar 元件位置、redirect 機制、migration 順序）。

**現有 NavBar 入口**：經 [HomePage.tsx:149-170](../../../../apps/medexam2-hospital-tw/src/pages/HomePage.tsx#L149-L170) 確認，頂層 nav 是 `HomePage` 內 inline `<Link>` 列表（非獨立 `NavBar` 元件），目前 8 個 link 順序：study / hospital / training / fate-cards / roster / bookmarks / leaderboard / achievements。本 change 對它做 7 元素 array reorder + remove training entry。

## Goals / Non-Goals

**Goals:**

- 玩家可在「醫師」頂層 tab 一站完成「看名冊 + 進修升 rarity」兩件事
- 玩家可在「成就 → 統計」看到近 N 天每日唸書分鐘 / 答對題數的趨勢
- 為未來 daily-streak / weekly-summary / share-progress-card 功能鋪資料層
- Schema migration 對既有玩家零 data loss（additive only）
- 既有分享 URL / deep link 全部繼續工作（路由路徑不變 + `/training` redirect）

**Non-Goals:**

- 不重命名既有 route path（`/roster` 不改 `/doctors`、`/achievements` 不改 `/stats`）
- 不引入 chart library（recharts / d3 / chart.js 都不上）
- 不為「答對題數」歷史精度重建 per-attempt log
- 不處理 > 90 天 weekly aggregate 縮放（forward-only 短期 < 90 天）
- 不改 `monotonicCounters.totalStudyMinutes` 寫入路徑（繼續 lifetime truth source）
- 不在本 change 加 daily-streak gameplay reward（純儀表板）
- 不為 range chip 加 URL searchParam deep link share

## Decisions

### D1: NavBar 改動範圍 — 只動 HomePage `<Link>` array 順序

**方案**: 改 `HomePage.tsx:149-170` 的 8 個 `<Link>` 為 7 個（移除 `/training` 一行）並重排成 `study / hospital / roster / fate-cards / achievements / leaderboard / bookmarks`。

**Alternatives 評估**:
- (a) 把 nav 抽出成獨立 `NavBar` 元件再排：scope expansion，本 change 不做 — UI 元件抽取留下次 refactor
- (b) Route path 重命名（`/roster` → `/doctors`）：增加 redirect 複雜度 + 外部 link fallback risk，violates Q6 決議

**Why**: 最小 surgical change（coding_principles 原則 3）；零 backward-compat 風險；後續若需要其他頁面也顯示 nav，再抽元件。

### D2: 醫師 subtab pattern — mirror BookmarksPage `?tab=` URL searchParam

**方案**: `DoctorRoster.tsx`（或當前承擔 `/roster` route 的 component，apply 時確認）改成 subtab container：

```tsx
const [searchParams, setSearchParams] = useSearchParams();
const tab = (searchParams.get('tab') ?? 'roster') as 'roster' | 'training';

return (
  <>
    <SubTabBar value={tab} onChange={(t) => setSearchParams({ tab: t })} />
    {tab === 'roster' ? <DoctorRosterPanel /> : <TrainingPanel />}
  </>
);
```

`TrainingPage.tsx` 內部抽出純 `TrainingPanel`（不含 route-level wrapper），新位置 mount。`/training` route 保留但只負責 redirect 到 `/roster?tab=training`。

**Alternatives 評估**:
- (a) Keep both mounted with `display:none`：保留 filter / scroll / battle state，但首次 mount cost 倍增；違反 Q5 已決議 unmount 簡單路線
- (b) Lift filter state to DoctorRoster parent：複雜度跨中、Q5 未選此路線

**Why**: 跟既有 `BookmarksPage` pattern 一致（玩家認知成本零）；簡單；切 subtab 時兩邊 state 重置可預期。

### D3: 進修戰鬥中切 subtab guard — `useBeforeUnload`-style hook 偵測 active battle

**方案**: 在 `TrainingPanel` 暴露 `useTrainingBattleActive()` hook（讀 internal `battleState`），DoctorRoster subtab container 訂閱；當切 tab 且 `battleActive=true` 時彈 `window.confirm('進修戰鬥進行中，切換會放棄當前戰鬥。確定？')`，玩家 cancel → 不切；confirm → unmount。

**Alternatives 評估**:
- (a) 自訂 modal 元件：UX 較細緻，但增加新元件 + state management；MVP 用 `window.confirm` 足夠（同類 SOS 模式：bug-report-modal 也用 native confirm）
- (b) 完全禁止切 tab（disable subtab button）：UX 太硬，玩家會困惑為何 button 灰掉

**Why**: 最低 surface area + 玩家有 escape hatch；自訂 modal 留 polish 時做。

### D4: `/training` route 處理 — 保留 + redirect

**方案**: `App.tsx` 中 `/training` route element 改成 `<Navigate to="/roster?tab=training" replace />`，老 deep link 自動 forward。

**Alternatives 評估**:
- (a) 完全刪除 `/training` route：老分享 link 噴 404 + GitHub Pages 預設 404 page（SPA route 三件套規則命中）
- (b) 改 `/training` 渲染 same `<TrainingPanel>`：route duplication，URL 不一致（兩個入口）

**Why**: 老 link 不死 + URL canonical 收斂到 `/roster?tab=training`。注意 react-router v6 的 `<Navigate replace>` 會把 history entry 取代不 push 新 entry，避免「上一頁」回不去。

### D5: Stats sub-tab 圖表 — 手寫 SVG bars

**方案**: 兩張獨立 `<svg>` chart，每張 ~120-160px 高、寬 100%：
- X 軸：根據 range chip 計算的日期序列（7d=7 bars / 30d=30 bars / 90d=90 bars，每 bar 寬度動態）
- Y 軸：自動 scale 到 max value × 1.1（不畫 grid line，僅顯示 max / mid 兩個 tick label）
- Bar 顏色：唸書分鐘 = 藍綠 (`#4a9b9b`)、答對題數 = 暖橘 (`#d8923d`)，rarity-agnostic
- Tooltip：mobile tap、desktop hover；簡單 `<title>` SVG 元素即可（不引入 React tooltip lib）
- Empty days：顯示空 bar（高度 0），保持 X 軸日期連續

`StatsPanel.tsx` 內部 helper：

```ts
function aggregateByDate(rows: QuestionHistoryRow[], range: number, subjectFilter: Set<string> | null) {
  const today = startOfDay(new Date());
  const start = subDays(today, range - 1);
  const buckets = new Map<string, number>(); // 'YYYY-MM-DD' → correctCount
  for (const r of rows) {
    if (r.lastResult !== 'correct') continue;
    if (subjectFilter && !subjectFilter.has(r.subjectId)) continue;
    const d = startOfDay(new Date(r.lastAnsweredAt));
    if (d < start || d > today) continue;
    const key = format(d, 'yyyy-MM-dd');
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  // fill empty days with 0
  return rangeOfDays(start, today).map(d => ({ date: d, value: buckets.get(format(d, 'yyyy-MM-dd')) ?? 0 }));
}
```

Same shape for daily study log (但不過 subject filter)。

**Alternatives 評估**:
- (a) recharts / chart.js：~30-80 KB gzipped bundle bloat for 2 simple bar charts — coding_principles 原則 2 違反
- (b) CSS bars (`<div>` with `width: %`)：可行但 SVG 對 mobile pinch zoom + accessibility 較友善
- (c) Canvas：crisp 但失去 SVG 的 inline tooltip + DOM inspection 便利

**Why**: 兩張 bar chart 純展示 + 不互動，手寫 SVG 80 LOC 內可解；bundle size win + 完全控制 mobile responsive。

### D6: 資料 query 策略 — 一次性讀 + memoize

**方案**: StatsPanel mount 時 `useEffect` 拉一次 `db.questionHistory.toArray()` + `db.dailyStudyLog.toArray()`；用 `useMemo` 對 range / subjectFilter 變化重新 aggregate（不重新 query Dexie）。資料量估計：

- questionHistory：< 6066 rows（二階題庫上限）
- dailyStudyLog：< 365 rows（一年內）

兩張表 `toArray()` 加總 << 1 MB JS heap，single-shot load 可接受。Live reactivity（玩家邊看 stats 邊答題不太可能）走 dexie-react-hooks `useLiveQuery` 是 over-engineering。

**Alternatives 評估**:
- (a) `useLiveQuery` 即時 reactive：useful for active game pages，但 stats 是查看不是互動，no-op
- (b) IndexedDB cursor + 邊讀邊 aggregate：避免 full toArray，但 6066 rows 對現代瀏覽器無壓力

**Why**: 簡單可預期；future optimization 如資料 > 50k rows 再改 incremental aggregate。

### D7: `dailyStudyLog` schema + tick hook 整合

**方案**:

```ts
// schema.ts v18 addition
this.version(18).stores({
  ...v17Stores,
  dailyStudyLog: 'date, updatedAt',  // 'date' PK as 'YYYY-MM-DD' string
});

interface DailyStudyLogRow {
  date: string;          // 'YYYY-MM-DD' (local timezone start-of-day)
  minutesAdded: number;
  updatedAt: number;     // ms epoch, for LWW
}
```

`lib/tick.ts` hook：

```ts
async function applyTick(deltaMinutes: number) {
  // ... existing monotonicCounters.totalStudyMinutes += deltaMinutes ...
  
  // NEW: per-day log
  const today = formatYMD(new Date());
  await db.transaction('rw', db.dailyStudyLog, async () => {
    const existing = await db.dailyStudyLog.get(today);
    const merged: DailyStudyLogRow = {
      date: today,
      minutesAdded: (existing?.minutesAdded ?? 0) + deltaMinutes,
      updatedAt: Date.now(),
    };
    await db.dailyStudyLog.put(merged);
  });
}
```

**Why date key**: localized `YYYY-MM-DD` (使用者裝置 timezone) 跨午夜自動換新 row；UTC offset 差異對個人 dogfood scope 無 impact。如果未來跨時區同步出現「同一天兩 row」問題，再加 timezone normalization；現在不過度設計。

**Forward-only semantics**: v18 migration 不 backfill 任何歷史值；既有玩家升級後 `dailyStudyLog` 為空 array。Stats panel 顯示 helper banner「歷史資料從升級當下開始累積（升級前累積 N min）」+ 從 `monotonicCounters.totalStudyMinutes` 顯示總和 chip。

### D8: R2 m2 bundle schema_version 2 → 3 + LWW

**方案**:

```ts
// bundles.ts
export const M2_BUNDLE_SCHEMA_VERSION = 3;

interface M2Bundle {
  schema_version: 2 | 3;
  // ... existing keys ...
  dailyStudyLog?: DailyStudyLogRow[];  // optional for v2 tolerance
}

// On read: if v2 bundle, dailyStudyLog defaults to []
// On write: always write v3 shape; older v2 reader will drop unknown key
```

LWW merge（`tables.ts` 新 adapter `DAILY_STUDY_LOG`）:

```ts
applyToLocal(local: DailyStudyLogRow | undefined, incoming: DailyStudyLogRow): DailyStudyLogRow {
  if (!local) return incoming;
  return incoming.updatedAt > local.updatedAt ? incoming : local;
}
```

**Why row-level LWW**（vs everWrong 的 monotonic-OR carve-out）：
- `dailyStudyLog.minutesAdded` 是 cumulative-per-day；兩裝置同日累加最後一個寫入贏（會丟一些 minutes，但裝置切換通常不同日）
- 不像 `everWrong` 有 v1 client → v2 bundle 的下游 contamination 風險（v2 client 永遠寫 v3 bundle 含此欄）

**Cross-version tolerance test**: Vitest `bundle-roundtrip.test.ts` 加 case：
- v2 bundle read by v3 client → `dailyStudyLog = []`
- v3 bundle read by v2 client → drop unknown key (Object.keys 不含)

**Phase 3 cutover 互動**: `add-r2-cloud-sync-migration` Phase 3 估計 2026-05-29 cutover；本 change schema_version bump 不阻塞 Phase 3（dual-write 期間 v2/v3 雙向 tolerant），但 ship 時序建議 Phase 3 done 後再合本 change，避免兩個 migration 疊在飛行中。

### D9: BookmarkFilterBar 重用範圍

**方案**: 直接 import `BookmarkFilterBar` from `../components/BookmarkFilterBar`，傳 props：
- `years = []`（stats 不分年）
- `subjects = ALL_SUBJECT_IDS`
- `selectedSubjects = ...`
- 隱藏 year chip section（傳 empty years → 已存在 conditional 不 render）

**Alternatives 評估**:
- (a) 抽 `SubjectFilterBar` 共用元件：refactor scope expansion；現在 reuse 已工作
- (b) 寫新 `StatsFilterBar`：duplicate CSS + chip layout 200+ LOC

**Why**: 已驗證 props 解耦（recon report §7），ship 時直接 reuse；未來如有第三 consumer 再 refactor。

### D10: 成就 sub-tab 整合（stats 條件分支）

**方案**: `AchievementsPage.tsx` 既有 `sub-tab` React state 從 `'main' | 'subject'` 擴成 `'main' | 'subject' | 'stats'`；既有 3 個 filter（category / tier / status）在 `sub-tab === 'stats'` 時隱藏；改顯示 range chip + subject filter chip。

```tsx
const [subTab, setSubTab] = useState<'main' | 'subject' | 'stats'>('main');

return (
  <>
    <SubTabBar value={subTab} onChange={setSubTab} options={['main', 'subject', 'stats']} />
    {subTab !== 'stats' ? (
      <AchievementFilters {...filterProps} />
    ) : (
      <StatsControls range={range} onRangeChange={setRange} selectedSubjects={...} onSubjectsChange={...} />
    )}
    {subTab === 'stats' ? <StatsPanel ... /> : <AchievementList ... />}
  </>
);
```

**Why**: 既有 sub-tab pattern 直接擴增，violation 風險低；filter UI 因不適用而隱藏，不混淆玩家。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **既有玩家升級到 v18 後 stats 圖表空白** → 困惑「我的歷史資料呢」 | 頂部 chip 顯示「升級前累積 N min（無法分日顯示）」+ helper banner 文案明確「從升級當下開始累積」 |
| **答對題數精度誤差** — 同題同天答兩次只算 1 | 頂部 summary chip 明確「以最近一次答題狀態統計」；lifetime `totalCorrectAnswers` counter 仍可在其他地方對照 |
| **R2 dual-write 期間 schema_version bump** 跟 Phase 3 cutover 衝突 | Ship 時序：等 `add-r2-cloud-sync-migration` Phase 3 archived 後再合本 change；v2/v3 bundle 雙向 tolerance test 必跑 |
| **進修戰鬥中切 subtab confirm 對話框** 阻擋自動化測試 | Test 用 `window.confirm` mock；human dogfood path 玩家 escape hatch 完整 |
| **`/training` redirect** 對 SPA route 三件套（in-app nav + direct URL + F5）三個 path 行為一致 | 三個 path 都走 `<Navigate>` 元件 = react-router 內建一致語意；prod GitHub Pages 直接打 `/training` 也會被 SPA shell + redirect handle |
| **手寫 SVG bar chart 對 mobile 觸控** 可能 tooltip 不直覺 | MVP `<title>` 元素為主；用 `@media (max-width: 600px)` chart 改成單軸 list view fallback（30 bars on 360px 寬度太密） |
| **Dexie v18 migration 失敗** 老玩家 lose 整個 IndexedDB | Migration 純 additive `version(18).stores()`，Dexie auto-handles；無 destructive op；v17 → v18 沒有資料轉換步驟 |

## Migration Plan

**Schema bump 順序**（apply 時嚴格遵守）:

1. `schema.ts` 加 v18 store definition；不 backfill；既有玩家 cold open → Dexie 自動 upgrade，空表
2. `tick.ts` 加 upsert hook；新一輪 tick 後即有 row
3. `bundles.ts` `M2_BUNDLE_SCHEMA_VERSION = 3`；read path 對 v2 bundle 容錯（default `[]`）
4. `tables.ts` 新 `DAILY_STUDY_LOG` adapter；row-level LWW
5. `StatsPanel.tsx` 新元件 + AchievementsPage 加 sub-tab
6. `HomePage.tsx` nav-link reorder + remove `/training` entry
7. `DoctorRoster.tsx` 包 subtab container；`TrainingPage.tsx` 抽 `TrainingPanel`
8. `App.tsx` `/training` route 改 `<Navigate>`

**Rollback strategy**:
- 沒 Phase 3 cutover gate 之外的 destructive op；rollback = revert commit
- 若 prod 上線後發現 v3 bundle 寫入 break v2 client（極不可能，因 v2 reader drop unknown），可手動 D1 / R2 fallback 回 schema_version=2

**Dogfood verify gate** (per project.md SPA route 三件套):
1. localhost dev：in-app click `/roster` → tab 切換 → subtab `?tab=training` → 戰鬥中切 confirm
2. localhost dev：直接 URL `/training` → 自動 redirect `/roster?tab=training` ✓
3. localhost dev：F5 on `/roster?tab=training` → 同 subtab 渲染（不跳回 roster）
4. prod GitHub Pages：1-3 重跑 ✓ 才算 ship

## Open Questions

- **Stats subtab 預設 range**: 30d ✓（grill Q4），但 7d/30d/90d/全部 chip 順序 — 提議 left-to-right 由短到長（`7d / 30d / 90d / 全部`），保持遞增直覺。Apply 階段再確認 chip label 中文化（「7 天 / 30 天 / 90 天 / 全部」？）
- **Mobile chart 寬度 < 360px**: 30 bars 寬度 ~10px 太細；fallback 為單欄 list view（日期 + 數字）還是改成「最近 N 天」自動 truncate？建議 apply 時用 RWD probe（chrome_mcp_rwd_probe rule）實測再決定
- **`window.confirm` 國際化**：「進修戰鬥進行中，切換會放棄當前戰鬥。確定？」這句文字寫死還是抽 i18n？二階目前 zh-TW only，先寫死
- **`/training` deep link 401 case**：玩家先打 `/training` → redirect → SPA 在 GitHub Pages 是否需要 `404.html` 配合？經 SPA route 三件套規則，prod 已有 404 redirect trick，本 change 不重碰
