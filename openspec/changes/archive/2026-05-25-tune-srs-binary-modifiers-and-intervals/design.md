## Context

Current SM-2 variant in `packages/core/src/lib/srs.ts` is shared by 一階 (`reviewCard(card, quality)`) and 二階 (`reviewCardBinary({correct})`) wrappers. Both paths derive quality from binary answer outcome:

| Outcome | 一階 quality | 二階 path | First interval after first correct |
|---|---|---|---|
| Correct | `4` (Good) | binary `correct: true` | **1 day** |
| Wrong | `2` (Lapse) | binary `correct: false` | 1 day (lapse reset) |

Constants in `srs.ts`: `STANDARD_INITIAL_INTERVALS = [1, 6]`, `EASE_FLOOR = 1.3`, `DEFAULT_EASE = 2.5`, `MAX_INTERVAL_DAYS = 365`, `SRS_DAILY_CAP = 20`, `WRONG_INTERVAL_MULTIPLIER = 0.5`, `WRONG_EASE_MULTIPLIER = 0.85`.

Recently shipped (2026-05-25) `add-bookmarks-filters-and-wrong-history-medexam2` adds the `everWrong` boolean to 二階 `questionHistory` with explicit「Once set, this flag is **never** unset」invariant + monotonic-OR cross-device merge. This change relaxes that invariant.

「歷史曾錯」tab in `/bookmarks?tab=wrong&sub=history` already provides proactive wrong-answer review surface, so the SRS due queue's job narrows to algorithmic spaced cadence only.

Grill summary at `~/.claude/scratch/grilled-SRS-binary-modifier-interval-tune-2026-05-25.md` documents the 7 facet decisions feeding this design.

## Goals / Non-Goals

**Goals:**
- Eliminate the「我答對為何又考」complaint by widening first interval from 1 day to 3 days.
- Give players opt-in agency via two action-bar buttons without forcing per-question self-rating.
- Keep cross-track parity: one core engine change, two apps ship simultaneously.
- Preserve published `@study-rpg/core@^0.2.0` API surface (no breaking export removal); add new exports as additive.
- Zero Dexie migration / zero R2 bundle schema_version bump.
- Provide DEV-only telemetry to detect ease-creep / button-misuse during dogfood.

**Non-Goals:**
- Full FSRS migration. Per the grill, FSRS has 17–19 per-card params requiring review-history fitting; ROI vs the 「opt-in modifier」 approach is low for our corpus scale.
- Per-question self-rating modal (Anki Easy/Good/Hard/Again 4-tier). Per the grill, time-of-evaluation conflicts with quick-fire quiz UX.
- Response-time-inferred quality. Requires new `elapsedMs` schema column; deferred unless dogfood metrics force the call.
- Player-configurable interval setting (e.g., short/medium/long preset). Adds complexity; defer until at least two distinct dogfood populations diverge in cadence preference.
- Surfacing buttons in answer-wrong state. By design, both buttons are correct-state-only (per Facet 4 + Facet 6).

## Decisions

### Decision 1 — First-interval values `[3, 7]` (not `[6, 14]`, not `[2, 7]`, not player-configurable)

**Choice**: Change `STANDARD_INITIAL_INTERVALS = [1, 6]` to `[3, 7]`.

**Why**: Aligns with FSRS-4/5 default stability ≈ 3 days. `[6, 14]` (close to Anki default) was rejected as too aggressive for an under-tested cadence — risk of「答對後好久才回頭」memory leak. `[2, 7]` was rejected as marginally bolder than current; not worth a change. Player-configurable rejected as premature complexity (open-questions catalog deferred unless dogfood splits players).

**Alternatives considered**: `[6, 14]` (Anki-like), `[2, 7]` (conservative), `[1, 3]` (status quo + nudge only second interval), player-configurable preset.

### Decision 2 — 「太簡單」 math: `ease *= 1.5`, `interval *= 3` (multiplicative, no graduation cap)

**Choice**: Both multipliers apply to current state, clamped only by `MAX_INTERVAL_DAYS = 365`. No fixed-day graduation gate (e.g.,「推到 90 天」).

