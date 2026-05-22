## 1. Font mode persistence service

- [x] 1.1 新增 `apps/medexam2-hospital-tw/src/services/font-mode.ts`：export `FONT_MODE_META_KEY = 'ui.fontMode'`、type `FontMode = 'readable' | 'pixel'`、`getFontMode(): Promise<FontMode>`（無 row → `'readable'`）、`setFontMode(mode: FontMode): Promise<void>`
- [x] 1.2 sanity check：值 schema canonical form — `getFontMode` 對非預期 string 也走 normalize → `'readable'`（防呆，遵守 coding_principles §6 schema normalization）

## 2. Body attribute wiring

- [x] 2.1 `App.tsx` 引入 `useLiveQuery(() => getFontMode(), [], 'readable')`
- [x] 2.2 在 App component top-level 加 `useEffect`，把 `document.body.dataset.fontMode = fontMode` 寫進；cleanup 不必（值持續存在）
- [x] 2.3 SSR-safe guard 不必（純 CSR Vite SPA，無 hydration mismatch 風險）

## 3. CSS — readable rule + smoothing override

- [x] 3.1 改 `apps/medexam2-hospital-tw/src/styles.css` 既有 `.quiz-modal__stem, .quiz-modal__explanation, ...` rule（行 52-60）：擴張 selector 加入 `.quiz-modal__option`、`.quiz-modal__option-key`、`.quiz-modal__option-text`、`.quiz-modal__question-meta-id`、`.quiz-modal__disputed`、`.quiz-modal__empty`、`.quiz-modal__image-missing`
- [x] 3.2 同一 rule 加 `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale`
- [x] 3.3 更新該 rule 上方 comment：解釋為何要 override smoothing（跨 browser 一致性）+ 列出涵蓋哪些 reading area
- [x] 3.4 `.bookmarks-page__entry-stem` / `.bookmarks-page__entry-explanation` / `.er-consult__stem` / `.er-consult__explanation` 同步加 smoothing（已在同 rule 內 → 自動繼承新加的 smoothing 屬性，無需另寫）

## 4. CSS — pixel mode override

- [x] 4.1 在 styles.css 既有 rule 之後緊接 `body[data-font-mode="pixel"] <selector-list>` block，把 reading area 全部 override 回 `var(--font-pixel-cjk)` + `-webkit-font-smoothing: none` + `-moz-osx-font-smoothing: unset`
- [x] 4.2 Selector list 必須跟 §3.1 完全一致（包含選項、stem、explanation、meta-id、disputed、bookmarks-page、er-consult）
- [x] 4.3 加 comment 解釋此 block 由 HelpMenu「字型偏好」section 切換觸發

## 5. HelpMenu — 字型偏好 section

- [x] 5.1 `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` 引入 `getFontMode` / `setFontMode` / type
- [x] 5.2 在 `SECTIONS` 陣列尾端（account-reset 之前或之後皆可，建議放在 `er-consult` 後、`account-reset` 前 — 跟其他「偏好設定」類 section 群組）加新項：
  - `id: 'font-mode'`
  - `icon: '🔤'`
  - `title: '字型偏好（題目 / 選項 / 詳解）'`
  - body 兩段：說明預設易讀字型 + 切到「像素」會回到 Cubic 11（GBA 風）+ 只影響答題系統內 reading area，其他 UI chrome 不變
- [x] 5.3 加 `useEffect` 載入當前 mode 進 component state
- [x] 5.4 conditional render block `section.id === 'font-mode'` 渲染雙 radio（`<input type="radio" name="font-mode">`），label 文字「易讀（Noto Sans TC）」/「像素（Cubic 11）」
- [x] 5.5 onChange 呼叫 `setFontMode` + 更新 local state；body attribute 變化由 §2.2 的 useLiveQuery 自動 reflow

## 6. Delta spec

- [x] 6.1 寫 `openspec/changes/polish-hospital-quiz-readable-fonts/specs/hospital-quiz/spec.md`：ADDED Requirement「Quiz reading area readable typography with per-device pixel mode override」+ 2 scenario（default readable / pixel mode toggle）

## 7. Verification

- [x] 7.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` 全綠
- [x] 7.2 `openspec validate polish-hospital-quiz-readable-fonts --strict` 通過
- [x] 7.3 Chrome MCP probe：對 10 個 reading-area selector 注入 detached element 跑 `getComputedStyle` — 全部回 `Noto Sans TC, system-ui, sans-serif` + `antialiased`；body[data-font-mode='pixel'] 切換後同 selector 變 `Cubic 11, Noto Sans TC, sans-serif` + `none` ✓
- [x] 7.4 Chrome MCP 開 HelpMenu → 「字型偏好」section 渲染 + 雙 radio + readable 預設 checked；切 pixel radio → `body.dataset.fontMode === 'pixel'`；切 readable → `body.dataset.fontMode === 'readable'` ✓
- [x] 7.5 切到 pixel → `location.reload()` → reload 後 `body.dataset.fontMode === 'pixel'`（Dexie meta 持久化驗證）✓
- [x] 7.6 user 在 Safari 親自確認 — 平滑 Noto 與 Chrome 一致（root cause 解決）✓

## 8. Pre-archive

- [ ] 8.1 user 確認 dogfood 後 OK
- [ ] 8.2 Git commit（須 user 顯式核可，per Curator rules）
