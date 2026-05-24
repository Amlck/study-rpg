## 1. Core types

- [ ] 1.1 Add to `packages/core/src/types.ts`: `export type EquipmentId = 'ct' | 'mri' | 'endoscopy' | 'davinci' | 'cathlab' | 'petct' | 'linac' | 'ecmo' | 'hybridor' | 'ngs'`
- [ ] 1.2 Add `export interface EquipmentDef { id: EquipmentId; displayName: string; spriteKey: string; costByLevel: [number, number, number]; reputationBonusByLevel: [number, number, number]; throughputBonusByLevel: [number, number, number]; description: string }`
- [ ] 1.3 Add `export interface OwnedEquipmentRow { equipmentId: EquipmentId; level: 1 | 2 | 3; purchasedAt: number; upgradedAt: number; updatedAt: number }`
- [ ] 1.4 Re-export `EquipmentId / EquipmentDef / OwnedEquipmentRow` from `packages/core/src/index.ts`

## 2. Catalog (content-medexam2-tw)

- [ ] 2.1 Create `packages/content-medexam2-tw/src/equipment-catalog.ts` with `export const EQUIPMENT_CATALOG: readonly EquipmentDef[]` containing all 10 definitions per design D1 + D2. Mark cost / bonus literals with `// TUNED 2026-05-23 — first design pass; revisit after dogfood telemetry`.
- [ ] 2.2 Export `EQUIPMENT_CATALOG` from `packages/content-medexam2-tw/src/index.ts`
- [ ] 2.3 Add unit-equivalent satisfies check: `EQUIPMENT_CATALOG satisfies readonly EquipmentDef[]` and `EQUIPMENT_CATALOG.length === 10`
- [ ] 2.4 Run `pnpm --filter @study-rpg/content-medexam2-tw build` to verify catalog compiles

## 3. Dexie schema bump

- [ ] 3.1 In `apps/medexam2-hospital-tw/src/db/schema.ts`: bump version from v15 → v16 (v15 was claimed by `add-achievement-system` commit 9bf1f5e on 2026-05-23 for the `achievements` table; equipment uses v16 to avoid collision)
- [ ] 3.2 Add new store `hospitalEquipment: 'equipmentId, updatedAt'` (compound index on `updatedAt` for sync engine query)
- [ ] 3.3 Add `hospitalEquipment: Dexie.Table<OwnedEquipmentRow, EquipmentId>` to the Dexie class definition
- [ ] 3.4 Add v16 upgrade callback that runs no-op (empty table for everyone, no data migration)
- [ ] 3.5 Smoke test: open dev `localhost:5173/study-rpg/hospital/`, devtools → Application → IndexedDB → verify `hospitalEquipment` store exists, empty

## 4. Equipment helpers + services

- [ ] 4.1 Create `apps/medexam2-hospital-tw/src/lib/equipment.ts`:
  - `getOwnedEquipment(): Promise<OwnedEquipmentRow[]>` — read all rows
  - `getEquipmentLevel(equipmentId: EquipmentId): Promise<0 | 1 | 2 | 3>` — return 0 if not in table
  - `computeReputationMultiplier(owned: OwnedEquipmentRow[]): number` — return 1 + Σ bonus per row
  - `computeThroughputMultiplier(owned: OwnedEquipmentRow[]): number` — same shape
  - `computeUniqueEquipmentCount(owned: OwnedEquipmentRow[]): number` — for T4 gate, count rows at level ≥ 1
- [ ] 4.2 Create `apps/medexam2-hospital-tw/src/services/equipment-purchase.ts`:
  - `purchaseOrUpgrade(equipmentId: EquipmentId): Promise<{ ok: true } | { ok: false; reason: 'insufficient_revenue' | 'already_max' }>` — Dexie transaction that (a) reads current level, (b) reads next-level cost from catalog, (c) verifies `gameCounters.revenue >= cost`, (d) deducts revenue, (e) upserts row with new level + timestamps, (f) returns result
  - Must be transactionally safe (`db.transaction('rw', db.gameCounters, db.hospitalEquipment, ...)`)
- [ ] 4.3 Add basic unit-equivalent assertions to the helper (smoke test in dev console or vitest):
  - 0 owned → multipliers return 1.0
  - 1 L1 owned → reputation +1%, throughput +2%
  - 1 L3 owned → reputation +7%, throughput +12%
  - 5 L3 + 5 L1 owned → reputation +40%, throughput +70%

## 5. Image generation (apply phase)

