# neurons-homepage

## Purpose

Defines the composition and behavior of the neurons-tw homepage (`/`): a hook region (lightweight connectome-tree hero + cap-aware DMN-draw progress ring + first-visit onboarding) over a dashboard region (progress chips + read/quiz CTA + family picker), with homepage-scoped answer-feedback motion. Reduces friction by surfacing game mechanics as visuals rather than prose rules, while keeping the reading timer manual and the quiz entry paths intact.

## Requirements

### Requirement: Homepage SHALL render a lightweight presentational connectome-tree hero that routes to the full interactive view

The neurons-tw homepage (`/`) SHALL render the real labeled connectome tree (`ConnectomeTreeSvg`) as its hero, in a **non-interactive (presentational) embed mode**: family sprites + names + AP chips + firedToday halos + state-styled synapse edges, but with pan / zoom / wheel-capture / drag and the zoom toolbar all disabled so the hero never intercepts page-scroll on the landing page. Activating the hero (click or keyboard Enter/Space) SHALL navigate to `/connectome`. The hero SHALL be a non-`<button>` activation wrapper (the tree renders a `<section>`). The force-sim layout pass SHALL be allowed to run only until it self-settles (its rAF loop stops when stable).

#### Scenario: Hero renders the labeled real tree
- **WHEN** the homepage loads with an initialized connectome snapshot
- **THEN** the hero renders the real `ConnectomeTreeSvg` with family sprites + names + AP chips and state-styled (`dormant | weak | strong`) synapse edges — not an abstract unlabeled mini-tree

#### Scenario: Hero is non-interactive and does not capture page-scroll
- **WHEN** the user wheel-scrolls, drags, or pinches over the hero on the homepage
- **THEN** no tree pan / zoom / node-drag occurs, the zoom toolbar is absent, and the page scrolls normally (the homepage embed passes `interactive={false}`)

#### Scenario: Hero routes to the full connectome on activation
- **WHEN** the user clicks the hero or focuses it and presses Enter/Space
- **THEN** the app navigates to `/connectome` where the same tree is interactive and the family-detail grid + synapse table live

#### Scenario: The /connectome tree remains fully interactive
- **WHEN** the user is on `/connectome`
- **THEN** the tree there is still pan/zoom/drag interactive with its zoom toolbar (the `interactive` prop defaults to true; only the homepage embed disables it)

#### Scenario: Hero is responsive on mobile
- **WHEN** the homepage is viewed below 768px width
- **THEN** the hero tree remains legible and within viewport without horizontal overflow

### Requirement: Homepage SHALL display a cap-aware "next DMN draw" progress ring driven by real reading-timer data

The homepage SHALL replace the prose rule line describing DMN draw timing with a `DmnDrawProgressRing` whose fill reflects reading minutes accrued toward the next 30-minute time-axis threshold, sourced from `readDmnMeta()` / the wired reading-timer + DMN time-axis. The ring SHALL be daily-cap aware: when the daily time-axis draw cap is reached it SHALL render an explicit terminal state rather than continuing a misleading countdown.

#### Scenario: Ring fills as reading minutes accrue
- **WHEN** the reading timer accrues minutes within the current 30-minute window
- **THEN** the ring fill advances proportionally toward the next draw threshold

#### Scenario: Ring reflects the daily cap as a terminal state
- **WHEN** the daily time-axis DMN draw cap has been reached
- **THEN** the ring shows a "今日抽卡已達上限" terminal state instead of a countdown toward another draw

#### Scenario: No prose rule line remains for DMN timing
- **WHEN** the homepage renders
- **THEN** the previous "每 30 min 觸發 DMN 抽卡…" prose rule line is absent, the ring conveying the mechanic visually instead

### Requirement: Homepage SHALL compose as hook-on-top + dashboard-on-bottom without merging dense connectome detail

