/**
 * Hospital equipment catalog — 二階 hospital mode.
 *
 * Added by add-hospital-equipment-medexam2 (2026-05-24).
 * 10 named equipment items, each with 3-level upgrade ladder.
 *
 * Design references:
 *   openspec/changes/add-hospital-equipment-medexam2/proposal.md
 *   openspec/changes/add-hospital-equipment-medexam2/design.md  (D1 catalog, D2 bonus formula)
 *   openspec/changes/add-hospital-equipment-medexam2/specs/hospital-equipment/spec.md
 *
 * Cost ladder: progressive revenue sinks ~500k → ~60M range.
 * Bonus ladder: additive % to (a) reputation gain rate, (b) patient throughput;
 *               L2/L3 REPLACE lower-level values (don't sum) per spec.
 *
 * sprite key convention: `equipment-<id>` (namespaced from doctor-* sprites).
 * Sprite assets live at packages/theme-pixel-hospital/sprites/equipment/<id>.png.
 */

import type { EquipmentDef } from '@study-rpg/core'

// TUNED 2026-05-24 — first design pass; revisit after dogfood telemetry
const BONUS_REPUTATION: [number, number, number] = [0.01, 0.03, 0.07] // L1 +1%, L2 +3%, L3 +7%
// TUNED 2026-05-24 — first design pass; revisit after dogfood telemetry
const BONUS_THROUGHPUT: [number, number, number] = [0.02, 0.05, 0.12] // L1 +2%, L2 +5%, L3 +12%

export const EQUIPMENT_CATALOG: readonly EquipmentDef[] = [
  {
    id: 'ct',
    displayName: '電腦斷層 (CT)',
    spriteKey: 'equipment-ct',
    // TUNED 2026-05-24 — 64-slice → 256-slice → photon-counting tier ladder
    costByLevel: [800_000, 3_000_000, 10_000_000],
    reputationBonusByLevel: BONUS_REPUTATION,
    throughputBonusByLevel: BONUS_THROUGHPUT,
    description: '快速斷層成像，急診與腫瘤分期主力。',
  },
  {
    id: 'mri',
    displayName: '磁振造影 (MRI)',
    spriteKey: 'equipment-mri',
    // TUNED 2026-05-24 — 1.5T → 3T → 7T research-grade
    costByLevel: [2_000_000, 8_000_000, 25_000_000],
    reputationBonusByLevel: BONUS_REPUTATION,
    throughputBonusByLevel: BONUS_THROUGHPUT,
    description: '高解析軟組織成像，神經科與肌肉骨骼必備。',
  },
  {
    id: 'endoscopy',
    displayName: '內視鏡系統',
    spriteKey: 'equipment-endoscopy',
    // TUNED 2026-05-24 — SD → HD + AI → capsule + ESD
    costByLevel: [500_000, 2_000_000, 6_000_000],
    reputationBonusByLevel: BONUS_REPUTATION,
    throughputBonusByLevel: BONUS_THROUGHPUT,
    description: '消化道直視檢查，含 AI 輔助與膠囊內視鏡升級。',
  },
  {
    id: 'davinci',
    displayName: '達文西手術機器人',
    spriteKey: 'equipment-davinci',
    // TUNED 2026-05-24 — Si → Xi → SP single-port
    costByLevel: [5_000_000, 20_000_000, 60_000_000],
    reputationBonusByLevel: BONUS_REPUTATION,
    throughputBonusByLevel: BONUS_THROUGHPUT,
    description: '微創手術系統，最頂級單孔機型。',
  },
  {
    id: 'cathlab',
    displayName: '心導管室 (DSA)',
    spriteKey: 'equipment-cathlab',
    // TUNED 2026-05-24 — single-plane → biplane → hybrid 4D
    costByLevel: [1_500_000, 5_000_000, 15_000_000],
    reputationBonusByLevel: BONUS_REPUTATION,
    throughputBonusByLevel: BONUS_THROUGHPUT,
    description: '心血管介入治療場域，含 4D 混合手術升級。',
  },
  {
    id: 'petct',
    displayName: '正子斷層 (PET-CT)',
    spriteKey: 'equipment-petct',
    // TUNED 2026-05-24 — 18F-FDG → multi-tracer → total-body
    costByLevel: [4_000_000, 12_000_000, 35_000_000],
    reputationBonusByLevel: BONUS_REPUTATION,
    throughputBonusByLevel: BONUS_THROUGHPUT,
    description: '分子影像，腫瘤代謝與全身性疾病評估。',
  },
  {
    id: 'linac',
    displayName: '直線加速器 (LINAC)',
    spriteKey: 'equipment-linac',
    // TUNED 2026-05-24 — conventional → VMAT → proton beam
    costByLevel: [3_000_000, 10_000_000, 30_000_000],
    reputationBonusByLevel: BONUS_REPUTATION,
    throughputBonusByLevel: BONUS_THROUGHPUT,
    description: '放射治療主力，最高階為質子治療升級。',
  },
  {
    id: 'ecmo',
    displayName: '體外膜氧合 (ECMO)',
    spriteKey: 'equipment-ecmo',
    // TUNED 2026-05-24 — single unit → multi-unit → mobile team
    costByLevel: [500_000, 1_500_000, 5_000_000],
    reputationBonusByLevel: BONUS_REPUTATION,
    throughputBonusByLevel: BONUS_THROUGHPUT,
    description: '重症生命維持系統，可組行動 ECMO 團隊。',
  },
  {
    id: 'hybridor',
    displayName: '複合式手術房',
    spriteKey: 'equipment-hybridor',
    // TUNED 2026-05-24 — basic → image-guided → AI-augmented
    costByLevel: [6_000_000, 20_000_000, 50_000_000],
    reputationBonusByLevel: BONUS_REPUTATION,
    throughputBonusByLevel: BONUS_THROUGHPUT,
    description: '整合影像導引的手術室，AI 輔助術中決策。',
  },
  {
    id: 'ngs',
    displayName: '次世代定序儀 (NGS)',
    spriteKey: 'equipment-ngs',
    // TUNED 2026-05-24 — desktop → production → long-read cluster
    costByLevel: [1_000_000, 3_000_000, 8_000_000],
    reputationBonusByLevel: BONUS_REPUTATION,
    throughputBonusByLevel: BONUS_THROUGHPUT,
    description: '基因定序平台，從桌上型到長讀長 cluster。',
  },
] as const satisfies readonly EquipmentDef[]

// Sanity assertion (build-time): catalog must have exactly 10 entries.
if (EQUIPMENT_CATALOG.length !== 10) {
  throw new Error(
    `[equipment-catalog] EQUIPMENT_CATALOG.length is ${EQUIPMENT_CATALOG.length}, expected 10`,
  )
}
