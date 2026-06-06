import { Link } from 'react-router-dom'
import type { Subject } from '@study-rpg/core'
import type { MasteryRow } from '../db/schema'
import { formatMasteryPercent } from '../lib/mastery'
import { EmojiIcon } from './EmojiIcon'

interface Props {
  subject: Subject
  affinity: number
  threshold: number
  mastery?: MasteryRow
  /** Number of due SRS cards available for this subject today (post-cap allocation). */
  dueCount?: number
  /** Answered vs total question counts for completion tracking. */
  completion?: { answered: number; total: number }
  /** When true, the 「📚 學習」 button is disabled and the disabled-reason caption renders. */
  quizDisabled?: boolean
  /** Caption text rendered below the actions row when `quizDisabled === true`. */
  quizDisabledReason?: string
  onStartQuiz: () => void
}

export function RecruitmentBanner({
  subject,
  affinity,
  threshold,
  mastery,
  dueCount = 0,
  completion,
  quizDisabled = false,
  quizDisabledReason,
  onStartQuiz,
}: Props) {
  const unlocked = affinity >= threshold
  const missing = Math.max(0, Math.ceil(threshold - affinity))
  const progressPct = Math.min(100, Math.round((affinity / threshold) * 100))
  const affinityDisplay = Math.round(affinity * 10) / 10

  return (
    <article
      className={`banner ${unlocked ? 'banner--unlocked' : 'banner--locked'}`}
      style={{ ['--banner-color' as string]: subject.color }}
    >
      <header className="banner__head">
        <h3 className="banner__title">{subject.displayName}</h3>
        <span className="banner__group">{subject.group}</span>
      </header>

      <div className="banner__progress">
        <div className="banner__progress-bar" style={{ width: `${progressPct}%` }} aria-hidden />
        <span className="banner__progress-text">
          {affinityDisplay} / {threshold}
        </span>
      </div>

      <div className="banner__chip-row">
        <span className="banner__mastery">{formatMasteryPercent(mastery)}</span>
        {dueCount > 0 && (
          <span className="banner__due-chip" title={`今日待複習 ${dueCount} 題`}>
            <EmojiIcon char="🔴" size={16} /> {dueCount > 99 ? '99+' : dueCount}
          </span>
        )}
        {completion && (
          <span
            className={`banner__completion-chip ${completion.answered === completion.total ? 'banner__completion-chip--complete' : ''}`}
            title={`本科題庫進度：${completion.answered} / ${completion.total}`}
          >
            <EmojiIcon char={completion.answered === completion.total ? '🏆' : '✅'} size={16} />{' '}
            {completion.answered} / {completion.total}
          </span>
        )}
      </div>

      <div className="banner__actions">
        <button
          type="button"
          className="banner__study"
          onClick={onStartQuiz}
          disabled={quizDisabled}
          title={quizDisabled ? quizDisabledReason : undefined}
        >
          <EmojiIcon char="📚" size={20} /> 學習
        </button>
        {unlocked ? (
          <Link
            to="/supply"
            className="banner__roll banner__supply-link"
            title="前往院務補給招募醫師"
          >
            <EmojiIcon char="🏥" size={20} /> 補給
          </Link>
        ) : (
          <button
            type="button"
            className="banner__roll"
            disabled
            title={`再答對 ${missing} 題${subject.displayName}解鎖`}
          >
            <EmojiIcon char="🏥" size={20} /> 補給
          </button>
        )}
      </div>
      {quizDisabled && quizDisabledReason && (
        <p className="banner-quiz-disabled-note"><EmojiIcon char="📷" size={16} /> {quizDisabledReason}</p>
      )}
      {!unlocked && (
        <p className="banner__locked-msg">
          再答對 <strong>{missing}</strong> 題{subject.displayName}解鎖招募
        </p>
      )}
    </article>
  )
}
