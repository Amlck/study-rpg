/**
 * Cosmetic catalog for theme-pixel-neurons.
 *
 * 5 categories from the engine's `CosmeticCategory` enum
 * (head / body / accessory / held / background), each repurposed for neurons-tw:
 *   - head      → soma decorations (the "head" of the neuron)
 *   - body      → dendrite patterns (the body / arborization)
 *   - accessory → myelin wraps along the axon
 *   - held      → axon terminal styles / synaptic vesicle palettes
 *   - background → connectome backdrop (network ambience)
 *
 * 20 entries total (4 per category). artKey follows `cosmetic-<category>-<id>`
 * convention; real PNGs land in generate-neurons-sprites (currently transparent
 * placeholder via SPRITE_MAP).
 *
 * Unlock predicates use the 4 NT stat keys (da / 5ht / gaba / glu) declared in
 * content-neurons-tw meta.json statSchema override. Threshold values are
 * first-pass placeholders; refine after dogfood telemetry.
 */

import type { Cosmetic, Player } from '@study-rpg/core'

const lvl = (n: number) => (p: Player) => p.level >= n
// Default stat keys preserved per core SkillBranchStatKey contract; mapping:
// knowledge↔Glu / reflex↔DA / memory↔GABA / stamina↔5-HT (see content meta.json statSchema).
const ntStat = (name: 'reflex' | 'stamina' | 'memory' | 'knowledge', n: number) => (p: Player) =>
  (p.stats[name] ?? 0) >= n
const streakAtLeast = (n: number) => (p: Player) =>
  p.currentStreak >= n || p.longestStreak >= n

