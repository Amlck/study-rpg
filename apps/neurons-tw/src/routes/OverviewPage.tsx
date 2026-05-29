import { useEffect, useMemo, useState } from 'react'
import { liveQuery } from 'dexie'
import type { ContentPack } from '@study-rpg/core'
import { initMasteryForPack, loadConnectome } from '../lib/services/connectome'
import MasteryChip from '../components/MasteryChip'
import LeaderboardPromoBanner from '../components/LeaderboardPromoBanner'
import { QuizModal } from '../components/QuizModal'
import { FamilyPicker } from '../components/FamilyPicker'
import { useReadingTimer } from '../lib/hooks/useReadingTimer'
import { readTotalStudyMinutes } from '../lib/services/reading-timer'
import { filterPoolByFamily } from '../lib/services/quiz-pool'
import { db } from '../lib/db'

interface Props {
  pack: ContentPack
}

interface ProgressStats {
  variants: number
  synapsesStrong: number
  synapsesWeak: number
  dmnOwned: number
}

export default function OverviewPage({ pack }: Props): JSX.Element {
  const [quizOpen, setQuizOpen] = useState(false)
  const [totalStudyMin, setTotalStudyMin] = useState(0)
  const [selectedFamilyId, setSelectedFamilyId] = useState<string | null>(null)
  const [stats, setStats] = useState<ProgressStats>({
    variants: 0,
    synapsesStrong: 0,
    synapsesWeak: 0,
    dmnOwned: 0,
  })
  const timer = useReadingTimer()

  // Filter quiz pool by selected family. null → unrestricted (random pool).
  const quizPool = useMemo(
    () => filterPoolByFamily(pack.questions, selectedFamilyId),
    [pack.questions, selectedFamilyId],
  )
  const selectedFamilyDisplayName = selectedFamilyId
    ? pack.subjects.find((s) => s.id === selectedFamilyId)?.displayName
    : null

  useEffect(() => {
    initMasteryForPack(pack).catch(() => {
      // Non-fatal: chips fall back to 0/0 display until next load
    })
  }, [pack])

  // Subscribe to progress stats for the top status chip.
  useEffect(() => {
    const sub = liveQuery(async () => {
      const [variants, dmn, snapshot] = await Promise.all([
        db.neuronVariants.toArray(),
        db.dmnCards.toArray(),
        loadConnectome(),
      ])
      return {
        variants: variants.length,
        synapsesStrong: snapshot.synapses.filter((s) => s.state === 'strong').length,
        synapsesWeak: snapshot.synapses.filter((s) => s.state === 'weak').length,
        dmnOwned: dmn.length,
      }
    }).subscribe({
      next: (val) => setStats(val),
      error: (err) => console.warn('[OverviewPage] stats query failed:', err),
    })
    return () => sub.unsubscribe()
  }, [])

  // Refresh totalStudyMinutes display whenever the timer fires a minute side-effect
  // (signalled by minutesFired change) OR on mount.
  useEffect(() => {
    void readTotalStudyMinutes().then(setTotalStudyMin)
  }, [timer.minutesFired])

  const onTimerToggle = (): void => {
    if (timer.status === 'idle') {
      timer.start()
    } else if (timer.status === 'paused') {
      timer.resume()
    } else {
      timer.stop()
    }
  }

  const timerButtonLabel = (() => {
    if (timer.status === 'idle') return '📖 開始閱讀'
    if (timer.status === 'reading') {
      return `🟢 閱讀中 · ${timer.currentMinute} min · 點擊結束`
    }
    // paused
    if (timer.pauseReason === 'visibility') return '⏸ 切到別的分頁 · 點擊繼續'
    if (timer.pauseReason === 'idle') return '⏸ 90s 無動作 · 點擊繼續'
    return '⏸ 已暫停 · 點擊繼續'
  })()

  const minutesUntilDmnDraw = totalStudyMin > 0 ? 30 - (totalStudyMin % 30) : 30

  return (
    <>
      <LeaderboardPromoBanner />

      <section style={statusChipStyle} aria-label="進度狀態">
        <div style={statusItemStyle}>
          <span style={statusEmojiStyle}>🧬</span>
          <span style={statusLabelStyle}>變體</span>
          <span style={statusValueStyle}>{stats.variants}</span>
          <span style={statusMaxStyle}>/ 55</span>
        </div>
        <span style={statusSepStyle}>·</span>
        <div style={statusItemStyle}>
          <span style={statusEmojiStyle}>🔗</span>
          <span style={statusLabelStyle}>Synapse</span>
          <span style={statusValueStyle}>{stats.synapsesStrong}</span>
          <span style={statusMaxStyle}>強 / {stats.synapsesWeak} 弱</span>
        </div>
        <span style={statusSepStyle}>·</span>
        <div style={statusItemStyle}>
          <span style={statusEmojiStyle}>💎</span>
          <span style={statusLabelStyle}>DMN</span>
          <span style={statusValueStyle}>{stats.dmnOwned}</span>
          <span style={statusMaxStyle}>/ 20</span>
        </div>
        <span style={statusSepStyle}>·</span>
        <div style={statusItemStyle}>
          <span style={statusEmojiStyle}>📖</span>
          <span style={statusLabelStyle}>累積閱讀</span>
          <span style={statusValueStyle}>{totalStudyMin}</span>
          <span style={statusMaxStyle}>min</span>
        </div>
      </section>

      <header style={heroStyle}>
        <div>
          <h1 style={heroTitleStyle}>{pack.meta.displayName}</h1>
          <p style={heroSubtitleStyle}>
            "Neurons that fire together, wire together." — Donald Hebb
          </p>
        </div>
      </header>

      <section style={quizCtaSectionStyle}>
        <div style={ctaButtonRowStyle}>
          <button
            type="button"
            style={quizCtaButtonStyle}
            onClick={() => setQuizOpen(true)}
            aria-label="開始答題"
            disabled={quizPool.length === 0}
          >
            🎯 開始答題
            {selectedFamilyDisplayName && (
              <span style={ctaFamilyChipStyle}>· {selectedFamilyDisplayName}</span>
            )}
          </button>
          <button
            type="button"
            style={timer.status === 'reading' ? readingActiveButtonStyle : readingCtaButtonStyle}
            onClick={onTimerToggle}
            aria-label="閱讀計時器"
          >
            {timerButtonLabel}
          </button>
        </div>
        <p style={quizCtaHintStyle}>
          {selectedFamilyDisplayName ? (
            <>
              答題 → 從 <strong>{selectedFamilyDisplayName}</strong> ({quizPool.length} 題) 抽題。
            </>
          ) : (
            <>答題 → 跨 11 family 隨機抽題（共 {quizPool.length} 題）。</>
          )}{' '}
          同一天兩 family 各答對 5 題 wire 出 synapse。閱讀 → 累計每分鐘 +1 study min，每 30 min 觸發 DMN 抽卡。
          <br />
          今日累計 <strong>{totalStudyMin}</strong> min · 距下個 DMN 抽卡還剩 <strong>{minutesUntilDmnDraw}</strong> min。
        </p>
      </section>

      <FamilyPicker
        pack={pack}
        selectedFamilyId={selectedFamilyId}
        onSelect={setSelectedFamilyId}
      />

      {quizOpen && <QuizModal pool={quizPool} onClose={() => setQuizOpen(false)} />}

      <section style={sectionStyle}>
        <h2 style={h2Style}>🎓 家族熟練度</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {pack.subjects.map((s) => (
            <MasteryChip key={s.id} familyId={s.id} displayName={s.displayName} />
          ))}
        </div>
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.78em', color: '#8c6d4a' }}>
          每答對 1 題 correct +1 + total +1；答錯 total +1。tier 在 5 題後評估，需同時通過題數與正確率雙閘門。
        </p>
      </section>

      <footer style={{ marginTop: '2rem', fontSize: '0.8em', color: '#5a3f29' }}>
        <p style={{ margin: '0.25rem 0' }}>
          來源：
          {pack.meta.credits.map((c, i) => (
            <span key={i}>
              {i > 0 && ' · '}
              {c.url ? (
                <a href={c.url} target="_blank" rel="noreferrer">
                  {c.name}
                </a>
              ) : (
                c.name
              )}
              （{c.license}）
            </span>
          ))}
        </p>
        <p style={{ margin: '0.25rem 0' }}>
          開源 fork engine · AGPL-3.0 · content packs CC-BY-NC · 本站不收費、不放廣告。
          <br />
          回報問題 / 想法 → 從各頁設定面板的「回報問題」按鈕，或開 GitHub issue。
        </p>
      </footer>
    </>
  )
}

