## MODIFIED Requirements

### Requirement: Synapse formation and strengthening SHALL surface user-facing toast notification, decay SHALL NOT

The system SHALL render a toast notification when the user is in the app and one of the following events fires:

- `connectome.synapseFormed`: toast with copy naming both family `displayName`s and the wiring relation
- `connectome.synapseStrengthened`: toast with copy naming both family `displayName`s and the new state (`weak` or `strong`)

Toasts SHALL auto-dismiss after `TOAST_AUTO_DISMISS_MS` (8 seconds, sourced from `neurons-motion-library`). Toasts SHALL NOT block input or pause gameplay.

The toast host (`ConnectomeToastHost`) SHALL consume `neurons-motion-library` primitives for animation and timing:

- Entry animation SHALL use Framer Motion `motion.div` slide-from-right + opacity-fade variants (not raw CSS keyframes), so `prefers-reduced-motion` can be honored at runtime via the `useRespectsReducedMotion` hook
- Auto-dismiss timing SHALL be the imported `TOAST_AUTO_DISMISS_MS` constant, not a locally-declared literal
- When `useRespectsReducedMotion()` returns true, the entry animation SHALL degrade to opacity fade only (no horizontal translation) while preserving auto-dismiss timing

The host SHALL retain its existing top-right anchored fixed-position vertical-stack layout (distinct from the motion library's single-`<Toast>` top-center primitive) so that multiple concurrent toasts remain visible without overlap.

Decay events (`connectome.synapseDecayed`) SHALL NOT trigger toast notifications (to avoid negative-feedback fatigue). Decay is visible only via the synapse table's state and `daysSinceCoFire` columns.

#### Scenario: New synapse formation triggers a toast naming both families

- **WHEN** a `connectome.synapseFormed` event fires for `pairKey = "藥理學|解剖學"`
- **THEN** a toast SHALL render containing both family `displayName`s (the renamed neuron family names per `wire-neurons-content-and-theme`)
- **AND** the toast SHALL auto-dismiss after `TOAST_AUTO_DISMISS_MS` (8 seconds)

#### Scenario: Synapse decay does NOT trigger a toast

- **WHEN** a `connectome.synapseDecayed` event fires
- **THEN** no toast SHALL render
- **AND** the user discovers the decay only by inspecting the synapse table or seeing a future strengthening event

#### Scenario: Standard motion users see slide-from-right entry animation

- **GIVEN** the user has not enabled OS `prefers-reduced-motion`
- **WHEN** a connectome toast event fires and the toast mounts
- **THEN** the toast SHALL enter with Framer Motion `motion.div` variant `initial={{ x: 400, opacity: 0 }}` → `animate={{ x: 0, opacity: 1 }}`
- **AND** the entry transition SHALL complete within 300ms

#### Scenario: Reduced-motion users see opacity fade only on entry

- **GIVEN** the user has set OS preference `prefers-reduced-motion: reduce`
- **WHEN** a connectome toast event fires and the toast mounts
- **THEN** `useRespectsReducedMotion()` SHALL return `true`
- **AND** the toast SHALL enter with `initial={{ opacity: 0 }}` → `animate={{ opacity: 1 }}` (no horizontal translation)
- **AND** auto-dismiss timing SHALL remain `TOAST_AUTO_DISMISS_MS` (8 seconds) — only the entry animation degrades

#### Scenario: Toast auto-dismiss timing sourced from motion library constant

- **GIVEN** the developer audits `apps/neurons-tw/src/components/SynapseFormationToast.tsx`
- **WHEN** the developer searches for the value `8000`
- **THEN** the value SHALL NOT appear as a local literal in the file
- **AND** the file SHALL import `TOAST_AUTO_DISMISS_MS` from `'../lib/motion'` and reference it at the auto-dismiss `setTimeout` call site
