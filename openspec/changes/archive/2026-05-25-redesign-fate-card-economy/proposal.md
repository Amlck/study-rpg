## Why

The current fate-card costs (普通 1k / 稀有 10k / 史詩 100k / **傳奇 1M**) were locked by `redesign-hospital-economy` (2026-05-17), but were never reconciled against the quiz-economy anchor introduced by `add-quiz-economy-redesign` (2026-05-18) or the equipment multipliers from `add-hospital-equipment-medexam2` (2026-05-24). Against the documented "~5k 聲望/day, ~60-day game arc" target (per `clinic-tiers.ts` line 24 comment), the top two tiers land off-curve:

- **史詩 100k** ≈ 20 days of typical play = 1/3 of the entire game arc per draw, AND the pool contains one negative-value slot (1 週薪水免除 yields ~50–70k *revenue*, which is a different currency than the 100k *reputation* spent).
- **傳奇 1M** ≈ 200 days of typical play = **3.3× the total game arc reputation**. Mathematically only reachable post-clear, which contradicts fate-cards.ts file-header intent ("endgame reputation sink") — sinks should be drainable within the endgame, not beyond it.

Re-tune now (pre-broad-dogfood) so the first wave of telemetry reflects intended economy, not a known-broken baseline.

## What Changes

- Re-tune `FATE_CARD_COSTS` literals in `packages/content-medexam2-tw/src/fate-cards.ts` for 史詩 and 傳奇 tiers (普通 / 稀有 unchanged — they're on-curve).
- Clean negative-EV slot from 史詩 reward pool (`FATE_CARD_POOLS.epic`) — replace `salary-waiver-1-week` with a reputation-coherent reward.
- Optionally align 史詩 `FATE_CARD_BAD_LUCK_RATES` to 0% (parity with 傳奇) so neither top-tier pack has bad-luck slots — design.md picks final shape.
- Update `openspec/specs/hospital-fate-cards/spec.md` Requirement 1 cost table to match new literals (**MODIFIED**, breaks no other spec).
- Update help-menu strings + FateCardPage cost displays where the old numbers are hardcoded.
- **NOT BREAKING for save data**: in-flight `fateCardHistory` rows preserve their original `costPaid` value; new draws use new costs. No migration script needed.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `hospital-fate-cards`: Requirement 1 ("Four card-pack tiers SHALL be available with locked costs") — cost table literals updated for 史詩 and 傳奇; reward pool entry for 史詩 swapped; bad-luck rate for 史詩 possibly adjusted to 0% (see design.md for option selection).

## Impact

- **Code**: `packages/content-medexam2-tw/src/fate-cards.ts` (FATE_CARD_COSTS / FATE_CARD_POOLS / FATE_CARD_BAD_LUCK_RATES / FATE_CARD_BAD_LUCK_PENALTIES literals); `apps/medexam2-hospital-tw/src/pages/FateCardPage.tsx` and `components/HelpMenu.tsx` (display strings if any hardcoded — to be confirmed during apply).
- **Specs**: `openspec/specs/hospital-fate-cards/spec.md` Requirement 1 delta only.
- **Tests**: any unit tests asserting on the old literals (search will identify).
- **Save data**: no migration; existing `fateCardHistory` rows + `consecutiveBadLuckCount` counters keep their values, new draws use new economy.
- **Sync**: no schema change — `fateCardHistory` shape unchanged, R2 m2 bundle unaffected.
- **Telemetry**: future dogfood draws will reflect new economy; comparing pre/post is straightforward via `drawnAt` timestamp.
- **Out of scope for this change**: pity threshold (3 — design D6 locked), targeted-ticket reroll cap (5 — orthogonal), reputation earning curve itself (lives in `hospital-quiz` / `hospital-reputation` capabilities).
