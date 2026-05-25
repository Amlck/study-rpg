# theme-pixel-neurons — DESIGN

> Pixel-art theme pack for the neurons-themed reskin of `apps/medexam-tw` (M_3rd track / neurons-tw). 4 neurotransmitter branches × Linnean phylogenetic taxonomy × Inside Out-style personas.

## Core visual

**Two-layer connectome view** (wired in follow-up `add-connectome-collection`):

1. **Static layer — Linnean phylogenetic tree**
   - Root: the player's connectome
   - 4 main branches: DA / 5-HT / GABA / Glu
   - Each branch hosts 2–4 neuron family clusters (per `wire-neurons-content-and-theme` design Decision 1 mapping)
   - Each family node displays its collected variants (P1–P5 rarity, wired in `wire-neuron-variant-gacha`)

2. **Dynamic overlay — Hebbian synapses**
   - Cross-cluster co-firing forms wires (dotted → solid → glowing as LTP progresses)
   - Idle decay returns wires to dotted (LTD), never severs them (per `neurons-mode` umbrella Requirement 1)

```
       (root: player connectome)
        /      |      |       \
       DA    5-HT   GABA      Glu
      / \    / \    /|\      /|\ \
    家族  家族 家族 家族  3 families  4 families
```

## Palette (CSS vars)

| Token | Hex | Use |
|---|---|---|
| `--nt-da` | `#d4a04d` | 多巴胺 — 亮黃 / 金 (reward / motivation) |
| `--nt-5ht` | `#c44d4d` | 血清素 — 紅 / 珊瑚 (mood / endurance) |
| `--nt-gaba` | `#6a9bc4` | GABA — 藍 / 青 (inhibition / focus) |
| `--nt-glu` | `#6a8c3f` | 麩胺酸 — 綠 / 翠 (excitation / learning) |
| `--synapse-dormant` | `#5a3f29` | 灰褐虛線 |
| `--synapse-forming` | `#6a9bc4` | 藍虛線 |
| `--synapse-potentiated` | `#d4a04d` | 金實線 |
| `--synapse-mastered` | `#6a8c3f` | 綠 + glow |
| `--rarity-{n,r,sr,ssr,ur}` | white / blue / purple / gold / red | 沿用 medical theme convention |

## Sprite style anchor

- GBA-era pixel art, 384×384 px transparent PNG
- 16-color quantize (matches existing codex CLI batch pipeline; see `~/.claude/imports/codex_image_gen.md`)
- Cute / chibi style with small eyes on neuron soma — `想收集感` is the design goal
- Cosmetic sprites layer over `character-base` (soma) per `cosmetic-system` spec bbox compliance

## Cosmetic category mapping (neuron-specific repurposing of engine enum)

| Engine enum | Neuron semantics | Examples |
|---|---|---|
| `head` | Soma decorations | 軸丘 halo / pyramidal crown / Purkinje arbor / Cajal-Retzius blueprint |
| `body` | Dendrite patterns | Sparse / bushy / fractal / spine-gold |
| `accessory` | Myelin wraps along axon | Thin / banded / rainbow / saltatory aura |
| `held` | Axon terminal / synaptic vesicle | Clear / dense-core / glutamate glow / rainbow array |
| `background` | Connectome backdrop | Plain lab / connectome map / gamma oscillation / Hebbian firewall |

## Item catalog (20 items across 5 EquipSlot enum values)

| Slot | Semantics | Sample items |
|---|---|---|
| `head` | Input receptors | Glu receptor / AMPA / NMDA / GABA-B |
| `body` | Membrane ion channels | Na_v / K_v / Ca_v L-type / HCN |
| `weapon` | NT molecules (the "weapon" the neuron wields) | Dopamine / Serotonin / GABA / Glutamate |
| `charm` | Metabotropic receptors / accessory molecules | D2 / 5-HT 2A / M1 / mGluR1 |
| `consumable` | Transient modulators / temporary buffs | ATP / Glycine / BDNF / Reelin |

Rarity distribution: N=8 / R=6 / SR=4 / SSR=1 / UR=1 (mirrors medical theme).

## Skill tree (36 nodes = 4 NT × 9)

Branches advance along neurotransmitter pathway themes:

- `da` (Dopamine): 好奇心 → 獎賞迴路 → 動機保溫 → 尋找新刺激 → 長期動機 → 抗倦怠 → 成就感累積 → 深層投入 → 追求精通
- `5ht` (Serotonin): 情緒平穩 → 耐力進階 → 壓力緩衝 → 睡眠週期 → 長期穩定 → 情緒覺察 → 社交支持 → 抗焦慮 → 內在平靜
- `gaba` (GABA): 專注初階 → 過濾干擾 → 節奏控制 → 深度專注 → 錯誤抑制 → 長期靜心 → 結構化思考 → 冥想級專注 → 抗 NMDA 平衡
- `glu` (Glutamate): 基礎學習 → LTP 啟動 → 記憶鞏固 → 跨章節連結 → 深層理解 → 跨科綜合 → 長期 LTP → 教學能力 → Hebbian 大師

## Out of scope (this theme)

- Real sprite PNGs → `generate-neurons-sprites`
- Connectome SVG / Canvas rendering → `add-connectome-collection`
- Variant gacha visualization → `wire-neuron-variant-gacha`
- Achievement badge sprites → `add-neurons-achievements`
