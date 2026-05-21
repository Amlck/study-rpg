## Why

The 二階國考 corpus had **397 / 6080 questions with image references properly wired up** (`imagePath` set in `questions.json`). The other ~45 image questions had files on disk but `imagePath = null` due to a build-script bug, and a handful of image questions had no extracted PNG at all. In-game, those questions either showed a misleading "圖片缺失" placeholder banner or rendered as text-only when the stem clearly requires a figure (ECG, blood smear, US, X-ray, etc.) — making them unfair to play.

Root cause: build.ts gated `imagePath` on `parsed.hasImage && existsSync(file)`, but the stem-text regex (`parsed.hasImage`) was strictly stricter than the PNG-on-disk reality. Phrasings like 「眼振圖」 / 「所附影像檢查圖」 weren't enumerated in the regex, so 45 questions with valid PDF-extracted PNGs got dropped. Conversely, a couple of false positives (「心電圖為竇性頻脈」 narrative description, 「cholangiogram 圖像」 as a concept) hit the regex but had no real figure in the PDF.

## What Changes

- **Realign build.ts with existing spec requirement** "Question SHALL carry `imagePath` when extracted PNG exists": file presence on disk is now the source of truth for `imagePath`, not `parsed.hasImage`. Adds 45 newly-wired image questions to playable state.
- **Add `KNOWN_NO_IMAGE` override list in build.ts** for stem-regex false positives (currently `112-1-醫學三-內科-Q3` and `113-1-醫學五-外科-Q54`). These get `hasImage = false` regardless of regex match, suppressing the misleading "圖片缺失" placeholder banner.
- **Document the moex-PDF-driven image recovery pipeline** that produced the 442 PNGs: fetch 76 raw 試題 PDFs from `wwwq.moex.gov.tw` per (year, sitting, paper) using mapped `s` / `c` params; PyMuPDF region-based attribution per PDF Q1–80 header with cross-page handling + auto-merge of vertically-stacked ECG strips; vertical-stack multiple per-question images into a single PNG to fit the `imagePath: string | null` schema; manual-crop fallback for vector-only / scanned-page PDFs (3 questions).
- **Result**: 441 `hasImage = true` ≡ 441 `imagePath` set, 0 gap. From 397 → 441 questions with playable images (+44 net, after suppressing 2 false positives).

## Capabilities

### New Capabilities

None — the image-recovery operational pipeline lives outside the repo (PDFs in `~/Desktop/國考/二階國考/`, extraction scripts as one-shot tools in `/tmp/`). Codifying a permanent recovery pipeline would be premature: moex's URL scheme is fragile across schemes (3 `s` patterns already observed across 106→115) and PDF text-layer quality varies. Future 115-2 / 116-1 ingests will re-derive scripts ad-hoc.

### Modified Capabilities

- `medexam2-corpus-ingestion`: clarify that `imagePath` is file-presence-driven (already in spec text but build.ts violated it); add `KNOWN_NO_IMAGE` override requirement for stem-regex false positives.

## Impact

- **Code**: `packages/content-medexam2-tw/scripts/build.ts` (+24 / −8 lines)
- **Generated artifacts**: `packages/content-medexam2-tw/dist/{questions,meta,stats,subjects}.json` rebuilt; `apps/medexam2-hospital-tw/public/content/medexam2-tw/*.json` synced
- **Image assets**: 442 PNGs in `apps/medexam2-hospital-tw/public/images/medexam2-tw/` — 47 newly added, ~395 re-encoded (vertical-stack merge for multi-image questions superseding earlier OCR-pipeline outputs)
- **No app-code changes**: `QuizModal.tsx` / `ERConsultDialog.tsx` / `TrainingPage.tsx` continue to render `imagePath` as-is; no regression risk
- **Bundle size**: `questions.json` gzipped 3.44 MB (+0.01 MB vs pre-change; existing NFR-exceed flag unchanged)
- **`.md` corpus**: 172 files in `~/Desktop/國考/二階國考/二階國考_拆分/` patched with `![](_images/...)` markdown references — outside repo, source corpus only, no app-runtime impact
