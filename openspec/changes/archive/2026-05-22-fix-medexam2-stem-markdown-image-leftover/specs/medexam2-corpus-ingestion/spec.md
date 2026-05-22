## ADDED Requirements

### Requirement: Stem normalization SHALL strip inline markdown image syntax

The question parser SHALL remove any markdown image inline syntax matching the pattern `!\[<alt-text>\](<url>)` from the `stem` field before it is written to the output Question object. After removal, any sequence of two or more consecutive newline characters SHALL collapse to a single newline, and the result SHALL be `.trim()`-ed.

This stripping SHALL be applied to `stem` only. Options and explanation fields SHALL NOT be touched by this step — they have their own dedicated PDF-junk sanitization (see "PDF-extraction-junk sanitization" in the parser requirement) and have been verified empirically (post-build scan) to contain zero markdown image leftover.

This requirement exists because the upstream PDF → Markdown ingest pipeline emits inline image references of the form `![Q<N> 圖](../../_images/<paper>/<file>.png)` inside question stems, while the runtime `imagePath` mechanism (file-system presence check in `apps/medexam2-hospital-tw/public/images/medexam2-tw/<id>.png`) already renders the figure via a proper `<img>` element. Leaving the markdown text in the stem produces visible literal garbage in the QuizModal reading area.

#### Scenario: Stem with inline markdown image emits clean text + `<img>` renders once

- **GIVEN** a source `.md` question block whose stem contains `<narrative text>\n\n![Q46 圖](../../_images/112-1_醫學三/Q46_p11_img00.png)` and a corresponding PNG file present in `apps/medexam2-hospital-tw/public/images/medexam2-tw/112-1-醫學三-內科-Q46.png`
- **WHEN** the parser produces the Question object
- **THEN** the emitted `stem` SHALL equal `<narrative text>` (no `![...](...)` substring)
- **AND** the emitted `hasImage` SHALL be `true`
- **AND** the emitted `imagePath` SHALL be `images/medexam2-tw/112-1-醫學三-內科-Q46.png`
- **AND** the QuizModal SHALL render the figure exactly once via its `imagePath`-driven `<img>` element, with no duplicate markdown text artifact above or below it