The homepage SHALL present the hero + progress ring (+ first-visit onboarding) as the top "hook" region and the existing progress status chips + read/quiz CTA + `FamilyPicker` as the bottom "dashboard" region. The dense family-detail grid and synapse table SHALL NOT be moved onto the homepage; they remain on `/connectome`.

#### Scenario: Top region presents the visual hook
- **WHEN** the homepage renders
- **THEN** the connectome hero and the DMN progress ring appear above the dashboard region

#### Scenario: Bottom region presents the dashboard
- **WHEN** the homepage renders
- **THEN** the progress status chips, the read/quiz CTA, and the `FamilyPicker` appear in the dashboard region

#### Scenario: Dense connectome detail is not duplicated on the homepage
- **WHEN** the homepage renders
- **THEN** the per-family AP detail grid and the synapse table are NOT present on the homepage (they remain only on `/connectome`)

### Requirement: Homepage SHALL surface a one-tap-dismissable first-visit onboarding that never reappears once dismissed

The homepage SHALL render a brief, skippable onboarding panel gated on a persisted `meta['homepageOnboardingDismissed']` flag. Dismissing it SHALL set the flag so it never reappears, including after F5 reload. The account-reset path SHALL clear the flag so a reset user sees the onboarding again. The existing `/connectome` first-visit callout SHALL be left in place (it serves users who land directly on `/connectome`).

#### Scenario: First-time user sees onboarding
- **WHEN** the homepage loads and `meta['homepageOnboardingDismissed']` is absent or false
- **THEN** the onboarding panel renders above the fold with a one-tap dismiss control

#### Scenario: Dismissed onboarding does not reappear
- **WHEN** the user dismisses the onboarding and later reloads the homepage (including F5)
- **THEN** the onboarding does not render and `meta['homepageOnboardingDismissed']` is true

#### Scenario: Account reset re-surfaces onboarding
- **WHEN** the user resets account data
- **THEN** `meta['homepageOnboardingDismissed']` is cleared and the onboarding renders again on next homepage load

#### Scenario: Connectome callout is unchanged
- **WHEN** a first-time user navigates directly to `/connectome` with no synapses
- **THEN** the existing `/connectome` empty-state callout still renders (it is not removed by this change)

### Requirement: Homepage SHALL preserve manual reading-timer start and the non-collapsed quiz CTA

The homepage redesign SHALL NOT auto-start the reading timer and SHALL NOT collapse the quiz entry into a single button. The manual reading toggle, the 🎲 cross-family random-quiz entry, and the `FamilyPicker` family-select entry SHALL all remain available; only the path into answering is smoothed.

#### Scenario: Timer does not auto-start on load
- **WHEN** the homepage loads
- **THEN** the reading timer remains in `idle` until the user manually starts it

#### Scenario: Both quiz entry paths remain
- **WHEN** the homepage renders
- **THEN** the 🎲 random-quiz entry and the `FamilyPicker` family-select entry are both present (the CTA is not reduced to a single mega-button)

### Requirement: Homepage answer-feedback and ambient motion SHALL respect reduced-motion and survive SPA direct-URL + F5

All new homepage motion (hero ambient firing, answer-resolution feedback flash) SHALL degrade under `prefers-reduced-motion` to a static end-state cue, and the homepage SHALL render correctly under direct-URL navigation and F5 reload as an SPA route.

#### Scenario: Reduced-motion degrades homepage motion
- **WHEN** the user has `prefers-reduced-motion` enabled
- **THEN** hero ambient firing and answer-feedback flashes are dropped, but state/colour end-state cues are preserved

#### Scenario: Correct answer plays a feedback flash
- **WHEN** a quiz answer resolves as correct (reduced-motion off)
- **THEN** a green firing-pulse feedback flash plays without blocking the answer/next-question flow

#### Scenario: Direct URL and F5 render the homepage
- **WHEN** the user navigates directly to `/` or presses F5 on `/`
- **THEN** the homepage renders fully (hero + ring + dashboard), not a 404 or blank shell
