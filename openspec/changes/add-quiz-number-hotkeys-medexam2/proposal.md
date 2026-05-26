## Why

二階 玩家在長 quiz session（50+ 題）內每個動作都要滑鼠點：選 A/B/C/D、捲動長案例題、點 ⭐ / ✨ / 🤔 modifier、再按下一題。滑鼠來回切回鍵盤打字（bug report sheet / 其他 UI）的 friction 累積成「答完一輪很累」。Anki 的 `1/2/3/4` 數字鍵慣例在台灣醫學生圈極普遍，把這個 muscle memory 引進來、再補 `Space` / `↓↑` 捲動，就能做到全 power-user session「數字鍵 + Enter」零滑鼠 loop。

## What Changes

- **題目階段**：`1` / `2` / `3` / `4` 數字鍵 highlight A / B / C / D 選項（可改選），`Enter` 送出選擇
- **答題後階段**：`1` toggle ⭐ 收藏、`2` toggle ✨ 太簡單、`3` toggle 🤔 我亂猜的，`Enter` 推進下一題（不 auto-advance；維持「選 + 確認」兩步驟，跟題目階段一致）
- **捲動**（兩階段共用）：`Space` page-down / `Shift+Space` page-up / `↓↑` 微捲 / `Home` `End` 跳頂底，全部在 modal body scroll container 內生效
- **視覺 hint**：選項與三顆 modifier 按鈕左下角加 ₁ ₂ ₃ ₄ 半透明灰角標（subscript style）；捲動鍵不加 per-element hint（瀏覽器通用、零學習成本）
- **A11y**：每個按鈕補 `aria-keyshortcuts` 屬性；modal root `<div tabIndex={-1}>` 開啟時取得焦點
- **RWD**：所有 hotkey + 角標走 `@media (hover: hover) and (pointer: fine)` gate — desktop-only 啟用，觸控裝置完全 hide
- **Edge guard**：`<input>` / `<textarea>` focused 時跳過所有 hotkey 處理（避免擋住 🐞 bug report sheet 輸入）
- **Docs**：HelpMenu 9th accordion 之後加新 section「⌨️ 鍵盤快捷鍵」列出完整對照表
- **一階 不在本 change scope**：cherry-pick 後另開 sibling change `add-quiz-number-hotkeys-medexam-tw`，等本 change dogfood 1-2 天驗證 UX 後啟動

## Capabilities

### New Capabilities

（無新 capability — 純行為擴充現有 quiz 流程）

### Modified Capabilities

- `hospital-quiz`：QuizModal 新增鍵盤快捷鍵契約（題目選擇、答題後 modifier、捲動），角標視覺與 a11y attributes。捲動行為與焦點管理是 modal-level 行為，所以也在這個 spec delta 內定義。

## Impact

- **Code**：
  - `apps/medexam2-hospital-tw/src/components/QuizModal.tsx`（主修改）
  - `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx`（新 docs section）
  - 新檔 `apps/medexam2-hospital-tw/src/lib/use-quiz-hotkeys.ts`（可重用 hook，per-app 不進 `@study-rpg/core`，遵守 engine content-agnostic curator rule）
  - CSS 增量：badge positioning + `@media (hover: hover) and (pointer: fine)` gate
- **不影響**：
  - `@study-rpg/core`（純 UI 層，core engine 不動）
  - SRS scheduler / 答題判定邏輯（hotkey 只觸發既有 action，不引入新 reward path）
  - Sync engine / Dexie schema（純 UI 行為、無持久化新欄位）
  - Leaderboard / achievements（無新 trigger）
- **A11y 風險**：modal focus management 改寫，要驗證 screen reader 在 Mac VoiceOver / NVDA 行為（手動 smoke 而非自動測試）
- **Touch + BT keyboard 受眾（iPad）trade-off**：`@media (hover: hover)` gate 會把 iPad + 外接鍵盤 case 排除在 hotkey 之外，這類玩家仍可滑鼠點 UI；本 change 接受此 trade-off，未來若有需求再開 sibling change 加 manual toggle
