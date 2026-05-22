## Context

The 二階國考 corpus build pipeline at `packages/content-medexam2-tw/scripts/build.ts` consumes `.md` files at `~/Desktop/國考/二階國考/二階國考_拆分/醫學*/<category>/<year>_<sitting>.md`, parses 6080 questions across 4 papers × 19 exams × ~80 Q, and emits `questions.json` for the 二階 hospital app. The spec `medexam2-corpus-ingestion` already requires `imagePath` to be set whenever a matching `<id>.png` exists in `apps/medexam2-hospital-tw/public/images/medexam2-tw/`, but the implementation deviated — `imagePath` was gated on `parsed.hasImage && existsSync(file)`, dropping 45 valid questions whose stem text didn't trip the `hasImage` regex.

Audit performed during this change:

- **6080 PDF Q ≡ 6080 .md Q** — every question is in the corpus; no stems missing
- **442 PNGs on disk** in `apps/medexam2-hospital-tw/public/images/medexam2-tw/` after this change's PDF-driven re-extraction (vs ~396 before, mostly OCR-pipeline outputs)
- **442 `imagePath` set in questions.json** after build.ts fix (was 397, +45)
- **441 `hasImage = true`** (was 398, +43 net = +45 from file-presence-driven detection − 2 false-positive overrides)

## Goals / Non-Goals

**Goals:**

- Every question whose stem references a figure SHALL have a corresponding PNG and `imagePath` set, OR an explicit `hasImage = false` if the regex hit was a false positive
- File presence on disk = source of truth for `imagePath` (already in spec, just enforce in code)
- Image quality: each PNG SHALL contain ONLY the figure region, not the question stem text (Q23 re-crop case)
- Suppress misleading "圖片缺失" placeholder banners in QuizModal for known false positives

**Non-Goals:**

- Codify the moex-PDF-fetch + PyMuPDF-extract pipeline as a permanent in-repo tool. The 76-PDF source set is a one-shot recovery; future exam years (115-2, 116-1) need re-derived scripts because moex's URL schema (`s` parameter) shifts across exam restructures (3 schemes observed across 106→115).
- Per-question hand-curation. Most images flow through the automated pipeline; only 4 questions needed manual attention (3 manual-crop + 2 false-positive overrides − 1 overlap = 4 touchpoints).
- Schema change to `Question.imagePath` from `string | null` to `string[]`. Multi-image questions (65 of 442) are vertical-stacked into a single PNG at extraction time; this keeps host-app code untouched.
- Tracking the `~/Desktop/國考/二階國考/二階國考_拆分/醫學*/<category>/*.md` patcher run that linked images back into source markdown. Source corpus is out-of-repo and re-patching is idempotent — no need to spec.

## Decisions

### Decision 1: File presence drives `imagePath`, not `parsed.hasImage`

**Choice**: In `buildQuestion()`:
```ts
const imageExists = existsSync(join(APP_IMAGE_DIR, imageFilename))
const imagePath = imageExists ? `${APP_IMAGE_REL}/${imageFilename}` : null
const hasImage = parsed.hasImage || imageExists
```

**Why over alternative**:
- *Alternative*: extend the `hasImage` stem regex to catch the 45 missing phrasings (「眼振圖」 / 「所附影像檢查圖」 / etc.). Rejected because (a) the regex is already 14-clause long and brittle; (b) PDF-extraction has already done the work of attribution — trusting it is simpler than re-deriving from stem text; (c) future ingests of new images become zero-touch (drop PNG into app folder → next build picks it up).
- The spec requirement "imagePath SHALL be set when PNG exists" was already written this way. Fixing build.ts aligns code with spec; no spec change needed for this part.

### Decision 2: `KNOWN_NO_IMAGE` override for stem-regex false positives

**Choice**: Hard-coded `Set<string>` in `buildQuestion()` listing question IDs that should be forced to `hasImage = false`:
```ts
const KNOWN_NO_IMAGE = new Set<string>([
  '113-1-醫學五-外科-Q54',  // "膽道攝影 (cholangiogram) 圖像" — concept, not a figure
  '112-1-醫學三-內科-Q3',   // "心電圖為竇性頻脈" — narrative finding, no figure
])
const hasImage = KNOWN_NO_IMAGE.has(id) ? false : (parsed.hasImage || imageExists)
```

**Why over alternatives**:
- *Alt A*: tighten the regex to exclude these phrasings. Rejected: 「心電圖為」 IS the documented pattern in `medexam2-corpus-ingestion` ("display verb required") because most 「心電圖為...」 questions DO have ECG figures; Q3 is the unusual one where 「為」 introduces a finding description. Removing it would break the common case.
- *Alt B*: add a `<!-- noimage -->` HTML comment to the affected `.md` blocks. Rejected: pollutes source corpus with build-time hints; uses up reviewer attention budget; doesn't actually scale — operator would need to hunt for them.
- *Alt C*: a `.json` override file co-located with the script. Rejected for now: 2 entries doesn't warrant a separate file + reader. Inline `Set` is grep-able and visible in code review. If the list exceeds ~10 entries, lift it to JSON.

