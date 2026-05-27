/**
 * Stats sub-tab panel — rendered inside `AchievementsPage` when the player
 * selects the 統計 sub-tab. Two stacked SVG bar charts (study minutes / day,
 * correct answers / day), a range chip selector (7d / 30d / 90d / 全部),
 * and a subject filter (reused `BookmarkFilterBar`) that affects only the
 * correct-answers chart.
 *
 * Spec: openspec/specs/achievement-system/spec.md
 *   - "Stats sub-tab SHALL render two bar charts — daily study minutes
 *      and daily correct answers"
 *   - "Stats sub-tab SHALL provide a range chip with four options"
 *   - "Stats sub-tab SHALL provide a subject filter that affects the
 *      correct-answers chart only"
 *   - "Stats sub-tab SHALL surface a summary chip showing pre-upgrade
 *      residual minutes"
 * Spec: openspec/specs/daily-study-log/spec.md "Stats consumers SHALL
 *   surface forward-only data caveat in UI"
 */

import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { SubjectId } from '@study-rpg/core'
import { ALL_SUBJECT_IDS, getHospitalDB } from '../db/schema'
import { dateRangeYMD, formatYMD, startOfDay, subDays } from '../lib/util/date'
import { BookmarkFilterBar } from './BookmarkFilterBar'

type RangeOption = 7 | 30 | 90 | 'all'

const RANGE_OPTIONS: ReadonlyArray<{ value: RangeOption; label: string }> = [
  { value: 7, label: '7 天' },
  { value: 30, label: '30 天' },
  { value: 90, label: '90 天' },
  { value: 'all', label: '全部' },
]

const STUDY_COLOR = '#4a9b9b'
const CORRECT_COLOR = '#d8923d'

interface ChartDatum {
  date: string
  value: number
}

function computeRangeBounds(
  range: RangeOption,
  earliestDataDate: Date | null,
): { start: Date; end: Date } | null {
  const today = startOfDay(new Date())
  if (range === 'all') {
    if (!earliestDataDate) return null
    return { start: startOfDay(earliestDataDate), end: today }
  }
  return { start: subDays(today, range - 1), end: today }
}

/**
 * Aggregate study-minute rows into per-day values within the given range,
 * zero-filling empty days so the X-axis stays continuous.
 */
export function aggregateStudyMinutes(
  rows: ReadonlyArray<{ date: string; minutesAdded: number }>,
  bounds: { start: Date; end: Date },
): ChartDatum[] {
  const byDate = new Map<string, number>()
  for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.minutesAdded)
  const dates = dateRangeYMD(bounds.start, bounds.end)
  return dates.map((d) => ({ date: d, value: byDate.get(d) ?? 0 }))
}

/**
 * Aggregate correct-answer rows (questionHistory) into per-day counts within
 * the given range. Filters by `lastResult === 'correct'` and optional subject
 * filter. Best-effort: per-question last-attempt only (see proposal trade-off).
 */
export function aggregateCorrectAnswers(
  rows: ReadonlyArray<{ lastAnsweredAt: number; lastResult: string; subjectId: string }>,
  bounds: { start: Date; end: Date },
  subjectFilter: ReadonlySet<SubjectId> | null,
): ChartDatum[] {
  const byDate = new Map<string, number>()
  const startMs = bounds.start.getTime()
  const endMs = bounds.end.getTime() + 24 * 60 * 60 * 1000 - 1 // inclusive end-of-day
  for (const r of rows) {
    if (r.lastResult !== 'correct') continue
    if (r.lastAnsweredAt < startMs || r.lastAnsweredAt > endMs) continue
    if (subjectFilter && subjectFilter.size > 0 && !subjectFilter.has(r.subjectId as SubjectId)) {
      continue
    }
    const key = formatYMD(new Date(r.lastAnsweredAt))
    byDate.set(key, (byDate.get(key) ?? 0) + 1)
  }
  const dates = dateRangeYMD(bounds.start, bounds.end)
  return dates.map((d) => ({ date: d, value: byDate.get(d) ?? 0 }))
}

interface BarChartProps {
  data: ChartDatum[]
  barColor: string
  title: string
  yLabel: string
  /** Baseline Y-axis max (e.g. 600 min, 500 題). Auto-extends if any data point exceeds. */
  yMax: number
  /** Y gridline interval (e.g. 120 for every 2 hours). Lines drawn at yGridStep, 2×yGridStep, … up to yMax. */
  yGridStep: number
  /** Number of X-axis segments — gridlines drawn at each segment boundary. Default 4. */
  xGridSegments?: number
}

