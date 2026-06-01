## Why

Dogfooder 反映「112-1-醫學三-內科-Q46」這題 stem 顯示出原始 markdown image 語法字串：

```
![Q46 圖](../../_images/112-1_醫學三/Q46_p11_img00.png)
```

掃描已 build 出的 `apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json` 確認影響面：

| 統計 | 二階 | 一階 |
|---|---|---|
| 總題數 | 6080 | 3291 |
| stem 含 `![...](...)` | **439** | 0 |
| options 含 | 0 | — |
| explanation 含 | 0 | — |
| 受影響題目 imagePath 已正確填充 | 439 / 439 | — |

439 受影響題目 paper 分布：醫學四 130 / 醫學六 123 / 醫學五 107 / 醫學三 79。

Root cause 在 [packages/content-medexam2-tw/scripts/build.ts:298](packages/content-medexam2-tw/scripts/build.ts:298)：stem 收集 lines 後直接 `stemLines.join('\n').trim()` 寫進 parsed result，沒過任何 markdown image 過濾。Source `.md` 是 PDF → markdown OCR ingest 階段產出，會插入 `![Q{N} 圖](../../_images/{paper}/{file}.png)` inline image reference。

但 `imagePath` mechanism（[build.ts:451-453](packages/content-medexam2-tw/scripts/build.ts:451)）會用 PDF-extracted PNG 落在 `apps/.../public/images/medexam2-tw/{id}.png` 自動填 `imagePath`，QuizModal renders via `<img>` ([QuizModal.tsx:393-400](apps/medexam2-hospital-tw/src/components/QuizModal.tsx:393))。所以圖實際正確顯示了一次，markdown 字面只是噪音。

一階 build.ts 沒這問題：source `.md` ingest pipeline 不一樣，stem 不含 markdown image syntax（grep 確認 0 hits）。

## What Changes

### Build-time stem normalization

- 在 [build.ts:298](packages/content-medexam2-tw/scripts/build.ts:298) `const stem = stemLines.join('\n').trim()` 前，新增 markdown-image stripping：以 `!\[[^\]]*\]\([^)]*\)` 把 image markdown 拿掉，再 collapse 殘餘 ≥ 2 個連續換行
- 加新 helper `stripMarkdownImages(text: string): string`（near top of file with other stripper helpers）
- 不改 `hasImage` 偵測邏輯（既有 regex 已正確、且 `imageExists` 檔案偵測是真正 source of truth per 既有 comment line 444-451）
- 不改 options / explanation 處理（scan 證實 0 hits — 不寫沒被觸發的防呆 code，遵守 coding_principles §2）

### Rebuild questions.json

- 跑 `pnpm --filter @study-rpg/content-medexam2-tw build` 重新產生 `dist/questions.json`
- copy 到 `apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json` 取代當前 build artifact
- 預期 file size 略降（439 個 stem 各 ~70-100 chars 減少 → 約 -35KB out of 12.86MB）

### Scope cap

- **二階 only** — 一階 source `.md` 已驗證 0 hits，不動 `packages/content-medexam-tw/`
- 不改 QuizModal runtime rendering（runtime fix 是 wrong layer — build-time strip 才是 schema canonical form 紀律，遵守 coding_principles §6）
- 不改 hasImage / imagePath 邏輯
- 不改其他 PDF-junk-stripping helper

## Capabilities

### Modified Capabilities

- `content-medexam2-tw`: stem normalization 新增 markdown image stripping 步驟（修 ADDED Requirement）

## Impact

**Code 影響**：
- `packages/content-medexam2-tw/scripts/build.ts`（新增 1 helper + 1 行 stem prep，~10 行新增）
- `apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json`（重新 build 整個 artifact，~12.86 MB；diff 純粹是 439 個 stem 的字串移除）
- `openspec/specs/content-medexam2-tw/spec.md`（如果存在；否則略過 spec 更新）

**Deploy**：
- 純前端 static content；gh-pages 自動 deploy
- 玩家 IndexedDB 內快取題庫的版本？檢查 — 二階 用 fetch + 寫 questionPool table，每次 app boot 會重新 fetch 最新 questions.json，無需 cache-bust

**Verification**：
- Build 完掃描 questions.json 確認 stem-markdown-image 命中 0
- Chrome MCP 驗 Q46 / 隨機 sample 一題 — modal 內看不到 `![...](...)` 字面、`<img>` 仍正常 render
- typecheck 全綠

**Non-goals**：
- ❌ 不改 PDF ingest pipeline（上游問題；繞過治本但工作量大、影響面廣）
- ❌ 不改一階 content pack（已驗證乾淨）
- ❌ 不做 cache-busting（玩家 reload 即 fetch 新 JSON，無需 SW invalidation）
- ❌ 不在 QuizModal runtime 加 regex（wrong layer — coding_principles §6）
