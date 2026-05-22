## ADDED Requirements

### Requirement: Quiz reading area uses readable typography with per-device pixel mode override

The QuizModal reading area — defined as the question meta row (year-subject ID line), question stem, all answer options, dispute-question banner, explanation block, and edge messages (empty pool / missing image) — SHALL render in a readable CJK body font with subpixel antialiasing enabled by default. The default font stack SHALL be `'Noto Sans TC', system-ui, sans-serif` (the existing `--font-body-cjk` token), with `-webkit-font-smoothing: antialiased` and `-moz-osx-font-smoothing: grayscale` explicitly applied to defeat the body-level `font-smoothing: none` that intentionally pixelates UI chrome.

The system SHALL persist a per-device `ui.fontMode` preference (`'readable' | 'pixel'`) in the Dexie `meta` table with key `ui.fontMode`. When the preference is `'pixel'`, the same reading-area selectors SHALL revert to the pixel font stack (`--font-pixel-cjk`, i.e. Cubic 11) and `font-smoothing: none`. UI chrome outside the reading area (modal headers, buttons, banners, navigation, partner card, subject dropdown label) SHALL remain in pixel font regardless of the preference — the toggle affects reading area only.

A toggle SHALL be exposed in the HelpMenu accordion under a new section「字型偏好（題目 / 選項 / 詳解）」. The toggle SHALL not require sign-in and SHALL not synchronise to cloud storage. The preference SHALL be applied via a `data-font-mode` attribute on `document.body`, which CSS selectors of the form `body[data-font-mode="pixel"] <reading-area-selector>` SHALL target.

#### Scenario: Default readable rendering across browser engines

- **GIVEN** a player on a device with no prior `ui.fontMode` preference written to the Dexie `meta` table
- **AND** the player opens any QuizModal (via banner 「📚 學習」 or SRS due picker)
- **WHEN** the modal renders the question stem, options A–D, and explanation
- **THEN** all four areas SHALL display in Noto Sans TC with subpixel antialiasing active
- **AND** the rendering SHALL be visually consistent between Safari and Chrome (no engine-specific pixelation regression)
- **AND** the modal header, partner card, subject dropdown label, and 下一題 button SHALL remain in Cubic 11 pixel font (UI chrome unaffected)

#### Scenario: Player toggles pixel mode in HelpMenu

- **GIVEN** a player opens HelpMenu → 「字型偏好」 section while a QuizModal is also open in another route
- **WHEN** the player selects the「像素 (Cubic 11)」radio option
- **THEN** the `ui.fontMode` Dexie meta row SHALL be set to `'pixel'`
- **AND** `document.body.dataset.fontMode` SHALL update to `'pixel'` via the App-level live query effect
- **AND** the QuizModal reading area (stem / options / explanation / meta row / disputed banner) SHALL re-render with Cubic 11 + `font-smoothing: none`
- **AND** the UI chrome SHALL remain visually unchanged
- **AND** on next page reload the preference SHALL persist (Dexie meta still holds `'pixel'`)
