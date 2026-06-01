## Context

### Current state (as locked by `redesign-hospital-economy` 2026-05-17)

| Pack | Cost (rep) | Bad-luck | Penalty (rep) | Pool |
|---|---|---|---|---|
| 普通 | 1,000 | 5% | −1,000 | 招募券 ×3 / 營收 +5,000 / 事件免疫卡 ×1 |
| 稀有 | 10,000 | 5% | −10,000 | 招募券 ×10 / 進修保證券 ×1 / 事件正向觸發券 ×1 |
| 史詩 | 100,000 | 5% | −50,000 | 指定科 P3+ 招募券 / 隨機 facility +0.5 永久 / **1 週薪水免除** |
| 傳奇 | 1,000,000 | 0% | 0 | 指定科 P2 招募券 / 全院 facility +1 永久 / 1 週 throughput ×2 |

### Reputation earning anchors (post-quiz-economy / post-equipment)

| Path | Rate |
|---|---|
| Quiz (國家級 / P2 同科 / 1 件 L3 設備) | 80 × 2.0 × 1.3 × 1.07 ≈ **222 rep/正確題** |
| Idle tick (only during reading session) | `throughput × 1.5 reading-buff × equipment-mult` ≈ **420–630 rep/min** at 國家級 full roster |
| Project.md anchor | "typical play ~5k rep/day, ~60-day arc" → **arc total ≈ 300k rep** |

### Cost-vs-arc misalignment

| Pack | Days @ 5k/day | % of full arc (300k) | Verdict |
|---|---|---|---|
| 普通 1k | 0.2 | 0.3% | ✓ on-curve |
| 稀有 10k | 2 | 3.3% | ✓ on-curve |
| 史詩 100k | 20 | **33%** | ✗ heavy — one draw per fifth of the game |
| 傳奇 1M | 200 | **333%** | ✗ unreachable — > full arc reputation |

The 史詩 pool also contains `salary-waiver-1-week` which pays out in *revenue* (~50–70k), not the *reputation* spent — currency mismatch makes it a strict negative-EV slot for players who entered the draw for reputation-coherent rewards.

## Goals / Non-Goals

**Goals:**
- Bring 史詩 and 傳奇 costs onto the 60-day game arc curve so an engaged endgame player can complete 1–2 traversals of each tier within the arc.
- Remove the negative-EV `salary-waiver-1-week` slot from 史詩 pool.
- Preserve 傳奇 pool exactly as locked (already top-tier rewards: gate-breaking P2 ticket / permanent +1 facility / 1-week throughput ×2).
- Preserve all 普通 / 稀有 economy (on-curve already).
- Keep `fateCardHistory` schema unchanged — no migration; just literal updates.

**Non-Goals:**
- Pity threshold (3) — locked by design D6 of `redesign-hospital-economy`, working as intended.
- Targeted-ticket reroll cap (5) — orthogonal mechanic, not touched here.
- Reputation earning curve itself — that's `hospital-quiz` / `hospital-reputation` / `hospital-equipment` territory.
- IAP / monetization paths — hard product principle, never on the table.
- Retroactive refund for players who already spent at old costs — fate cards are consumables, draws are final.

## Decisions

### Decision 1: Three rebalance options on the table

Each option is a self-contained re-tune that fixes the math without breaking the spec contract. Quantified below; recommendation follows.

#### Option A — Cost rebalance only (preserve pools)

| Pack | Old cost | **New cost** | Days @ 5k/day | % of arc |
|---|---|---|---|---|
| 史詩 | 100,000 | **30,000** | 6 | 10% |
| 傳奇 | 1,000,000 | **200,000** | 40 | 67% |

Pros: minimal surface-area change (1 file, 2 literals). No pool churn, no UX text changes beyond cost displays. 傳奇 200k = 67% of arc, so a focused endgame player can hit it once or twice naturally.

Cons: `salary-waiver-1-week` slot still pollutes 史詩 pool. 5% bad-luck × -50k penalty on 史詩 (now 30k cost) means a single bad-luck draw burns 80k = **2.7× the new draw cost** — proportionally worse than before.

#### Option B — Pool fix only (preserve costs)

