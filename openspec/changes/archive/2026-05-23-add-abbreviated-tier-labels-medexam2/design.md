## Context

`HospitalTier` is the literal union `'診所' | '區域醫院' | '醫學中心' | '國家級教學醫院'` exported from `packages/core/src/types.ts`. The 二階 app stores the player's current tier as `gameCounters.tier: HospitalTier` in Dexie. Every UI surface that shows a tier today does `{counters.tier}` or hard-codes the full name in copy.

The owner reports the longer canonical names (especially 「國家級教學醫院」 7 chars) wrap awkwardly inside pixel-art frame cells on mobile. They want the displayed name shortened to `診所 / 區域 / 醫中 / 大廟` while keeping all other behavior identical.

## Goals / Non-Goals

**Goals:**
- Provide a single `tierLabel()` helper that every UI render site calls.
- Map each canonical tier to an abbreviated 1–2 char display label.
- Leave Dexie / R2 / D1 / spec scenarios / `HospitalTier` union untouched.
- Cover every UI surface that currently renders a tier name (8 known sites + LeaderboardPage tier column).

**Non-Goals:**
- Renaming canonical type strings (would force save migration + R2 bundle version bump + cross-capability spec rewrite — explicitly out of scope per owner decision 2026-05-23).
- Internationalization framework for tier labels (only zh-TW supported; if future themes need different labels, the helper can be parameterized then — not now).
- Changing the abbreviated labels post-ship without a follow-up change (the labels are normative once shipped — users will memorize 「大廟」 = 國家級).
- Touching 一階 (`apps/medexam-tw/`) — no hospital tier concept there.

## Decisions

### D1: Abbreviated label mapping (locked)

| Canonical (`HospitalTier`) | Abbreviated UI label | Rationale |
|---|---|---|
| `'診所'` | `診所` | Already 2 chars, no change. Keeps onboarding mental model. |
| `'區域醫院'` | `區域` | Drop the「醫院」suffix — context already implies hospital. |
| `'醫學中心'` | `醫中` | Common 台灣 colloquial abbreviation. |
| `'國家級教學醫院'` | `大廟` | 台灣醫療圈黑話 — 大型教學醫院的暱稱（「三大廟」= 台大 / 北榮 / 林口長庚）。Owner-selected; not literal but culturally recognizable. |

These labels are normative — they become part of the player-facing terminology. Internal logs, spec scenarios, code identifiers continue to use canonical strings.

### D2: Helper lives in app layer, not packages/core

The mapping lives in `apps/medexam2-hospital-tw/src/lib/tier-labels.ts`, not in `packages/core/`. Reasoning:
- Core stays content-agnostic per CLAUDE.md curator rule ("medical terms belong in theme / content packs, never in core").
- Different theme/content packs (future TOEFL fork, 律師考 fork) wouldn't reuse hospital tier labels.
- Helper signature accepts `HospitalTier` (typed from core) but the mapping is hospital-app-specific.

If a future hospital-mode theme pack wants different labels (e.g., 英文版), the helper can be moved to `packages/theme-pixel-hospital/` with a theme-injected override — but that is YAGNI for now.

### D3: No fallback for unknown tier values

The helper is typed as `tierLabel(tier: HospitalTier): string` — TypeScript prevents passing anything outside the union at compile time. Runtime defensive `default → '?'` is omitted because:
- `HospitalTier` is a strict literal union — invalid values would already fail at the Dexie write site, never reach UI.
- Adding a runtime fallback masks bugs (per `coding_principles.md` §5: no silent errors).

### D4: No staged rollout / feature flag

The label change is purely cosmetic — zero risk to save data, sync, leaderboard, or upgrade logic. Ship in a single commit with `pnpm typecheck` + Chrome MCP smoke. No A/B, no remote config. If owner dislikes the labels post-ship, a follow-up change tweaks the mapping.

### D5: HelpMenu copy uses both names for first introduction

The HelpMenu tier-upgrade explanation (currently `「診所→區域醫院」「區域→醫學中心」「醫學中心→國家級」`) will use the new short labels but include the full canonical name in parentheses on first mention so existing players who saw the long names don't lose context:

```
診所 → 區域（區域醫院）：30k 聲望 + 5 不同科別；
區域 → 醫中（醫學中心）：300k + 8 P3+ 不同科別；
醫中 → 大廟（國家級教學醫院）：3M + 10 P2+ 不同科別含 1 P1。
```

Other surfaces (tier badge, upgrade modal, leaderboard) use the short label only — no parenthetical disambiguation needed because those surfaces are recurring (player sees them every session).

## Risks / Trade-offs

[Risk] Player memorizes long name from prior gameplay and confuses 「大廟」 reference in new UI.
→ Mitigation: D5 HelpMenu disambiguation on first encounter; V6MigrationModal body copy updated to mention "tier 名稱顯示改成簡稱（區域 / 醫中 / 大廟），實際資料未變動".

[Risk] Translation / accessibility tooling that reads `aria-label` picks up 「大廟」 and confuses screen readers (or non-native readers).
→ Mitigation: For accessibility-critical surfaces, use `aria-label="醫院等級：${canonicalName}"` (full canonical) while displaying `{tierLabel(tier)}` in visible text. Out of scope for this change unless owner flags it; defer to a follow-up `improve-tier-label-a11y` if needed.

[Risk] Future content pack (e.g., 英文版 hospital theme) wants different abbreviations.
→ Mitigation: Helper signature already accepts `HospitalTier` — moving to theme injection later is a 30-line refactor. Not blocking.

[Risk] Spec scenarios across `hospital-management-mode` / `hospital-leaderboard` / `clinic-level-up` etc. still mention canonical names. Reading specs and the app together creates cognitive friction.
→ Mitigation: Specs are normative on canonical strings; UI is presentation. This is intentional separation. The new requirement makes the rule explicit.

## Migration Plan

No data migration. Steps:
1. Write `apps/medexam2-hospital-tw/src/lib/tier-labels.ts`.
2. Replace UI render sites listed in proposal (Impact section).
3. Typecheck + Chrome MCP smoke (open hospital, recruit a doctor, click leaderboard, verify tier badge text + HelpMenu copy + LeaderboardPage tier column all show the short labels).
4. Ship.

**Rollback**: revert the commit. Zero data impact.

## Open Questions

- Q: Should the LeaderboardPage table tier column show 「大廟」 alongside the existing rank? Resolved — yes, per Impact section.
- Q: Should the abbreviated labels carry a tooltip on hover that reveals the canonical name?
  - Tentatively no — adds DOM overhead per row in the leaderboard table; player can read full names in HelpMenu / V6 modal. **Confirm with owner.**
