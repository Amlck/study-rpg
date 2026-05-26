## ADDED Requirements

### Requirement: Top-level navigation SHALL render seven tabs in the specified order

The hospital app `apps/medexam2-hospital-tw` top-level navigation (rendered from `pages/HomePage.tsx` `<Link>` list) SHALL display exactly seven entries in the following left-to-right order:

1. 唸書 → `/study`
2. 醫院 → `/hospital`
3. 醫師 → `/roster`
4. 命運 → `/fate-cards`
5. 成就 → `/achievements`
6. 排名 → `/leaderboard`
7. 收藏 → `/bookmarks`

The `/training` route SHALL NOT appear as a top-level link (it is collapsed into a sub-tab of 醫師, per separate Requirement below). Route paths themselves SHALL NOT change — only the rendered order of `<Link>` elements in the home navigation array. Existing deep links, share URLs, and bookmarks pointing to any of these paths SHALL continue to work unchanged.

#### Scenario: Home page renders seven nav links in order

- **WHEN** the player loads `/` (home page)
- **THEN** exactly seven `<a class="nav-link">` elements SHALL be rendered
- **AND** their order from top to bottom (or left to right depending on viewport) SHALL be 唸書 / 醫院 / 醫師 / 命運 / 成就 / 排名 / 收藏

#### Scenario: Existing /training share link still resolves

- **GIVEN** a player has bookmarked `https://med-study-rpg.com/2nd/training` from before the change
- **WHEN** the player opens that URL
- **THEN** the app SHALL handle the route (per the redirect requirement below)
- **AND** the route SHALL NOT 404 or fall back to the home page silently

### Requirement: Doctor page SHALL host roster and training as URL-keyed sub-tabs

The `/roster` route SHALL render a sub-tab container with two sub-tabs:

- **醫師名冊** (default): the existing `DoctorRoster` panel listing recruited doctors with rarity / specialty / pity filters
- **進修**: the existing training UI (extracted from `TrainingPage` into a panel component) including rarity multi-select, pity status multi-select, doctor list, and the training-battle flow

The active sub-tab SHALL be controlled by URL search parameter `?tab=roster|training` (mirror the `BookmarksPage` `?tab=manual|wrong` pattern). When the parameter is absent, the default sub-tab SHALL be `roster`. Switching sub-tabs SHALL update the URL via `setSearchParams`, and switching SHALL unmount the previously-active panel (state is not preserved across sub-tab switches; this includes filters, scroll position, and training-battle state).

#### Scenario: Default landing on /roster shows roster panel

- **WHEN** the player navigates to `/roster` (no query string)
- **THEN** the active sub-tab indicator SHALL show 醫師名冊 as selected
- **AND** the DoctorRoster panel SHALL be mounted
- **AND** the training panel SHALL NOT be mounted

#### Scenario: URL parameter selects training sub-tab

- **WHEN** the player navigates to `/roster?tab=training`
- **THEN** the active sub-tab indicator SHALL show 進修 as selected
- **AND** the training panel SHALL be mounted
- **AND** the DoctorRoster panel SHALL NOT be mounted

#### Scenario: Switching sub-tab resets the other panel's state

- **GIVEN** the player is on `/roster?tab=training` and has selected rarity filters P2+P3 in the training panel
- **WHEN** the player clicks 醫師名冊 sub-tab
- **THEN** the URL SHALL update to `/roster?tab=roster`
- **AND** the training panel SHALL unmount (rarity filters discarded from memory)
- **AND** the DoctorRoster panel SHALL mount fresh with its own default filter state
- **AND** when the player later clicks 進修 again, the training panel SHALL mount with default rarity filters (not the prior P2+P3 selection)

### Requirement: Switching away from training during an active battle SHALL prompt confirmation

When the training sub-tab is rendering an active training battle (battle state is mid-resolution, awaiting player input or animation), and the player attempts to switch sub-tabs (clicks 醫師名冊 or navigates away via browser back), the system SHALL display a native `window.confirm` dialog with text reading «進修戰鬥進行中，切換會放棄當前戰鬥。確定？» (or substantively equivalent zh-TW wording). The player MUST explicitly confirm before the sub-tab switch proceeds.

- **Cancel** SHALL keep the player on the training sub-tab with battle state intact
- **Confirm** SHALL unmount the training panel (battle state discarded) and navigate to the requested sub-tab

This guard SHALL only fire when battle is actively in progress. Idle states (training panel mounted but no battle running) SHALL NOT trigger the confirm.

#### Scenario: Active battle blocks accidental sub-tab switch

- **GIVEN** the player is on `/roster?tab=training` and has started a P3 → P2 training attempt that is mid-resolution (animation playing or answer pending)
- **WHEN** the player clicks the 醫師名冊 sub-tab button
- **THEN** a `window.confirm` dialog SHALL appear with the confirmation text
- **AND** if the player clicks Cancel, the URL SHALL remain `/roster?tab=training` and battle state SHALL persist
- **AND** if the player clicks OK, the URL SHALL update to `/roster?tab=roster` and the training panel SHALL unmount

#### Scenario: Idle training panel allows free switch

- **GIVEN** the player is on `/roster?tab=training` but has not started any training attempt (no active battle)
- **WHEN** the player clicks 醫師名冊 sub-tab
- **THEN** the switch SHALL occur immediately without any confirm dialog

### Requirement: Legacy /training route SHALL redirect to /roster?tab=training

The `/training` route SHALL be retained in the app's route table for backward compatibility, but its element SHALL be a `<Navigate to="/roster?tab=training" replace />` (react-router v6 navigate with `replace` flag). The redirect SHALL apply to all three navigation paths defined in the SPA route 三件套 verification protocol:

1. **In-app navigation** via `<Link to="/training">` or `useNavigate('/training')`
2. **Direct URL entry** via address bar or external link click
3. **F5 / browser reload** on `/training`

In each case the player SHALL land on `/roster?tab=training` with the training sub-tab active. The redirect SHALL use `replace` to avoid pushing an extra history entry (so browser back goes to the prior page, not back through `/training`).

#### Scenario: Direct URL to /training lands on training sub-tab

- **WHEN** the player enters `https://med-study-rpg.com/2nd/training` into the address bar
- **THEN** the app SHALL handle the route, redirect, and render the page at `/roster?tab=training`
- **AND** the training sub-tab SHALL be active

#### Scenario: F5 on /training redirects to /roster?tab=training

- **GIVEN** the player is on `/training` after redirect (URL may have already been replaced to `/roster?tab=training`)
- **WHEN** the player presses F5
- **THEN** the page SHALL reload and render `/roster?tab=training`
- **AND** SHALL NOT return a 404
