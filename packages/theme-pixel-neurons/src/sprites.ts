/**
 * Sprite registry — placeholders covering all artKeys referenced by
 * ITEM_CATALOG + COSMETIC_CATALOG + skill tree fallback keys + contract-required
 * character / slot-placeholder keys + per-subject icon keys. All point to a 1×1
 * transparent PNG until generate-neurons-sprites populates real assets.
 *
 * theme-pack-contract MUST-cover keys: character-base, slot-placeholder-{head,
 * body,weapon,charm}, plus every Item.artKey in itemCatalog. Engine boots cleanly
 * with placeholders (no broken-image icons; per contract "missing key" scenario).
 */

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

// 11 subject icon keys (matched to FAMILY_BY_SUBJECT in content-neurons-tw build.ts)
const SUBJECT_IDS = [
  '藥理學',
  '公共衛生學',
  '寄生蟲學',
  '組織學',
  '生物化學',
  '病理學',
  '免疫學',
  '解剖學',
  '生理學',
  '胚胎學',
  '微生物學',
] as const

// itemCatalog artKeys (must stay in sync with items.ts)
const ITEM_ART_KEYS = [
  'receptor-glu-generic',
  'receptor-ampa',
  'receptor-nmda',
  'receptor-gaba-b',
  'channel-na-v',
  'channel-k-v',
  'channel-ca-v-l',
  'channel-hcn',
  'nt-dopamine',
  'nt-serotonin',
  'nt-gaba',
  'nt-glutamate',
  'receptor-d2',
  'receptor-5ht2a',
  'receptor-m1',
  'receptor-mglur1',
  'mol-atp',
  'mol-glycine',
  'mol-bdnf',
  'mol-reelin',
] as const

// cosmetic artKeys (must stay in sync with cosmetics.ts)
const COSMETIC_ART_KEYS = [
  // head (soma) — 4
  'cosmetic-head-soma-newcomer-halo',
  'cosmetic-head-soma-pyramidal-crown',
  'cosmetic-head-soma-purkinje-arbor',
  'cosmetic-head-soma-cajal-retzius-blueprint',
  // body (dendrite) — 4
  'cosmetic-body-dendrite-sparse',
  'cosmetic-body-dendrite-bushy',
  'cosmetic-body-dendrite-fractal',
  'cosmetic-body-dendrite-spine-gold',
  // accessory (myelin) — 4
  'cosmetic-accessory-myelin-thin',
  'cosmetic-accessory-myelin-banded',
  'cosmetic-accessory-myelin-rainbow',
  'cosmetic-accessory-myelin-saltatory-aura',
  // held (vesicle) — 4
  'cosmetic-held-vesicle-clear',
  'cosmetic-held-vesicle-dense-core',
  'cosmetic-held-vesicle-glutamate-glow',
  'cosmetic-held-vesicle-rainbow-array',
  // background — 4
  'cosmetic-background-bg-plain-lab',
  'cosmetic-background-bg-connectome-map',
  'cosmetic-background-bg-gamma-oscillation',
  'cosmetic-background-bg-hebbian-firewall',
] as const

// skill tree placeholder keys (4 NT × 9 nodes = 36)
const SKILL_ART_KEYS: string[] = []
for (const nt of ['da', '5ht', 'gaba', 'glu'] as const) {
  for (let i = 1; i <= 9; i += 1) {
    SKILL_ART_KEYS.push(`skill-placeholder-${nt}-${i}`)
  }
}

// Contract-required keys
const CORE_KEYS = [
  'character-base',
  'slot-placeholder-head',
  'slot-placeholder-body',
  'slot-placeholder-weapon',
  'slot-placeholder-charm',
  'dorm-default',
] as const

export const SPRITE_MAP: Record<string, string> = Object.fromEntries([
  ...CORE_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  ...SUBJECT_IDS.map((id) => [`subject:${id}`, TRANSPARENT_PIXEL]),
  ...ITEM_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  ...COSMETIC_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  ...SKILL_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
])
