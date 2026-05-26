/**
 * Sprite registry — maps theme sprite keys to runtime URLs.
 *
 * Subject icons (11 neuron families): REAL sprites generated via codex CLI per
 * `generate-neurons-sprites` change (2026-05-25). See `../SPRITE_GENERATION.md`
 * for prompts + regen procedure. Bundled via Vite `import.meta.glob` with
 * `?url` for cache-busting hash URLs in production.
 *
 * Other categories (core scaffold / items / cosmetics / skill placeholders)
 * still map to a 1×1 transparent PNG until their respective consumer
 * capabilities (variant gacha / achievements / dorm view / skill tree, etc.)
 * ship real assets in separate future changes.
 *
 * theme-pack-contract MUST-cover keys: character-base, slot-placeholder-{head,
 * body,weapon,charm}, plus every Item.artKey in itemCatalog. Engine boots cleanly
 * with placeholders (no broken-image icons; per contract "missing key" scenario).
 */

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

// Real subject sprites — Vite glob handles UTF-8 Chinese filenames cleanly
// per `theme-pixel-hospital/sprites/doctor-內科-P3.png` proven precedent.
const subjectSpriteModules = import.meta.glob('../sprites/subjects/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const subjectSprites: Record<string, string> = Object.fromEntries(
  Object.entries(subjectSpriteModules).map(([path, url]) => {
    const id = path.replace(/.*\/(.+)\.png$/, '$1')
    return [`subject:${id}`, url]
  }),
)

// 4 NT-branch hub icons (DA / 5HT / GABA / Glu). Same glob pattern as subjects.
const branchSpriteModules = import.meta.glob('../sprites/branches/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const branchSprites: Record<string, string> = Object.fromEntries(
  Object.entries(branchSpriteModules).map(([path, url]) => {
    // Filename pattern: `<nt>-icon.png` → key `branch:<nt>` (e.g. da-icon.png → branch:da)
    const stem = path.replace(/.*\/(.+)\.png$/, '$1').replace(/-icon$/, '')
    return [`branch:${stem}`, url]
  }),
)

// Root brain icon (central Neuron Connectome node). Single file.
const rootSpriteModules = import.meta.glob('../sprites/root/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const rootSprite: string | undefined = Object.values(rootSpriteModules)[0]

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

// neuron-variant-gacha placeholder keys (11 families × 5 slots = 55)
// Real sprites deferred to a follow-up generate-neuron-variant-sprites change.
const VARIANT_ART_KEYS: string[] = []
for (const subjectId of SUBJECT_IDS) {
  for (let slot = 1; slot <= 5; slot += 1) {
    VARIANT_ART_KEYS.push(`variant:${subjectId}:${slot}`)
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
  'variant:default',
] as const

// 4 NT-branch hub keys — `branch:da` / `branch:5ht` / `branch:gaba` / `branch:glu`.
const BRANCH_KEYS = ['branch:da', 'branch:5ht', 'branch:gaba', 'branch:glu'] as const

export const SPRITE_MAP: Record<string, string> = Object.fromEntries([
  ...CORE_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  // Subject icons: real sprite if file present, else defensive fallback to placeholder
  ...SUBJECT_IDS.map((id) => [
    `subject:${id}`,
    subjectSprites[`subject:${id}`] ?? TRANSPARENT_PIXEL,
  ]),
  // NT-branch hub icons: real sprite if file present, else placeholder
  ...BRANCH_KEYS.map((k) => [k, branchSprites[k] ?? TRANSPARENT_PIXEL]),
  // Root brain icon (central Neuron Connectome).
  ['root:brain', rootSprite ?? TRANSPARENT_PIXEL],
  ...ITEM_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  ...COSMETIC_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  ...SKILL_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
  ...VARIANT_ART_KEYS.map((k) => [k, TRANSPARENT_PIXEL]),
])
