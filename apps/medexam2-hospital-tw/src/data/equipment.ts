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
    effectText: '門診型醫師的基礎診斷裝備。',
  },
  {
    id: 'night-shift-coffee',
    name: '值班咖啡',
    category: 'coffee',
    rarity: 'P5',
    effectText: '適合長時間唸書與急診照會的精神支援。',
  },
  {
    id: 'clean-white-coat',
    name: '乾淨白袍',
    category: 'coat',
    rarity: 'P5',
    effectText: '泛用裝備，任何科別都能穿。',
  },
  {
    id: 'surgical-scalpel',
    name: '外科手術刀',
    category: 'scalpel',
    rarity: 'P4',
    effectText: '手術房取向裝備，適合外科系醫師。',
  },
  {
    id: 'rounding-chart',
    name: '病房查房夾',
    category: 'chart',
    rarity: 'P4',
    effectText: '病房與住院照護取向裝備。',
  },
  {
    id: 'pocket-guideline',
    name: '口袋臨床指引',
    category: 'textbook',
    rarity: 'P4',
    effectText: '寫題與進修戰取向裝備。',
  },
  {
    id: 'cardiology-stethoscope',
    name: '心臟科聽診器',
    category: 'stethoscope',
    rarity: 'P3',
    effectText: '門診診斷取向，適合內科與家醫科。',
  },
  {
    id: 'annotated-textbook',
    name: '滿是註記的國考書',
    category: 'textbook',
    rarity: 'P3',
    effectText: '進修戰與考古題練習取向裝備。',
  },
  {
    id: 'golden-chart',
    name: '金邊病歷夾',
    category: 'chart',
    rarity: 'P3',
    effectText: '病房管理與連續照護取向裝備。',
  },
  {
    id: 'chief-scalpel',
    name: '主任手術刀',
    category: 'scalpel',
    rarity: 'P2',
    effectText: '高階手術房裝備，適合核心外科醫師。',
  },
  {
    id: 'professor-coat',
    name: '教授白袍',
    category: 'coat',
    rarity: 'P2',
    effectText: '高階泛用裝備，適合醫院主力醫師。',
  },
  {
    id: 'legendary-coffee',
    name: '傳說值班咖啡',
    category: 'coffee',
    rarity: 'P2',
    effectText: '急診照會與長時間 session 取向裝備。',
  },
  {
    id: 'national-board-textbook',
    name: '國考祕典',
    category: 'textbook',
    rarity: 'P1',
    effectText: '頂級進修與寫題裝備，之後可作為 build 核心。',
  },
  {
    id: 'oracle-stethoscope',
    name: '神諭聽診器',
    category: 'stethoscope',
    rarity: 'P1',
    effectText: '頂級診斷裝備，適合門診王牌。',
  },
]

export function getEquipmentDefinition(definitionId: string): EquipmentDefinition | undefined {
  return EQUIPMENT_DEFINITIONS.find((item) => item.id === definitionId)
}

export function getDefinitionsByRarity(rarity: Rarity): EquipmentDefinition[] {
  return EQUIPMENT_DEFINITIONS.filter((item) => item.rarity === rarity)
}