// EEG-monitor status readout — dark signal surface + grid/scanline backdrop +
// monospace signal-cyan values. The single Overview data surface (D3 + D5); the
// rest of the page stays warm. (polish-neurons-clinical-machine-aesthetic)
const statusChipStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.5rem',
  justifyContent: 'center',
  padding: '0.5rem 0.85rem',
  marginBottom: '1rem',
  background: 'var(--signal-bg)',
  backgroundImage:
    'linear-gradient(var(--grid-line) 1px, transparent 1px),' +
    'linear-gradient(90deg, var(--grid-line) 1px, transparent 1px),' +
    'repeating-linear-gradient(0deg, var(--scanline) 0px, var(--scanline) 1px, transparent 1px, transparent 3px)',
  backgroundSize: '18px 18px, 18px 18px, 100% 3px',
  color: 'var(--signal-ink)',
  border: '2px solid var(--signal-dim)',
  borderRadius: '6px',
  fontSize: '0.8rem',
  fontWeight: 600,
}

const statusItemStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'baseline',
  gap: '0.3rem',
}

const statusEmojiStyle: React.CSSProperties = { fontSize: '0.95rem' }
const statusLabelStyle: React.CSSProperties = { color: 'var(--signal-ink)', opacity: 0.75, fontWeight: 500 }
const statusValueStyle: React.CSSProperties = {
  color: 'var(--signal-cyan)',
  fontFamily: "'VT323', monospace",
  fontSize: '1.25rem',
  lineHeight: 1,
  fontWeight: 400,
  letterSpacing: '0.5px',
}
const statusMaxStyle: React.CSSProperties = { color: 'var(--signal-ink)', opacity: 0.5, fontWeight: 500 }
const statusSepStyle: React.CSSProperties = { color: 'var(--signal-ink)', opacity: 0.35 }

