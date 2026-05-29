/**
 * Family subject picker — NT-branch-grouped portrait cards + 「全部」hero chip.
 *
 * Spec: openspec/specs/neurons-mode/spec.md
 *   "Overview SHALL surface a family subject picker that filters the active
 *   quiz pool"
 *
 * Visual baseline: 二階 hospital app's specialty-grouped doctor roster
 * (門診 / 病房 / 開刀房 rows with portrait cards). For neurons, we group by
 * the 4 NT branches (DA / 5-HT / GABA / Glu) with each row labeled.
 */

import type { ContentPack, Subject } from '@study-rpg/core'
import { THEME_PIXEL_NEURONS } from '@study-rpg/theme-pixel-neurons'

const SPRITE_MAP = THEME_PIXEL_NEURONS.sprites

const NT_BRANCHES = ['DA', '5HT', 'GABA', 'Glu'] as const
const BRANCH_LABEL: Record<typeof NT_BRANCHES[number], string> = {
  DA: 'DA · 多巴胺',
  '5HT': '5-HT · 血清素',
  GABA: 'GABA · γ-胺基丁酸',
  Glu: 'Glu · 麩胺酸',
}
const BRANCH_ACCENT: Record<typeof NT_BRANCHES[number], string> = {
  DA: '#d4a04d',
  '5HT': '#c44d4d',
  GABA: '#6a9bc4',
  Glu: '#6a8c3f',
}

interface Props {
  pack: ContentPack
  selectedFamilyId: string | null
  onSelect: (familyId: string | null) => void
}

