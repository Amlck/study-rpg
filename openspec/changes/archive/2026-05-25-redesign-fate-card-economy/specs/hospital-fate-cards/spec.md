## MODIFIED Requirements

### Requirement: Four card-pack tiers SHALL be available with locked costs

The system SHALL provide exactly 4 card-pack tiers with locked reputation costs and content pools:

| Pack | Reputation cost | Content pool | Bad-luck rate |
|---|---|---|---|
| 普通命運（白） | 1,000 | recruitment ticket ×3 / minor revenue / event-immunity card | 5% (penalty: `-1,000 rep`) |
| 稀有命運（藍） | 10,000 | recruitment ticket ×10 / training guarantee voucher ×1 / event-positive trigger | 5% (penalty: `-10,000 rep`) |
| 史詩命運（紫） | **50,000** | targeted P3+ recruitment ticket / facility +0.5 permanent / **targeted P3+ recruitment ticket ×2** | **0%** |
| 傳奇命運（金） | **300,000** | targeted P2 recruitment ticket / all-room facility +1 / 1-week throughput ×2 | 0% |

The costs SHALL be recorded as literals in `packages/content-medexam2-tw/src/fate-cards.ts`. Insufficient-reputation attempts SHALL be blocked client-side BEFORE the draw.

Rationale (per `redesign-fate-card-economy` design.md Decision 1, Option C):
- 史詩 cost dropped 100k → 50k (≈ 10 days at typical 5k rep/day play = ~17% of 60-day game arc), making mid-late game draws reachable.
- 傳奇 cost dropped 1M → 300k to match the `TIER_UPGRADE_THRESHOLDS.醫學中心 = 300_000` rep threshold, creating a "tier-up tribute" loop where crossing T3→T4 also funds one 傳奇 draw.
- 史詩 pool drops the `salary-waiver-1-week` slot (negative-EV: pays in revenue, not the reputation spent) and adds a second `targeted-p3-ticket` reward (now ×2 multiplier) to accelerate T2→T3 / T3→T4 diversification gates.
- 史詩 bad-luck rate 5% → 0% so both top-tier packs (史詩, 傳奇) are pure-positive draws. 普通 / 稀有 keep 5% bad luck to preserve the low-cost lottery feel at the bottom.

#### Scenario: Common pack draw deducts reputation

- **GIVEN** `reputation = 5,000` and player initiates a 普通命運 draw
- **WHEN** the draw completes
- **THEN** `reputation` SHALL equal `4,000` (1,000 deducted regardless of result)
- **AND** a row SHALL appear in `fateCardHistory`

#### Scenario: Insufficient reputation blocks draw

- **GIVEN** `reputation = 5,000` and player attempts a 稀有命運 draw (cost 10,000)
- **WHEN** the draw button is pressed
- **THEN** no reputation deduction SHALL occur
- **AND** the UI SHALL display an insufficient-reputation error

#### Scenario: Epic pack draw deducts 50,000 reputation

- **GIVEN** `reputation = 80,000` and player initiates a 史詩命運 draw
- **WHEN** the draw completes
- **THEN** `reputation` SHALL equal `30,000` (50,000 deducted regardless of result)
- **AND** a row SHALL appear in `fateCardHistory` with `costPaid = 50,000`

#### Scenario: Epic pack never produces bad-luck result

- **GIVEN** any number of 史詩命運 draws performed
- **WHEN** each draw resolves
- **THEN** no `fateCardHistory` row SHALL have `resultType = 'badLuck'` for a `packTier = 'epic'` row drawn under the current economy
- **AND** the per-tier `consecutiveBadLuckCount` for `epic` SHALL never increment

#### Scenario: Legendary pack draw deducts 300,000 reputation

- **GIVEN** `reputation = 320,000` and player initiates a 傳奇命運 draw
- **WHEN** the draw completes
- **THEN** `reputation` SHALL equal `20,000` (300,000 deducted regardless of result)
- **AND** a row SHALL appear in `fateCardHistory` with `costPaid = 300,000`

#### Scenario: Epic pool no longer includes salary-waiver

- **GIVEN** the `FATE_CARD_POOLS.epic` content pool
- **WHEN** the system enumerates pool entries
- **THEN** no entry SHALL have `key = 'salary-waiver-1-week'`
- **AND** the pool SHALL contain a reward whose effect grants two targeted P3+ recruitment tickets per draw (replacing the removed salary-waiver slot)
