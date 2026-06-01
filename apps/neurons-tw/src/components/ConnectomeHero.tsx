/**
 * ConnectomeHero — lightweight, presentational connectome-tree hero for the
 * homepage. Renders the 4 NT branches + their family leaves from the
 * `loadConnectome()` snapshot with state-driven synapse edges and a gentle
 * CSS-driven ambient firing layer. Clicking (or Enter/Space) routes to the full
 * interactive `/connectome` view.
 *
 * Deliberately NOT the heavy interactive `ConnectomeTreeSvg` (rAF force-sim +
 * pan/zoom/pinch): this is a fixed-layout, stable-position SVG with zero physics
 * and zero per-frame JS loop, so it is cheap on a landing page, can't be
 * accidentally dragged, and survives background-tab rAF throttling.
 *
 * Spec: openspec/specs/neurons-homepage/spec.md
 *   "Homepage SHALL render a lightweight presentational connectome-tree hero
 *    that routes to the full interactive view"
 */

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ContentPack } from '@study-rpg/core'
import {
  loadConnectome,
  subscribeConnectomeEvents,
  decodePairKey,
  type ConnectomeSnapshot,
} from '../lib/services/connectome'
import {
  NT_BRANCH_ORDER,
  NT_BRANCH_COLOR,
  type NtBranch,
} from './connectome/layout'

interface Props {
  pack: ContentPack
}

const VB_W = 320
const VB_H = 150
const ROOT_X = 26
const BRANCH_X = 150
const LEAF_X = 280

interface Pt {
  x: number
  y: number
}

const SYNAPSE_EDGE_COLOR: Record<'dormant' | 'weak' | 'strong', string> = {
  dormant: 'var(--signal-dim)',
  weak: 'var(--signal-cyan)',
  strong: 'var(--signal-amber)',
}

