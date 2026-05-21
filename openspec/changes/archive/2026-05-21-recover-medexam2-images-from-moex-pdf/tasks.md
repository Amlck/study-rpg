## 1. moex PDF acquisition

- [x] 1.1 Probe moex.gov.tw URL schema for 二階 papers — find code/`c`/`s` params per (year, sitting, paper)
- [x] 1.2 Document 3 s-schemes: 舊制 (106–113) `s=11/22/33/44` / 新制第一次 (114-1, 115-1) `s=0103/0104/0105/0106` / 新制第二次 (114-2) `s=0101/0102/0103/0104`
- [x] 1.3 Fetch 76 question PDFs (19 exams × 4 papers) into `~/Desktop/國考/二階國考/moex_原始題目_pdf/`, name `{code}__{year}-{sitting}_{paper}.pdf`
- [x] 1.4 Verify all 76 PDFs by checking first-page cover text matches the embedded year-sitting-paper label

## 2. Image extraction pipeline

- [x] 2.1 Build PyMuPDF region-based attribution: for each PDF, line-level scan for `^(\d+)\.` Q headers via dict-mode; collect `(page, y0, y1, q_num)` tuples
- [x] 2.2 Attribute each embedded image to the Q whose region `[Q.y_end, next_Q.y_start]` contains the image's `y_top` (cross-page aware)
- [x] 2.3 Auto-merge vertically-stacked ECG strip images: detect (x-aligned, similar-width, vertical-gap ≤ 8pt) chains and vertical-stack on white canvas
- [x] 2.4 Vertical-stack multiple per-question images (e.g. 甲狀腺超音波 3 views) into a single PNG with 10px gap + horizontal-center
- [x] 2.5 Render manual-crop fallback for vector-only / scanned-page PDFs: clip rect = `[Q.y_end, first-option.y_start]` at 200 DPI
- [x] 2.6 For Q23 (肝癌 CT) refine clip to skip stem text — use `last-text-line.y_end` as crop start to exclude question text from the image
- [x] 2.7 Write extracted PNGs to `~/Desktop/國考/二階國考/moex_原始題目_pdf/_images/{label}_{paper}/Q{n}_p{page}_img{idx}.png` + emit `_manifest.json`

## 3. Source corpus patch (out-of-repo, idempotent)

- [x] 3.1 Symlink `~/Desktop/國考/二階國考/二階國考_拆分/_images → ../moex_原始題目_pdf/_images` for relative-path resolution from `.md`
- [x] 3.2 Build `(label, paper, q_num) → (md_path, category)` lookup by scanning all `醫學*/<category>/*.md`
- [x] 3.3 Patch 172 `.md` files: inject `![Qn 圖](../../_images/{label}_{paper}/{filename})` before first `- A.` option line; idempotent skip if already linked
- [x] 3.4 Auto-write `.md.bak` next to each modified file for rollback safety

## 4. Ingest to app folder

- [x] 4.1 Copy/rename `_images/{label}_{paper}/Q{n}_*.png` → `apps/medexam2-hospital-tw/public/images/medexam2-tw/{year}-{sitting}-{paper}-{category}-Q{n}.png`
- [x] 4.2 Where same Q has multiple stacked strips, single output PNG already merged at extraction time
- [x] 4.3 Validate filename collision against existing 396 OCR-pipeline outputs; overwrite is intentional (PDF source has higher fidelity)

## 5. Fix build.ts imagePath logic

- [x] 5.1 Change `imagePath` from `parsed.hasImage && existsSync(file)` gate to `existsSync(file)` only
- [x] 5.2 Add `hasImage = parsed.hasImage || imageExists` so file presence auto-promotes hasImage (covers 45 stem-regex misses)
- [x] 5.3 Update inline comment block to document the new contract: "file presence is the source of truth"

## 6. Add KNOWN_NO_IMAGE override

- [x] 6.1 Declare `KNOWN_NO_IMAGE: Set<string>` inline in `buildQuestion()` with `113-1-醫學五-外科-Q54` and `112-1-醫學三-內科-Q3`
- [x] 6.2 Apply override: `hasImage = KNOWN_NO_IMAGE.has(id) ? false : (parsed.hasImage || imageExists)`
- [x] 6.3 Document each entry inline with the false-positive phrasing (「膽道攝影圖像」 concept noun / 「心電圖為竇性頻脈」 narrative finding)
- [x] 6.4 Delete misleading PNG for `112-1-醫學三-內科-Q3` from `apps/medexam2-hospital-tw/public/images/medexam2-tw/`

## 7. Build + sync artifacts

- [x] 7.1 Run `MEDEXAM2_ALLOW_SKIPS=1 pnpm --filter @study-rpg/content-medexam2-tw build`
- [x] 7.2 Verify build output: 441 hasImage=true ≡ 441 imagePath set ≡ 0 hasImage-but-no-imagePath gap
- [x] 7.3 Copy `packages/content-medexam2-tw/dist/{questions,meta,stats,subjects}.json` → `apps/medexam2-hospital-tw/public/content/medexam2-tw/`
- [x] 7.4 Spot-check 3 samples: 108-1 Q5 ECG, 108-1 Q74 三-view 甲狀腺超音波, 106-1 Q10 頭骨 X-ray (R10 + L10)

## 8. Verify via Chrome MCP

- [x] 8.1 Start medexam2-hospital-tw dev server on port 5174
- [x] 8.2 Navigate to raw image URLs to confirm static file serving works for sampled questions
- [x] 8.3 Visual-confirm vertical-stack rendering (Q10 / Q74 / Q23 sampled)

## 9. Spec + change docs

- [x] 9.1 Write `proposal.md`, `design.md`, `specs/medexam2-corpus-ingestion/spec.md`, `tasks.md` under `openspec/changes/recover-medexam2-images-from-moex-pdf/`
- [x] 9.2 Run `openspec validate recover-medexam2-images-from-moex-pdf` → expect ✓ valid
- [x] 9.3 Run `/opsx:verify` to confirm 3-dim coherence (completeness / correctness / coherence)
- [ ] 9.4 Run `/opsx:archive` to merge delta into `openspec/specs/medexam2-corpus-ingestion/spec.md`

## 10. Commit

- [ ] 10.1 Stage explicit files: `build.ts`, 47 new PNGs (`git add -A apps/medexam2-hospital-tw/public/images/medexam2-tw/`), modified PNGs, regenerated JSON artifacts, openspec change folder
- [ ] 10.2 Verify staging area with `git diff --cached --name-status` — confirm no parallel-session leakage
- [ ] 10.3 Commit with message `spec(archive): merge recover-medexam2-images-from-moex-pdf — moex PDF → 441 image-bug questions covered (was 397)`
- [ ] 10.4 Push to `origin/track-m2` only after explicit user confirmation
