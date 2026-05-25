## Context

`add-neurons-mode-scaffold` 在 `track-neurons` branch 立起 2 package + 1 app 空骨架。`neurons-mode` umbrella capability spec 已 archive 並 lock 以下決策：

1. 4 個 NT stat schema：`da` / `5ht` / `gaba` / `glu`（umbrella spec Requirement 2）
2. Linnean phylogenetic taxonomy 視覺路線、**禁止 brain anatomy** 視覺（umbrella spec Requirement 3）
3. 跨 app 資料完全獨立（umbrella spec Requirement 4）
4. 借鏡 二階 4 個 capability 但建立獨立 neurons-* spec（umbrella spec Requirement 5）

本 change 填內容（不引入新 capability），對標 `2026-05-15-ingest-medexam2-tw-corpus` 跟 `wire-hospital-tycoon-engine` 的 cadence。

題庫複用策略：medexam-tw 既有 `apps/medexam-tw/public/content/medexam-tw/questions.json` 已有 ~3505 題、subject id 已 lock；neurons-tw 100% 複用此題庫（**subject id 不變**，僅 displayName 改名）以保證 `question.subject` reference 解析正確。

## Goals / Non-Goals

**Goals:**

- Lock 10 個 一階 subject → 10 個 neuron family 的對映表 + 4 NT branch 分配，每條對映附 ≥ 1 個 PubMed 文獻佐證
- Build 一個可運行的 content + theme pipeline：跑完 build 後，`apps/neurons-tw` 能載入完整題庫並顯示 10 個 neuron family + 4 NT branch labels + 4 NT stat 鍵
- 兌現 `neurons-mode` umbrella capability 的 Requirements 2 + 3 + 4（4 NT stat schema delivery / Linnean taxonomy 結構 / 跨 app package isolation）
- 為後續 `add-connectome-collection` 提供完整的 family / NT / 屬性 metadata 基礎

**Non-Goals:**

- **不**畫任何 sprite asset（catalog 條目存在但 artKey 全指向 transparent PNG，留給 `generate-neurons-sprites`）
- **不**實作 connectome 視覺（譜系樹本身的 SVG / Canvas 渲染 → `add-connectome-collection`）
- **不**接 game event triggers（answer correct → stat increment、reading → DA increment 等 → `add-connectome-collection`）
- **不**做 variant gacha / mastery / leaderboard / achievement（各自獨立 changes）
- **不**設定 deploy（CF Pages / OAuth allowlist → `add-neurons-deploy`）
- **不**支援 medexam-tw save 匯入（per umbrella spec Requirement 4）

## Decisions

### Decision 1: 11 個 一階 科目 ↔ Neuron Family ↔ NT Branch ↔ Persona 對映表

**設計哲學**：對標 Inside Out（腦筋急轉彎）的擬人化設計 — 每個 neuron family 是一個有清楚「人設」的角色（Persona + 視覺 vibe），玩家想收集就像看 Pokemon 圖鑑想收集每隻怪物。**科目 ↔ neuron 連結允許 thematic 靈活**（不強求學術嚴謹），但 **neuron 本身的 NT 識別 / 解剖位置 / 功能必須科學嚴謹**（每條附 PubMed 文獻 anchor）。

**Choice**: 採用 11-subject 框架（split 微生物暨免疫學 → 微生物學 + 免疫學，使每 subject 獨立享有專屬 persona）；分布 DA 2 / 5-HT 2 / GABA 3 / Glu 4 = 11。實際 medexam-tw 沒有「醫學倫理」subject，醫學二 也沒有 single subject「微生物」or「免疫」（原本 merged 為「微生物暨免疫學」）— 本 change 利用源 markdown per-Q `**科目**：` tag 重新 split（見 Decision 4 build pipeline）。