function BarChart({
  data,
  barColor,
  title,
  yLabel,
  yMax: baselineMax,
  yGridStep,
  xGridSegments = 4,
}: BarChartProps) {
  const dataMax = Math.max(0, ...data.map((d) => d.value))
  // Auto-extend if data exceeds baseline (rounded up to next gridline step)
  const yMax =
    dataMax > baselineMax
      ? Math.ceil((dataMax * 1.1) / yGridStep) * yGridStep
      : baselineMax
  // Intermediate Y gridline values: yGridStep, 2×yGridStep, … up to but not including yMax
  const yGridlines: number[] = []
  for (let v = yGridStep; v < yMax; v += yGridStep) yGridlines.push(v)

  const chartHeight = 160
  const padding = { top: 8, right: 8, bottom: 24, left: 50 }
  const innerWidth = 600 // viewBox base; SVG scales via width=100%
  const innerHeight = chartHeight - padding.top - padding.bottom
  const plotWidth = innerWidth - padding.left - padding.right
  const barCount = data.length
  const barGap = 1
  const barWidth = barCount > 0 ? Math.max(1, plotWidth / barCount - barGap) : 0

  const yToPx = (v: number): number => padding.top + innerHeight - (v / yMax) * innerHeight
  // Formatter: integer values get no decimal; non-integer get 1 decimal place.
  const fmt = (n: number): string =>
    Number.isInteger(n) ? n.toString() : n.toFixed(1).replace(/\.0$/, '')

  // X gridline indices (segment boundaries, excluding 0 and last)
  const xGridIndices: number[] = []
  if (barCount > 0 && xGridSegments > 1) {
    for (let i = 1; i < xGridSegments; i++) {
      const idx = Math.floor((barCount * i) / xGridSegments)
      if (idx > 0 && idx < barCount) xGridIndices.push(idx)
    }
  }
  const xPosForIndex = (i: number): number =>
    padding.left + i * (barWidth + barGap)

  return (
    <figure className="stats-panel__chart">
      <figcaption className="stats-panel__chart-title">{title}</figcaption>
      <svg
        viewBox={`0 0 ${innerWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${title} 長條圖，最近 ${barCount} 天`}
        className="stats-panel__chart-svg"
      >
        {/* Y gridlines (light) + their labels */}
        {yGridlines.map((v) => (
          <g key={`yg-${v}`}>
            <line
              x1={padding.left}
              y1={yToPx(v)}
              x2={padding.left + plotWidth}
              y2={yToPx(v)}
              className="stats-panel__chart-gridline"
            />
            <text
              x={padding.left - 6}
              y={yToPx(v) + 3}
              textAnchor="end"
              className="stats-panel__chart-y-label"
            >
              {fmt(v)}
            </text>
          </g>
        ))}
        {/* Y max label (top) */}
        <text
          x={padding.left - 6}
          y={padding.top + 8}
          textAnchor="end"
          className="stats-panel__chart-y-label"
        >
          {fmt(yMax)} {yLabel}
        </text>
        {/* X gridlines (light) at segment boundaries */}
        {xGridIndices.map((i) => (
          <line
            key={`xg-${i}`}
            x1={xPosForIndex(i)}
            y1={padding.top}
            x2={xPosForIndex(i)}
            y2={padding.top + innerHeight}
            className="stats-panel__chart-gridline"
          />
        ))}
        {/* X axis baseline */}
        <line
          x1={padding.left}
          y1={padding.top + innerHeight}
          x2={padding.left + plotWidth}
          y2={padding.top + innerHeight}
          className="stats-panel__chart-axis"
        />
        {/* Bars */}
        {data.map((d, i) => {
          const x = padding.left + i * (barWidth + barGap)
          const y = yToPx(d.value)
          const h = padding.top + innerHeight - y
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(0, h)}
                fill={barColor}
                rx={1}
              >
                <title>
                  {d.date}: {fmt(d.value)} {yLabel}
                </title>
              </rect>
            </g>
          )
        })}
        {/* X axis date labels: first / segment boundaries / last */}
        {data.length > 0 && (
          <>
            <text
              x={padding.left}
              y={chartHeight - 6}
              textAnchor="start"
              className="stats-panel__chart-x-label"
            >
              {data[0].date.slice(5)}
            </text>
            {xGridIndices.map((i) => (
              <text
                key={`xl-${i}`}
                x={xPosForIndex(i)}
                y={chartHeight - 6}
                textAnchor="middle"
                className="stats-panel__chart-x-label"
              >
                {data[i].date.slice(5)}
              </text>
            ))}
            <text
              x={padding.left + plotWidth}
              y={chartHeight - 6}
              textAnchor="end"
              className="stats-panel__chart-x-label"
            >
              {data[data.length - 1].date.slice(5)}
            </text>
          </>
        )}
      </svg>
    </figure>
  )
}

