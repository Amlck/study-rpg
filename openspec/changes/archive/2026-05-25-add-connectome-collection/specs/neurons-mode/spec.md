## MODIFIED Requirements

### Requirement: Game loop SHALL follow Hebbian 3-step learn-fire-wire cycle

The neurons mode SHALL implement a closed game loop framed by Donald Hebb's principle ("neurons that fire together, wire together"):

1. Player reads study material (reading timer accrues) AND answers exam questions filtered by subject (one of 10 一階 國考 subjects, displayed under their renamed neuron-family identities)
2. Each correct answer increases the per-neuron-family **affinity** counter (drives variant gacha unlock — see `neuron-variant-gacha` capability) AND increases the **action potential** counter for that family (drives variant collection growth — see `connectome-collection` capability)
3. When ≥ 2 distinct neuron families each reach the same-day fired threshold (N = 5 correct answers per family within the same local-TZ calendar day), the system SHALL form (or strengthen) a **synapse** between those families in the player's connectome view; repeated same-day co-firing on subsequent days potentiates the synapse through a 3-state machine (`dormant → weak → strong`); prolonged absence of co-firing decays it (LTD) downward by one level after 7+ days without same-day co-fire, **never** removing the synapse

The loop is intentionally closed — answering more cross-family questions → more synapses + more potentiation → richer connectome view + more variant gacha unlocks → encourages answering more questions. No external grind / no real-money loop. The exact N value, decay timing, state machine transitions, AP threshold ladder, and connectome view rendering are specified by the `connectome-collection` capability.

#### Scenario: Initial state has empty connectome

- **GIVEN** the player starts a new save in neurons-tw
- **THEN** `affinity[family] = 0` for all 10 neuron families
- **AND** the connectome view SHALL display all 10 neuron family nodes in a Linnean taxonomy tree with zero synapses between any pair
- **AND** the player MAY answer questions from any subject (answering is not gated)

#### Scenario: First synapse formation

- **GIVEN** the player has answered ≥ N questions correctly from neuron family A in the current session
- **AND** the player has answered ≥ N questions correctly from neuron family B in the same session
- **WHEN** the second cross-family threshold is crossed
- **THEN** a synapse between family A and family B SHALL be created in the dormant state
- **AND** an in-app notification SHALL surface informing the player of the new wiring
- **AND** the connectome view SHALL render the new synapse with the dormant visual style

#### Scenario: Incorrect answer does not rupture synapse

- **GIVEN** a synapse exists between two neuron families in the potentiated state
- **WHEN** the player answers a question from one of those families incorrectly
- **THEN** the synapse SHALL NOT be removed
- **AND** the synapse SHALL NOT be downgraded by more than one state level (LTD applies gradually via decay, not punitively per answer)

#### Scenario: connectome-collection capability is in effect after archive

- **GIVEN** the `add-connectome-collection` change has archived
- **WHEN** the `neurons-mode` capability spec is read
- **THEN** the game loop's Hebbian step-3 mechanics (N value, state machine, decay rules, AP counter, view rendering) SHALL be defined by the `connectome-collection` capability spec at `openspec/specs/connectome-collection/spec.md`
- **AND** the umbrella spec SHALL NOT redefine those mechanics independently