const heroStyle: React.CSSProperties = {
  marginBottom: '1rem',
  padding: '0.85rem 1rem',
  background: 'linear-gradient(135deg, #fdf6e3 0%, #f4ecd8 100%)',
  border: '2px solid #8c6d4a',
  borderRadius: '6px',
}

const heroTitleStyle: React.CSSProperties = {
  fontSize: '1.35rem',
  margin: '0 0 0.25rem',
  color: '#3a2a1a',
}

const heroSubtitleStyle: React.CSSProperties = {
  margin: 0,
  color: '#5a3f29',
  fontStyle: 'italic',
  fontSize: '0.9rem',
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

const quizCtaSectionStyle: React.CSSProperties = {
  background: 'linear-gradient(135deg, #fdf2e8 0%, #f5e6d3 100%)',
  border: '2px solid #d4a04d',
  borderRadius: '8px',
  padding: '1rem 1.1rem',
  marginBottom: '1rem',
  boxShadow: '0 2px 6px rgba(212, 160, 77, 0.15)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '0.5rem',
}

const ctaButtonRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
}

const quizCtaButtonStyle: React.CSSProperties = {
  padding: '0.65rem 1.4rem',
  borderRadius: '6px',
  border: '1px solid #b8893a',
  background: '#d4a04d',
  color: '#fff',
  fontSize: '1.05rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
}

const readingCtaButtonStyle: React.CSSProperties = {
  padding: '0.65rem 1.4rem',
  borderRadius: '6px',
  border: '1px solid #6a8c3f',
  background: '#7fa84a',
  color: '#fff',
  fontSize: '1.05rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
}

const readingActiveButtonStyle: React.CSSProperties = {
  ...readingCtaButtonStyle,
  background: '#4d8c4d',
  border: '1px solid #3a6a3a',
  animation: 'pulse 2s ease-in-out infinite',
}

const quizCtaHintStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.85rem',
  color: '#5a3f29',
  lineHeight: 1.55,
}

const ctaFamilyChipStyle: React.CSSProperties = {
  marginLeft: '0.5rem',
  padding: '0.15rem 0.5rem',
  background: 'rgba(255,255,255,0.25)',
  borderRadius: '4px',
  fontSize: '0.78em',
  fontWeight: 600,
}
