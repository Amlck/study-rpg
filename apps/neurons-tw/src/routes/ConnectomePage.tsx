import { useEffect, useState } from 'react'
import type { ContentPack, Subject } from '@study-rpg/core'
import { initFamilyAccrualIfEmpty } from '../lib/db'
import {
  decodePairKey,
  initMasteryForPack,
  loadConnectome,
  subscribeConnectomeEvents,
  type ConnectomeSnapshot,
} from '../lib/services/connectome'
import { AP_THRESHOLDS, nextSlotThreshold } from '../lib/connectome'
import MasteryChip from '../components/MasteryChip'
import { FamilyMasteryBadge } from '../components/FamilyMasteryBadge'
import VariantCollectionChip from '../components/VariantCollectionChip'
import { ConnectomeTreeSvg } from '../components/connectome/ConnectomeTreeSvg'

interface Props {
  pack: ContentPack
}

const NT_BRANCHES = ['DA', '5HT', 'GABA', 'Glu'] as const

export default function ConnectomePage({ pack }: Props): JSX.Element {
  const [snapshot, setSnapshot] = useState<ConnectomeSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = (): void => {
    loadConnectome()
      .then((s) => setSnapshot(s))
      .catch((e) => setError(String(e)))
  }

  useEffect(() => {
    let disposed = false
    Promise.all([initFamilyAccrualIfEmpty(pack), initMasteryForPack(pack)])
      .then(() => {
        if (disposed) return
        refresh()
      })
      .catch((e) => setError(String(e)))

    const sub = subscribeConnectomeEvents({
      'connectome.synapseFormed': () => refresh(),
      'connectome.synapseStrengthened': () => refresh(),
      'connectome.synapseDecayed': () => refresh(),
      'connectome.variantSlotUnlocked': () => refresh(),
    })

    return () => {
      disposed = true
      sub.dispose()
    }
  }, [pack])

  if (error) {
    return (
      <section style={errorStyle}>
        <strong>Connectome 載入錯誤：</strong>
        {error}
      </section>
    )
  }
  if (!snapshot) {
    return <p>載入 connectome 中…</p>
  }

  const familyById = new Map(pack.subjects.map((s) => [s.id, s]))
  const accrualByFamily = new Map(snapshot.familyAccrual.map((r) => [r.familyId, r]))

  return (
    <>
      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.4rem', marginBottom: '0.25rem' }}>Connectome 連結組</h1>
        <p style={{ margin: 0, color: '#5a3f29', fontStyle: 'italic' }}>
          11 個 neuron family 分布於 4 條 NT 分支 · 同一天兩個 family 各答對 5 題即 wire 出 synapse · LTP / LTD 不 rupture
        </p>
      </header>

      {snapshot.synapses.length === 0 && (
        <section role="region" aria-label="新手指引" style={emptyStateCalloutStyle}>
          <strong style={emptyStateOpenerStyle}>👋 第一次打開 connectome？</strong>
          <p style={emptyStateBodyStyle}>
            到「總覽」頁按 <strong>🎯 開始答題</strong> 開始作答。同一天讓 <strong>兩個 family 各答對 5 題</strong>，
            就能 wire 出你的第一條 synapse；想專練某一科就先用「📚 選科目練習」chip 選定 family。
          </p>
          <p style={emptyStateFlavorStyle}>
            Hebbian rule — &ldquo;Neurons that fire together, wire together.&rdquo;
          </p>
        </section>
      )}

      <ConnectomeTreeSvg pack={pack} />

      <section style={sectionStyle}>
        <h2 style={h2Style}>🧬 Neuron family 詳細（action potential 與槽位進度）</h2>
        <div style={branchGridStyle}>
          {NT_BRANCHES.map((branch) => {
            const families = pack.subjects.filter((s) => s.group === branch)
            if (families.length === 0) return null
            return (
              <div key={branch} style={branchColumnStyle}>
                <h3 style={{ ...branchHeaderStyle, color: families[0].color ?? '#000' }}>
                  {branch}
                </h3>
                {families.map((family) => {
                  const accrual = accrualByFamily.get(family.id)
                  return (
                    <FamilyCard
                      key={family.id}
                      family={family}
                      ap={accrual?.ap ?? 0}
                      unlockedSlots={accrual?.unlockedSlots ?? []}
                      firedToday={accrual?.firedToday ?? false}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>🔗 Synapse 列表（共 {snapshot.synapses.length} 條）</h2>
        {snapshot.synapses.length === 0 ? (
          <p style={{ margin: 0, color: '#5a3f29' }}>
            尚無 synapse — 同一天在兩個 family 各答對 5 題就會自動 wire 出來。
          </p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr style={trHeadStyle}>
                <th style={thStyle}>家族 A</th>
                <th style={thStyle}>家族 B</th>
                <th style={thStyle}>狀態</th>
                <th style={thStyle}>上次共激發日</th>
                <th style={thStyle}>距今天數</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.synapses
                .slice()
                .sort((a, b) => a.pairKey.localeCompare(b.pairKey))
                .map((syn) => {
                  const [aId, bId] = decodePairKey(syn.pairKey)
                  const aFamily = familyById.get(aId)
                  const bFamily = familyById.get(bId)
                  const daysSince = daysBetween(syn.lastCoFireDate, snapshot.today)
                  return (
                    <tr key={syn.pairKey}>
                      <td style={tdStyle}>
                        <span style={{ color: aFamily?.color ?? '#000' }}>
                          {aFamily?.displayName ?? aId}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ color: bFamily?.color ?? '#000' }}>
                          {bFamily?.displayName ?? bId}
                        </span>
                      </td>
                      <td style={tdStyle}>{stateBadge(syn.state)}</td>
                      <td style={tdStyle}>
                        <code>{syn.lastCoFireDate}</code>
                      </td>
                      <td style={tdStyle}>{daysSince} 天</td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        )}
      </section>

    </>
  )
}

function FamilyCard({
  family,
  ap,
  unlockedSlots,
  firedToday,
}: {
  family: Subject
  ap: number
  unlockedSlots: number[]
  firedToday: boolean
}): JSX.Element {
  const next = nextSlotThreshold(unlockedSlots)
  return (
    <div style={{ ...familyCardStyle, borderColor: family.color ?? '#8c6d4a' }}>
      <div style={{ fontWeight: 600, color: family.color ?? '#000' }}>
        {firedToday && <span title="今日已激發">🔥 </span>}
        {family.displayName}
      </div>
      <div style={{ fontSize: '0.8em', color: '#5a3f29' }}>
        AP <strong>{ap}</strong>
        {next == null
          ? `／MAX（${AP_THRESHOLDS.length}/${AP_THRESHOLDS.length}）`
          : `／next @ ${next}（${unlockedSlots.length}/${AP_THRESHOLDS.length}）`}
      </div>
      <div style={{ marginTop: '0.3rem', display: 'flex', flexWrap: 'wrap', gap: '0.25rem', alignItems: 'center' }}>
        <FamilyMasteryBadge familyId={family.id} size={28} />
        <MasteryChip familyId={family.id} displayName={family.displayName} />
        <VariantCollectionChip familyId={family.id} />
      </div>
    </div>
  )
}

const STATE_LABELS: Record<'dormant' | 'weak' | 'strong', string> = {
  dormant: '休眠 dormant',
  weak: '弱 weak',
  strong: '強 strong',
}

function stateBadge(state: 'dormant' | 'weak' | 'strong'): JSX.Element {
  // Dark signal-chips so the synapse states read coherently with the tree's
  // cyan/amber EEG edges (weak→cyan, strong→amber) while staying legible on the
  // cream section bg. (polish-neurons-clinical-machine-aesthetic)
  const styles: Record<typeof state, React.CSSProperties> = {
    dormant: { color: 'var(--signal-ink)', borderColor: 'var(--signal-dim)' },
    weak: { color: 'var(--signal-cyan)', borderColor: 'var(--signal-cyan)' },
    strong: { color: 'var(--signal-amber)', borderColor: 'var(--signal-amber)' },
  }
  return (
    <span
      style={{
        ...badgeStyle,
        background: 'var(--signal-bg)',
        ...styles[state],
      }}
    >
      {STATE_LABELS[state]}
    </span>
  )
}

function daysBetween(earlier: string, later: string): number {
  const ms = Date.parse(later) - Date.parse(earlier)
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)))
}

const sectionStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  padding: '0.85rem 1rem',
  marginBottom: '1rem',
  borderRadius: '4px',
}

const h2Style: React.CSSProperties = {
  fontSize: '1rem',
  margin: '0 0 0.5rem',
  borderBottom: '1px solid #c4a878',
  paddingBottom: '0.25rem',
}

const branchGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: '0.6rem',
}

const branchColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.4rem',
}

const branchHeaderStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  margin: '0 0 0.2rem',
  textAlign: 'center',
}

const familyCardStyle: React.CSSProperties = {
  border: '2px solid #8c6d4a',
  borderRadius: '4px',
  padding: '0.4rem 0.5rem',
  background: '#fff',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.85rem',
}

const trHeadStyle: React.CSSProperties = {
  background: '#e8dcc0',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '0.35rem 0.5rem',
  borderBottom: '2px solid #8c6d4a',
}

const tdStyle: React.CSSProperties = {
  padding: '0.3rem 0.5rem',
  borderBottom: '1px solid #d4c4a0',
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.1rem 0.5rem',
  border: '1px solid',
  borderRadius: '999px',
  fontSize: '0.75rem',
  fontWeight: 600,
}

const errorStyle: React.CSSProperties = {
  background: '#ffe5e5',
  border: '2px solid #c44d4d',
  padding: '0.85rem 1rem',
  borderRadius: '4px',
  color: '#c44d4d',
}

const emptyStateCalloutStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #fdf2e8 0%, #f5e6d3 100%)',
  border: '2px solid #d4a04d',
  borderRadius: '8px',
  padding: '0.9rem 1.1rem',
  marginBottom: '1rem',
  boxShadow: '0 2px 6px rgba(212, 160, 77, 0.15)',
}

const emptyStateOpenerStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '1.05rem',
  color: '#5a3f29',
  marginBottom: '0.4rem',
}

const emptyStateBodyStyle: React.CSSProperties = {
  margin: '0 0 0.45rem',
  fontSize: '0.92rem',
  lineHeight: 1.55,
  color: '#3a2a1a',
}

const emptyStateFlavorStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.8rem',
  fontStyle: 'italic',
  color: '#8c6d4a',
}
