# achievement-system Spec Delta

## ADDED Requirements

### Requirement: buildAchievementStats transaction scope covers every read

The `buildAchievementStats()` helper (二階 only — `apps/medexam2-hospital-tw/src/lib/achievement-stats.ts`) SHALL declare every Dexie table it reads in its `'r'` transaction scope tuple. Adding a new read to the function body without extending the scope is a forbidden pattern, because Dexie throws `Table <name> not part of transaction` the first time the unreachable branch fires for a player with the matching state.

Callers that wrap `buildAchievementStats()` inside their own outer `'rw'` transaction (e.g. `QuizModal`'s answer-reward block) SHALL include `buildAchievementStats`'s full read set in their outer scope. Sub-transactions in Dexie must be a scope subset of the parent — omissions surface as `SubTransactionError` aborting every write of the outer transaction.

#### Scenario: Player with P1 doctor fully assigned to a room can still recruit, retire, draw fate cards, train, tick, and earn quiz rewards

- **GIVEN** a player has at least one P1-rarity doctor AND every P1-rarity doctor has a non-null `assignedRoom`
- **WHEN** they trigger any caller of `buildAchievementStats()` — recruit (`attemptRoll`), retire (`retireDoctor`), fate card draw, training attempt, idle tick, or quiz reward
- **THEN** `buildAchievementStats()` SHALL resolve without throwing `Table rooms not part of transaction`, AND the caller's primary mutation (ticket consume + doctor insert / doctor delete + refund / fate card cost + reward / training success + rarity bump / revenue accrual / mastery + affinity increment) SHALL commit normally

#### Scenario: Adding a new Dexie read to buildAchievementStats requires updating the scope tuple

- **WHEN** a future change adds a new Dexie `await db.<table>.foo()` read inside `buildAchievementStats`'s callback
- **THEN** the contributor SHALL also extend the `'r'` transaction's scope tuple to include `db.<table>`, AND extend `QuizModal`'s outer `'rw'` scope (and any other outer-tx caller of `buildAchievementStats` that exists at that time) to include `db.<table>` so the sub-tx remains a subset of the parent
