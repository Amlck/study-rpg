## ADDED Requirements

### Requirement: AchievementsPage SHALL host a third sub-tab named 統計

The achievements page (`apps/medexam2-hospital-tw/src/components/AchievementsPage.tsx`, served at route `/achievements`) SHALL extend its sub-tab navigation from the existing two options (`main` 主成就 / `subject` 科別精通) to three options:

- `main` 主成就 (unchanged)
- `subject` 科別精通 (unchanged)
- `stats` 統計 (NEW)

The default selected sub-tab on first mount SHALL remain `main`. The sub-tab control SHALL use React local state (no URL searchParam wiring required for this change). When `stats` is the active sub-tab, the existing three filter dropdowns (category / tier / status) SHALL be hidden and replaced with stats-specific controls (range chip + subject filter chip, defined below).

#### Scenario: Sub-tab selector renders three options

- **WHEN** the player loads `/achievements`
- **THEN** the sub-tab selector SHALL render three buttons in order: 主成就 / 科別精通 / 統計
- **AND** 主成就 SHALL be the default active sub-tab

#### Scenario: Activating 統計 hides achievement filters

- **WHEN** the player clicks 統計 sub-tab
- **THEN** the category / tier / status filter dropdowns SHALL NOT render
- **AND** the achievement list SHALL NOT render
- **AND** the stats panel (charts + range chip + subject filter) SHALL render

### Requirement: Stats sub-tab SHALL render two bar charts — daily study minutes and daily correct answers

The 統計 sub-tab SHALL display two independent vertical bar charts stacked vertically (study minutes on top, correct answers on bottom). Each chart SHALL:

- Have an X axis representing calendar days within the selected range (oldest on left, today on right)
- Have a Y axis auto-scaled to `max(values) × 1.1`, with at most two visible Y tick labels (max and mid)
- Render one bar per day in the range, including days with zero value (zero-height bar; X axis remains continuous)
- Use distinct fill colors per chart (study minutes ≠ correct answers); colors MAY follow the existing theme palette
- Be implemented as hand-written SVG (NO chart library dependency such as recharts / d3 / chart.js)
- Display a per-bar tooltip on hover/tap showing the exact date and value (e.g., via `<title>` SVG element or equivalent)

**Data source for study minutes chart**: rows from `dailyStudyLog` Dexie table (defined in `daily-study-log` capability). Each bar's height = `row.minutesAdded` for that date, or `0` if no row.

**Data source for correct answers chart**: rows from `questionHistory` Dexie table grouped by `startOfDay(lastAnsweredAt)` where `lastResult === 'correct'`. Each bar's height = count of qualifying rows for that date.

#### Scenario: Stats panel renders both charts on first mount

- **GIVEN** the player has `dailyStudyLog` with one row `{date:'2026-05-26', minutesAdded:30}` and `questionHistory` with three `lastResult='correct'` rows dated `2026-05-26`
- **WHEN** the player opens the 統計 sub-tab with default range 30d
- **THEN** the page SHALL render a SVG chart for study minutes with the bar at `2026-05-26` representing 30
- **AND** the page SHALL render a SVG chart for correct answers with the bar at `2026-05-26` representing 3
- **AND** all other days in the 30-day window SHALL render as zero-height bars (or visually absent but X axis continuous)

#### Scenario: Charts use SVG not a third-party library

- **WHEN** inspecting the rendered DOM of the stats panel
- **THEN** the chart containers SHALL be `<svg>` elements with `<rect>` children for bars
- **AND** the app bundle SHALL NOT include recharts / d3 / chart.js / victory / chartist or any chart library import attributable to this feature

### Requirement: Stats sub-tab SHALL provide a range chip with four options

The 統計 sub-tab SHALL render a chip-style single-select control above (or beside) the charts with exactly four options:

- 7 天 (7d)
- 30 天 (30d) — **default**
- 90 天 (90d)
- 全部 (all)

Selecting an option SHALL trigger re-aggregation of both charts to that window. Selection SHALL use React local state (no URL searchParam). On sub-tab unmount (player switches to 主成就 / 科別精通) the selection MAY be discarded.

The «全部» option SHALL aggregate from the earliest existing data point (oldest of `dailyStudyLog.date` and `min(questionHistory.lastAnsweredAt)`) to today. If `dailyStudyLog` is empty and no `questionHistory` rows exist, «全部» SHALL render an empty-state message.