export function StatsPanel() {
  const db = getHospitalDB()
  const [range, setRange] = useState<RangeOption>(30)
  const [selectedSubjects, setSelectedSubjects] = useState<Set<SubjectId>>(new Set())

  // Reset selected subjects when leaving the panel (cleanup on unmount).
  useEffect(() => () => setSelectedSubjects(new Set()), [])

  const dailyRows = useLiveQuery(() => db.dailyStudyLog.toArray(), []) ?? []
  const historyRows = useLiveQuery(() => db.questionHistory.toArray(), []) ?? []
  const mono = useLiveQuery(() => db.monotonicCounters.get('singleton'), [])

  const earliestDataDate = useMemo<Date | null>(() => {
    let earliest: number | null = null
    for (const r of dailyRows) {
      const ms = Date.parse(r.date)
      if (Number.isFinite(ms) && (earliest === null || ms < earliest)) earliest = ms
    }
    for (const r of historyRows) {
      if (r.lastAnsweredAt && (earliest === null || r.lastAnsweredAt < earliest)) {
        earliest = r.lastAnsweredAt
      }
    }
    return earliest === null ? null : new Date(earliest)
  }, [dailyRows, historyRows])

  const bounds = useMemo(() => computeRangeBounds(range, earliestDataDate), [range, earliestDataDate])

  const studyData = useMemo<ChartDatum[]>(
    () => (bounds ? aggregateStudyMinutes(dailyRows, bounds) : []),
    [dailyRows, bounds],
  )
  const correctData = useMemo<ChartDatum[]>(
    () =>
      bounds
        ? aggregateCorrectAnswers(historyRows, bounds, selectedSubjects)
        : [],
    [historyRows, bounds, selectedSubjects],
  )

  const residualMinutes = useMemo(() => {
    const lifetime = mono?.totalStudyMinutes ?? 0
    const logged = dailyRows.reduce((sum, r) => sum + r.minutesAdded, 0)
    return Math.max(0, lifetime - logged)
  }, [mono, dailyRows])

  const allChartsEmpty =
    studyData.every((d) => d.value === 0) && correctData.every((d) => d.value === 0)
  const isEmptyAll = range === 'all' && !bounds

  return (
    <section className="stats-panel" aria-label="統計">
      <div className="stats-panel__controls">
        <div className="filter-bar__group">
          <span className="filter-bar__label">區間</span>
          <span className="filter-chip-group" role="group" aria-label="統計區間">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className="filter-chip"
                aria-pressed={range === opt.value}
                onClick={() => setRange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </span>
        </div>
        {residualMinutes > 0 && (
          <span
            className="stats-panel__residual-chip"
            title="升級到 v18 後才開始記錄每日唸書時間；升級前的累積時間無法分日顯示。"
          >
            升級前累積{' '}
            {residualMinutes.toLocaleString('zh-TW', { maximumFractionDigits: 0 })} 分鐘 (無法分日顯示)
          </span>
        )}
      </div>

      <p className="stats-panel__filter-caption">分科 filter 僅影響下方圖表（答對題數）</p>
      <BookmarkFilterBar
        availableYears={[]}
        availableSubjects={ALL_SUBJECT_IDS}
        selectedYears={new Set()}
        selectedSubjects={selectedSubjects}
        onYearsChange={() => {
          /* stats panel never filters by year */
        }}
        onSubjectsChange={setSelectedSubjects}
        visibleCount={correctData.reduce((s, d) => s + d.value, 0)}
        totalCount={historyRows.filter((r) => r.lastResult === 'correct').length}
      />

      {isEmptyAll || allChartsEmpty ? (
        <p className="stats-panel__empty">
          還沒有資料 — 開始唸書後會在這裡顯示趨勢。
        </p>
      ) : (
        <>
          <BarChart
            data={studyData}
            barColor={STUDY_COLOR}
            title="每日唸書分鐘"
            yLabel="min"
            yMax={600}
            yGridStep={120}
          />
          <BarChart
            data={correctData}
            barColor={CORRECT_COLOR}
            title="每日答對題數（以最近一次答題狀態統計）"
            yLabel="題"
            yMax={500}
            yGridStep={100}
          />
        </>
      )}
    </section>
  )
}
