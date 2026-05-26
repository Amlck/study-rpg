/**
 * Pure layout function for the connectome SVG Linnean phylogenetic tree.
 *
 * Two layout modes:
 *  - horizontal (≥ 768px viewport): root on the left, branches fanning right,
 *    leaves arrayed vertically on the right side
 *  - vertical (< 768px viewport): root at top, branches stacked, leaves cluster
 *    beneath their branch
 *
 * NT branches always rendered in canonical order: DA / 5HT / GABA / Glu.
 *
 * Spec: openspec/specs/connectome-collection/spec.md
 *   "Polished SVG Linnean phylogenetic tree SHALL render the connectome ..."
 * Design: openspec/changes/add-connectome-svg-tree/design.md (D2, D6)
 */

import type { Subject } from '@study-rpg/core'

export type LayoutMode = 'horizontal' | 'vertical'

export type NtBranch = 'DA' | '5HT' | 'GABA' | 'Glu'

export const NT_BRANCH_ORDER: readonly NtBranch[] = ['DA', '5HT', 'GABA', 'Glu'] as const

export const NT_BRANCH_COLOR: Record<NtBranch, string> = {
  DA: '#d4a04d',
  '5HT': '#c44d4d',
  GABA: '#6a9bc4',
  Glu: '#5c9b6b',
}

export const NT_BRANCH_LABEL: Record<NtBranch, string> = {
  DA: 'DA · 多巴胺',
  '5HT': '5-HT · 血清素',
  GABA: 'GABA · γ-胺基丁酸',
  Glu: 'Glu · 麩胺酸',
}

export interface Vec2 {
  x: number
  y: number
}

/**
 * Deterministic 32-bit FNV-1a hash of a string. Same input → same output across
 * renders, so jitter offsets stay stable per family (no flicker on re-render).
 */
function stringHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Return a pseudo-random value in [-1, 1] keyed off an id + axis token. Used to
 * jitter leaf / branch positions and connector control points so the tree looks
 * organic (asymmetric, dendritic) rather than a perfect dendrogram.
 */
function jitter(id: string, salt: string): number {
  const h = stringHash(`${id}|${salt}`)
  return ((h % 1000) / 500) - 1
}

/**
 * Generate `count` dendrite stub paths radiating from `center`, each a short
 * curved twig at a pseudo-random angle. The angles are spread around 360° so
 * the result reads as terminal arborization (rather than all pointing the
 * same direction).
 */
function dendriteStubs(center: Vec2, seed: string, count: number): string[] {
  const stubs: string[] = []
  for (let i = 0; i < count; i++) {
    const baseAngle = (i / count) * Math.PI * 2
    const angle = baseAngle + jitter(seed, `stub${i}-rot`) * 0.6
    const length = 18 + Math.abs(jitter(seed, `stub${i}-len`)) * 22
    const endX = center.x + Math.cos(angle) * length
    const endY = center.y + Math.sin(angle) * length
    // Control point perpendicular to the stub direction for a slight curve.
    const perpX = -Math.sin(angle)
    const perpY = Math.cos(angle)
    const curveAmp = jitter(seed, `stub${i}-curve`) * 10
    const midX = (center.x + endX) / 2 + perpX * curveAmp
    const midY = (center.y + endY) / 2 + perpY * curveAmp
    stubs.push(
      `M ${center.x.toFixed(2)},${center.y.toFixed(2)} Q ${midX.toFixed(2)},${midY.toFixed(2)} ${endX.toFixed(2)},${endY.toFixed(2)}`,
    )
  }
  return stubs
}

/**
 * Generate `count` axon collateral paths along an existing start→end trajectory.
 * Each collateral branches off the main axon at a t ∈ (0, 1) position and ends
 * in mid-air perpendicular to the main path direction — mimicking neuron axon
 * collaterals that branch off and project elsewhere.
 */
