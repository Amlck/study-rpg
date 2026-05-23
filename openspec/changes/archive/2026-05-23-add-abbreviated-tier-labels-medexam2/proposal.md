## Why

The four hospital tier names — `診所` / `區域醫院` / `醫學中心` / `國家級教學醫院` — render verbatim across the 二階 hospital UI (tier badge, upgrade prompts, V6 migration body, HelpMenu copy, leaderboard rows, milestone toasts). On mobile and inside narrow pixel-art frame cells (`HospitalScene` badge, `LeaderboardPage` table column), the longer two — 「醫學中心」(4 chars) and especially 「國家級教學醫院」(7 chars) — wrap awkwardly or get truncated. The owner wants a single shorter label that reads naturally on every surface: `診所 / 區域 / 醫中 / 大廟`.

A pure UI-display rename is preferred over renaming the canonical type strings because:
1. Existing Dexie `gameCounters.tier` rows on live saves carry literal `'區域醫院'` / `'醫學中心'` / `'國家級教學醫院'` values — renaming canonicals forces a write-side migration for every active user.
2. The R2 cloud-sync bundle schema (`m2-snapshot.json.gz`) and D1 `leaderboard_m2.hospital_tier` numeric clamp would both need version bumps.
3. The `HospitalTier` literal union appears in 20+ source sites, 12+ spec scenarios — coordinated rename risks subtle bugs across the dual-worktree (一階 / 二階) merge surface.

Display-only rename keeps canonical strings frozen and adds one mapping helper that all UI render sites delegate to.

## What Changes

- Add a new module `apps/medexam2-hospital-tw/src/lib/tier-labels.ts` exporting `TIER_DISPLAY_LABEL: Record<HospitalTier, string>` and a thin helper `tierLabel(tier: HospitalTier): string`.
- Replace every direct render of `counters.tier` (and hard-coded mentions like「升級至 區域醫院」) inside `apps/medexam2-hospital-tw/src/` with `tierLabel(...)` calls.
- Update HelpMenu tier-upgrade copy to use the abbreviated names throughout the explanation text.
- Update V6MigrationModal body copy that mentions 「區域醫院」 and 「國家級教學醫院」.
- Leave canonical type strings (`'診所'` / `'區域醫院'` / `'醫學中心'` / `'國家級教學醫院'`), Dexie schema, R2 bundle layout, D1 `hospital_tier` column, and the `HospitalTier` literal union **completely untouched**.
- No data migration. No spec rename across other capabilities.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `hospital-management-mode`: gains one new requirement covering UI display labels for hospital tiers. The capability's underlying tier semantics (3 named tiers + opt-in `國家級教學醫院` per `core/types.ts`) are unchanged.

## Impact

**Client (medexam2-hospital-tw)**
- New: `apps/medexam2-hospital-tw/src/lib/tier-labels.ts` (mapping + helper)
- Edited: `apps/medexam2-hospital-tw/src/pages/Hospital.tsx` (tier badge, upgrade unlock messages)
- Edited: `apps/medexam2-hospital-tw/src/pages/HomePage.tsx` (diversification panel tier label)
- Edited: `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx` (tier upgrade copy)
- Edited: `apps/medexam2-hospital-tw/src/components/V6MigrationModal.tsx` (body copy)
- Edited: `apps/medexam2-hospital-tw/src/components/MilestoneTipToast.tsx` (if any tier name appears in toast copy)
- Edited: `apps/medexam2-hospital-tw/src/components/UpgradeModal.tsx` (upgrade confirmation copy)
- Edited: `apps/medexam2-hospital-tw/src/components/LeaderboardPage.tsx` (tier column display — pulls label from helper)
- Edited: `apps/medexam2-hospital-tw/src/services/room-extension.ts` JSDoc only (canonical strings stay in code logic)

**Untouched**
- `packages/core/` — engine stays agnostic per CLAUDE.md curator rule
- Dexie schema version (no bump needed — no column rename)
- R2 bundle schema (`m2-snapshot.json.gz`) — values unchanged
- D1 `leaderboard_m2` schema — numeric clamp unchanged
- `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` `HOSPITAL_TIER_TO_NUM` mapping — canonical keys unchanged
- All other OpenSpec `specs/hospital-*` capability files (scenarios remain on canonical names)
- 一階 `apps/medexam-tw/` (unaffected — no hospital tiers there)

**No-op for**
- `add-r2-cloud-sync-migration` in-flight change (canonical strings unchanged)
- `add-hospital-leaderboard-correct-count-filter` in-flight change (display labels orthogonal to filter logic)
- `fix-medexam2-room-write-sync-race` in-flight change
- `add-achievement-system` in-flight change
