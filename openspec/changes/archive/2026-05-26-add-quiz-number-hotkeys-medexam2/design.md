## Context

`apps/medexam2-hospital-tw/src/components/QuizModal.tsx` 目前 0 個 keyboard listener、0 個 a11y `aria-keyshortcuts`、選項與按鈕都靠滑鼠點。長 quiz session（50+ 題）每題要至少 2-3 個 click（選答案 → 看詳解 → 可能 toggle modifier → 下一題），power user friction 累積成顯著體驗痛點。

題庫題目時常超過一個 viewport 高度（case-based 題含 patient presentation + labs + imaging），目前只能用滑鼠 / trackpad 捲動，跟 power-user 偏好的 keyboard-only 流不相容。

二階 玩家樣本（owner dogfood + 預期受眾）對 Anki muscle memory `1/2/3/4` 鍵慣例熟悉度高。

### Existing references

- Anki review side：`1`=Again / `2`=Hard / `3`=Good / `4`=Easy（left-to-right = harder-to-easier 直覺）
- 瀏覽器 / PDF reader / Kindle / Apple Books / Notion：`Space` = page-down / `Shift+Space` = page-up
- VSCode / Figma / Linear command palette：corner badge superscript hint pattern
- W3C ARIA 1.2：`aria-keyshortcuts` attribute for screen reader announcement

## Goals / Non-Goals

**Goals:**

- 答 50 題 session 可全程「數字鍵 + Enter」無滑鼠
- 視覺 hint 一目了然但不擠 mobile / 不影響 a11y
- 焦點管理避免「想捲動卻誤點按鈕」
- 跟既有 quiz 行為 100% backwards-compatible（滑鼠流程不變）

**Non-Goals:**

- vim-style `j/k` / `gg/G` 捲動 — 學習成本高、台灣醫學生圈低共識
- 自訂 keybinding remap UI — 設計成 fixed convention，避免 settings 表面 bloat
- 全 app keyboard navigation overhaul — 本 change 只動 QuizModal，其他 modal（FateCardModal / DoctorCard / SettingsPanel）的 hotkey 留給未來
- 一階 medexam-tw 的同等改動 — 另開 sibling change `add-quiz-number-hotkeys-medexam-tw`，等本 change dogfood 1-2 天驗證
- 滑鼠 / 觸控行為改動 — 純加 keyboard path，既有點擊流程不變

## Decisions

### D1: Two-phase listener with phase-state guard

題目階段 + 答題後階段共用一個 `useEffect` keydown listener，但內部用 `phase` state（`'asking' | 'answered'`）分派處理。

**Why over alternative**：兩個獨立 useEffect 各自管 phase 會在 phase 切換瞬間出現雙 listener 同時存在的短暫 race window（題目階段最後一個 keypress 可能漏進答題後階段 handler）。單一 listener + state guard 簡單可靠。

```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (!isModalOpen) return
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    // ... dispatch by phase
  }
  document.addEventListener('keydown', handler)
  return () => document.removeEventListener('keydown', handler)
}, [isModalOpen, phase, /* deps */])
```

### D2: Subscript badge with absolute positioning, desktop-only via CSS

選項 / 按鈕用 `position: relative` 包裝，badge 用 `position: absolute; left: 6px; bottom: 4px; font-size: 11px; opacity: 0.55; pointer-events: none;` 浮在左下角。`<sub>` 半形阿拉伯數字（₁ ₂ ₃ ₄）已是 Unicode subscript 字元、不依賴字型 OpenType 支援。

桌機 / 觸控 gate 完全在 CSS 端：

```css
.quiz-hotkey-badge { display: none; }
@media (hover: hover) and (pointer: fine) {
  .quiz-hotkey-badge { display: inline-block; }
}
```

JS listener 不額外 gate — 觸控裝置即使理論上能接外接鍵盤，listener 跑也無害（沒人按時就沒事）。維持 listener 永遠掛載讓 iPad + BT keyboard 的 minority case 自動 work，badge 純視覺 layer 不混淆觸控 user。

**Why over alternative**：JS-side `matchMedia('(hover: hover)')` gate 讓 listener 不掛 — 但這樣 iPad + 外接鍵盤就完全沒得用。CSS-only gate 兼容 minority case，trade-off 為「觸控玩家若有外接鍵盤也能用，但沒視覺 hint」。

### D3: Modal focus management — root div tabIndex={-1}, autofocus on open, Space preventDefault

`QuizModal` 最外層 `<div role="dialog" tabIndex={-1} ref={modalRef}>` 在 modal 開啟的 useEffect 內 `modalRef.current?.focus()`。**不**對任何 button autofocus（避免 Space 觸發 focused button click）。

Space / Shift+Space 在 keydown handler 內 `e.preventDefault()` 後手動操作 modal body scroll container：

```typescript
if (e.key === ' ' && !e.shiftKey) {
  e.preventDefault()
  scrollContainerRef.current?.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' })
}
```

**Why over alternative**：依賴瀏覽器原生 Space scroll（不 preventDefault）會被 focused button 攔截成 click — 不可接受。手動 scroll 也讓我們控制 80% viewport height、smooth scroll behavior、跟原生略不同但更平滑。

### D4: Number-key behavior on out-of-range keys (5-9, 0)

題目階段按 `5` / `6` / `7` / `8` / `9` / `0` → no-op，listener 不 preventDefault、不報錯。

答題後階段按 `4` / `5` / ... → 同 no-op。

**Why over alternative**：警示 toast 太煩；silent no-op 跟瀏覽器其他 modal 慣例一致（按錯鍵就什麼都不發生）。

