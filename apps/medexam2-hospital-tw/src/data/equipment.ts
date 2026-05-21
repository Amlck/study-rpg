import type { GachaTier, PityRule } from '@study-rpg/core'
import type { Rarity } from '@study-rpg/content-medexam2-tw'

export type EquipmentCategory =
  | 'stethoscope'
  | 'scalpel'
  | 'chart'
  | 'coat'
  | 'textbook'
  | 'coffee'

export interface EquipmentDefinition {
  id: string
  name: string
  category: EquipmentCategory
  rarity: Rarity
  effectText: string
}

export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  stethoscope: '聽診器',
  scalpel: '手術刀',
  chart: '病歷夾',
  coat: '白袍',
  textbook: '教科書',
  coffee: '值班咖啡',
}

export const EQUIPMENT_RARITY_LABELS: Record<Rarity, string> = {
  P1: '傳說',
  P2: '頂級',
  P3: '稀有',
  P4: '精良',
  P5: '標準',
}

export const INITIAL_EQUIPMENT_TICKETS = 10
export const EQUIPMENT_TICKET_CAP = 99

export const EQUIPMENT_WEIGHTS: GachaTier[] = [
  { id: 'P5', weight: 55 },
  { id: 'P4', weight: 27 },
  { id: 'P3', weight: 13 },
  { id: 'P2', weight: 4 },
  { id: 'P1', weight: 1 },
]

export const EQUIPMENT_PITY_RULES: PityRule[] = [
  { tier: 'P3', atRolls: 20 },
  { tier: 'P2', atRolls: 80 },
]

export const EQUIPMENT_DEFINITIONS: EquipmentDefinition[] = [
  {
    id: 'standard-stethoscope',
    name: '標準聽診器',
    category: 'stethoscope',
    rarity: 'P5',
    effectText: '門診產能 +5%。裝備中的醫師在門診房間效率提升。',
  },
  {
    id: 'night-shift-coffee',
    name: '值班咖啡',
    category: 'coffee',
    rarity: 'P5',
    effectText: '暫未開放效果；目前不會出現在器材補給池。',
  },
  {
    id: 'clean-white-coat',
    name: '乾淨白袍',
    category: 'coat',
    rarity: 'P5',
    effectText: '所有房型產能 +3%。泛用，任何科別都能穿。',
  },
  {
    id: 'surgical-scalpel',
    name: '外科手術刀',
    category: 'scalpel',
    rarity: 'P4',
    effectText: '手術房產能 +10%。適合外科系醫師。',
  },
  {
    id: 'rounding-chart',
    name: '病房查房夾',
    category: 'chart',
    rarity: 'P4',
    effectText: '病房產能 +10%。適合住院照護取向醫師。',
  },
  {
    id: 'pocket-guideline',
    name: '口袋臨床指引',
    category: 'textbook',
    rarity: 'P4',
    effectText: '暫未開放效果；目前不會出現在器材補給池。',
  },
  {
    id: 'cardiology-stethoscope',
    name: '心臟科聽診器',
    category: 'stethoscope',
    rarity: 'P3',
    effectText: '門診產能 +20%。適合內科與家醫科王牌。',
  },
  {
    id: 'annotated-textbook',
    name: '滿是註記的國考書',
    category: 'textbook',
    rarity: 'P3',
    effectText: '暫未開放效果；目前不會出現在器材補給池。',
  },
  {
    id: 'golden-chart',
    name: '金邊病歷夾',
    category: 'chart',
    rarity: 'P3',
    effectText: '病房產能 +20%。適合病房管理與連續照護。',
  },
  {
    id: 'chief-scalpel',
    name: '主任手術刀',
    category: 'scalpel',
    rarity: 'P2',
    effectText: '手術房產能 +35%。適合核心外科醫師。',
  },
  {
    id: 'professor-coat',
    name: '教授白袍',
    category: 'coat',
    rarity: 'P2',
    effectText: '所有房型產能 +20%。適合醫院主力醫師。',
  },
  {
    id: 'legendary-coffee',
    name: '傳說值班咖啡',
    category: 'coffee',
    rarity: 'P2',
    effectText: '暫未開放效果；目前不會出現在器材補給池。',
  },
  {
    id: 'national-board-textbook',
    name: '國考祕典',
    category: 'textbook',
    rarity: 'P1',
    effectText: '暫未開放效果；目前不會出現在器材補給池。',
  },
  {
    id: 'oracle-stethoscope',
    name: '神諭聽診器',
    category: 'stethoscope',
    rarity: 'P1',
    effectText: '門診產能 +55%。傳說級診斷裝備，適合門診王牌。',
  },
]

export const EQUIPMENT_ROLL_DEFINITIONS: EquipmentDefinition[] = EQUIPMENT_DEFINITIONS.filter(
  (item) => item.category !== 'coffee' && item.category !== 'textbook',
)

export function getEquipmentDefinition(definitionId: string): EquipmentDefinition | undefined {
  return EQUIPMENT_DEFINITIONS.find((item) => item.id === definitionId)
}

export function getDefinitionsByRarity(rarity: Rarity): EquipmentDefinition[] {
  return EQUIPMENT_ROLL_DEFINITIONS.filter((item) => item.rarity === rarity)
}