function axonCollaterals(start: Vec2, end: Vec2, seed: string, count: number): string[] {
  const collaterals: string[] = []
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  for (let i = 0; i < count; i++) {
    // Position along main axon; avoid both endpoints (where dendrite stubs already are).
    const t = 0.25 + (i / Math.max(count, 1)) * 0.5 + jitter(seed, `coll${i}-t`) * 0.08
    const baseX = start.x + dx * t
    const baseY = start.y + dy * t
    const sign = jitter(seed, `coll${i}-side`) >= 0 ? 1 : -1
    const reach = 26 + Math.abs(jitter(seed, `coll${i}-reach`)) * 26
    const endX = baseX + nx * reach * sign
    const endY = baseY + ny * reach * sign
    const curveAmp = jitter(seed, `coll${i}-curve`) * 14
    const midX = (baseX + endX) / 2 + (dx / len) * curveAmp
    const midY = (baseY + endY) / 2 + (dy / len) * curveAmp
    collaterals.push(
      `M ${baseX.toFixed(2)},${baseY.toFixed(2)} Q ${midX.toFixed(2)},${midY.toFixed(2)} ${endX.toFixed(2)},${endY.toFixed(2)}`,
    )
  }
  return collaterals
}

/**
 * Build a multi-segment cubic Bézier path between `start` and `end` that wiggles
 * through `segments` intermediate waypoints — each waypoint placed along the
 * rough straight-line trajectory but pushed off-axis by `wiggleAmp` units.
 *
 * Output uses two cubic Bézier commands per segment so control-point continuity
 * gives a smooth axon-like curve (not visible corners). The path looks like a
 * cortical neuron axon snaking from soma to target rather than a clean S-curve.
 */