### D5: Key-repeat behavior

依賴瀏覽器原生 key-repeat throttle（macOS ~30 fps、Windows 系統設定可調）。**不**自己加 debounce。

- 題目階段：長按 `1` → 一直 re-highlight 選項 A，重複觸發 setState 但結果一樣（idempotent），無副作用
- 答題後階段：長按 `1` → bookmark 連續 toggle on/off — **這是預期行為**（跟滑鼠連點同個按鈕等效），不修
- 長按 `Enter`：題目階段送出後 phase 切到 `answered` → 下一個 Enter event 落在新 phase handler → 推進下一題。**這是潛在 bug**：使用者長按 Enter 想加速翻題可能誤送答案直接跳下一題。

對策（D5 sub-decision）：phase 切換的瞬間（`setPhase('answered')` 後）設一個 `phaseChangedAt = Date.now()` ref，handler 內檢查 `Date.now() - phaseChangedAt > 150ms` 才處理 Enter（題目 → 答題後切換需要 ≥150ms cooldown）。150ms 對人類有意 keypress 來說足夠寬鬆，對 key-repeat 來說足夠 block 連發。

### D6: Bookmark toggle key-mapping divergence from Anki

Anki: `1` = Again（重來、最痛）。我們: `1` = ⭐ bookmark（純記號、最常用、無負面 SRS 影響）。

**Why divergence**：Anki 的 4 鍵都是 SRS difficulty rating（互斥單選）。我們的 3 鍵是 post-answer modifier（可同時 on，bookmark 跟 SRS modifier 正交）。映射對應「**最常用的 modifier 放最左**」原則：bookmark > 太簡單 > 我亂猜的（依預期使用頻率）。

User 同意此 mapping（本 session）。

### D7: `useQuizHotkeys` hook location

新檔 `apps/medexam2-hospital-tw/src/lib/use-quiz-hotkeys.ts`，per-app 不進 `@study-rpg/core`。

**Why over alternative**：
- 放 `@study-rpg/core` ❌：violates content-agnostic curator rule（core 不該知道 ⭐ bookmark / ✨ 太簡單 等 hospital-specific button labels）
- 放 `packages/theme-pixel-hospital/` ❌：theme pack 是視覺資產，不放 React hook
- 放 `apps/medexam2-hospital-tw/src/lib/` ✓：app-internal util，跟 `lib/grace-toast.ts` / `lib/achievement-toast-queue.ts` 同級
- 一階 sibling change 跑時複製到 `apps/medexam-tw/src/lib/`，兩 app 各自維護一份 — duplicate 是小成本，比硬抽到共享 package 簡單

### D8: aria-keyshortcuts attribute on every interactive element

選項 button + modifier button + 下一題 button 都加 `aria-keyshortcuts="1"` / `aria-keyshortcuts="Enter"` 等。screen reader（VoiceOver / NVDA）會在 focus 時讀出快捷鍵。

不對 modal root 加 `aria-keyshortcuts` summary — W3C 規範只用在實際可觸發按鈕上。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Power user 長按 Enter 連送多題 | D5 phase-change cooldown 150ms |
| 觸控玩家偶爾接 BT 鍵盤但看不到 badge hint | D2 CSS-only gate 接受此 trade-off；listener 仍工作；HelpMenu 提供完整 cheat sheet 文字 |
| screen reader 焦點漂移 | D3 modal root autofocus；按鈕 `aria-keyshortcuts` 在 focus 時讀出 |
| Phase-切換瞬間 keypress race | D1 單一 listener + phase guard，D5 cooldown 強化 |
| `<input>` focused 時 hotkey 攔截輸入 | D1 listener 開頭即 `target instanceof HTMLInputElement` 跳過；🐞 bug report sheet 的 textarea 同理 |
| Modal 關閉動畫期間 keypress 漏觸發 | D1 listener cleanup 在 `useEffect` return；`isModalOpen` 在 dep array、close 立即 false |
| 既有滑鼠 user 受影響 | 純加 keyboard path、既有 click handler 不動 |
| Cherry-pick 到 一階 時遺漏 edge case | sibling change 提案時直接 import 本 change 的 design.md 為基底；diff 限於兩 app 結構差異 |

## Migration Plan

純 UI 加法，無資料 schema 變動、無 sync 影響、無持久化新欄位。Migration = code-only ship。

- Phase 1：本 change apply → 二階 worktree commit + push → CF Pages 與 GH Pages 雙 deploy 自動觸發
- Phase 2：1-2 天 dogfood（owner + 任何已 sign in 二階 玩家）— 收 bug report，特別關注 key-repeat / phase race / mobile 接外接鍵盤的 edge case
- Phase 3：若無 P1 / P2 issue → archive 本 change → 開 sibling change `add-quiz-number-hotkeys-medexam-tw` 一階 同等實作 + spec
- Rollback：純 client-side，revert PR commit 即可；玩家不會卡在 inconsistent state（無持久化欄位）

## Open Questions

1. ✅ Resolved — D7 hook 位置（per-app `src/lib/`）
2. ✅ Resolved — D6 bookmark 對應 `1`（user-confirmed）
3. ✅ Resolved — D5 key-repeat（依瀏覽器 throttle + phase cooldown）
4. ⏸ Defer — 是否提供「鍵盤快捷鍵開關」settings toggle？本 change 預設 always-on，若 dogfood 反映干擾再開 follow-up
5. ⏸ Defer — Mock-exam mode（M5 模擬考全套）也有自己的 QuizModal-like UI，是否同步加 hotkey？本 change scope 限既有 `QuizModal.tsx`，Mock exam 改動由未來 change 處理