**Why**: Multiplicative preserves the SRS feedback loop — player still sees the question eventually, just less often. Connectivity to SRS graph is intact; reversible if player surprises themselves. Fixed-day graduation creates a one-way door (player can't easily walk it back; no SRS signal generated again until the cap hits). Convergence behavior: 3 consecutive 「太簡單」 clicks push interval ~7 → 21 → 63 → 189 → 365 (clamped). Ease meanwhile: 2.5 → 3.75 → 5.625 → 8.4 → ... (unbounded — see Open Question 1).

**Alternatives considered**:
- Graduation to fixed 90 days (rejected: one-way door + dead-cell complexity).
- `ease += 0.5, interval *= 2` (rejected: smaller per-click effect, requires more clicks to escape — conflicts with the「one-click and forget」UX intent).
- Decay multiplier (×3, ×2, ×1.5 — capped at 3 applications) (rejected: complex bookkeeping; the cap on `interval` already collars runaway behavior). Defer to dogfood evidence.

### Decision 3 — 「我亂猜的」 math: `interval = 1`, ease unchanged, no lapse counter bump

**Choice**: Force `interval = 1` (明天再考). Do not modify `ease`. Do not increment `lapses`.

**Why**: The signal「I got it right but not because I knew it」 is weaker than 「I got it wrong」. Bumping `lapses` would double-count as both a correct-answer reward path AND a SRS penalty path — incoherent. Bumping `ease` down would impose a permanent learning curve penalty for a momentary admission. Resetting only `interval` cleanly schedules verification without permanent state contamination.

**Alternatives considered**:
- `interval = 1, ease -= 0.1` (rejected: long-term ease creep down on honest players is unfair).
- `interval = 0, surface immediately in same session` (rejected: breaks the read-mode quiz flow; pool-exhaustion / round-robin semantics become messy).
- `interval = 3` (rejected: defeats the「明天驗證」 intent; if you have to wait 3 days, you'll forget you flagged it).

### Decision 4 — 「太簡單」 in 二階 also sets `everWrong = false`; 一階 has no `everWrong` column (no-op for 一階)

**Choice**: 「太簡單」 in `apps/medexam2-hospital-tw` invokes `recordEverWrongFalse(questionId)` (new helper in `packages/core/src/lib/mastery.ts` or `apps/medexam2-hospital-tw/src/services/mastery.ts` — Apply phase chooses). 一階 has no `everWrong` column on its `srs` table; the button is purely an SRS modifier there.

**Why**: 「太簡單」 semantic is「player explicitly graduates this question」. Leaving the row in 「歷史曾錯」 contradicts that intent. The grill explicitly accepts the risk that an accidental click silently removes from 「歷史曾錯」 — mitigated by Open Question 2 (grace-toast undo).

**Cross-device sync impact (二階 only)**: The current monotonic-OR merge for `everWrong` blocks any `true → false` transition from one device to propagate to another. This change replaces the merge with last-explicit-write-wins: the field carries its own `updated_at` for LWW, OR we rely on the row-level LWW (`questionHistory.lastAnsweredAt`) — Apply phase picks one (the latter is simpler if 「太簡單」 always updates `lastAnsweredAt` too; the former is more precise but adds a column).

### Decision 5 — Buttons in QuizModal action bar (same row as 🐞 + 下一題), correct-state-only

**Choice**: Both buttons render after answer reveal, in the action bar, only when the resolved answer is correct. Wrong-state: only 🐞 bug-report + 下一題 visible (current behavior). Correct-state: 🐞 + ✨ 「太簡單」 + 🤔 「我亂猜的」 + 下一題.

**Why**: Action bar is the player's natural eye-gaze terminal location post-answer (where 下一題 lives). Putting opt-in modifiers next to the「proceed」action makes them discoverable without forcing a separate UI gesture. Correct-state-only avoids the trap where wrong-state would let players bump ease by claiming「太簡單」on questions they failed — semantically incoherent.

**Inline ★ to manual bookmarks is in explanation region, NOT action bar** — separation of concerns: ★ writes `bookmarks` table; new buttons write `srs` / `srsCard` table. Different operands, different mental model.

### Decision 6 — DEV-only telemetry via `globalThis.__srs`

**Choice**: Expose `globalThis.__srs?.getStats()` returning aggregated stats, computed at call-time from existing Dexie tables. Mirrors the existing `globalThis.__sync` / `globalThis.__db` pattern. Stripped from prod via `import.meta.env.DEV`.

**Why**: Zero schema cost. Owner can `__srs.getStats()` in DevTools console mid-dogfood to validate ease distribution, button-click rates, and queue-size trajectory. If signals warrant (e.g., ease distribution rightward skew > 5% of cards), Apply-time follow-up change can upgrade to a persistent metric table.

**Metrics surfaced** (computed lazily on call):
- `dailyDueQueueSize`: rolling 7-day average of `db.srs.where('dueAt').belowOrEqual(now).count()` snapshots — bootstrapped from a per-call computation since we don't persist history (acceptable approximation: take current snapshot only, label「current」).
- `easyButtonClicks` / `guessedButtonClicks`: in-memory counters in the modal component, reset on app reload (acceptable for DEV-only smoke).
- `totalCorrectAnswers`: derived from `gameCounters` (existing).
- `avgEase` / `easeHistogram`: aggregate over `db.srs.toArray()` (一階) and equivalent 二階 source.
- `graduatedCount`: count of cards with `interval > 30`.

### Decision 7 — Cross-track simultaneous ship (no two-phase dogfood)

**Choice**: Both apps in same release commit; engine change in `packages/core/src/lib/srs.ts` propagates atomically.

**Why**: Per grill Facet 1, the engine API is the published contract; staging changes between apps breaks the「same engine, two themes」 fork story (M3 already published `@study-rpg/core@^0.2.0`). Blast radius is acceptable because the change is purely additive at the engine level (new `reviewCardEasy` / `reviewCardGuessed` exports) plus a single constant edit (`STANDARD_INITIAL_INTERVALS`).

## Risks / Trade-offs

- **[Ease creep with repeated 「太簡單」]** → No `ease` cap means a player who hammers the easy button can drive `ease` to absurd values (e.g., 10.0 after 5 clicks). Behaviorally harmless because `interval` is capped at 365, but `getStats().avgEase` becomes misleading. **Mitigation**: telemetry watches ease distribution; if dogfood shows runaway, follow-up change adds `EASE_CEILING = 5.0`. (Open Question 1.)

- **[Accidental 「太簡單」 click silently removes from 「歷史曾錯」 (二階)]** → No undo. **Mitigation**: deferred to Open Question 2 — apply-phase decision whether to add a 10-second grace toast (仿照 wrong→correct grace toast pattern already shipped) or a confirmation modal.

- **[mentor-daily (一階) might share `reviewCard` path]** → If 一階 mentor daily uses the same engine helper, the buttons would need to also surface on the mentor screen. **Mitigation**: Apply-phase audit at `apps/medexam-tw/src/services/mentor-daily.ts` decides. If yes, mentor UI extends; if no, no action. (Open Question 3.)

- **[Reward dispatch coupling]** → `quiz-rewards.ts` and SRS write path are presumed independent. If 「我亂猜的」 somehow triggers reward suppression, that breaks the proposal's promise. **Mitigation**: Apply-phase grep + manual test verifies separation at `apps/medexam-tw/src/App.tsx:540`. (Open Question 4.)

- **[Cross-device `everWrong = false` propagation]** → Last-explicit-write-wins requires either (a) row-level LWW (relies on `lastAnsweredAt` also updating on 「太簡單」 — adds a write coupling), or (b) per-field LWW (adds `everWrongUpdatedAt` column — Dexie migration). **Mitigation**: choose (a) for simplicity unless it breaks Achievement / Leaderboard `lastAnsweredAt` semantics elsewhere — Apply-phase audit. (Open Question 5.)

- **[Players who liked daily review of correct answers]** → Some players may feel cheated that questions they answered correctly take 3 days to re-surface. **Mitigation**: 「歷史曾錯」 tab + 手動收藏 tab + manual review-mode quiz button (existing) all give the player ways to summon any question. Document this in CHANGELOG / dogfood communication.

## Migration Plan

1. **Engine change** (`packages/core/src/lib/srs.ts`): change `STANDARD_INITIAL_INTERVALS` constant; add `reviewCardEasy(card, now?)` and `reviewCardGuessed(card, now?)` exports. Bump `@study-rpg/core` minor version (additive API). No breaking changes.
2. **二階 mastery helper** (`apps/medexam2-hospital-tw/src/services/mastery.ts`): new `recordEverWrongFalse(questionId)` to support 「太簡單」 side effect.
3. **UI** (both apps' `QuizModal.tsx`): action bar buttons gated on `answerStatus === 'correct'`.
4. **R2 m2 bundle adapter** (`apps/medexam2-hospital-tw/src/lib/sync/r2/`): replace monotonic-OR merge for `everWrong` with last-explicit-write-wins (Decision 4 + Open Question 5).
5. **Telemetry** (both apps): `globalThis.__srs.getStats()` DEV-only.
6. **Spec deltas** (5 capabilities — see `specs/`).
7. **Verify**: Chrome MCP three-event smoke (in-app nav + direct URL + F5 reload) on both apps; manual verify: click 「太簡單」 3 times on a fresh question → interval推到 ~63 days; click 「我亂猜的」 on a question → next day verify it's due; cross-device sync verify (sign in on a second profile, set 「太簡單」 → 「歷史曾錯」 entry removed on first device after pull).
8. **Rollback**: Revert engine constant + revert UI buttons + restore monotonic-OR merge. All saves remain compatible (no schema delta). No data loss.

## Open Questions

1. **Ease cap (Decision 2 follow-up)**: Add `EASE_CEILING = 5.0` (or similar) to prevent runaway ease growth? Defer to Apply phase + dogfood telemetry.

2. **「太簡單」 undo grace toast (Decision 4 follow-up)**: Should accidental click open a 10-second「↩ 還原」toast (仿照已 ship 的 wrong→correct grace toast pattern) instead of being silent? Apply-phase decision based on whether the action-bar location reduces accidental-click risk enough.

3. **mentor-daily integration**: Does `apps/medexam-tw/src/services/mentor-daily.ts` use the shared `reviewCard` path? If yes, mentor screen needs the same buttons. If not, leave mentor surface untouched. Apply-phase audit (read mentor-daily.ts + trace `reviewCard` callers).

4. **Reward dispatch separation**: Confirm `quiz-rewards.ts` and SRS write paths at `apps/medexam-tw/src/App.tsx:540` (and equivalent 二階 site) are independent. Apply-phase audit + trace.

5. **`everWrong = false` cross-device merge mechanism**: (a) row-level LWW via `lastAnsweredAt`, or (b) per-field LWW via new `everWrongUpdatedAt` column? Pick (a) unless it conflicts with Achievement / Leaderboard `lastAnsweredAt` semantics. Apply-phase audit.
