## 1. Helper module

- [x] 1.1 Create `apps/medexam2-hospital-tw/src/lib/tier-labels.ts` exporting `TIER_DISPLAY_LABEL: Record<HospitalTier, string>` (mapping per design D1) and `tierLabel(tier: HospitalTier): string` (thin lookup).
- [x] 1.2 Add unit-equivalent inline assertion (or jsdoc) confirming every `HospitalTier` literal has a label (TypeScript exhaustive check via `satisfies Record<HospitalTier, string>`).

## 2. UI render-site replacement

- [x] 2.1 `apps/medexam2-hospital-tw/src/pages/Hospital.tsx:57` — replace `{counters?.tier ?? '診所'}` with `{tierLabel(counters?.tier ?? '診所')}`.
- [x] 2.2 `apps/medexam2-hospital-tw/src/pages/Hospital.tsx:100, 111, 158` — replace hard-coded `「區域醫院」` with `tierLabel('區域醫院')` in upgrade unlock copy.
- [x] 2.3 `apps/medexam2-hospital-tw/src/pages/HomePage.tsx:190` — wrap the diversification panel tier display (if present) with `tierLabel()`. **Note**: line 197 (tier badge) + line 205 (next-tier badge) both wrapped; line 191 (`tier === '國家級教學醫院'`) intentionally left as canonical comparison (code logic, not UI render).
- [x] 2.4 `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx:36-41` — rewrite the tier-upgrade body copy to use short labels with parenthetical canonical on first mention per design D5. Final copy structure verified in dev: `診所（診所）→ 區域（區域醫院）：30k 聲望 + 5 不同科別；區域 → 醫中（醫學中心）：80k...；醫中 → 大廟（國家級教學醫院）：150k...` ✓
- [x] 2.5 `apps/medexam2-hospital-tw/src/components/V6MigrationModal.tsx:66, 80-81` — replace `「區域醫院」` / `「國家級教學醫院」` in body copy with short labels; **note line added** at end of modal body: `「顯示說明：tier 名稱改為簡稱（${tierLabel('區域醫院')} / ${tierLabel('醫學中心')} / ${tierLabel('國家級教學醫院')}），實際資料未變動」`.
- [x] 2.6 `apps/medexam2-hospital-tw/src/components/UpgradeModal.tsx` — replace tier-name renders with `tierLabel()` calls. Lines edited: 45 (current tier badge), 53 (next tier badge).
- [x] 2.7 `apps/medexam2-hospital-tw/src/components/MilestoneTipToast.tsx` — **audit found no tier-name occurrences in this file**; no edit needed (vacuously complete).
- [x] 2.8 `apps/medexam2-hospital-tw/src/components/LeaderboardPage.tsx` — **N/A for this change**: LeaderboardPage does not yet render a tier column. The tier column is being added by the sibling change `add-hospital-leaderboard-correct-count-filter`, which has not yet been applied. When that change ships, its tasks SHALL ensure the new tier column uses `tierLabel()`. Scope of THIS change is unaffected.
- [x] 2.9 Grep verification: `rg "區域醫院|醫學中心|國家級教學醫院" apps/medexam2-hospital-tw/src/ --type tsx --type ts -l` — remaining hits are all code-internal (HOSPITAL_TIER_TO_NUM-like mappings, type literal union, conditional comparisons in `tick.ts` / `HospitalScene.tsx` TIER_TO_KEY mapping, code comments). Zero user-facing string literal hits remain. Also fixed `packages/content-medexam2-tw/src/tutorial.ts:124` (tutorial body copy) discovered during Chrome MCP smoke — changed `區域醫院` → `區域` (short form, no canonical disambiguation needed for brief tutorial tips).

## 3. Verify

- [x] 3.1 Typecheck: `pnpm -r typecheck` — passes for all 6 packages (content-medexam-tw / content-medexam2-tw / theme-pixel-medical / theme-pixel-hospital / medexam-tw / medexam2-hospital-tw).
- [x] 3.2 Dev server: `pnpm --filter @study-rpg/medexam2-hospital-tw dev` started on `http://localhost:5174/study-rpg/hospital/` (port 5173 occupied by other dev server).
- [x] 3.3 Chrome MCP smoke verified 2026-05-23:
  - HomePage tier badge: `醫院：大廟 已達頂峰` ✓
  - Hospital page header: `大廟 · 總產能 0.0 患者/分 · 房間 0/3` ✓
  - Hospital page tutorial copy (from rebuilt content-medexam2-tw): `Facility 升級放大該房間 throughput；區域以上可花錢擴建` ✓
  - HelpMenu 升級雙閘門 accordion: full short-label + canonical-parenthetical copy renders as designed (D5) ✓
  - HomePage / Hospital DOM canonical scan: 0 user-facing canonical refs found ✓
  - Console: no errors ✓
  - LeaderboardPage tier column: N/A (column not yet added; see 2.8)
  - V6MigrationModal: not triggered live (would only fire for pre-v6 saves); note line added in source verified by code review.
- [x] 3.4 `openspec validate add-abbreviated-tier-labels-medexam2 --strict` passes (53/53 specs + 4 changes pass at session end).

## 4. Docs

- [x] 4.1 Updated root `CLAUDE.md` `Known sharp edges` section with the `Hospital tier display / canonical separation` rule explaining `tierLabel()` UI usage vs canonical type strings used in Dexie / R2 / D1 / `HOSPITAL_TIER_TO_NUM` / scene-key mapping / spec scenarios. Includes the HelpMenu disambiguation exception and aria-label / accessibility guidance.
- [x] 4.2 `docs/LEADERBOARD.md` line 52 (`hospital_tier` column description) extended with a trailing sentence noting UI walks through `tierLabel()` per `add-abbreviated-tier-labels-medexam2`.

## 5. Out-of-scope confirmations

- [x] 5.1 Dexie schema version max remains **v14** (verified via `grep "this.version" apps/medexam2-hospital-tw/src/db/schema.ts`); no v15 bump from this change. Equipment change will bump to v15 separately.
- [x] 5.2 `apps/medexam2-hospital-tw/src/lib/sync/leaderboard.ts` mapping (actual variable name: `TIER_TO_NUMBER`, not `HOSPITAL_TIER_TO_NUM`) — keys remain canonical (`診所` / `區域醫院` / `醫學中心` / `國家級教學醫院`), values unchanged (`1 / 2 / 3 / 3`).
- [x] 5.3 R2 bundle `SCHEMA_VERSION` in `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts` line 14 remains `= 1`; no bump from this change.
- [x] 5.4 Cloudflare Worker `TIER_MAX = 3` in `cloudflare/sync-worker/src/leaderboard.ts:39` unchanged. D1 `leaderboard_m2.hospital_tier` numeric clamp `[1, 3]` unchanged (display-only change).
