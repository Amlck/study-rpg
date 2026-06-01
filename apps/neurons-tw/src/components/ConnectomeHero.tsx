/**
 * ConnectomeHero — homepage hero. Embeds the REAL labeled connectome tree
 * (`ConnectomeTreeSvg`, family sprites + names + AP chips + state-styled synapse
 * edges) in non-interactive mode (`interactive={false}`): no pan / zoom / drag /
 * toolbar, so it never intercepts page-scroll. The whole hero is an activation
 * target that routes to the full interactive `/connectome`.
 *
 * Replaces the earlier abstract unlabeled mini-tree (which read as a decorative
 * skeleton at "0 連線"). The tree self-loads its own snapshot + subscribes to
 * connectome events, so this wrapper holds no data logic.
 *
 * Spec: openspec/specs/neurons-homepage/spec.md
 *   "Homepage SHALL render a lightweight presentational connectome-tree hero
 *    that routes to the full interactive view"
 */

import { useNavigate } from 'react-router-dom'
import type { ContentPack } from '@study-rpg/core'
import { ConnectomeTreeSvg } from './connectome/ConnectomeTreeSvg'

interface Props {
  pack: ContentPack
}

export function ConnectomeHero({ pack }: Props): JSX.Element {
  const navigate = useNavigate()
  const open = (): void => navigate('/connectome')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      aria-label="打開完整 connectome 連結組"
      style={wrapperStyle}
    >
      <ConnectomeTreeSvg pack={pack} interactive={false} />
      <span style={captionStyle}>🔗 點開看完整連結組（可拖拉 / 縮放 / 看 synapse 列表）→</span>
    </div>
  )
}

const wrapperStyle: React.CSSProperties = {
  display: 'block',
  cursor: 'pointer',
  // Cap the hero height so the embedded tree reads as a hook, not a full-screen
  // tree; width:100%/height:auto inside scales down to fit.
  maxWidth: 640,
  marginInline: 'auto',
}

const captionStyle: React.CSSProperties = {
  display: 'block',
  marginTop: '-0.5rem',
  marginBottom: '0.25rem',
  textAlign: 'center',
  fontSize: '0.8rem',
  color: 'var(--signal-ink, #cfe8e2)',
  opacity: 0.85,
}
