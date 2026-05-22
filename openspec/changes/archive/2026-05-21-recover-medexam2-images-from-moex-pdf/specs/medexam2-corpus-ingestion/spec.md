## MODIFIED Requirements

### Requirement: Question SHALL carry `imagePath` when extracted PNG exists

The build script SHALL set `Question.imagePath` to a relative path under the app's public image dir when a matching PNG file exists on disk, and SHALL leave it `null` (or omit it) otherwise. **File presence on disk SHALL be the source of truth for `imagePath`**, irrespective of whether `parsed.hasImage` (the stem-text regex) matched.

Specifically, for each parsed question, after constructing the question id `<year>-<sitting>-<paper>-<subject>-Q<n>`:

1. Compute candidate image path `apps/medexam2-hospital-tw/public/images/medexam2-tw/<id>.png` (absolute path relative to monorepo root)
2. If the file exists (`existsSync`), assign `Question.imagePath = "images/medexam2-tw/<id>.png"` (relative path, app-base-URL prepended at render time) **AND set `Question.hasImage = true`** even if the stem-text regex didn't match
3. If the file does NOT exist, omit `imagePath` from the question object (or set to `null`); the question is still emitted with all other fields intact

This SHALL apply uniformly to all 6080 questions. The behaviour ensures that when an operator drops a new PNG into `apps/medexam2-hospital-tw/public/images/medexam2-tw/<id>.png`, the next build run picks it up automatically with no `.md` patch or regex extension needed.

The `imagePath` value SHALL be a forward-slash path suitable for browser URL concatenation; absolute filesystem paths SHALL NOT be written into `questions.json`.

#### Scenario: hasImage question with matching PNG gets imagePath set

- **GIVEN** question `108-2-醫學三-內科-Q45` has `hasImage = true` (stem regex matched)
- **AND** the file `apps/medexam2-hospital-tw/public/images/medexam2-tw/108-2-醫學三-內科-Q45.png` exists
- **WHEN** the build script runs
- **THEN** the question's `imagePath` field SHALL equal `"images/medexam2-tw/108-2-醫學三-內科-Q45.png"`
- **AND** `hasImage` SHALL remain `true`

#### Scenario: hasImage question with no PNG omits imagePath

- **GIVEN** question `109-1-醫學四-外科-Q12` has `hasImage = true` (stem regex matched)
- **AND** no matching PNG file exists at the expected path
- **WHEN** the build script runs
- **THEN** the question's `imagePath` field SHALL be absent (or `null`)
- **AND** the question SHALL still be emitted with all other fields (id, stem, options, answer, explanation, hasImage, meta) intact
- **AND** `QuizModal` SHALL render a "（題目有附圖，但目前圖片缺失）" placeholder banner via the `hasImage && !imagePath` condition

#### Scenario: Stem regex missed but PNG exists — hasImage auto-promoted

- **GIVEN** question `108-2-醫學六-眼科-Q17` has `hasImage = false` from the stem regex (stem says 「如眼底視網膜照片所示」 — phrasing not in regex enumeration)
- **AND** the file `apps/medexam2-hospital-tw/public/images/medexam2-tw/108-2-醫學六-眼科-Q17.png` exists on disk (extracted from moex PDF)
- **WHEN** the build script runs
- **THEN** the question's `imagePath` field SHALL equal `"images/medexam2-tw/108-2-醫學六-眼科-Q17.png"`
- **AND** `hasImage` SHALL be auto-promoted to `true`

#### Scenario: Plain text question (no hasImage, no PNG) has no imagePath

- **GIVEN** question `111-2-醫學六-麻醉科-Q3` has `hasImage = false` from stem regex
- **AND** no matching PNG file exists at the expected path
- **WHEN** the build script runs
- **THEN** the question's `imagePath` field SHALL be absent (or `null`)
- **AND** `hasImage` SHALL remain `false`

## ADDED Requirements

### Requirement: `KNOWN_NO_IMAGE` override SHALL suppress false-positive hasImage matches

The build script SHALL maintain a `KNOWN_NO_IMAGE: Set<string>` of question IDs (`<year>-<sitting>-<paper>-<subject>-Q<n>` format) for which `hasImage` is forced to `false`, regardless of stem-regex match. These IDs SHALL be hard-coded inline in `buildQuestion()` with an inline comment explaining the false-positive phrasing.

Override SHALL be applied after stem-regex evaluation and file-presence check, as the final authority:

```ts
const hasImage = KNOWN_NO_IMAGE.has(id) ? false : (parsed.hasImage || imageExists)
```

The override SHALL NOT touch `imagePath` directly — if a PNG file exists for an overridden question (orphan asset), `imagePath` remains set, but `hasImage = false` means `QuizModal` won't render an image area (since the render condition is `imagePath && hasImage`).

This requirement covers stem-regex false positives that are too narrow to fix at the regex level without losing legitimate matches in the common case. Examples:

- `113-1-醫學五-外科-Q54`: stem option ④ contains 「膽道攝影（cholangiogram）圖像」 as a procedure-concept noun phrase, hitting the `圖像` clause; the question is a 5-statement pure-text MCQ with no actual figure
- `112-1-醫學三-內科-Q3`: stem contains 「心電圖為竇性頻脈」 as a narrative finding; hits the `心電圖為` clause that exists precisely because most such questions DO have figures

Operator workflow: when QA discovers a question where `hasImage = true` triggers a misleading "圖片缺失" banner with no underlying figure in the source PDF, add the question ID to `KNOWN_NO_IMAGE`. If the list exceeds ~10 entries, lift to a separate JSON file under `packages/content-medexam2-tw/data/`.

#### Scenario: Question in KNOWN_NO_IMAGE has hasImage forced to false

- **GIVEN** question `113-1-醫學五-外科-Q54` whose stem hits the `圖像` clause of the hasImage regex (false positive)
- **AND** `KNOWN_NO_IMAGE` contains `'113-1-醫學五-外科-Q54'`
- **AND** no PNG exists at the expected path
- **WHEN** the build script runs
- **THEN** the question's `hasImage` SHALL be `false`
- **AND** the question's `imagePath` SHALL be `null`
- **AND** `QuizModal` SHALL render the question as pure-text with no figure area and no placeholder banner

#### Scenario: Override does not affect questions not in the set

- **GIVEN** question `108-1-醫學三-內科-Q5` whose stem hits the `心電圖.*如下圖` clause (true positive — has an ECG figure)
- **AND** `KNOWN_NO_IMAGE` does NOT contain `'108-1-醫學三-內科-Q5'`
- **AND** the file `apps/medexam2-hospital-tw/public/images/medexam2-tw/108-1-醫學三-內科-Q5.png` exists
- **WHEN** the build script runs
- **THEN** the question's `hasImage` SHALL be `true`
- **AND** the question's `imagePath` SHALL equal `"images/medexam2-tw/108-1-醫學三-內科-Q5.png"`
