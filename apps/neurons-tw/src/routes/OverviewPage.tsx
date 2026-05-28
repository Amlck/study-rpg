import { useEffect, useState } from 'react'
import type { ContentPack } from '@study-rpg/core'
import { THEME_PIXEL_NEURONS, COSMETIC_CATALOG_SIZE } from '@study-rpg/theme-pixel-neurons'

const SPRITE_MAP = THEME_PIXEL_NEURONS.sprites
import { initMasteryForPack } from '../lib/services/connectome'
import MasteryChip from '../components/MasteryChip'
import LeaderboardPromoBanner from '../components/LeaderboardPromoBanner'
import { QuizModal } from '../components/QuizModal'
import { useReadingTimer } from '../lib/hooks/useReadingTimer'
import { readTotalStudyMinutes } from '../lib/services/reading-timer'

interface Props {
  pack: ContentPack
}

export default function OverviewPage({ pack }: Props): JSX.Element {
  const ntCount = (br: string): number => pack.subjects.filter((s) => s.group === br).length
  const [quizOpen, setQuizOpen] = useState(false)
  const [totalStudyMin, setTotalStudyMin] = useState(0)
  const timer = useReadingTimer()

  useEffect(() => {
    initMasteryForPack(pack).catch(() => {
      // Non-fatal: chips fall back to 0/0 display until next load
    })
  }, [pack])

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
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.35rem' }}>{pack.meta.displayName}</h1>
        <p style={{ margin: 0, color: '#5a3f29', fontStyle: 'italic' }}>
          "Neurons that fire together, wire together." — Donald Hebb
        </p>
      </header>

      <section style={quizCtaSectionStyle}>
        <div style={ctaButtonRowStyle}>
          <button
            type="button"
            style={quizCtaButtonStyle}
            onClick={() => setQuizOpen(true)}
            aria-label="開始答題"
          >
            🎯 開始答題
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
          答題 → 隨機 1 題 / 同一天兩 family 各答對 5 題 wire 出 synapse。
          閱讀 → 累計每分鐘 +1 study min，每 30 min 觸發 DMN 抽卡。
          今日累計 <strong>{totalStudyMin}</strong> min · 距下個 DMN 抽卡還剩 <strong>{minutesUntilDmnDraw}</strong> min。
        </p>
      </section>

      {quizOpen && <QuizModal pool={pack.questions} onClose={() => setQuizOpen(false)} />}

      <section style={sectionStyle}>
        <h2 style={h2Style}>📊 內容總覽</h2>
        <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
          <li>
            題目總數：<strong>{pack.questions.length}</strong>
          </li>
          <li>
            科目（neuron family）：<strong>{pack.subjects.length}</strong>
          </li>
          <li>
            NT branch 分布：DA {ntCount('DA')} / 5-HT {ntCount('5HT')} / GABA{' '}
            {ntCount('GABA')} / Glu {ntCount('Glu')}
          </li>
          <li>
            主題：{THEME_PIXEL_NEURONS.meta.displayName}（道具 {THEME_PIXEL_NEURONS.itemCatalog.length} 項、外觀 {COSMETIC_CATALOG_SIZE} 項）
          </li>
        </ul>
      </section>

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

      <section style={sectionStyle}>
        <h2 style={h2Style}>🧠 4 種神經傳導物質屬性</h2>
        {pack.meta.statSchema && (
          <ul style={{ paddingLeft: '1.2rem', margin: 0 }}>
            {pack.meta.statSchema.order.map((key) => (
              <li
                key={key}
                style={{
                  borderLeft: `4px solid ${pack.meta.statSchema!.colors[key]}`,
                  paddingLeft: '0.6rem',
                  margin: '0.35rem 0',
                }}
              >
                <strong>{pack.meta.statSchema!.labels[key]}</strong>
                <span
                  style={{ color: '#5a3f29', marginLeft: '0.5rem', fontSize: '0.85em' }}
                >
                  （鍵：<code>{key}</code>）
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>🧬 11 個 neuron family 科目</h2>
        {(['DA', '5HT', 'GABA', 'Glu'] as const).map((branch) => {
          const familiesInBranch = pack.subjects.filter((s) => s.group === branch)
          if (familiesInBranch.length === 0) return null
          return (
            <div key={branch} style={{ marginBottom: '0.8rem' }}>
              <h3
                style={{
                  fontSize: '0.95rem',
                  margin: '0.4rem 0 0.25rem',
                  color: familiesInBranch[0]?.color ?? '#000',
                }}
              >
                {branch} 分支（{familiesInBranch.length} 個）
              </h3>
              <ul style={{ paddingLeft: '0', margin: 0, listStyle: 'none' }}>
                {familiesInBranch.map((s) => (
                  <li
                    key={s.id}
                    style={{
                      margin: '0.4rem 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.6rem',
                    }}
                  >
                    <img
                      src={SPRITE_MAP[`subject:${s.id}`] ?? ''}
                      alt={s.displayName}
                      width={48}
                      height={48}
                      style={{
                        imageRendering: 'pixelated',
                        border: `2px solid ${s.color}`,
                        borderRadius: '4px',
                        background: '#fdf6e3',
                        flexShrink: 0,
                      }}
                    />
                    <div>
                      <div>
                        <strong style={{ color: s.color }}>{s.displayName}</strong>
                        <span
                          style={{ color: '#5a3f29', marginLeft: '0.4rem', fontSize: '0.85em' }}
                        >
                          （{s.totalQuestions} 題、id：<code>{s.id}</code>）
                        </span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
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
          Scaffold + content + theme + connectome 已就位。下一步：sprite + gacha + leaderboard + achievement + deploy。
        </p>
      </footer>
    </>
  )
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