| 一階 Subject ID（actual）| Q count | Neuron Family | NT Branch | Persona | 視覺 vibe（sprite gen 用）| 神經科學 anchor |
|---|---|---|---|---|---|---|
| `藥理學` | 418 | VTA Dopaminergic Neuron | **DA** | **The Thrill-Seeker 尋樂者** | 興奮笑臉、亮黃跳動、嘴邊冒小泡泡 | PMID [23578393](https://pubmed.ncbi.nlm.nih.gov/23578393/) — Lammel 2014 Neuropharmacology |
| `公共衛生學` | 237 | Substantia Nigra Pars Compacta DA Neuron | **DA** | **The Aging Guardian 長者守護** | 鬚白慈眉、神情堅毅、緩緩淡出 outline（暗示退化） | PMID [32674367](https://pubmed.ncbi.nlm.nih.gov/32674367/) — Pajares 2020 Cells（PD = SNc DA neuron death） |
| `寄生蟲學` | 101 | Enteric Serotonergic Neuron | **5-HT** | **The Puppeteer's Puppet 寄生木偶** | 圓肚子紅色 enteric 細胞、身上有微弱提線、眼神呆滯帶笑、背後浮現 Toxoplasma tachyzoite 小影子（mind-control 寄生蟲）| PMID [33493503](https://pubmed.ncbi.nlm.nih.gov/33493503/) — Margolis 2021 Gastroenterology + PMID [25530081](https://pubmed.ncbi.nlm.nih.gov/25530081/) — Parlog 2015 Parasite Immunol（T. gondii 自編碼 tyrosine hydroxylase 劫持 DA / 5-HT）+ PMID [38895868](https://pubmed.ncbi.nlm.nih.gov/38895868/) — Kazemi Arababadi 2024 Parasite Immunol |
| `組織學` | 160 | **Median Raphe (MRN) Serotonergic Neuron** | **5-HT** | **The Quiet Curator 沉默策展人** | 紅紫色低調樣態、手拿放大鏡與染色玻片（暗示組織切片）、有條不紊整理周邊細胞排列 | PMID [3323265](https://pubmed.ncbi.nlm.nih.gov/3323265/) — Molliver 1987 J Clin Psychopharmacol（MRN serotonergic projections to hippocampus / septum，5-HT 系統解剖 anchor）|
| `生物化學` | 445 | Cerebellar Purkinje Cell | **GABA** | **The Mathematician 數學家** | 巨大對稱樹突、方框眼鏡、藍、手拿尺與算盤 | PMID [9364613](https://pubmed.ncbi.nlm.nih.gov/9364613/) — Sastry 1997 Prog Neurobiol（Purkinje→DCN GABAergic transmission）+ PMID [8940630](https://pubmed.ncbi.nlm.nih.gov/8940630/) — Kaldis 1996 Dev Neurosci（creatine kinase 高代謝需求）|
| `病理學` | 421 | Striatal Medium Spiny Neuron | **GABA** | **The Judge 法官** | 法官小錘、嚴肅、深藍法袍 | PMID [22441874](https://pubmed.ncbi.nlm.nih.gov/22441874/) — Ehrlich 2012 Neurotherapeutics（MSN cell-autonomous mechanisms in Huntington's）|
| **`免疫學`** (split from `微生物暨免疫學`) | ~196 | Parvalbumin+ Cortical Interneuron | **GABA** | **The Sentry Under Siege 圍城警衛** | 藍色 PV+ 細胞被無數 Y 字形小箭頭（IgG 抗體）包圍但仍堅守崗位、戴頭盔的軍人風、緊握長矛 | PMID [25000913](https://pubmed.ncbi.nlm.nih.gov/25000913/) — Steullet 2016 Schizophr Res（PV+ neuroinflammation hub）+ PMID [29490181](https://pubmed.ncbi.nlm.nih.gov/29490181/) — Dalmau 2018 NEJM（anti-NMDAR encephalitis = "Brain on Fire" 自體免疫攻擊神經元）+ PMID [35273081](https://pubmed.ncbi.nlm.nih.gov/35273081/) — Andrzejak 2022 J Neurosci（anti-NMDAR ab preferentially attacks GABAergic interneurons）|
| `解剖學` | 517 | DRG Sensory Afferent Neuron | **Glu** | **The Scout 探險家** | 探險帽、地圖筒、長鬚（觸覺）、綠 | Kandel 6e Ch 22-23（DRG glutamatergic central terminals，textbook canonical）|
| `生理學` | 449 | Cortical Pyramidal Neuron Layer 5 | **Glu** | **The CEO 執行長** | 三角形 soma（pyramidal!）、領帶、綠、發號施令 | Kandel 6e Ch 7-9（L5 pyramidal canonical Glu principal neuron，textbook）|
| `胚胎學` | 82 | **Cajal-Retzius Neuron** | **Glu** | **The Pioneer Architect 拓荒建築師** | 綠色細胞拿藍圖與工具、身體微微透明（暗示 postnatal 多數退場）、釋出 Reelin 分子粒子組織皮層層次 | PMID [31022460](https://pubmed.ncbi.nlm.nih.gov/31022460/) — Armstrong 2019 Int J Biochem Cell Biol（Reelin in CNS development，Cajal-Retzius 為皮層 lamination 開創者）|
| **`微生物學`** (split from `微生物暨免疫學`) | ~279 | Olfactory Sensory Neuron | **Glu** | **The Sentinel 哨兵（前線守門員）** | 綠色 OSN 細胞、大鼻子敏銳、警覺豎耳、四周圍繞多種小病原怪獸（病毒 / 阿米巴）試圖鑽過 cribriform plate 入侵 | PMID [16733331](https://pubmed.ncbi.nlm.nih.gov/16733331/) — Rawson 2006 Adv Otorhinolaryngol（OSN → glutamate → mitral cells）+ PMID [37733240](https://pubmed.ncbi.nlm.nih.gov/37733240/) — Tsukahara 2023 Physiol Rev（SARS-CoV-2 anosmia mechanism）+ PMID [25404245](https://pubmed.ncbi.nlm.nih.gov/25404245/) — van Riel 2015 J Pathol（olfactory nerve as shortcut for influenza / HSV-1 / rabies / polio / Naegleria）|

**Why this distribution**: 11 subjects 分配到 4 NT branch 沒有「完美對稱」拆法。2/2/3/4 是接受 Glu 略多的取捨 — 每個 family 都有獨立的 textbook canonical 故事（DRG / Pyramidal L5 / Cajal-Retzius / Olfactory Sensory），不為了均衡犧牲 persona 強度。每個 family 是真實有名的細胞（C. elegans 302-neuron literal 不選 — 線蟲跟人類醫學脫鉤）。

**Persona design rationale**：
- 每 Persona 一句話 archetype + 鮮明視覺 vibe → sprite gen 階段直接可用作為 prompt 的 character description
- Inside Out 風人格 → 玩家看每隻 neuron 像看 Pokemon（想收集 / 想養 / 解鎖 P1-P5 變體想看每個變體有啥不同人格細節）
- 4 NT branch palette 提供「家族共同視覺基調」（DA 黃 / 5-HT 紅 / GABA 藍 / Glu 綠），同 branch family 視覺上有家族感
- **4 個 personas 由 OpenEvidence 臨床文獻查詢過程升級**（2026-05-25），故事 hook 從原本的「生物背景」升級為「教科書級臨床戲劇」：
  - 寄生蟲 → Toxoplasma gondii 編碼自己的酪胺酸羥化酶直接劫持宿主 DA 路徑（最戲劇化的「寄生蟲操控宿主行為」分子機制）
  - 免疫 → anti-NMDAR encephalitis（"Brain on Fire" 真實案例）—自體免疫 IgG 攻擊 NMDA receptor，preferentially 攻擊 PV+ inhibitory neuron，造成 cortical disinhibition + 精神症狀
  - 倫理 → DRN 5-HT 透過 SSRI 增加 harm aversion 的分子機制（Crockett 2010 PNAS）+ vmPFC 為 moral integration hub（Phineas Gage classic）
  - 微生物 → Multi-pathogen olfactory nerve 入侵清單（COVID-19 / HSV-1 / Rabies / Polio / Naegleria fowleri 都用同一條 cribriform plate 通路）

**Alternative considered**:
- 走「嚴格學術對映」（subject ↔ neuron 必須有教科書直接連結）— **拒絕**：限制太多、無趣（per user feedback 2026-05-25）
- 走 brain region anatomy（cortex / hippocampus / amygdala）— **拒絕**：被 umbrella spec Requirement 3 明確排除
- 走 ACh 第 5 NT — **拒絕**：4 個 stat schema 已 lock 在 umbrella spec
- 公衛 → TIDA Dopaminergic（先前 draft）— **被取代為 SNc DA**：SNc 連結神經退化族群健康更強、persona「Aging Guardian」更具感染力、PubMed citation 更直接
- 免疫 → Microglia / Astrocyte — **拒絕**：glia 不是 neuron（umbrella spec 鎖在 neuron）
- 10-subject 框架（醫學倫理 + 微生物暨免疫學合併）— **被取代為 11-subject**：實際 medexam-tw 沒有醫學倫理；微生物暨免疫學 split 後讓每 subject 享有獨立 persona，且源 markdown 已有 per-Q `**科目**：` tag 可精準 split（per user feedback 2026-05-25 + source file inspection）
- 醫學倫理 → DRN Moral Compass persona — **被取代為 MRN Quiet Curator persona（給組織學）**：醫學倫理 subject 在 medexam-tw 不存在；DRN 5-HT 是 mood 系統 canonical，但 5-HT 槽位讓給 MRN 對組織學（neural tissue organization）更貼合。Moral Compass persona 待未來若 medexam-tw 加入醫學倫理 subject 再啟用

**Spot-check**：apply 階段 task 10.1 由 owner 對照神經科學教科書（Kandel 6e）+ 抽閱 design.md citation；若 owner 對任何 persona / 視覺 vibe 命名不滿意，subject `displayName` 是純文字（不影響 subject id），改起來只動 `subjects.json` 一行 + DESIGN.md 一行。Persona 名稱與視覺 vibe 主要影響 sprite gen 階段的 prompt（codex / Gemini），命名調整後可重新 batch 生成。

### Decision 2: Subject id 與 medexam-tw 對映規則 — 1-to-1 直送 + 1-to-N split (微生物暨免疫學)

**Choice**: `content-neurons-tw` 的 `subjects.json` 採用「**多對一映射 + 一對多 split**」規則：
- **9 subjects 直送（1-to-1）**：`藥理學` / `公共衛生學` / `寄生蟲學` / `組織學` / `生物化學` / `病理學` / `解剖學` / `生理學` / `胚胎學` — id 跟 medexam-tw 完全相同，只改 `displayName`
- **1 subject split（1-to-2）**：`微生物暨免疫學` → `微生物學` + `免疫學`（neurons-tw 兩個 subject id，皆衍生自 medexam-tw 同一個 id），split 依據 source markdown per-Q `**科目**：` tag

**Why**:
- 9 subjects 1-to-1 直送：保持題庫 reference 100% 對齊（per cross-app integrity invariant）
- 微生物暨免疫學 split：實際 一階 國考 教材在這個 subject 內，每題有 per-Q `**科目**：` tag 明確標示 `免疫` / `微生物` / `微免`（cross-domain）/ `細菌` / `病毒` / `黴菌` 等子分類，可以精準重新分類為 2 個獨立 subject，無學術爭議。每 subject 享有獨立 persona（PV+ Sentry / Olfactory Sentinel）比合併更有遊戲感
- 每題仍恰好 resolve 到唯一一個 neurons-tw subject id（無多重 reference / 無 orphan question）
- Build script 必須 assert 此 invariant：medexam-tw 的每題 subject 套用 mapping 後必須對應到 neurons-tw 的 subjects[] 中有效 id

**Alternative considered**:
- 改 subject id 為 kebab-case English（`'pharmacology'` 等）— **拒絕**：需同步改 medexam-tw 題庫 build script 或在 neurons-tw build 加 id mapping，徒增複雜度
- 不 split 微生物暨免疫學 — **拒絕**：合併 persona 故事壓抑（per user feedback 2026-05-25）；split 後神經學 anchor 更乾淨（PV+ for 免疫、OSN for 微生物）
- 修改 medexam-tw 源 markdown 預先 split（10 subjects → 11 subjects 在 medexam-tw 也生效）— **拒絕**：違反「medexam-tw 進入 maintenance mode、不接新 feature」承諾（per umbrella spec Requirement 6）；split 是 neurons-tw 的 product decision，不該污染 medexam-tw

### Decision 3: 4 NT Stat Schema — keys 對齊 core default + labels/colors 走 NT 風格

**Choice**: `ContentPackMeta.statSchema` 保留 core 的 default 4 stat keys（`knowledge` / `reflex` / `memory` / `stamina`）但**覆蓋 labels + colors 為 4 NT 風格**：

```ts
statSchema: {
  order: ['knowledge', 'reflex', 'memory', 'stamina'],
  labels: {
    knowledge: 'Glutamate 麩胺酸 (學習)',
    reflex:    'Dopamine 多巴胺 (動機)',
    memory:    'GABA γ-胺基丁酸 (專注)',
    stamina:   'Serotonin 血清素 (耐力)',
  },
  colors: {
    knowledge: 'var(--nt-glu)',   // 綠
    reflex:    'var(--nt-da)',    // 黃
    memory:    'var(--nt-gaba)',  // 藍
    stamina:   'var(--nt-5ht)',   // 紅
  },
}
```

**Why keys 不直接用 `'da' / '5ht' / 'gaba' / 'glu'`**：core 的 `SkillBranchStatKey` 型別是 hardcoded `'knowledge' | 'reflex' | 'memory' | 'stamina'`（見 `packages/core/src/lib/skillTree.ts:21`），skill tree branches 的 `statKey` 必須是這 4 個值之一。若 statSchema keys 改為 NT 名（da/5ht/gaba/glu），`player.stats['da']` 跟 `branch.statKey = 'knowledge'` 不同 key，skill tree 永遠無法解鎖。

兩種解法：
- (A) **預留 default keys + 覆蓋 labels**（本 change 採用）— player.stats[knowledge] 增量 → branch[knowledge] 解鎖 → label 顯示「Glutamate 麩胺酸 (學習)」。玩家看到 NT 命名、引擎內部不打破。
- (B) **修 core 把 SkillBranchStatKey 改 generic** — breaking change，需 minor version bump，影響三 fork。延後到單獨 change 處理。

採 (A) 的 trade-off：
- 內部 stat key 與顯示名不一致（developer 看 code 看到 `knowledge`，玩家看到「麩胺酸」）— 接受
- 未來若 medical theme 跟 neurons theme 在同 codebase 共存，stat key 一樣但顯示不同（content statSchema 決定）— 自然
- skill tree 不需特別處理 — 默認跑通

**NT ↔ Default key 對映**（design rationale）：
- `knowledge` ↔ Glu (學習 / LTP) — 「知識」軸 = 學習軸 = Glu 主導
- `reflex` ↔ DA (動機 / 反應 / reward) — 「反應」軸 = 反應快 = 多巴胺驅動
- `memory` ↔ GABA (專注 / 控制 / 抑制) — 「記憶」軸 = 專注力 + 篩選 = GABA 抑制控制
- `stamina` ↔ 5-HT (耐力 / 情緒 / mood) — 「耐力」軸 = 情緒穩定 = 血清素

**Game event trigger 對映**（描述性 only — 實際接 event 在 `add-connectome-collection`）：

| Event | Stat increment（key） | Why（NT 對應）|
|---|---|---|
| Reading session 完成 1 分鐘 | `reflex += 1` | DA 主導 motivation / reward / 開機反應 |
| 連續 5 天 streak 維持 | `stamina += 1` | 5-HT 主導耐力 / 情緒穩定 |
| Quiz 答題 accuracy ≥ 80% 在 timed run | `memory += 1` | GABA 主導抑制 / 專注 |
| 第一次答對 first-seen question（非 SRS 複習）| `knowledge += 1` | Glu 主導 LTP / 新學習 |

每分鐘最多累加 1（per umbrella spec 防刷 invariant，沿用 medexam-tw 既有 idle pause 邏輯）。

**Alternative considered**: 直接用 NT keys（如 `'da'`）— **拒絕**：與 core SkillBranchStatKey 型別衝突，需改 engine API（breaking）。

**Game event trigger 對映**（描述性 only — 實際接 event 在 `add-connectome-collection`）：

| Event | Stat increment |
|---|---|
| Reading session 完成 1 分鐘 | `da += 1`（DA 主導 motivation / reward）|
| 連續 5 天 streak 維持 | `5ht += 1`（5-HT 主導耐力 / 情緒穩定）|
| Quiz 答題 accuracy ≥ 80% 在 timed run | `gaba += 1`（GABA 主導抑制 / 專注）|
| 第一次答對 first-seen question（非 SRS 複習）| `glu += 1`（Glu 主導 LTP / 新學習）|

每分鐘最多累加 1（per umbrella spec 防刷 invariant，沿用 medexam-tw 既有 idle pause 邏輯）。

**Why**：4 NT 各自有不同 game-event 來源，避免單一行為刷滿所有屬性。Mapping 對齊真實神經科學 NT 功能（DA = reward、5-HT = mood、GABA = inhibition、Glu = learning）。

### Decision 4: Build pipeline — copy 9 subjects verbatim + re-split 微生物暨免疫學 from source markdown

**Choice**: `content-neurons-tw` 的 `scripts/build.ts` 採用混合策略：

1. **9 subjects 直送**：讀 `apps/medexam-tw/public/content/medexam-tw/questions.json`，對 `question.subject !== '微生物暨免疫學'` 的題目**完全 verbatim copy** 到 `dist/questions.json`（subject id 不動）
2. **微生物暨免疫學 re-split**：對 `question.subject === '微生物暨免疫學'` 的題目，從源 markdown `$MEDEXAM_SOURCE_ROOT/醫學二/微生物暨免疫學/*.md` 重新讀取每題的 `**科目**：<tag>` 行（不在 YAML frontmatter，在 Q block body）
3. **Split heuristic**（per Decision 1 footnote）：
   ```
   if tag matches /免疫|microimmune|微免/ → subject = '免疫學'
   else if tag matches /微生物|細菌|病毒|黴菌/ → subject = '微生物學'
   else (untagged / typo) → subject = '微生物學'（default）
   ```
4. **Output**：`dist/subjects.json` 11 entries（9 直送 + 微生物學 + 免疫學）、`dist/questions.json`（subject 已 re-classified）、`dist/meta.json`（加 statSchema + credits + builtAt）

**Why**:
- 不直接 verbatim copy medexam-tw `questions.json` — 因 split 需要修改部分題目的 `subject` 欄位
- 不修改 medexam-tw 源碼 — 維持 medexam-tw 進入 maintenance mode 的承諾
- 源 markdown per-Q `**科目**：` tag 已存在 + 經 owner inspection 確認（351/476 tagged + clear 路由規則），無需 LLM keyword guessing
- Symlink 不採用：Vite static asset pipeline 對 symlink 處理不一致（Windows / Linux / macOS）、pnpm workspace + npm publish 不友善
- ~250 KB 包體積 trivial（比較 1.2 MB 總）
- Build assertion 確保：(a) medexam-tw 每題都成功分類到 11 個 neurons-tw subjects 之一；(b) 無 orphan question；(c) 11 個 subject id 都有非零 totalQuestions

**Env vars**:
- `MEDEXAM_TW_DIST`（default: `apps/medexam-tw/public/content/medexam-tw`）— medexam-tw build output 路徑
- `MEDEXAM_SOURCE_ROOT`（default: `~/Desktop/國考/一階國考/陽明國考考古/_extracted`）— 源 markdown 路徑（與 medexam-tw build 一致）
- `MEDEXAM_ALLOW_SKIPS`（default: 0）— 若為 1，允許未標籤題目走 default 路由不報錯

**Alternative considered**:
- Symlink — 拒絕，跨平台 Vite 不一致
- 直接從 `packages/content-medexam-tw/dist/questions.json` 來源（更上游）— 可行但 medexam-tw build artifact 仍要先存在；wire prebuild dependency 較繁瑣。先用 app public/ 路徑作 source（owner 既有 build pipeline 已落地），下游 refactor 再優化
- LLM keyword classification（不用源 tag，用 question stem keyword 分類 微免）— **拒絕**：tag 已是 human-curated gold standard，比 keyword 準確

### Decision 5: Theme catalog 結構 — 沿用 medical theme 命名慣例 + 神經元語彙

**Choice**:

- **CSS vars**（`packages/theme-pixel-neurons/src/index.ts cssVars`）：
  ```
  --nt-da: #d4a04d              --synapse-dormant: #5a3f29(50%)
  --nt-5ht: #c44d4d             --synapse-forming: #6a9bc4
  --nt-gaba: #6a9bc4            --synapse-potentiated: #d4a04d
  --nt-glu: #6a8c3f             --synapse-mastered: #6a8c3f + glow
  
  --rarity-n: #ffffff           --bg-cream: #f4ecd8
  --rarity-r: #6a9bc4           --bg-dark: #2d1f1a
  --rarity-sr: #a06ac4          --ink: #1a1410
  --rarity-ssr: #d4a04d         --frame-cell-light: #8c6d4a
  --rarity-ur: #c44d4d          --frame-cell-dark: #5a3f29
  ```
  Rarity / bg / frame palette 沿用 medical theme（已驗證的 GBA-era 風格），只換主色軸（4 stat 醫療 → 4 NT 神經元）。

- **`itemCatalog`**（`packages/theme-pixel-neurons/src/items.ts`）：~20 個 ion channel + receptor + neurotransmitter molecule，分散 5 個 rarity（N / R / SR / SSR / UR），artKey 用 `ion-<id>` / `receptor-<id>` / `nt-<id>` 命名約定。具體 20 項在 tasks.md 列舉。

- **`COSMETIC_CATALOG`**（`packages/theme-pixel-neurons/src/cosmetics.ts`）：~20 個 cosmetic 分 5 個 category：
  - `soma-shape`：4 個（star / round / pyramidal / spindle）
  - `dendrite-pattern`：4 個（sparse / dense / fan / fractal）
  - `myelin-color`：4 個（fast / slow / glow / minimal）
  - `axon-decoration`：4 個（standard / branched / collateral / boutons）
  - `synapse-vesicle-color`：4 個（DA-yellow / 5HT-red / GABA-blue / Glu-green）
  
  cosmetic unlock conditions 沿用 medical theme 的 milestone-based predicate 模式（per `cosmetic-system` capability）：例 `gaba >= 10`、`firstSynapse >= 1`、`dailyStreak >= 14`。

- **`SKILL_TREE_PIXEL_NEURONS`**（`packages/theme-pixel-neurons/src/skillTree.ts`）：4 NT branch × 9 node = 36 nodes。每 branch 的 9 nodes 命名為「<NT>-<aspect>-<level>」例 `da-reward-1`、`gaba-tonic-3`、`glu-ltp-9`。詳細命名 list 在 tasks.md。

**Why**: 結構對齊既有 ThemePack pattern，name 重新命名為神經元語彙。後續 sprite gen 階段以本 catalog 為 input。

**Alternative considered**: 不寫 itemCatalog（等 generate-neurons-sprites 階段補）— **拒絕**：item catalog 是 ThemePack contract 要求項目 + cosmetic unlock predicate 需要 catalog 才能判定。先 fill structure（artKey 指 placeholder）即可。

### Decision 6: 不新增 capability spec — 本 change 兌現既有 neurons-mode requirement

**Choice**: 不開新 capability spec。本 change 內容（subject rename + statSchema + theme catalog）都已被 `neurons-mode` umbrella spec 的 Requirement 2（4 NT stat schema）+ Requirement 3（Linnean taxonomy）+ Requirement 4（cross-app isolation）涵蓋。

**Why**:
- umbrella spec 是 capability-level contract，本 change 是 implementation；OpenSpec 慣例：implementation change 不重複 spec 既有 requirement
- 若本 change 引入「神經科學文獻引用必須長期維護」這類新 invariant，那才需新 spec。但對映表的 plausibility 是 design-time 決策、非 runtime contract。
- 對標 二階 fork：`wire-hospital-tycoon-engine` 也是「填 hospital-management-mode 的 implementation」，沒開新 capability spec

**Alternative considered**: 開 `neurons-content-pack` 細描繪每條對映 — **拒絕**：對映表是 design-time 鎖定的設定值，不需 spec-level normative contract。

## Risks / Trade-offs

- **[11 條對映命名爭議]** → 部分玩家 / reviewer 可能認為某條對映牽強（如 組織→MRN 偏冷門）→ mitigate: 每條附 PubMed 文獻 + design.md 明列「subject displayName 可在 apply 階段彈性調整、不涉及 spec / id 改動」
- **[微生物暨免疫學 split heuristic 邊角]** → ~95 題 `微免` cross-domain tag 路由到 `免疫學`、~125 題未標籤 fallback 到 `微生物學`；split 結果 ~279 / ~196 平衡，但少數題目可能被路錯 → mitigate: build script 印 split 細節（每題 tag → 路由），apply 階段 owner 可抽查若干隨機題目確認；錯誤路由不影響核心遊戲體驗（題目仍能正常出，僅歸類略偏）
- **[題庫共用導致 medexam-tw build 變必要]** → neurons-tw build 依賴 medexam-tw 已 build → mitigate: `content-neurons-tw/scripts/build.ts` 加 prerequisite check（檔案不存在則報錯 + 提示先跑 `pnpm build:content`）；長期 refactor 為直接從 `packages/content-medexam-tw/dist/` 來源（更上游）
- **[Cosmetic catalog 5 categories × 4 entries 視覺 placeholder]** → dev mode 看到 ~20 個 cosmetic 全是 transparent PNG，看起來空白 → mitigate: catalog 仍要 ship（test 真實 unlock predicate 運作）；sprite 在 `generate-neurons-sprites` 階段補
- **[Stat schema 對映 game event triggers 與 medexam-tw 不同]** → reading 在 medexam-tw 加 `knowledge`，neurons-tw 改為加 `da`；玩家若同時玩兩 app 體感不同 → 接受（per umbrella spec Requirement 4 跨 app 獨立）
- **[NT 顏色與 medical theme 撞色]** → DA 黃 / 5-HT 紅 / GABA 藍 / Glu 綠 部分與 medical theme stat 顏色重合 → 接受（兩 theme 分屬不同 app，視覺 context 不混）
- **[Subject color 由 NT branch palette 派生]** → 多個 subject 共享同色（同 NT branch 的 family 同色）→ mitigate: subject card 加 family icon（sprite gen 階段）區分

## Migration Plan

1. **content-neurons-tw**：
   - 改寫 `src/index.ts` 為實際 fetch loader
   - 新增 `scripts/build.ts`：read medexam-tw questions.json → assert 題數 + subject id 一致 → 複製 + 生成新 subjects.json（rename displayName + group + color）+ 生成新 meta.json（加 statSchema + credits）
   - `package.json` 加 `"build": "tsx scripts/build.ts"`
   - 跑 `pnpm --filter @study-rpg/content-neurons-tw build` 產生 dist/
2. **theme-pixel-neurons**：
   - 大改 `src/index.ts`（補 cssVars / fonts / catalog wiring）
   - 新增 `src/items.ts` / `src/cosmetics.ts` / `src/skillTree.ts`
   - 擴充 `styles/global.css`（@font-face + base layout vars）
   - 擴充 `DESIGN.md`（palette / tree layout / synapse animation guidance）
3. **apps/neurons-tw**：
   - 改寫 `src/App.tsx` 接 content + theme + 顯示家族 list + 屬性 labels（純 read-only 驗證 wiring）
   - `package.json` 加 prebuild hook：先跑 `@study-rpg/content-neurons-tw` build → copy `dist/*.json` 到 `apps/neurons-tw/public/content/neurons-tw/`
   - `vite.config.ts` 若需要任何路徑配置調整一併處理
4. **根 `package.json`**：加 `build:neurons-content` script
5. **Smoke verify**：
   - `pnpm -r typecheck` 全綠
   - `pnpm --filter @study-rpg/content-neurons-tw build` 產生 3 個 dist JSON 檔
   - `pnpm --filter @study-rpg/neurons-tw dev` 啟動 → Chrome MCP 驗證主畫面 render 10 family + 4 NT labels + 4 stat keys + 題目總數
   - 一階 / 二階 regression check
6. **Pre-archive review**：
   - 對映表 10 條由 owner 抽閱
   - openspec validate passes
   - file size review

**Rollback**: 本 change 純內容填充，無資料庫遷移 / 無 production write。回退方式：`git revert` apply commit + 把 content-neurons-tw / theme-pixel-neurons / apps/neurons-tw 三個資料夾 reset 回 scaffold 狀態。

## Open Questions

- **5-HT object key '5ht' 數字開頭**：部分舊 ES5 環境解析 object key 可能 issue（現代 ES2022 OK）。若 typecheck 有警告再改成 `'serotonin'` 或 `'fiveht'`。先用 `'5ht'`（最符合科學慣例）。
- **Persona 中文命名語感**：10 條 Inside Out 風格 persona（尋樂者 / 長者守護 / 哲學家 / 直覺派 / 數學家 / 法官 / 警衛 / 探險家 / 執行長 / 哨兵）由 owner 在 task 10.1 review；若某 persona 中文不順可調整（純文字、無 code impact）。視覺 vibe 細節（顏色 / 飾品 / 姿勢）會在 `generate-neurons-sprites` 階段透過 sprite prompt 進一步定義。
- **DRN 醫學倫理連結**：DRN serotonergic 系統調控 mood + decision modulation 是 Kandel canonical；moral decision making 在當代 cognitive neuroscience / neuroethics 文獻有 fMRI 證據（vmPFC / DRN interaction），但這條對映本質是 thematic vibe（哲學家氣質）非學術硬連結。Persona 概念已正式採用，本對映無爭議。
- **`COSMETIC_CATALOG` 的 20 個條目 unlock predicate**：design 階段先寫 generic threshold（例 `glu >= 5`）；具體閾值需在 apply 階段對照 一階 deploy telemetry 評估合理性（owner 自己 dogfood 時調整）。
- **Build pipeline 對 medexam-tw 依賴的長期重構**：本 change 先用 app public/ 路徑作 source（最快 ship）；下個 refactor change（或 `generate-neurons-sprites` 階段）改為從 `packages/content-medexam-tw/dist/` 來源（更乾淨）。
