## 1. Build script — stem markdown image stripper

- [x] 1.1 在 `packages/content-medexam2-tw/scripts/build.ts` 既有 stripper helpers 區（`stripPdfExtractionJunk` / `extractGradingNote` 附近）新增 `function stripMarkdownImages(text: string): string`
  - 規格：移除所有 `!\[[^\]]*\]\([^)]*\)` 出現（image syntax），然後將連續 ≥ 2 個 newline 收成 single newline，最後 `.trim()`
- [x] 1.2 修改 line 298 `const stem = stemLines.join('\n').trim()` → `const stem = stripMarkdownImages(stemLines.join('\n'))`
- [x] 1.3 跑 `pnpm --filter @study-rpg/content-medexam2-tw typecheck` 確認新 helper 無 type 錯

## 2. Rebuild artifact

- [x] 2.1 `MEDEXAM2_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam2-tw build` 跑完看 imported / skipped / total 三數（per No-Silent-Errors discipline）
- [x] 2.2 copy `packages/content-medexam2-tw/dist/questions.json` 到 `apps/medexam2-hospital-tw/public/content/medexam2-tw/questions.json`
- [x] 2.3 git diff stat 確認 questions.json 改動量符合預期（439 stem trimmed，~30-40KB 縮減）

## 3. Verification — data side

- [x] 3.1 在 built questions.json 上跑 `!\[.*?\]\(.*?\)` regex scan：confirm hits === 0（從 439 → 0）
- [x] 3.2 同樣 scan options + explanation：confirm 仍 0 / 0（防衛性確認 fix 沒誤傷其他欄位）
- [x] 3.3 隨機抽 5 題 sample 看 stem 內容仍語意完整（不要把非 image markdown 一起 strip 掉）— 特別挑剛好原本 stem 結尾就是「如圖所示」「附圖如下」的題目
- [x] 3.4 sample 題：確認 `imagePath` 仍正確填充、`hasImage === true`

## 4. Verification — runtime side

- [x] 4.1 開 dev server `pnpm --filter @study-rpg/medexam2-hospital-tw dev`
- [x] 4.2 Chrome MCP 找一題受影響題目（如 `106-1-醫學三-內科-Q10`）→ 開 QuizModal → confirm stem 字面不再含 `![...](...)`、`<img>` 仍 render
- [x] 4.3 隨機抽一題未受影響題目（imagePath 也存在但原本 stem 乾淨的）→ confirm 沒被誤傷

## 5. Delta spec

- [x] 5.1 寫 `openspec/changes/fix-medexam2-stem-markdown-image-leftover/specs/medexam2-corpus-ingestion/spec.md`：ADDED Requirement「Stem normalization SHALL strip inline markdown image syntax」+ 1 scenario

## 6. Pre-archive

- [x] 6.1 `openspec validate fix-medexam2-stem-markdown-image-leftover --strict` 通過
- [x] 6.2 typecheck 全綠
- [x] 6.3 user 確認 dogfood ✓ → archive + commit + push + merge → main + push main 觸發 gh-pages