function axonPath(
  start: Vec2,
  end: Vec2,
  seed: string,
  segments: number,
  wiggleAmp: number,
): string {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const len = Math.hypot(dx, dy) || 1
  // Unit normal perpendicular to the start→end direction
  const nx = -dy / len
  const ny = dx / len

  // Waypoint sequence: start, w1, w2, …, end. Each waypoint is on the line plus
  // a perpendicular offset (sign alternates so the path snakes side-to-side).
  const points: Vec2[] = [start]
  for (let i = 1; i <= segments; i++) {
    const t = i / (segments + 1)
    const sign = i % 2 === 0 ? 1 : -1
    const amp = wiggleAmp * (0.6 + 0.4 * Math.abs(jitter(seed, `amp${i}`)))
    points.push({
      x: start.x + dx * t + nx * amp * sign,
      y: start.y + dy * t + ny * amp * sign,
    })
  }
  points.push(end)

  // Render with one cubic Bézier per pair, with control points along the
  // tangent direction so consecutive segments meet smoothly.
  let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    // Tangent estimate at p0 and p1 — average of prev/next direction.
    const prev = points[i - 1] ?? p0
    const next = points[i + 2] ?? p1
    const t0x = (p1.x - prev.x) * 0.28
    const t0y = (p1.y - prev.y) * 0.28
    const t1x = (next.x - p0.x) * 0.28
    const t1y = (next.y - p0.y) * 0.28
    const c1x = p0.x + t0x
    const c1y = p0.y + t0y
    const c2x = p1.x - t1x
    const c2y = p1.y - t1y
    d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p1.x.toFixed(2)},${p1.y.toFixed(2)}`
  }
  return d
}

export interface ComputedLayout {
  mode: LayoutMode
  /** viewBox dimensions. */
  width: number
  height: number
  /** Root anchor (left in horizontal mode, top-center in vertical mode). */
  rootPos: Vec2
  /** Branch sub-root positions, keyed by NT branch. */
  branchPos: Map<NtBranch, Vec2>
  /** Family leaf positions, keyed by family id. */
  leafPos: Map<string, Vec2>
  /** Connector path from root → branch sub-root (rendered as primary skeleton). */
  rootToBranchPath: (branch: NtBranch) => string
  /** Connector path from branch sub-root → leaf (rendered as primary skeleton). */
  branchToLeafPath: (branch: NtBranch, familyId: string) => string
  /**
   * Decorative dendrite stubs radiating outward from a leaf — 3-5 short curved
   * "twigs" mimicking terminal arborization. Visual texture only; no semantics.
   */
  dendriteStubsFor: (familyId: string) => string[]
  /**
   * Decorative axon collaterals along the branch → leaf path — short
   * perpendicular twigs that branch off the main axon and end in mid-air,
   * mimicking neuron axon collaterals seen in Cajal drawings.
   */
  axonCollateralsFor: (branch: NtBranch, familyId: string) => string[]
  /**
   * Synapse edge path between two family leaves across branches. Bézier curves
   * with control points offset proportional to endpoint distance, biased away
   * from the layout centerline to reduce crossings (per design.md D6).
   */
  synapsePath: (familyA: string, familyB: string) => string
}

// Spacing constants — tweak here, not in component code.
// Bilateral horizontal layout: monoamines (DA / 5HT) on the LEFT half,
// amino-acid neurotransmitters (GABA / Glu) on the RIGHT half. Root is centered.
// `H_SIDE_MARGIN` is the gutter beyond each leaf column where labels sit without
// running off the viewBox edge.
const H_SIDE_MARGIN = 220
const H_BRANCH_X_OFFSET = 190 // distance from root to each branch sub-root
const H_LEAF_X_OFFSET = 360 // distance from root to leaf column
const H_ROOT_X = H_SIDE_MARGIN + H_LEAF_X_OFFSET // viewBox: |margin|leaves|root|leaves|margin|
const H_LEAF_STRIDE = 86
const H_BRANCH_GAP = 32
const H_TOP_PAD = 70

// Which side each NT branch sits on.
const BRANCH_SIDE: Record<NtBranch, 'left' | 'right'> = {
  DA: 'left',
  '5HT': 'left',
  GABA: 'right',
  Glu: 'right',
}

const V_TOP_Y = 70
const V_BRANCH_Y = 190
const V_LEAF_Y = 320
const V_BRANCH_STRIDE = 220
const V_LEAF_GAP = 16
const V_LEFT_PAD = 70
const V_RIGHT_PAD = 70

/**
 * Group subjects by NT branch, preserving content-pack iteration order
 * within each branch so layouts are deterministic across renders.
 */
function groupByBranch(subjects: readonly Subject[]): Map<NtBranch, Subject[]> {
  const grouped = new Map<NtBranch, Subject[]>()
  for (const branch of NT_BRANCH_ORDER) grouped.set(branch, [])
  for (const subject of subjects) {
    const branch = subject.group as NtBranch
    if (!grouped.has(branch)) continue
    grouped.get(branch)!.push(subject)
  }
  return grouped
}

export function computeLayout(
  subjects: readonly Subject[],
  mode: LayoutMode,
): ComputedLayout {
  return mode === 'horizontal'
    ? computeHorizontal(subjects)
    : computeVertical(subjects)
}

function computeHorizontal(subjects: readonly Subject[]): ComputedLayout {
  const grouped = groupByBranch(subjects)

  // Allocate vertical bands per side, so each side's tree is self-contained
  // and we can compute the overall height as the taller of the two sides.
  function sideHeight(side: 'left' | 'right'): number {
    const branchesOnSide = NT_BRANCH_ORDER.filter((b) => BRANCH_SIDE[b] === side)
    const leafTotal = branchesOnSide.reduce(
      (sum, b) => sum + (grouped.get(b)?.length ?? 0),
      0,
    )
    return (
      leafTotal * H_LEAF_STRIDE +
      Math.max(0, branchesOnSide.length - 1) * H_BRANCH_GAP +
      H_TOP_PAD * 2
    )
  }

  const height = Math.max(sideHeight('left'), sideHeight('right'), 520)
  const width = H_ROOT_X * 2

  const branchPos = new Map<NtBranch, Vec2>()
  const leafPos = new Map<string, Vec2>()

  // Lay out each side independently so band centers don't fight each other.
  // Each leaf + branch position gets a small deterministic jitter so the tree
  // reads as an organic neural circuit (asymmetric, dendritic) rather than a
  // pristine phylogenetic dendrogram.
  for (const side of ['left', 'right'] as const) {
    const sideBranches = NT_BRANCH_ORDER.filter((b) => BRANCH_SIDE[b] === side)
    const sideLeaves = sideBranches.reduce(
      (sum, b) => sum + (grouped.get(b)?.length ?? 0),
      0,
    )
    const sideTotalBand =
      sideLeaves * H_LEAF_STRIDE + Math.max(0, sideBranches.length - 1) * H_BRANCH_GAP
    let cursorY = (height - sideTotalBand) / 2
    const branchXBase = side === 'left' ? H_ROOT_X - H_BRANCH_X_OFFSET : H_ROOT_X + H_BRANCH_X_OFFSET
    const leafXBase = side === 'left' ? H_ROOT_X - H_LEAF_X_OFFSET : H_ROOT_X + H_LEAF_X_OFFSET
    const outward = side === 'left' ? -1 : 1

    for (const branch of sideBranches) {
      const leaves = grouped.get(branch) ?? []
      const bandHeight = Math.max(leaves.length, 1) * H_LEAF_STRIDE
      const bandCenter = cursorY + bandHeight / 2

      // Branch sub-root jitter — pushes branches off the perfect vertical line.
      // Larger amplitude than before so branch sub-roots scatter into cortical
      // layer-like Y bands rather than landing on the same horizontal line.
      const bxJitter = jitter(branch, 'branchX') * 48
      const byJitter = jitter(branch, 'branchY') * 36
      branchPos.set(branch, { x: branchXBase + bxJitter, y: bandCenter + byJitter })

      const leafStartY = cursorY + H_LEAF_STRIDE / 2
      leaves.forEach((leaf, idx) => {
        // Leaf jitter — x always pulls INWARD (toward root) so labels stay safely
        // inside the viewBox no matter how dramatic the jitter; y is free to
        // scatter ±56 so soma cluster in organic cortical-layer bands.
        const lxJitter = -Math.abs(jitter(leaf.id, 'leafX')) * 110 * outward
        const lyJitter = jitter(leaf.id, 'leafY') * 56
        leafPos.set(leaf.id, {
          x: leafXBase + lxJitter,
          y: leafStartY + idx * H_LEAF_STRIDE + lyJitter,
        })
      })

      cursorY += bandHeight + H_BRANCH_GAP
    }
  }

  const rootPos: Vec2 = { x: H_ROOT_X, y: height / 2 }

  return {
    mode: 'horizontal',
    width,
    height,
    rootPos,
    branchPos,
    leafPos,
    rootToBranchPath: (branch) => {
      const p = branchPos.get(branch)
      if (!p) return ''
      // Root → branch sub-root: 2 intermediate wiggle waypoints — main axon
      // bundle leaving the central spine with a Cajal-style sinusoidal trajectory.
      return axonPath(rootPos, p, `rtb-${branch}`, 2, 28)
    },
    branchToLeafPath: (branch, familyId) => {
      const branchP = branchPos.get(branch)
      const leafP = leafPos.get(familyId)
      if (!branchP || !leafP) return ''
      // Branch → leaf: tighter axon with 2 waypoints + smaller amp so it reads
      // as a terminal projection. Each family gets its own curve.
      return axonPath(branchP, leafP, `btl-${familyId}`, 2, 22)
    },
    dendriteStubsFor: (familyId) => {
      const leaf = leafPos.get(familyId)
      if (!leaf) return []
      // 3-4 stubs around each leaf — varies by family hash.
      const stubCount = 3 + (stringHash(`stub-count-${familyId}`) % 2)
      return dendriteStubs(leaf, `dendrite-${familyId}`, stubCount)
    },
    axonCollateralsFor: (branch, familyId) => {
      const branchP = branchPos.get(branch)
      const leafP = leafPos.get(familyId)
      if (!branchP || !leafP) return []
      // 1-2 collaterals per branch→leaf axon — sparse, supplemental.
      const count = 1 + (stringHash(`coll-count-${familyId}`) % 2)
      return axonCollaterals(branchP, leafP, `coll-${familyId}`, count)
    },
    synapsePath: (familyA, familyB) =>
      synapseBezierHorizontal(
        leafPos.get(familyA),
        leafPos.get(familyB),
        rootPos.x,
        height,
      ),
  }
}

function computeVertical(subjects: readonly Subject[]): ComputedLayout {
  const grouped = groupByBranch(subjects)

  // 4 branches stacked horizontally at fixed stride; each branch's leaves
  // arranged vertically beneath its sub-root.
  const maxLeavesPerBranch = Math.max(
    ...NT_BRANCH_ORDER.map((b) => grouped.get(b)?.length ?? 0),
  )
  const width = V_LEFT_PAD * 2 + (NT_BRANCH_ORDER.length - 1) * V_BRANCH_STRIDE
  const height = V_LEAF_Y + maxLeavesPerBranch * (H_LEAF_STRIDE + V_LEAF_GAP) + 60

  const rootPos: Vec2 = { x: width / 2, y: V_TOP_Y }

  const branchPos = new Map<NtBranch, Vec2>()
  NT_BRANCH_ORDER.forEach((branch, i) => {
    branchPos.set(branch, {
      x: V_LEFT_PAD + i * V_BRANCH_STRIDE,
      y: V_BRANCH_Y,
    })
  })

  const leafPos = new Map<string, Vec2>()
  for (const branch of NT_BRANCH_ORDER) {
    const leaves = grouped.get(branch) ?? []
    const branchP = branchPos.get(branch)!
    leaves.forEach((leaf, idx) => {
      leafPos.set(leaf.id, {
        x: branchP.x,
        y: V_LEAF_Y + idx * (H_LEAF_STRIDE + V_LEAF_GAP),
      })
    })
  }

  return {
    mode: 'vertical',
    width: width + V_RIGHT_PAD,
    height,
    rootPos,
    branchPos,
    leafPos,
    rootToBranchPath: (branch) => {
      const p = branchPos.get(branch)
      if (!p) return ''
      const midY = (rootPos.y + p.y) / 2
      return `M ${rootPos.x},${rootPos.y} C ${rootPos.x},${midY} ${p.x},${midY} ${p.x},${p.y}`
    },
    branchToLeafPath: (branch, familyId) => {
      const branchP = branchPos.get(branch)
      const leafP = leafPos.get(familyId)
      if (!branchP || !leafP) return ''
      const midY = (branchP.y + leafP.y) / 2
      return `M ${branchP.x},${branchP.y} C ${branchP.x},${midY} ${leafP.x},${midY} ${leafP.x},${leafP.y}`
    },
    dendriteStubsFor: () => [],
    axonCollateralsFor: () => [],
    synapsePath: (familyA, familyB) =>
      synapseBezierVertical(leafPos.get(familyA), leafPos.get(familyB), height),
  }
}

/**
 * Cubic Bézier between two leaves in bilateral horizontal layout.
 *
 * - Cross-side pair (one leaf on left half, one on right half): control points
 *   sit near the central root x so the path arcs through (or near) the central
 *   spine — the user-perceived "wiring across the brain" moment
 * - Same-side pair: control points push outward (further from root) so the path
 *   bows away from the central skeleton and into the leaf gutter
 */
function synapseBezierHorizontal(
  a: Vec2 | undefined,
  b: Vec2 | undefined,
  rootX: number,
  layoutHeight: number,
): string {
  if (!a || !b) return ''
  const aSide = a.x < rootX ? 'left' : 'right'
  const bSide = b.x < rootX ? 'left' : 'right'
  if (aSide !== bSide) {
    // Cross-side: arc through central spine — control points anchored near rootX.
    // Vertical sag proportional to leaf y separation so different cross-pairs don't all overlap.
    const sag = Math.min(Math.abs(b.y - a.y) * 0.15, layoutHeight * 0.05)
    const cx1 = rootX
    const cx2 = rootX
    return `M ${a.x},${a.y} C ${cx1},${a.y + sag} ${cx2},${b.y + sag} ${b.x},${b.y}`
  }
  // Same-side: bow outward (away from root) so the arc sits in the gutter, not over the skeleton.
  const outward = aSide === 'left' ? -1 : 1
  const offset = Math.abs(b.y - a.y) * 0.32 + 36
  const cx1 = a.x + outward * offset
  const cx2 = b.x + outward * offset
  return `M ${a.x},${a.y} C ${cx1},${a.y} ${cx2},${b.y} ${b.x},${b.y}`
}

/** Vertical-mode synapse Bézier (mobile layout). */
function synapseBezierVertical(
  a: Vec2 | undefined,
  b: Vec2 | undefined,
  layoutExtent: number,
): string {
  if (!a || !b) return ''
  // Push control points downward (below the leaf cluster) so arcs swing
  // beneath the tree skeleton instead of cutting through it.
  const offset = Math.abs(b.x - a.x) * 0.18 + Math.min(layoutExtent * 0.05, 40)
  const cy1 = a.y + offset
  const cy2 = b.y + offset
  return `M ${a.x},${a.y} C ${a.x},${cy1} ${b.x},${cy2} ${b.x},${b.y}`
}

/** Decode the pair-key wire format `"familyA|familyB"` used by SynapseRow.pairKey. */
export function decodePairKey(pairKey: string): [string, string] {
  const [a, b] = pairKey.split('|')
  return [a, b]
}
