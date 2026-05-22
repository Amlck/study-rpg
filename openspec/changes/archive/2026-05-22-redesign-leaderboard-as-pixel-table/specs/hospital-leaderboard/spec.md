## MODIFIED Requirements

### Requirement: Top 100 list plus my-rank chip

The leaderboard UI SHALL display up to 100 ranked rows for the active filter as a **pixel-art tabular grid** (not an unstyled list), rendering one row per opted-in player with one cell per data attribute (rank / nickname / hospital tier / reputation / doctor count / total study minutes). The grid SHALL use the existing pixel design tokens (`--frame-dark` border, `--accent-gold` highlight, Cubic 11 font for nicknames and numeric stats) so the visual style matches the rest of the 二階 hospital UI shell. The player's own current rank SHALL remain accessible regardless of scroll position via either the existing sticky top chip OR a new sticky-bottom "my row" repeat that mirrors the user's row data.

#### Scenario: Top 100 displayed when ≥ 100 opted-in players

- **WHEN** the leaderboard backend has ≥ 100 opted-in players and the player views any filter tab
- **THEN** the UI SHALL display 100 rows in a single scrollable tabular grid where each row aligns its cells vertically with the row above and below

#### Scenario: All rows displayed when < 100 opted-in players

- **WHEN** the leaderboard backend has fewer than 100 opted-in players
- **THEN** the UI SHALL display all available rows and SHALL show a counter「目前 N 位玩家加入排行」 at the top or bottom of the grid

#### Scenario: Rank 1 / 2 / 3 visually distinguished

- **WHEN** any row's display rank is 1, 2, or 3
- **THEN** that row's rank cell SHALL be styled with gold (rank 1) / silver (rank 2) / bronze (rank 3) accent color and pixel-art emboss, distinct from the default frame color used by ranks 4–100

#### Scenario: My-row visually highlighted when present in top 100

- **WHEN** the current authenticated user's `user_id` matches one of the rows in the active filter's top 100
- **THEN** that row SHALL be highlighted with `--accent-gold` border (or equivalent pixel design token) so the user can spot themselves at a glance while scrolling

#### Scenario: My-rank chip shows when player is opted in

- **WHEN** an opted-in player views any filter tab
- **THEN** a chip SHALL display「你目前第 X 名 (共 N 人)」using the player's rank in the active filter; if the player's row is scrolled offscreen the chip MAY be pinned (e.g., via `position: sticky` or a sticky-bottom repeat row that mirrors the player's data) so it stays visible while scrolling the grid

#### Scenario: My-rank chip hidden when player is opted out

- **WHEN** a player has not opted in (or has opted out)
- **THEN** the my-rank chip SHALL be hidden and an explanation「未加入排行 — 至「設定」開啟以參與」 SHALL be shown in its place

#### Scenario: Mobile viewport prioritizes essential columns

- **WHEN** the leaderboard page is rendered at viewport width < 768 px
- **THEN** the grid SHALL show at minimum: rank, nickname, the **active filter's primary stat** bolded, and one secondary stat; non-essential columns MAY be hidden via CSS to prevent horizontal overflow; the row order and underlying row data MUST remain identical to the desktop layout

#### Scenario: Empty state preserved

- **WHEN** the active filter's snapshot has zero rows
- **THEN** the existing message「期待第一個上榜的玩家！」 SHALL render in place of the grid; no empty grid frame SHALL appear
