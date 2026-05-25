## ADDED Requirements

### Requirement: Subject IDs in content-neurons-tw SHALL map to content-medexam-tw via documented many-to-one OR one-to-many mapping, with per-question subject resolution invariant

The `content-neurons-tw` content pack SHALL ship a `subjects.json` whose every `Subject.id` value derives from a corresponding `Subject.id` in `content-medexam-tw` via a documented mapping. The mapping SHALL support:

- **1-to-1 direct mapping** (the default): a neurons-tw subject id equals a medexam-tw subject id verbatim (whitespace-insensitive, case-sensitive). Only `Subject.displayName` differs (renamed to neuron family per `neurons-mode` Requirement 3).
- **1-to-N controlled split**: a single medexam-tw subject id MAY split into multiple neurons-tw subject ids, provided each question originally classified under the medexam-tw subject can be re-classified into exactly ONE of the resulting neurons-tw subject ids via a deterministic, build-time-verifiable rule (e.g., source markdown per-question metadata tag).

Per-question resolution invariant: **every question in the shared corpus SHALL resolve to exactly one neurons-tw subject id** after applying the mapping. No question SHALL map to zero or multiple neurons-tw subjects.

For the current `wire-neurons-content-and-theme` change scope, the mapping is:
- 9 subjects (`藥理學` / `公共衛生學` / `寄生蟲學` / `組織學` / `生物化學` / `病理學` / `解剖學` / `生理學` / `胚胎學`): 1-to-1 direct
- 1 subject split: `微生物暨免疫學` → `微生物學` + `免疫學`, classified via source markdown per-Q `**科目**：<tag>` lookup (see `add-neurons-mode-scaffold` design.md Decision 4 for split heuristic)

The build script for content-neurons-tw SHALL assert the per-question resolution invariant at build time and fail loudly if any question fails to resolve or resolves to multiple subjects.

Future changes that introduce a brand-new subject in content-neurons-tw (with no corresponding medexam-tw subject, e.g., adding 醫學倫理 if medexam-tw adds it) SHALL update this requirement AND provide a corpus path for the new subject's questions.

#### Scenario: 9 直送 subject ids match medexam-tw verbatim

- **GIVEN** `packages/content-medexam-tw/dist/subjects.json` lists 10 subjects including `'藥理學'`, `'生理學'`, `'解剖學'`, `'病理學'`, `'生物化學'`, `'寄生蟲學'`, `'公共衛生學'`, `'組織學'`, `'胚胎學'`, and `'微生物暨免疫學'`
- **WHEN** `pnpm --filter @study-rpg/content-neurons-tw build` runs
- **THEN** the produced `packages/content-neurons-tw/dist/subjects.json` SHALL contain the 9 直送 subject ids verbatim (set equality on this subset)
- **AND** every `Subject.displayName` for these 9 ids SHALL be different from the corresponding medexam-tw displayName (renamed per Linnean taxonomy decision)

#### Scenario: 微生物暨免疫學 split into 微生物學 + 免疫學 via source markdown per-Q tag

- **GIVEN** the source markdown directory `$MEDEXAM_SOURCE_ROOT/醫學二/微生物暨免疫學/*.md` contains question blocks with `**科目**：<tag>` per-Q metadata
- **WHEN** the build script processes the `微生物暨免疫學` subject's questions
- **THEN** each question SHALL be re-classified into either `微生物學` OR `免疫學` based on the per-Q tag (per documented split heuristic in design.md Decision 4)
- **AND** the resulting `subjects.json` SHALL contain BOTH `微生物學` AND `免疫學` as distinct subject entries
- **AND** the original `微生物暨免疫學` subject id SHALL NOT appear in neurons-tw `subjects.json`
- **AND** the union of questions assigned to `微生物學` + `免疫學` SHALL equal the original count of questions under `微生物暨免疫學` in medexam-tw

#### Scenario: Question subject references resolve against neurons-tw subject list

- **WHEN** the neurons-tw app loads `getContentPack()` and the engine evaluates `question.subject`
- **THEN** for every question in the corpus, there SHALL exist exactly one `Subject` in the neurons-tw `subjects[]` whose `id` equals `question.subject`
- **AND** the engine SHALL never encounter an unresolved subject id reference

#### Scenario: Untagged 微生物暨免疫學 question gets default split route

- **GIVEN** a question in `微生物暨免疫學` source markdown lacks a `**科目**：<tag>` per-Q line (or the tag is malformed / unrecognized)
- **WHEN** the build script processes this question
- **THEN** the question SHALL be assigned to the documented default subject for this scenario (currently `微生物學` per design.md Decision 4)
- **AND** the build script SHALL log a warning naming the offending question
- **AND** the build SHALL continue (not fail) when `MEDEXAM_ALLOW_SKIPS=1` is set; otherwise SHALL fail loudly

#### Scenario: Future addition of new neurons-tw subject without medexam-tw counterpart is rejected

- **WHEN** a future change introduces a new `Subject.id` in `content-neurons-tw/subjects.json` that does NOT derive from any `content-medexam-tw/subjects.json` id via the documented mapping
- **THEN** the build script SHALL exit non-zero with a clear error message identifying the orphan subject id
- **AND** the change proposing the divergence SHALL update this requirement AND provide a separate corpus path for the new subject's questions
