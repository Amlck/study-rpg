/**
 * Neurons-themed starter item catalog: 20 items across 5 EquipSlot enum
 * values (head / body / weapon / charm / consumable). Each item is an ion
 * channel, receptor, neurotransmitter molecule, or modulator drawn from
 * canonical neuroscience. Distribution: N=8 / R=6 / SR=4 / SSR=1 / UR=1.
 *
 * artKey naming convention: `<category>-<id>` (transparent placeholder PNG
 * served by sprites.ts until generate-neurons-sprites lands). Stats follow
 * the 4 NT schema (da / 5ht / gaba / glu) declared in content-neurons-tw
 * meta.json statSchema override.
 */

import type { Item } from '@study-rpg/core'

export const ITEM_CATALOG: Item[] = [
  // ─── HEAD (input receptors) ──────────────────────────────────────────────
  {
    id: 'item:glu-receptor-n',
    name: 'Glutamate Receptor',
    rarity: 'N',
    slot: 'head',
    effects: [{ stat: { name: 'knowledge', delta: 1 } }],
    artKey: 'receptor-glu-generic',
    flavor: '興奮性訊號的基本門戶。',
  },
  {
    id: 'item:ampa-receptor-r',
    name: 'AMPA Receptor',
    rarity: 'R',
    slot: 'head',
    effects: [{ stat: { name: 'knowledge', delta: 2 } }, { multiplier: { type: 'readingSpeed', value: 1.05 } }],
    artKey: 'receptor-ampa',
    flavor: '快速興奮的常駐主力，主導突觸電流的瞬間打開。',
  },
  {
    id: 'item:nmda-receptor-sr',
    name: 'NMDA Receptor',
    rarity: 'SR',
    slot: 'head',
    effects: [
      { stat: { name: 'knowledge', delta: 4 } },
      { multiplier: { type: 'quizXp', value: 1.15 } },
    ],
    artKey: 'receptor-nmda',
    flavor: 'LTP 的鑰匙——同時放電才開門。',
  },
  {
    id: 'item:gaba-b-receptor-ssr',
    name: 'GABA-B Receptor',
    rarity: 'SSR',
    slot: 'head',
    effects: [
      { stat: { name: 'memory', delta: 6 } },
      { multiplier: { type: 'critRate', value: 1.1 } },
    ],
    artKey: 'receptor-gaba-b',
    flavor: '慢速抑制的代謝型門禁，藥理愛考的進階題。',
  },

  // ─── BODY (ion channels in the membrane) ─────────────────────────────────
  {
    id: 'item:na-v-channel-n',
    name: 'Voltage-gated Na+ Channel',
    rarity: 'N',
    slot: 'body',
    effects: [{ stat: { name: 'knowledge', delta: 1 } }],
    artKey: 'channel-na-v',
    flavor: '動作電位的點火栓——沒它就沒 spike。',
  },
  {
    id: 'item:k-v-channel-n',
    name: 'Voltage-gated K+ Channel',
    rarity: 'N',
    slot: 'body',
    effects: [{ stat: { name: 'memory', delta: 1 } }],
    artKey: 'channel-k-v',
    flavor: '收尾的鎮場王——repolarization 的引擎。',
  },
  {
    id: 'item:ca-v-l-channel-r',
    name: 'L-type Ca2+ Channel',
    rarity: 'R',
    slot: 'body',
    effects: [{ stat: { name: 'knowledge', delta: 2 } }],
    artKey: 'channel-ca-v-l',
    flavor: '突觸末梢的訊使，召喚 vesicle 釋放。',
  },
  {
    id: 'item:hcn-channel-ur',
    name: 'HCN Channel (Pacemaker)',
    rarity: 'UR',
    slot: 'body',
    effects: [
      { stat: { name: 'reflex', delta: 4 } },
      { stat: { name: 'knowledge', delta: 4 } },
      { multiplier: { type: 'readingSpeed', value: 1.25 } },
    ],
    artKey: 'channel-hcn',
    flavor: '節律器神經元的心跳，主導 thalamocortical 振盪。',
  },

  // ─── WEAPON (neurotransmitter molecules — the "weapon" the neuron wields) ─
  {
    id: 'item:dopamine-n',
    name: 'Dopamine',
    rarity: 'N',
    slot: 'weapon',
    effects: [{ stat: { name: 'reflex', delta: 2 } }],
    artKey: 'nt-dopamine',
    flavor: '獎賞、動機、運動——VTA 跟 SNc 的招牌武器。',
  },
  {
    id: 'item:serotonin-n',
    name: 'Serotonin (5-HT)',
    rarity: 'N',
    slot: 'weapon',
    effects: [{ stat: { name: 'stamina', delta: 2 } }],
    artKey: 'nt-serotonin',
    flavor: '情緒、耐力、腸道——raphe 跟 enteric 兩派系。',
  },
  {
    id: 'item:gaba-n',
    name: 'GABA',
    rarity: 'N',
    slot: 'weapon',
    effects: [{ stat: { name: 'memory', delta: 2 } }],
    artKey: 'nt-gaba',
    flavor: '抑制性的標準裝備，剎車系統的關鍵。',
  },
  {
    id: 'item:glutamate-r',
    name: 'Glutamate',
    rarity: 'R',
    slot: 'weapon',
    effects: [{ stat: { name: 'knowledge', delta: 3 } }, { multiplier: { type: 'quizXp', value: 1.05 } }],
    artKey: 'nt-glutamate',
    flavor: '腦中最多的興奮性傳導物質——學習與記憶都靠它。',
  },

  // ─── CHARM (metabotropic receptors / accessory molecules) ────────────────
  {
    id: 'item:d2-receptor-n',
    name: 'D2 Dopamine Receptor',
    rarity: 'N',
    slot: 'charm',
    effects: [{ stat: { name: 'reflex', delta: 1 } }],
    artKey: 'receptor-d2',
    flavor: '抑制性 G-protein-coupled——抗精神病藥的主目標。',
  },
  {
    id: 'item:5ht2a-receptor-r',
    name: '5-HT 2A Receptor',
    rarity: 'R',
    slot: 'charm',
    effects: [{ stat: { name: 'stamina', delta: 2 } }, { multiplier: { type: 'luck', value: 1.05 } }],
    artKey: 'receptor-5ht2a',
    flavor: '迷幻藥的目標、非典型抗精神病藥的關鍵。',
  },
  {
    id: 'item:m1-muscarinic-r',
    name: 'M1 Muscarinic Receptor',
    rarity: 'R',
    slot: 'charm',
    effects: [{ stat: { name: 'knowledge', delta: 2 } }],
    artKey: 'receptor-m1',
    flavor: '皮層 ACh 訊號的代表，記憶與認知都靠它。',
  },
  {
    id: 'item:mglur1-sr',
    name: 'mGluR1',
    rarity: 'SR',
    slot: 'charm',
    effects: [{ stat: { name: 'knowledge', delta: 4 } }, { multiplier: { type: 'critRate', value: 1.1 } }],
    artKey: 'receptor-mglur1',
    flavor: 'Purkinje cell 的長期凋零（LTD）總指揮。',
  },

  // ─── CONSUMABLE (transient modulators / temporary buffs) ─────────────────
  {
    id: 'item:atp-n',
    name: 'ATP',
    rarity: 'N',
    slot: 'consumable',
    effects: [
      { stat: { name: 'knowledge', delta: 1 } },
      { multiplier: { type: 'readingSpeed', value: 1.1, durationMs: 600_000 } },
    ],
    artKey: 'mol-atp',
    flavor: '細胞的通用能量幣，10 分鐘加速閱讀。',
  },
  {
    id: 'item:glycine-r',
    name: 'Glycine',
    rarity: 'R',
    slot: 'consumable',
    effects: [
      { stat: { name: 'memory', delta: 2 } },
      { multiplier: { type: 'critRate', value: 1.05, durationMs: 900_000 } },
    ],
    artKey: 'mol-glycine',
    flavor: '脊髓抑制 + NMDA co-agonist——雙面助攻 15 分鐘。',
  },
  {
    id: 'item:bdnf-sr',
    name: 'BDNF',
    rarity: 'SR',
    slot: 'consumable',
    effects: [
      { stat: { name: 'knowledge', delta: 3 } },
      { multiplier: { type: 'quizXp', value: 1.2, durationMs: 1_800_000 } },
    ],
    artKey: 'mol-bdnf',
    flavor: '腦源性神經滋養因子，30 分鐘 LTP 加成。',
  },
  {
    id: 'item:reelin-sr',
    name: 'Reelin',
    rarity: 'SR',
    slot: 'consumable',
    effects: [
      { stat: { name: 'knowledge', delta: 3 } },
      { multiplier: { type: 'luck', value: 1.1, durationMs: 1_800_000 } },
    ],
    artKey: 'mol-reelin',
    flavor: 'Cajal-Retzius 拓荒建築師的招牌建材——皮層層次的設計藍圖。',
  },
]