export const COSMETIC_CATALOG: readonly Cosmetic[] = [
  // ─── Head — soma decorations (4) ─────────────────────────────────────────
  {
    id: 'soma-newcomer-halo',
    name: '新生軸丘 Halo',
    category: 'head',
    unlockCondition: lvl(1),
    unlockDescription: '起始裝備',
    artKey: 'cosmetic-head-soma-newcomer-halo',
    rarity: 'N',
  },
  {
    id: 'soma-pyramidal-crown',
    name: 'Pyramidal Crown 椎體之冠',
    category: 'head',
    unlockCondition: ntStat('knowledge',30),
    unlockDescription: 'Glutamate ≥ 30 解鎖（生理 CEO 條件）',
    artKey: 'cosmetic-head-soma-pyramidal-crown',
    rarity: 'R',
  },
  {
    id: 'soma-purkinje-arbor',
    name: 'Purkinje Arbor 樹突冠',
    category: 'head',
    unlockCondition: ntStat('memory',50),
    unlockDescription: 'GABA ≥ 50 解鎖（生化 數學家 條件）',
    artKey: 'cosmetic-head-soma-purkinje-arbor',
    rarity: 'SR',
  },
  {
    id: 'soma-cajal-retzius-blueprint',
    name: 'Cajal-Retzius Blueprint 拓荒藍圖',
    category: 'head',
    unlockCondition: ntStat('knowledge',80),
    unlockDescription: 'Glutamate ≥ 80 解鎖（胚胎 Pioneer 條件）',
    artKey: 'cosmetic-head-soma-cajal-retzius-blueprint',
    rarity: 'SSR',
  },

  // ─── Body — dendrite patterns (4) ────────────────────────────────────────
  {
    id: 'dendrite-sparse',
    name: 'Sparse Dendrite 疏疏分支',
    category: 'body',
    unlockCondition: lvl(1),
    unlockDescription: '起始裝備',
    artKey: 'cosmetic-body-dendrite-sparse',
    rarity: 'N',
  },
  {
    id: 'dendrite-bushy',
    name: 'Bushy Dendrite 蓬鬆樹叢',
    category: 'body',
    unlockCondition: ntStat('knowledge',20),
    unlockDescription: 'Glutamate ≥ 20 解鎖',
    artKey: 'cosmetic-body-dendrite-bushy',
    rarity: 'R',
  },
  {
    id: 'dendrite-fractal',
    name: 'Fractal Dendrite 碎形樹突',
    category: 'body',
    unlockCondition: ntStat('memory',40),
    unlockDescription: 'GABA ≥ 40 解鎖（Purkinje 致敬款）',
    artKey: 'cosmetic-body-dendrite-fractal',
    rarity: 'SR',
  },
  {
    id: 'dendrite-spine-gold',
    name: 'Golden Spine Forest 金棘森林',
    category: 'body',
    unlockCondition: streakAtLeast(30),
    unlockDescription: '連續 30 天 streak 解鎖',
    artKey: 'cosmetic-body-dendrite-spine-gold',
    rarity: 'SSR',
  },

  // ─── Accessory — myelin wraps on the axon (4) ────────────────────────────
  {
    id: 'myelin-thin',
    name: 'Thin Myelin 薄髓鞘',
    category: 'accessory',
    unlockCondition: lvl(1),
    unlockDescription: '起始裝備',
    artKey: 'cosmetic-accessory-myelin-thin',
    rarity: 'N',
  },
  {
    id: 'myelin-banded',
    name: 'Banded Myelin 帶狀髓鞘',
    category: 'accessory',
    unlockCondition: ntStat('reflex',15),
    unlockDescription: 'Dopamine ≥ 15 解鎖',
    artKey: 'cosmetic-accessory-myelin-banded',
    rarity: 'R',
  },
  {
    id: 'myelin-rainbow',
    name: 'Rainbow Myelin 彩虹髓鞘',
    category: 'accessory',
    unlockCondition: ntStat('stamina',40),
    unlockDescription: 'Serotonin ≥ 40 解鎖',
    artKey: 'cosmetic-accessory-myelin-rainbow',
    rarity: 'SR',
  },
  {
    id: 'myelin-saltatory-aura',
    name: 'Saltatory Aura 跳躍光環',
    category: 'accessory',
    unlockCondition: ntStat('knowledge',60),
    unlockDescription: 'Glutamate ≥ 60 解鎖（高速傳導敬意）',
    artKey: 'cosmetic-accessory-myelin-saltatory-aura',
    rarity: 'SR',
  },

  // ─── Held — axon terminal / synaptic vesicle palettes (4) ───────────────
  {
    id: 'vesicle-clear',
    name: 'Clear Vesicles 透明小泡',
    category: 'held',
    unlockCondition: lvl(1),
    unlockDescription: '起始裝備',
    artKey: 'cosmetic-held-vesicle-clear',
    rarity: 'N',
  },
  {
    id: 'vesicle-dense-core',
    name: 'Dense-Core Vesicles 緻密核小泡',
    category: 'held',
    unlockCondition: ntStat('reflex',25),
    unlockDescription: 'Dopamine ≥ 25 解鎖（DA / 5-HT 共用 vesicle 樣態）',
    artKey: 'cosmetic-held-vesicle-dense-core',
    rarity: 'R',
  },
  {
    id: 'vesicle-glutamate-glow',
    name: 'Glutamate Glow 麩胺酸金光',
    category: 'held',
    unlockCondition: ntStat('knowledge',40),
    unlockDescription: 'Glutamate ≥ 40 解鎖',
    artKey: 'cosmetic-held-vesicle-glutamate-glow',
    rarity: 'R',
  },
  {
    id: 'vesicle-rainbow-array',
    name: 'Rainbow Vesicle Array 彩虹小泡',
    category: 'held',
    unlockCondition: streakAtLeast(14),
    unlockDescription: '連續 14 天 streak 解鎖',
    artKey: 'cosmetic-held-vesicle-rainbow-array',
    rarity: 'SR',
  },

  // ─── Background — connectome backdrop (4) ────────────────────────────────
  {
    id: 'bg-plain-lab',
    name: 'Plain Lab Wall 素白實驗室',
    category: 'background',
    unlockCondition: lvl(1),
    unlockDescription: '起始裝備',
    artKey: 'cosmetic-background-bg-plain-lab',
    rarity: 'N',
  },
  {
    id: 'bg-connectome-map',
    name: 'Connectome Map 連結圖譜',
    category: 'background',
    unlockCondition: lvl(5),
    unlockDescription: 'Level ≥ 5 解鎖',
    artKey: 'cosmetic-background-bg-connectome-map',
    rarity: 'R',
  },
  {
    id: 'bg-gamma-oscillation',
    name: 'Gamma Oscillation Field γ波場域',
    category: 'background',
    unlockCondition: streakAtLeast(7),
    unlockDescription: '連續 7 天 streak 解鎖（全網同步閃爍）',
    artKey: 'cosmetic-background-bg-gamma-oscillation',
    rarity: 'SR',
  },
  {
    id: 'bg-hebbian-firewall',
    name: "Hebbian's Firewall 赫布之牆",
    category: 'background',
    unlockCondition: ntStat('knowledge',100),
    unlockDescription: 'Glutamate ≥ 100 解鎖（完整 LTP 致敬款）',
    artKey: 'cosmetic-background-bg-hebbian-firewall',
    rarity: 'UR',
  },
]

export const COSMETIC_CATALOG_SIZE = COSMETIC_CATALOG.length
