## Why

二階答題 UI 的 reading area（年份科別 row / 題目 stem / 選項 / 送分題提示 / 解析）目前**在 Safari 看起來全像素風、在 Chrome 軟一點但仍偏 pixel**。Dogfooder 反映「題目跟詳解不好讀」、加上跨 browser render 不一致。

Root cause 兩層疊加：

1. **`body { -webkit-font-smoothing: none }`**（[apps/medexam2-hospital-tw/src/styles.css:46](apps/medexam2-hospital-tw/src/styles.css:46)）關掉了整頁的 font antialiasing — 即使 `.quiz-modal__stem` / `.quiz-modal__explanation` 已 override `font-family: var(--font-body-cjk)`，Noto Sans TC 仍以「無平滑」方式 render，看起來塊狀。Safari (WebKit) 嚴格遵守此設定 → 完全無 antialiasing；Chrome (Blink) 對部分 fallback CJK 仍做 grayscale → 略軟但同樣偏 pixel。
2. **選項 / 送分題 / 年份科別 row 從來沒被 readable-font selector 列表收進去** — 它們直接 inherit body 的 `--font-pixel-cjk`，所以連字型本身都是 Cubic 11。

連帶設計需求（dogfooder ask）：預設要是易讀字型，但保留切回 pixel 全像素風的選項給「想要原 GBA 美術調性」的玩家。

## What Changes

### 字型 + 平滑修正（純 CSS）

- 把 readable-font rule 的 selector list 擴張涵蓋整個 QuizModal reading area：選項三個 class、年份科別 row 的 ID 文字、送分題提示、空池提示、附圖缺失提示
- 在同一條 rule 加上 `-webkit-font-smoothing: antialiased` + `-moz-osx-font-smoothing: grayscale`，明確覆蓋 body-level 的 `none` → 兩個 browser engine 都拿到一致的平滑 Noto 渲染
- 對應 `.bookmarks-page__entry-*` 與 `.er-consult__*` 已有的 entry 也順手加上 smoothing（一致性）

### Pixel mode opt-in（玩家可切回）

- 新 Dexie meta key `ui.fontMode`（沿用 `quiz.yearFilter` 既有模式 — `meta` table，`&key` index）
- Type `FontMode = 'readable' | 'pixel'`；無 row 視為 `'readable'`（預設）
- App.tsx 用 `useLiveQuery` 讀取，effect 把值寫進 `document.body.dataset.fontMode`
- CSS 新增 `body[data-font-mode="pixel"]` override block — 切到 pixel 時把 reading area 改回 `--font-pixel-cjk` + `font-smoothing: none`，回到 dogfooder 偏好的原始 GBA 風
- HelpMenu 新增第 11 個 accordion section `font-mode`（icon 🔤、title「字型偏好」），內含雙 radio + 簡短說明

### Scope cap

- **只影響二階 hospital app**（一階 medexam-tw 的 quiz-stem / quiz-option / quiz-explanation 早已全 body-cjk，不需改；且 worktree 紀律不該動 `apps/medexam-tw/`）
- **Pixel mode 切換只覆蓋 reading area**（題目 / 選項 / 詳解 / meta row / 送分題提示） — UI chrome（header / button / banner / chip / partner row）永遠保持 Cubic 11 pixel 美術，維持遊戲整體 GBA 調性
- **不動 body-level `font-smoothing: none`** — 那是 UI chrome 的像素感基礎，動了會把 header / nav 也軟化，破壞美術調性。Selective override on reading-area selectors 已經足夠
- **不雲端同步** — 純裝置本地偏好（一個人不同裝置可能想要不同設定）；沿用 `year-filter` / `quiz-companion` 的 Dexie meta 不同步模式

## Capabilities

### Modified Capabilities

- `hospital-quiz`: 新增 Requirement「Quiz reading area uses readable typography by default with per-device pixel mode override」 + 兩個 scenario

## Impact

**Code 影響**：
- `apps/medexam2-hospital-tw/src/styles.css` — 擴張既有 rule + 新增 pixel-mode override block（~30 行新增）
- `apps/medexam2-hospital-tw/src/services/font-mode.ts` — 新檔（~25 行）
- `apps/medexam2-hospital-tw/src/App.tsx` — useLiveQuery + useEffect 應用 body attribute（~10 行）
- `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` — 新 section + radio 控件（~40 行）
- `openspec/specs/hospital-quiz/spec.md` — ADDED 1 Requirement

**Schema / Migration**：
- 不需要 Dexie schema 變動（`meta` table & `&key` index 已存在 v5+）
- 不需要 cloud-sync 變動（純 device-local 偏好）

**Deploy**：
- 純前端 CSS + React 變動；gh-pages 自動 deploy
- 無 Worker / D1 / KV 影響

**Non-goals**：
- ❌ 不改一階 app（一階 quiz UI 早已 body-font）
- ❌ 不改 body-wide font-smoothing 行為
- ❌ 不把 pixel mode 推到全 app UI（只覆蓋 quiz reading area）
- ❌ 不做雲端同步此偏好
- ❌ 不改 ER consult dialog 字型行為（已 body-font）
