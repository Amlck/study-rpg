/**
 * Skill tree content for theme-pixel-neurons.
 *
 * 36 nodes total = 4 NT branches × 9 nodes each. Each branch advances along a
 * neurotransmitter pathway theme (reward / mood / inhibition / learning).
 *
 * Sprite keys use `skill-placeholder-<nt>-<n>` convention (engine fallback
 * sprite naming; SPRITE_MAP can register real PNGs without changing this file).
 */

import type { SkillTreeContent } from '@study-rpg/core'

// Default stat keys preserved per core SkillBranchStatKey contract.
// Branch ↔ NT mapping (declared in content meta.json statSchema):
//   knowledge ↔ Glu (學習 / LTP)
//   reflex    ↔ DA  (動機 / reward)
//   memory    ↔ GABA (專注 / inhibition)
//   stamina   ↔ 5-HT (耐力 / mood)
function nodes(nt: 'glu' | 'da' | 'gaba' | '5ht', items: Array<[string, string]>) {
  return items.map(([name, flavor], i) => ({
    spriteKey: `skill-placeholder-${nt}-${i + 1}`,
    name,
    flavor,
  }))
}

export const SKILL_TREE_PIXEL_NEURONS: SkillTreeContent = {
  branches: [
    {
      // knowledge slot = Glu / 學習 branch
      statKey: 'knowledge',
      nodes: nodes('glu', [
        ['基礎學習 I', '新章節讀一次就記得大意——AMPA 開門。'],
        ['LTP 啟動', '重複看同樣概念三次後產生長期記憶——NMDA 進場。'],
        ['記憶鞏固', '前一週讀的還很清楚，spine 真的長出來了。'],
        ['跨章節連結', '看到 Topic A 就想到 Topic B 的相關處——關聯網絡形成。'],
        ['深層理解', '不只記答案，能講出機制；皮層 L5 pyramidal 全開。'],
        ['跨科綜合', 'Multi-modal integration——sensory + cognitive 同步。'],
        ['長期 LTP', '半年後概念仍清晰可用——synaptic consolidation。'],
        ['教學能力', '能把學會的東西教給學弟妹，Cajal-Retzius 級的開創性整合。'],
        ['Hebbian 大師', '看一次就能整合到既有知識網——neurons that fire together truly wire together。'],
      ]),
    },
    {
      // reflex slot = DA / 動機 branch
      statKey: 'reflex',
      nodes: nodes('da', [
        ['好奇心 I', '看到新章節就忍不住打開——VTA 的興奮波擴散。'],
        ['獎賞迴路', '答對題目時感受到的小煙火，腦內 reward circuit 點亮。'],
        ['動機保溫', '即使疲累也願意繼續，多巴胺水位穩定。'],
        ['尋找新刺激', '舊內容讀膩會主動找新章節——novelty seeking。'],
        ['長期動機', '半年計畫不退燒，SNc 跟 VTA 雙重支援。'],
        ['抗倦怠', '連續高負荷學習仍維持興趣，避免 burnout。'],
        ['成就感累積', '完成任務後的滿足感能維持到隔天。'],
        ['深層投入', '一坐下就能進入心流，多巴胺與專注並進。'],
        ['追求精通', '對知識本身著迷，不只為了考試分數。'],
      ]),
    },
    {
      // memory slot = GABA / 專注 branch
      statKey: 'memory',
      nodes: nodes('gaba', [
        ['專注初階 I', '能屏蔽外界雜訊 30 分鐘——cortical inhibition 開始運作。'],
        ['過濾干擾', 'PV+ interneuron 風格的快速抑制，無關訊息進不來。'],
        ['節奏控制', '答題不躁進——gamma oscillation 校準時機。'],
        ['深度專注', '一坐下就能投入 60 分鐘，不被手機奪走。'],
        ['錯誤抑制', '看到熟悉陷阱題能立刻識別並排除。'],
        ['長期靜心', 'Striatal MSN 等級的選擇性過濾，雜訊全擋下。'],
        ['結構化思考', '心智地圖清晰，每個概念都有自己的位置。'],
        ['冥想級專注', '達到 Purkinje 級精細抑制，不被衝動帶偏。'],
        ['抗 NMDA 平衡', '興奮抑制平衡到位——Sentry Under Siege 守住內外。'],
      ]),
    },
    {
      // stamina slot = 5-HT / 耐力 branch
      statKey: 'stamina',
      nodes: nodes('5ht', [
        ['情緒平穩 I', '低潮時不放棄、高峰時不浮躁——raphe 維穩。'],
        ['耐力進階', '長時間閱讀仍能撐住，5-HT 穩定情緒能量。'],
        ['壓力緩衝', '考試前不慌張，DRN 跟 enteric 5-HT 雙線供給。'],
        ['睡眠週期', '規律作息提升 5-HT → melatonin 循環，記憶整合更好。'],
        ['長期穩定', '面對挫折時恢復力強——serotonergic resilience。'],
        ['情緒覺察', '能辨識自己的焦慮源頭，不被無名情緒帶走。'],
        ['社交支持', '懂得在學習群組中互助——5-HT/oxytocin 社交線。'],
        ['抗焦慮', '高壓場合心跳不過速，腸腦軸線穩定。'],
        ['內在平靜', '完整接納學習過程的起伏。'],
      ]),
    },
  ],
}