- [x] 5.1 ~~Generate 10 equipment sprites via Gemini MCP~~ — **Gemini image gen unavailable at 2026-05-23 (auth/region error). Switched to codex CLI per fallback strategy.** All 10 sprites generated via `codex exec --skip-git-repo-check --sandbox workspace-write -C /tmp "..." < /dev/null` with prompt template producing GBA-era pixel art with chroma-key-friendly solid white background. CT smoke test 2026-05-23 confirmed style ✓; remaining 9 batched in parallel background jobs.
- [x] 5.2 Postprocess via magick: `corner=$(magick "$src" -format "%[pixel:p{0,0}]" info:); magick "$src" -filter point -resize 384x384! +dither -colors 16 -fuzz 10% -transparent "$corner" "PNG32:$out"` — downsamples codex's ~1254×1254 raw output to 384×384 (matches existing doctor-sprite dimension) + 16-color quantize + transparent corner key.
- [x] 5.3 Codex CLI was the primary path (not Gemini reroll). If a sprite needs reroll later, re-run the single codex command for that item.
- [ ] 5.4 Commit sprites to `packages/theme-pixel-hospital/sprites/equipment/{ct,mri,endoscopy,davinci,cathlab,petct,linac,ecmo,hybridor,ngs}.png` (matches existing doctor-sprite convention in `packages/theme-pixel-hospital/sprites/`; theme pack ownership keeps hospital-specific assets out of app folder). 384×384 RGBA, 16-color quantize, transparent background.
- [ ] 5.5 Fallback if image gen blocked: ship with emoji placeholders in `EquipmentCard.tsx` (e.g., 🏥 for CT, 🧲 MRI, 🔬 endoscopy, 🤖 da Vinci) so the feature can ship without sprites. Sprite hot-swap is a low-risk follow-up.

## 6. UI components

- [ ] 6.1 Create `apps/medexam2-hospital-tw/src/components/EquipmentCard.tsx`:
  - Props: `{ definition: EquipmentDef; ownedRow: OwnedEquipmentRow | null }`
  - Renders sprite + display name + level chip (L0–L3) + bonus breakdown + cost button
  - On click: opens `EquipmentUpgradeModal` with confirmation
- [ ] 6.2 Create `apps/medexam2-hospital-tw/src/components/EquipmentUpgradeModal.tsx`:
  - Shows current level → next level transition
  - Shows cost vs current revenue
  - Shows projected new bonus values
  - Confirm button calls `purchaseOrUpgrade()` service
- [ ] 6.3 Create `apps/medexam2-hospital-tw/src/components/EquipmentPanel.tsx`:
  - Subscribes via `liveQuery` to `db.hospitalEquipment.toArray()`
  - Renders grid of 10 `EquipmentCard` (5-col desktop, 2-col mobile)
  - Section header: 「設備」+ collapse toggle (default expanded T2+, collapsed T1)
- [ ] 6.4 In `apps/medexam2-hospital-tw/src/pages/Hospital.tsx`: mount `<EquipmentPanel />` below the existing room extension section

## 7. Wire multipliers into tick + reward paths

**REVISED 2026-05-24**: original draft assumed `reading-rewards.ts` / `mentor.ts` / `mock-exam.ts` existed in 二階. Re-audit via `grep -rn "counters\.reputation\s*+" apps/medexam2-hospital-tw/src/` found these files do NOT exist — those features (reading session XP, mentor daily, mock exam) are **一階 only** (`apps/medexam-tw/`). 二階 reputation accrual is limited to **3 sites**: quiz answer / ER consultation / emergency-shift event. `fate-card.ts` only **deducts** reputation (cost path) — no multiplier needed there.

- [ ] 7.1 In `apps/medexam2-hospital-tw/src/lib/tick.ts` (throughput multiplier, NOT reputation):
  - Read `db.hospitalEquipment` once per tick (in the same transaction as the rest of tick work)
  - Compute `equipmentThroughputMultiplier = computeThroughputMultiplier(owned)`
  - Apply to each doctor's per-minute throughput in the existing aggregation loop: `... × roomFacility × affinityBonus × equipmentThroughputMultiplier`
- [ ] 7.2 In `apps/medexam2-hospital-tw/src/services/quiz-rewards.ts` (existing `reputation: counters.reputation + reputationDelta` at ~line 137):
  - Read owned equipment, compute `equipmentReputationMultiplier`
  - Wrap `reputationDelta`: `Math.round(reputationDelta × equipmentReputationMultiplier)` before adding to counters; multiplier returned by `computeReputationMultiplier(owned)` is the **final** value (formula `1 + Σ bonusByLevel`; e.g., 1.40 for 40% bonus, 1.00 for zero owned)
- [ ] 7.3 In `apps/medexam2-hospital-tw/src/services/er-consultation.ts` (existing `reputation: counters.reputation + reputationDelta` at ~line 300):
  - Same wiring as 7.2 — wrap `reputationDelta` with `equipmentReputationMultiplier`