#### Scenario: Default range is 30 days

- **WHEN** the player opens the 統計 sub-tab for the first time
- **THEN** the «30 天» chip SHALL appear as selected
- **AND** both charts SHALL render 30 bars (one per day for the last 30 days ending today)

#### Scenario: Switching to 7 天 reduces chart density

- **GIVEN** the 統計 sub-tab is active with «30 天» selected
- **WHEN** the player clicks «7 天»
- **THEN** the «7 天» chip SHALL become selected
- **AND** «30 天» SHALL deselect
- **AND** both charts SHALL re-render with 7 bars covering the last 7 days

#### Scenario: 全部 with no data shows empty state

- **GIVEN** a freshly-installed player with `dailyStudyLog = []` and `questionHistory = []`
- **WHEN** the player opens 統計 and clicks «全部»
- **THEN** an empty-state message SHALL be displayed (e.g., «還沒有資料 — 開始唸書後會在這裡顯示趨勢»)
- **AND** the chart areas SHALL NOT render zero-height bars stretching to infinity

### Requirement: Stats sub-tab SHALL provide a subject filter that affects the correct-answers chart only

The 統計 sub-tab SHALL reuse the existing `BookmarkFilterBar` component to render a multi-select subject chip filter (mirroring its use on the bookmarks page). The filter SHALL be configured as:

- `years = []` (year section hidden — stats sub-tab doesn't filter by year)
- `subjects = ALL_SUBJECT_IDS` (all 14 二階 subjects)
- `selectedSubjects` = controlled by stats sub-tab local state, default `all selected` (treated as no filter)

The subject filter SHALL affect only the correct-answers chart. The study-minutes chart SHALL NOT be affected by subject selection (study time is recorded globally, not per-subject). The visual separation MAY be communicated via a small caption like «分科 filter 僅影響下方圖表» near the filter bar.

#### Scenario: Filtering to one subject reduces correct-answers bars

- **GIVEN** the player has 5 correct 內科 answers on 2026-05-26 and 3 correct 外科 answers on the same date
- **WHEN** the player opens 統計, default range 30d, and deselects all subjects except 內科
- **THEN** the correct-answers chart bar for 2026-05-26 SHALL show height 5 (not 8)
- **AND** the study-minutes chart bar for 2026-05-26 SHALL remain unchanged (whatever `dailyStudyLog` row for that date contains)

#### Scenario: Empty subject selection treated as no-filter (show all)

- **WHEN** the player deselects all subjects (zero subjects checked)
- **THEN** the correct-answers chart SHALL fall back to showing all correct answers across all subjects (equivalent to all selected)
- **AND** a hint MAY display «未選擇任何科別 = 顯示全部»

### Requirement: Stats sub-tab SHALL surface a summary chip showing pre-upgrade residual minutes

Above (or near) the charts, the 統計 sub-tab SHALL display a small chip summarizing the gap between lifetime study minutes and the sum of dailyStudyLog rows visible in any range. The chip SHALL show:

```
升級前累積 {N} 分鐘 (無法分日顯示)
```

Where `N = max(0, monotonicCounters.totalStudyMinutes − sum(dailyStudyLog[*].minutesAdded))`. This chip exists to make the forward-only nature of `dailyStudyLog` transparent to players, especially those upgrading from v17 who had accumulated study minutes before this change shipped.

The chip MAY be hidden when `N === 0` (clean install — no pre-upgrade history exists).

#### Scenario: Existing player with prior accumulated minutes sees residual chip

- **GIVEN** a player with `monotonicCounters.totalStudyMinutes = 4320` and `dailyStudyLog = [{minutesAdded:30}, {minutesAdded:25}]` (total 55)
- **WHEN** the player opens the 統計 sub-tab
- **THEN** the summary chip SHALL display «升級前累積 4265 分鐘 (無法分日顯示)»

#### Scenario: Fresh install hides the residual chip

- **GIVEN** a new player with `monotonicCounters.totalStudyMinutes = 0` and `dailyStudyLog = []`
- **WHEN** the player opens the 統計 sub-tab
- **THEN** the summary chip SHALL NOT render (or render with N=0 hidden)
