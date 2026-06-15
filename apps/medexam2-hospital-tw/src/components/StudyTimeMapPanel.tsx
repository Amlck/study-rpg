import type { StudyTimeMap } from '../lib/study-time'
import { EmojiIcon } from './EmojiIcon'

interface StudyTimeMapPanelProps {
  data: StudyTimeMap
}

export function StudyTimeMapPanel({ data }: StudyTimeMapPanelProps) {
  const maxHour = Math.max(0, ...data.hourlyMinutes)

  return (
    <section className="study-time-map" aria-label="讀書時間地圖">
      <header className="study-time-map__head">
        <div>
          <h2 className="study-time-map__title">
            <EmojiIcon char="🗓" size={22} /> 讀書時間地圖
          </h2>
          <p className="study-time-map__subtitle">近 12 週 active session 分布</p>
        </div>
        <div className="study-time-map__summary">
          <Metric label="總計" value={`${Math.round(data.totalMinutes)} 分`} />
          <Metric label="天數" value={`${data.activeDays} 天`} />
          <Metric label="連續" value={`${data.currentStreak} 天`} />
        </div>
      </header>

      <div className="study-time-map__body">
        <div className="study-time-map__grid" aria-label="每日讀書分鐘熱圖">
          {data.days.map((day) => (
            <span
              key={day.dayKey}
              className={`study-time-map__cell study-time-map__cell--${day.level}`}
              title={`${day.dayKey}: ${formatMinutes(day.minutes)}`}
              aria-label={`${day.dayKey} ${formatMinutes(day.minutes)}`}
            />
          ))}
        </div>
        <div className="study-time-map__legend" aria-hidden="true">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <span key={level} className={`study-time-map__cell study-time-map__cell--${level}`} />
          ))}
          <span>多</span>
        </div>
      </div>

      <div className="study-time-map__hours" aria-label="一天中讀書時段分布">
        {data.hourlyMinutes.map((minutes, hour) => (
          <span key={hour} className="study-time-map__hour" title={`${hour}:00 ${formatMinutes(minutes)}`}>
            <span
              className="study-time-map__hour-fill"
              style={{ height: `${maxHour > 0 ? Math.max(6, (minutes / maxHour) * 100) : 0}%` }}
            />
          </span>
        ))}
      </div>
      <div className="study-time-map__hour-labels" aria-hidden="true">
        <span>0</span>
        <span>6</span>
        <span>12</span>
        <span>18</span>
        <span>23</span>
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="study-time-map__metric">
      <span className="study-time-map__metric-label">{label}</span>
      <span className="study-time-map__metric-value">{value}</span>
    </div>
  )
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return '0 分'
  if (minutes < 60) return `${Math.round(minutes)} 分`
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return rest > 0 ? `${hours} 小時 ${rest} 分` : `${hours} 小時`
}
