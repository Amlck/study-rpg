import type { SubjectId } from '@study-rpg/core'
import type { StudyInsightsResult, SubjectInsight, IntervalKey } from '../lib/study-insights'
import { EmojiIcon } from './EmojiIcon'

interface StudyInsightsPanelProps {
  data: StudyInsightsResult
  onStartQuiz: (subjectId: SubjectId) => void
  onStartChallenge?: (subjectId: SubjectId) => void
}

const INTERVALS: Array<{ key: IntervalKey; label: string }> = [
  { key: '3d', label: '3日' },
  { key: '7d', label: '7日' },
  { key: '14d', label: '14日' },
]

export function StudyInsightsPanel({ data, onStartQuiz, onStartChallenge }: StudyInsightsPanelProps) {
  if (data.summary.totalPlayable === 0) return null

  const priority = data.insights.slice(0, 5)
  const lowCoverage = [...data.insights]
    .sort((a, b) => a.coverageRate - b.coverageRate)
    .slice(0, 6)

  return (
    <section className="study-insights" aria-label="弱科雷達">
      <header className="study-insights__head">
        <div>
          <h2 className="study-insights__title">
            <EmojiIcon char="📈" size={22} /> 弱科雷達
          </h2>
          <p className="study-insights__subtitle">正答率優先，錯題 / SRS 其次</p>
        </div>
        <div className="study-insights__summary">
          <Metric label="已做" value={`${data.summary.answered}/${data.summary.totalPlayable}`} />
          <Metric label="覆蓋" value={formatPct(data.summary.coverageRate)} />
          <Metric label="SRS" value={String(data.summary.dueCount)} />
        </div>
      </header>

      <div className="study-insights__grid">
        <div className="study-insights__priority" aria-label="今日優先科別">
          <h3 className="study-insights__section-title">今日優先</h3>
          <div className="study-insights__bars">
            {priority.map((row) => (
              <PriorityBar
                key={row.subjectId}
                row={row}
                onStartQuiz={onStartQuiz}
                onStartChallenge={onStartChallenge}
              />
            ))}
          </div>
        </div>

        <div className="study-insights__coverage" aria-label="練習覆蓋率">
          <h3 className="study-insights__section-title">題量缺口</h3>
          <div className="study-insights__coverage-list">
            {lowCoverage.map((row) => (
              <CoverageBar key={row.subjectId} row={row} />
            ))}
          </div>
        </div>
      </div>

      <div className="study-insights__heatmap" aria-label="近三日七日十四日正答率">
        <div className="study-insights__heatmap-head">
          <span>科別</span>
          {INTERVALS.map((interval) => (
            <span key={interval.key}>{interval.label}</span>
          ))}
          <span>錯題</span>
          <span>動作</span>
        </div>
        {data.insights.map((row) => (
          <div key={row.subjectId} className="study-insights__heatmap-row">
            <span className="study-insights__heatmap-subject">{row.displayName}</span>
            {INTERVALS.map((interval) => (
              <IntervalCell key={interval.key} row={row} interval={interval.key} />
            ))}
            <span className="study-insights__wrong-count">{row.wrongLastCount}</span>
            <span className="study-insights__actions">
              <button
                type="button"
                className="study-insights__quick-start"
                onClick={() => onStartQuiz(row.subjectId)}
              >
                {row.recommendation}
              </button>
              {onStartChallenge && (
                <button
                  type="button"
                  className="study-insights__challenge"
                  onClick={() => onStartChallenge(row.subjectId)}
                >
                  整回
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="study-insights__metric">
      <span className="study-insights__metric-label">{label}</span>
      <span className="study-insights__metric-value">{value}</span>
    </div>
  )
}

function PriorityBar({
  row,
  onStartQuiz,
  onStartChallenge,
}: {
  row: SubjectInsight
  onStartQuiz: (subjectId: SubjectId) => void
  onStartChallenge?: (subjectId: SubjectId) => void
}) {
  return (
    <div className="study-insights__bar-row" aria-label={`${row.displayName} 優先度 ${Math.round(row.priorityScore)}`}>
      <button
        type="button"
        className="study-insights__bar-main"
        onClick={() => onStartQuiz(row.subjectId)}
      >
        <span className="study-insights__bar-label">{row.displayName}</span>
        <span className="study-insights__bar-track">
          <span
            className="study-insights__bar-fill"
            style={{ width: `${Math.max(4, row.priorityScore)}%` }}
          />
        </span>
        <span className="study-insights__bar-score">{Math.round(row.priorityScore)}</span>
      </button>
      {onStartChallenge && (
        <button
          type="button"
          className="study-insights__bar-challenge"
          onClick={() => onStartChallenge(row.subjectId)}
        >
          整回
        </button>
      )}
    </div>
  )
}

function CoverageBar({ row }: { row: SubjectInsight }) {
  return (
    <div className="study-insights__coverage-row">
      <span className="study-insights__coverage-label">{row.displayName}</span>
      <span className="study-insights__coverage-track">
        <span
          className="study-insights__coverage-fill"
          style={{ width: `${Math.round(row.coverageRate * 100)}%` }}
        />
      </span>
      <span className="study-insights__coverage-value">
        {row.unanswered}
      </span>
    </div>
  )
}

function IntervalCell({ row, interval }: { row: SubjectInsight; interval: IntervalKey }) {
  const perf = row.intervals[interval]
  const tone =
    perf.rate === null ? 'empty' :
    perf.rate < 0.65 ? 'low' :
    perf.rate < 0.8 ? 'mid' :
    'high'
  return (
    <span className={`study-insights__rate study-insights__rate--${tone}`}>
      {perf.rate === null ? '-' : formatPct(perf.rate)}
      {perf.total > 0 && <small>{perf.total}</small>}
    </span>
  )
}

function formatPct(rate: number): string {
  return `${Math.round(rate * 100)}%`
}