### Decision 3: Vertical-stack multi-image questions into single PNG

**Choice**: When a PDF Q has multiple embedded images in its region (e.g. Q74 甲狀腺超音波 = 3 views), the extraction pipeline vertical-stacks them onto a white canvas with horizontal-center alignment and 10px gaps, saved as a single `{id}.png`.

**Why over alternatives**:
- *Alt A*: schema change to `Question.imagePath: string[]`. Rejected: ripples through `QuizModal.tsx`, `ERConsultDialog.tsx`, `TrainingPage.tsx`, `bug-report.ts`, and any external content-pack consumer. High blast radius for a 65-question UX optimization.
- *Alt B*: pick the largest image, drop others. Rejected: medical figures often need all views together (US transverse + sagittal + Doppler; X-ray AP + lateral). Information loss.
- *Alt C*: store individual files and add a comma-separated `imagePaths` string for backward compat. Rejected: ad-hoc parsing breeds bugs in 3 consumers.

Vertical-stack also handles the ECG-strip pathology where one ECG is encoded as N narrow 211×27pt strip images in the PDF; the pipeline auto-detects contiguous strips by (x-aligned, similar-width, vertical-gap ≤ 8pt) and merges them into a coherent ECG figure before stacking.

### Decision 4: Manual crop for vector-drawn / scanned-page PDFs

**Choice**: For 4 questions where PyMuPDF found `embedded_imgs = 0` on the page (Q23 / Q34 / Q3 / Q54), render the PDF page at 200 DPI then crop the rectangle [Q-header.y_end, first-option.y_start]. For Q23 specifically, refine the crop further: skip to the last-text-line.y_end so the stem text isn't included.

**Why over alternatives**:
- *Alt A*: improve PyMuPDF extraction to handle vector drawings. Rejected: vector → raster conversion at correct DPI + clip detection is non-trivial; not worth the engineering for 4 edge cases.
- *Alt B*: leave those 4 questions without images. Rejected: 3 of them actually have figures embedded; the user can validate the manual crops.

### Decision 5: Source `.md` patching is one-shot, out-of-repo

**Choice**: The `_images` symlink at `~/Desktop/國考/二階國考/二階國考_拆分/_images → ../moex_原始題目_pdf/_images` plus 172 `.md` files patched with `![](_images/...)` markdown blocks are documented in this change but not committed (they're in the user's Desktop corpus, not the repo).

**Why**: This change focuses on the runtime corpus (`packages/content-medexam2-tw/dist/` + `apps/medexam2-hospital-tw/public/`). Source `.md` patches are an authoring-side convenience for the operator viewing source files; build.ts doesn't read the image markdown back. Idempotent re-run is safe via `/tmp/patch_md_images.py --apply`.

## Risks / Trade-offs

- **[Risk]** File-presence-driven `imagePath` lets a stray PNG matching some `<id>.png` filename auto-link itself, even if the PNG content is wrong. **Mitigation**: filename collision unlikely given exhaustive ID format `<year>-<sitting>-<paper>-<subject>-Q<n>`; manual `git status` review surfaces unexpected new PNGs at commit time.
- **[Risk]** `KNOWN_NO_IMAGE` Set grows over time as more false positives surface. **Mitigation**: monitor manually; lift to JSON file at ~10 entries.
- **[Risk]** Vertical-stacking obscures source image identity (clinicians may need to know "this is the sagittal view"). **Mitigation**: original strip files preserved in `~/Desktop/國考/二階國考/moex_原始題目_pdf/_images/` for archival reference; manifest tracks per-strip metadata.
- **[Trade-off]** Multi-image vertical stack canvas adds ~10px gap padding × N-1 stack rows, increasing total PNG size ~5–15%. **Accepted**: visual delineation between sub-figures outweighs marginal file-size cost.
- **[Risk]** Bundle size 3.44 MB gzipped exceeds the 2.5 MB NFR ceiling. **Mitigation**: pre-existing flag for follow-up `lazy-load-medexam2-by-subject` (not in scope for this change).

## Migration Plan

This is a build-pipeline correction, not a runtime migration. Deployment:

1. **Commit** `build.ts` change + new/modified PNG assets + rebuilt JSON artifacts
2. **CI auto-build** via existing `.github/workflows/deploy.yml` (medexam2 has prebuild hook to rebuild content pack)
3. **Verify** on Pages deploy: navigate to e.g. `/study-rpg/hospital/` → enter quiz → confirm image renders for known image questions
4. **No rollback needed**: build.ts change is forward-compatible; if any specific PNG turns out to be wrong, delete the PNG and rebuild — fallback to placeholder banner is graceful

## Open Questions

- Should `KNOWN_NO_IMAGE` move to a JSON file under `packages/content-medexam2-tw/data/`? Not blocking; revisit when the list exceeds 10 entries.
- The 45 `Qextra` images (PDF has image but stem-regex misses) — should we update the `hasImage` regex in spec + code to enumerate the missing phrasings (e.g. 「眼振圖」)? Currently the file-presence fallback covers them. Cosmetic; revisit if regex audit-trail becomes important.