export function ConnectomeHero({ pack }: Props): JSX.Element {
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState<ConnectomeSnapshot | null>(null)

  useEffect(() => {
    let disposed = false
    loadConnectome()
      .then((s) => {
        if (!disposed) setSnapshot(s)
      })
      .catch(() => {
        /* hero is decorative — silent fallback to skeleton */
      })
    const sub = subscribeConnectomeEvents({
      'connectome.synapseFormed': () => loadConnectome().then((s) => !disposed && setSnapshot(s)),
      'connectome.synapseStrengthened': () => loadConnectome().then((s) => !disposed && setSnapshot(s)),
      'connectome.synapseDecayed': () => loadConnectome().then((s) => !disposed && setSnapshot(s)),
    })
    return () => {
      disposed = true
      sub.dispose()
    }
  }, [])

  // Fixed positions: families stacked in a right-hand column ordered by branch;
  // each branch node sits at the vertical centre of its family group.
  const layout = useMemo(() => {
    const familyPos = new Map<string, Pt>()
    const branchPos = new Map<NtBranch, Pt>()
    const familyColor = new Map<string, string>()
    const familyByBranch: { branch: NtBranch; ids: string[] }[] = []

    for (const branch of NT_BRANCH_ORDER) {
      const fams = pack.subjects.filter((s) => s.group === branch)
      familyByBranch.push({ branch, ids: fams.map((f) => f.id) })
      for (const f of fams) familyColor.set(f.id, f.color ?? NT_BRANCH_COLOR[branch])
    }
    const total = familyByBranch.reduce((n, b) => n + b.ids.length, 0) || 1
    const top = 14
    const span = VB_H - 28
    let i = 0
    for (const { branch, ids } of familyByBranch) {
      const ys: number[] = []
      for (const id of ids) {
        const y = total === 1 ? VB_H / 2 : top + (span * i) / (total - 1)
        familyPos.set(id, { x: LEAF_X, y })
        ys.push(y)
        i++
      }
      const cy = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : VB_H / 2
      branchPos.set(branch, { x: BRANCH_X, y: cy })
    }
    return { familyPos, branchPos, familyColor, familyByBranch }
  }, [pack.subjects])

  const root: Pt = { x: ROOT_X, y: VB_H / 2 }

  // Most-recent synapse (max lastCoFireDate) gets the highlight.
  const recentPairKey = useMemo(() => {
    if (!snapshot || snapshot.synapses.length === 0) return null
    return snapshot.synapses.reduce((best, s) =>
      s.lastCoFireDate > best.lastCoFireDate ? s : best,
    ).pairKey
  }, [snapshot])

  const handleOpen = (): void => navigate('/connectome')

  return (
    <button
      type="button"
      onClick={handleOpen}
      aria-label="打開完整 connectome 連結組"
      style={heroButtonStyle}
    >
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-hidden
        style={{ display: 'block', maxHeight: 200 }}
      >
        {/* root → branch trunks */}
        {NT_BRANCH_ORDER.map((branch) => {
          const bp = layout.branchPos.get(branch)
          if (!bp) return null
          return (
            <line
              key={`trunk-${branch}`}
              x1={root.x}
              y1={root.y}
              x2={bp.x}
              y2={bp.y}
              stroke={NT_BRANCH_COLOR[branch]}
              strokeWidth={1.5}
              strokeOpacity={0.55}
            />
          )
        })}

        {/* branch → family twigs */}
        {layout.familyByBranch.map(({ branch, ids }) =>
          ids.map((id) => {
            const bp = layout.branchPos.get(branch)
            const fp = layout.familyPos.get(id)
            if (!bp || !fp) return null
            return (
              <line
                key={`twig-${id}`}
                x1={bp.x}
                y1={bp.y}
                x2={fp.x}
                y2={fp.y}
                stroke={NT_BRANCH_COLOR[branch]}
                strokeWidth={1}
                strokeOpacity={0.4}
              />
            )
          }),
        )}

        {/* synapse edges (cross-family), state-styled; recent one highlighted +
            animated as a travelling signal */}
        {snapshot?.synapses.map((syn) => {
          const [aId, bId] = decodePairKey(syn.pairKey)
          const a = layout.familyPos.get(aId)
          const b = layout.familyPos.get(bId)
          if (!a || !b) return null
          const isRecent = syn.pairKey === recentPairKey
          const color = SYNAPSE_EDGE_COLOR[syn.state]
          // bow the edge outward to the right so overlapping leaves stay readable
          const mx = (a.x + b.x) / 2 + 28
          const my = (a.y + b.y) / 2
          return (
            <path
              key={`syn-${syn.pairKey}`}
              className={syn.state === 'strong' ? 'neuron-signal-edge' : undefined}
              d={`M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`}
              fill="none"
              stroke={color}
              strokeWidth={isRecent ? 2.4 : 1.4}
              strokeOpacity={syn.state === 'dormant' ? 0.5 : 0.9}
              style={
                isRecent
                  ? { filter: `drop-shadow(0 0 3px ${color})`, ['--signal-dash' as string]: 60 }
                  : { ['--signal-dash' as string]: 60 }
              }
            />
          )
        })}

        {/* root node */}
        <circle cx={root.x} cy={root.y} r={4} fill="var(--signal-ink, #cfe8e2)" />

        {/* branch nodes */}
        {NT_BRANCH_ORDER.map((branch, i) => {
          const bp = layout.branchPos.get(branch)
          if (!bp) return null
          return (
            <circle
              key={`bn-${branch}`}
              className="neuron-firing-node"
              cx={bp.x}
              cy={bp.y}
              r={3.5}
              fill={NT_BRANCH_COLOR[branch]}
              style={{ animationDelay: `${i * 0.5}s`, filter: `drop-shadow(0 0 2px ${NT_BRANCH_COLOR[branch]})` }}
            />
          )
        })}

        {/* family leaves */}
        {layout.familyByBranch.map(({ ids }) =>
          ids.map((id, i) => {
            const fp = layout.familyPos.get(id)
            if (!fp) return null
            const c = layout.familyColor.get(id) ?? '#8c6d4a'
            return (
              <circle
                key={`fl-${id}`}
                className="neuron-firing-node"
                cx={fp.x}
                cy={fp.y}
                r={2.6}
                fill={c}
                style={{ animationDelay: `${i * 0.3}s` }}
              />
            )
          }),
        )}
      </svg>
      <span style={heroCaptionStyle}>
        🔗 Connectome · {snapshot ? `${snapshot.synapses.length} 連線` : '載入中'} · 點開看完整連結組 →
      </span>
    </button>
  )
}

const heroButtonStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: '0.6rem 0.75rem 0.4rem',
  background: 'var(--signal-bg-dim, #16242a)',
  backgroundImage:
    'linear-gradient(var(--grid-line, rgba(56,224,208,0.06)) 1px, transparent 1px),' +
    'linear-gradient(90deg, var(--grid-line, rgba(56,224,208,0.06)) 1px, transparent 1px)',
  backgroundSize: '20px 20px, 20px 20px',
  border: '2px solid var(--signal-dim, #2a4a52)',
  borderRadius: '8px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'center',
}

const heroCaptionStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '0.2rem',
  fontSize: '0.78rem',
  color: 'var(--signal-ink, #cfe8e2)',
  opacity: 0.85,
}