- [ ] 7.4 In `apps/medexam2-hospital-tw/src/services/event.ts` (existing `reputation: counters.reputation + EMERGENCY_SHIFT_REPUTATION_BONUS` at ~line 159):
  - Wrap the constant: `Math.round(EMERGENCY_SHIFT_REPUTATION_BONUS × equipmentReputationMultiplier)` before adding to counters
  - Note: `EMERGENCY_SHIFT_REPUTATION_BONUS` is a module-level constant, not a computed delta — multiplier applies at the call site, not at the constant definition
- [ ] 7.5 Audit: `rg "reputation:\s*counters\.reputation\s*\+" apps/medexam2-hospital-tw/src/` SHALL return exactly 3 hits (quiz-rewards / er-consultation / event); each one MUST pass `reputationDelta` (or the constant) through `equipmentReputationMultiplier`. `fate-card.ts` deducts only (uses `counters.reputation -` patterns) — verify no addition path. If implementation introduces a new reputation accrual path, wire multiplier there too

## 8. Modify T4 upgrade gate + bump T4 reputation threshold

- [ ] 8.1 **Bump threshold value**: in `packages/content-medexam2-tw/src/clinic-tiers.ts`, change `醫學中心: 150_000` to `醫學中心: 300_000`. Update the surrounding `// TUNED` comment to reflect the 2026-05-23 recalibration per design D9. Do NOT change `診所: 30_000` or `區域醫院: 80_000` (per design — players already crossed those gates).
- [ ] 8.2 **Add equipment gate to T3 → T4 evaluation**: in `apps/medexam2-hospital-tw/src/lib/tick.ts`'s tier-upgrade evaluation block:
  - For T3 (醫學中心) → T4 (國家級教學醫院) check, add a third gate condition: `uniqueEquipmentCount >= 3`
  - Existing reputation gate + diversification gate + requireP1 conditions remain unchanged in structure (note: reputation gate now reads `300_000` from `TIER_UPGRADE_THRESHOLDS.醫學中心` after task 8.1)
  - If equipment gate fails but other gates pass, show shortfall in UI: `「設備不足 (目前 N / 需 3)」`
- [ ] 8.3 In `apps/medexam2-hospital-tw/src/pages/HomePage.tsx`: when player is at T3 (醫學中心) targeting T4, display the equipment progress line: `「設備：N / 3」`. Hidden at other tiers. The reputation progress line automatically picks up the new 300k denominator from the threshold table (no further edit needed in HomePage).
- [ ] 8.4 In `apps/medexam2-hospital-tw/src/components/HelpMenu.tsx`: update tier-upgrade copy to mention both new T4 conditions: `「醫中 → 大廟：300k 聲望 + 10 P2+ 不同科別 + 1 P1 + 安裝 3 種以上設備」`. The 30k / 80k thresholds for lower tiers remain in the copy unchanged.
- [ ] 8.5 In `apps/medexam2-hospital-tw/src/components/V6MigrationModal.tsx` (or a fresh equipment-system intro modal): add a body copy line for players whose `tier === '醫學中心'` explaining the recalibration: `「T4 升級門檻已從 150k 提高到 300k 聲望 + 安裝 3 種設備，給遊戲多一個月的後期目標。已累積的聲望不會被清零」`. Display only once per save.
- [ ] 8.6 Grep verification: `rg "150_?000|150,000" apps/medexam2-hospital-tw/src/ packages/content-medexam2-tw/src/ --type ts --type tsx` should return zero hits for the threshold literal. (Other 150k literals elsewhere — e.g., a finance cap — are acceptable; check each hit.)

## 9. Sync wiring (R2 bundle schema_version bump)

- [ ] 9.1 In `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts`: bump `m2Bundle` schema_version from `1` to `2`
- [ ] 9.2 Extend `m2Bundle` snapshot composition to include `hospitalEquipment: OwnedEquipmentRow[]`
- [ ] 9.3 Extend `m2Bundle` apply logic to write incoming `hospitalEquipment` rows into Dexie via `db.hospitalEquipment.bulkPut(rows)` with LWW resolution per `updatedAt`
- [ ] 9.4 Confirm forward-compatibility: old client reads new bundle, ignores unknown `hospitalEquipment` key (no schema_version error); new client reads old bundle (schema_version = 1), defaults `hospitalEquipment` to empty array
- [ ] 9.5 Smoke test: in dev, purchase 1 CT L1, force a sync push, inspect R2 bundle via DEV-only `globalThis.__sync.getLastPushedBundle()` (if available) — confirm `hospitalEquipment` array has 1 row with `equipmentId='ct'`, `level=1`

## 10. Verify