| Pack | Cost | **Pool change** |
|---|---|---|
| 史詩 | 100,000 (unchanged) | drop `salary-waiver-1-week` → add `targeted-p3-ticket-x2` (or `training-guarantee-x3`) |
| 傳奇 | 1,000,000 (unchanged) | extend `throughput-x2-1-week` → `throughput-x2-2-weeks` (rename `key` so old history doesn't ambiguate) |

Pros: keeps the "high-cost prestige" framing of top tiers. Pool quality goes up.

Cons: **does not fix the headline cost misalignment**. 傳奇 still costs > full arc rep; player still functionally can't draw it pre-clear. This is a cosmetic patch.

#### Option C — Combined (recommended)

| Pack | Old cost | **New cost** | Bad-luck | **Pool change** |
|---|---|---|---|---|
| 史詩 | 100,000 | **50,000** | 5% → **0%** | drop `salary-waiver-1-week` → add `targeted-p3-ticket-x2` |
| 傳奇 | 1,000,000 | **300,000** | 0% (unchanged) | unchanged (already optimal) |

Anchoring:
- 史詩 50k = 10 days @ 5k/day = 17% of arc → 4–6 draws across a full arc is reachable
- 傳奇 300k = 60 days @ 5k/day = exactly 100% of arc, AND **matches the 醫學中心→國家級 reputation threshold** (`TIER_UPGRADE_THRESHOLDS.醫學中心 = 300_000`). This makes 傳奇 a literal "tier-up tribute" — the moment you cross the T3→T4 gate, you've also banked one 傳奇 draw, which can hand you the P2 doctor that satisfied the diversification gate to begin with. Strong narrative + mechanical loop.
- 史詩 bad-luck 0% = parity with 傳奇 (both top-tier packs are pure-positive), keeps player sentiment on the "high-cost feels good" side. 普通 / 稀有 keep their 5% bad luck to preserve the "low-cost lottery feel" at the bottom.

Pros: fixes both math (cost) and quality (pool slot) in one pass. Reframes 傳奇 from "unreachable collector item" to "endgame milestone reward". Bad-luck removal at 史詩 keeps reward expectation positive at high spend.

Cons: largest surface area — 4 literal changes in fate-cards.ts + 1 spec table edit. UI text changes in help-menu need cross-check.

### Decision 2: Recommendation = **Option C** unless user picks otherwise

Option C aligns three things at once (cost / pool / bad-luck), and the 傳奇 300k = T3→T4 threshold coincidence is too on-the-nose to ignore — it creates a designed feedback loop (cross gate → draw 傳奇 → get P2 → easier to maintain gate).

**Gate**: user confirms A / B / C before specs delta is written. Spec deltas embed literal numbers, so we can't write the spec until the option is locked.

### Decision 3: No save-data migration

Fate-card draws are point-in-time consumables. `fateCardHistory.costPaid` records the cost at the moment of the draw, so old draws retain their historical cost. `consecutiveBadLuckCount` per-tier counter resets are also unaffected — pity threshold (3) unchanged. New draws use new literals; no backfill, no data surgery.

### Decision 4: Reward `key` strings unchanged where pool entry survives

Per Option B/C rename clause: if a reward entry is *modified* (e.g., 1-week → 2-week throughput), bump the `key` so historical analytics distinguish old vs. new payouts. For Option C as currently drafted, only `salary-waiver-1-week` is being *removed* (replaced by `targeted-p3-ticket-x2` which is a new key entirely), and 傳奇 pool is untouched — so no `key` ambiguity arises.

## Risks / Trade-offs

- **Player who already banked 1M+ rep for 傳奇 under old economy gets a 70% discount.** → Acceptable. Pre-broad-dogfood, < 5 known testers, all are owner+close circle. Not a perceived-unfairness risk at this stage.

- **Hardcoded cost strings in UI may drift.** → Mitigation: tasks.md includes a grep sweep for `100,000` / `1,000,000` / `100k` / `1M` in `apps/medexam2-hospital-tw/src/` to confirm all displays read from the constants, not literal strings.

- **`salary-waiver-1-week` removal could surprise testers who hit it as a positive surprise.** → Acceptable. The slot was negative-EV by economy math; removing it improves player experience even if a few testers remember it fondly. No code references the key elsewhere (the dispatcher in `services/fate-card.ts` will need the case branch trimmed or the entry replaced — `targeted-p3-ticket-x2` will reuse the existing `targeted-p3-ticket` dispatcher path with a ×2 multiplier).

- **Telemetry-before-tune temptation.** Owner asked "tune now vs dogfood-2-weeks-then-tune" — picked tune-now because current cost is mathematically broken (1M > arc total), so dogfood data would just show "no one drew 傳奇" which we already know. Tuning now + collecting fresh telemetry against a sound baseline is more informative than tuning against a known-bad one.

- **Sync collision with `add-hospital-equipment-medexam2` §9** (R2 sync passenger pattern). → No conflict: equipment §9 changes m2 bundle schema_version 1→2 and adds `hospitalEquipment` array. Fate cards' `fateCardHistory` table is unchanged here. Independent.

## Migration Plan

1. **Land literals + spec delta** (this change) → ship to dogfood as part of next deploy.
2. **No data migration** — old `fateCardHistory` rows preserved as-is.
3. **No rollback plan needed** — literals can be re-tuned in a future change without breaking anything (precedent: `redesign-hospital-economy` itself was a rebalance of an earlier baseline).
4. **Dogfood signal to watch**: ratio of (史詩 + 傳奇 draws) / (普通 + 稀有 draws) — pre-change this is ~0 (cost barrier), post-change target is ~10–20% (meaningful top-tier engagement without trivializing them).

## Open Questions

- **Q1**: User confirms A / B / C? (Recommendation: C — see Decision 2.)
- **Q2**: For Option C 史詩 replacement reward, prefer `targeted-p3-ticket-x2` (2 specific-subject P3+ tickets) or `training-guarantee-x3` (3 training guarantee vouchers)? Both are reputation-coherent — first one accelerates roster diversification, second one accelerates roster power. **Default: `targeted-p3-ticket-x2`** because it directly aids the T2→T3 / T3→T4 diversification gates which are the bottleneck. User can override.