export function FamilyPicker({ pack, selectedFamilyId, onSelect }: Props): JSX.Element {
  const totalQuestions = pack.questions.length
  return (
    <section style={pickerSectionStyle} aria-label="選科目練習">
      <header style={headerRowStyle}>
        <h2 style={pickerHeaderStyle}>📚 選科目練習</h2>
        <AllChip
          selected={selectedFamilyId === null}
          onClick={() => onSelect(null)}
          totalCount={totalQuestions}
        />
      </header>

      <div style={branchListStyle}>
        {NT_BRANCHES.map((branch) => {
          const families = pack.subjects.filter((s) => s.group === branch)
          if (families.length === 0) return null
          const accent = BRANCH_ACCENT[branch]
          return (
            <div key={branch}>
              <div style={branchHeaderStyle}>
                <span style={{ ...branchDotStyle, background: accent }} aria-hidden />
                <span style={branchLabelTextStyle}>{BRANCH_LABEL[branch]}</span>
                <span style={branchCountStyle}>{families.length} / 11</span>
              </div>
              <div style={branchRowStyle}>
                {families.map((s) => (
                  <FamilyCard
                    key={s.id}
                    family={s}
                    selected={selectedFamilyId === s.id}
                    onClick={() => onSelect(s.id)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {selectedFamilyId && (() => {
        const selected = pack.subjects.find((s) => s.id === selectedFamilyId)
        if (!selected) return null
        return (
          <p style={selectedHintStyle}>
            🎯 練習範圍鎖定：<strong>{selected.id}</strong>（{selected.displayName}）— 點「全部」恢復跨科隨機
          </p>
        )
      })()}
    </section>
  )
}

function FamilyCard({
  family,
  selected,
  onClick,
}: {
  family: Subject
  selected: boolean
  onClick: () => void
}): JSX.Element {
  const accent = family.color ?? '#8c6d4a'
  const spriteUrl = SPRITE_MAP[`subject:${family.id}`] ?? ''
  return (
    <button
      type="button"
      onClick={onClick}
      style={selected ? selectedCardStyle(accent) : familyCardStyle(accent)}
      aria-pressed={selected}
      title={`${family.id} · ${family.displayName} · ${family.totalQuestions} 題`}
    >
      <div style={spriteFrameStyle(accent, selected)}>
        {spriteUrl ? (
          <img src={spriteUrl} alt="" width={48} height={48} style={spriteStyle} />
        ) : (
          <span style={{ fontSize: '1.4rem', color: accent }} aria-hidden>🧬</span>
        )}
      </div>
      <div style={primaryNameStyle(selected ? '#fff' : accent)}>{family.id}</div>
      <div style={personaNameStyle(selected ? 'rgba(255,255,255,0.85)' : '#5a3f29')}>
        {family.displayName}
      </div>
      <div style={countChipStyle(selected ? 'rgba(255,255,255,0.18)' : '#fdf6e3', accent, selected)}>
        {family.totalQuestions} 題
      </div>
    </button>
  )
}

function AllChip({
  selected,
  onClick,
  totalCount,
}: {
  selected: boolean
  onClick: () => void
  totalCount: number
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={selected ? allChipSelectedStyle : allChipStyle}
      aria-pressed={selected}
    >
      <span style={{ fontSize: '1.05rem' }} aria-hidden>🎲</span>
      <span>全部</span>
      <span style={allChipCountStyle(selected)}>{totalCount}</span>
    </button>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const pickerSectionStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  padding: '0.85rem 1rem 1rem',
  marginBottom: '1rem',
  borderRadius: '4px',
}

const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.6rem',
  borderBottom: '1px solid #c4a878',
  paddingBottom: '0.3rem',
  gap: '0.5rem',
  flexWrap: 'wrap',
}

const pickerHeaderStyle: React.CSSProperties = {
  fontSize: '1rem',
  margin: 0,
  color: '#3a2a1a',
}

const branchListStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.7rem',
}

const branchHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.4rem',
  marginBottom: '0.3rem',
}

const branchDotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
}

const branchLabelTextStyle: React.CSSProperties = {
  fontSize: '0.82rem',
  fontWeight: 700,
  color: '#3a2a1a',
  letterSpacing: '0.02em',
}

const branchCountStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#8c6d4a',
  marginLeft: 'auto',
}

const branchRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.45rem',
  flexWrap: 'wrap',
}

function familyCardStyle(accent: string): React.CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
    padding: '0.45rem 0.4rem 0.4rem',
    background: '#fff',
    border: `2px solid ${accent}`,
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'transform 0.1s ease, box-shadow 0.12s ease, background 0.15s ease',
    width: 102,
    boxSizing: 'border-box',
  }
}

function selectedCardStyle(accent: string): React.CSSProperties {
  return {
    ...familyCardStyle(accent),
    background: accent,
    borderColor: accent,
    transform: 'translateY(-2px)',
    boxShadow: `0 4px 10px ${accent}50`,
  }
}

function spriteFrameStyle(accent: string, selected: boolean): React.CSSProperties {
  return {
    width: 56,
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: selected ? 'rgba(255,255,255,0.15)' : '#fdf6e3',
    border: `1px solid ${selected ? 'rgba(255,255,255,0.35)' : accent}`,
    borderRadius: '4px',
  }
}

const spriteStyle: React.CSSProperties = {
  imageRendering: 'pixelated',
  width: 48,
  height: 48,
}

function primaryNameStyle(color: string): React.CSSProperties {
  return {
    fontSize: '0.85rem',
    fontWeight: 700,
    color,
    textAlign: 'center',
    lineHeight: 1.15,
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

function personaNameStyle(color: string): React.CSSProperties {
  return {
    fontSize: '0.6rem',
    color,
    textAlign: 'center',
    lineHeight: 1.2,
    width: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

function countChipStyle(bg: string, accent: string, selected: boolean): React.CSSProperties {
  return {
    fontSize: '0.62rem',
    padding: '0.05rem 0.35rem',
    borderRadius: '999px',
    background: bg,
    color: selected ? '#fff' : accent,
    border: `1px solid ${selected ? 'rgba(255,255,255,0.5)' : accent}`,
    marginTop: '0.1rem',
  }
}

const allChipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.4rem',
  padding: '0.3rem 0.7rem',
  background: '#fdf6e3',
  border: '2px solid #5a3f29',
  borderRadius: '4px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: '0.8rem',
  fontWeight: 700,
  color: '#3a2a1a',
}

const allChipSelectedStyle: React.CSSProperties = {
  ...allChipStyle,
  background: '#3a2a1a',
  color: '#fff',
  borderColor: '#3a2a1a',
}

function allChipCountStyle(selected: boolean): React.CSSProperties {
  return {
    fontSize: '0.72rem',
    padding: '0.05rem 0.45rem',
    borderRadius: '999px',
    background: selected ? 'rgba(255,255,255,0.18)' : '#5a3f29',
    color: selected ? '#fff' : '#fff',
    fontWeight: 600,
  }
}

const selectedHintStyle: React.CSSProperties = {
  margin: '0.7rem 0 0',
  fontSize: '0.78rem',
  color: '#5a3f29',
  padding: '0.35rem 0.6rem',
  background: '#fdf6e3',
  border: '1px dashed #c4a878',
  borderRadius: '4px',
}