- [ ] 10.1 Typecheck: `pnpm -r typecheck` (must pass)
- [ ] 10.2 Build: `pnpm -r build` (must pass)
- [ ] 10.3 Dev server smoke: `pnpm --filter @study-rpg/medexam2-hospital-tw dev` → open Hospital page → verify EquipmentPanel renders with 10 cards, all at L0 with cost buttons
- [ ] 10.4 Purchase flow smoke: click「購買 (800,000)」on CT card → confirm modal → confirm → verify (a) revenue deducted, (b) CT card flips to L1 with bonus chip showing `+1% / +2%`, (c) cost button updates to L2 cost (3,000,000)
- [ ] 10.5 Multiplier smoke: with 1 L1 CT installed, run a quiz quiz session, verify reputation awarded ~1% higher than baseline (compare to a fresh save without equipment)
- [ ] 10.6 T4 gate smoke (verifies both the bump and the equipment gate):
  - **Step a**: dev-only state hack to set `tier = '醫學中心'`, `reputation = 200,000` (above old 150k, below new 300k), 10 P2+ doctors, 1 P1, and 3 equipment installed → verify next tick does NOT upgrade (300k reputation gate not met)
  - **Step b**: bump `reputation = 320,000`, 0 equipment installed → verify HomePage shows `「設備：0 / 3」` shortfall and tier remains 醫學中心
  - **Step c**: purchase 3 cheapest equipment (3× ECMO L1 = 1.5M revenue) → verify next tick upgrades to 國家級教學醫院
  - **Step d**: revert dev state hack
- [ ] 10.7a Bump-specific HomePage smoke: at `tier = '醫學中心'` with `reputation = 150,000`, verify reputation progress line shows `「聲望 150,000 / 300,000 → 大廟」` (NOT the old `/ 150,000`).
- [ ] 10.7 Sync smoke: complete a sync push with 3 equipment owned, sign out, sign back in, verify R2 pulldown restores all 3 rows + multipliers re-activate
- [ ] 10.8 `openspec validate add-hospital-equipment-medexam2 --strict` must pass
- [ ] 10.9 Chrome MCP smoke for SPA route: navigate to `/`, then directly to `/#/hospital`, then F5 — verify EquipmentPanel renders on F5 (no 404)
- [ ] 10.10 `/verify` global skill end-to-end check on the equipment flow

## 11. Documentation

- [ ] 11.1 Add a new section to `apps/medexam2-hospital-tw/CLAUDE.md` (or `~/coding-scratch/study-rpg-m2/CLAUDE.md` if no app-level CLAUDE.md): "## Hospital equipment (M_2nd ext)" describing the 10 items, the L1/L2/L3 cost ladder, multiplier formula, T4 gate change. Cross-reference the spec.
- [ ] 11.2 Update `openspec/project.md` Roadmap: add a new milestone entry "**M_2nd ext — 醫院設備**" with status 🔄 in-progress (move to ✓ when archived)
- [ ] 11.3 **DEFERRED** ~~Update `docs/LEADERBOARD.md`~~ — `add-hospital-leaderboard-correct-count-filter` is in-flight and also edits `docs/LEADERBOARD.md` (its tasks §11+ touches the filter table). Concurrent edits would merge-conflict. Either (a) wait until that change archives then do the doc edit as a follow-up commit, or (b) capture rationale in this change's archived `proposal.md` ("equipment count intentionally NOT a leaderboard column — see design open Q") and skip the docs/ edit entirely
- [ ] 11.4 If `docs/HOSPITAL.md` or similar exists, add a "設備" section; otherwise this can wait until a `docs/EQUIPMENT.md` makes sense (defer to follow-up)

## 12. Deploy coordination

- [ ] 12.1 Confirm `add-r2-cloud-sync-migration` is at Phase 3 (R2 reads cutover) before applying this change's §9. The R2 bundle schema_version bump 1 → 2 requires the R2 path to be primary read backend, not Supabase mirror dual-write.
  - **STATUS NOTE (2026-05-24)**: `add-r2-cloud-sync-migration` is at 71/85 tasks (Phase 2 M2 bundle dual-write). Phase 3 bug_reports monitor window opened 2026-05-22; `add-r2-cloud-sync-migration` task §5.7 explicitly states "proceed to 5.8 on or after 2026-05-29". **Earliest apply window for equipment §9 (sync wiring)**: 2026-05-29 (Phase 3 reads-to-R2 cutover). Equipment §9 does NOT require Phase 4 (Supabase writes off, ~2026-06-12) — only the read backend flip
  - **Apply order**: §1–§8 (catalog / helpers / UI / T4 gate / threshold bump) are R2-independent and CAN apply now; only §9 (R2 bundle schema_version bump + equipment write into m2 bundle) MUST block until Phase 3 cutover. Split apply into two waves if needed
- [ ] 12.2 Bundle schema bump is forward-compatible — no coordinated client/Worker deploy needed (Worker doesn't parse bundle internals)
- [ ] 12.3 Once equipment ships, monitor R2 storage size for ~7 days to confirm the new field doesn't blow size budgets (10 rows × 80 bytes = 800 bytes max per user, negligible)
