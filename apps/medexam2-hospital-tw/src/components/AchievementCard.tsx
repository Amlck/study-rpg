/**
 * AchievementCard — single tile shown on `/achievements` page grid.
 *
 * Handles two states:
 *   - Unlocked: full BadgeSprite + name + description + unlock date + reward chip
 *   - Locked: silhouette (BadgeSprite with reduced opacity / grayscale via CSS)
 *     + "?" name placeholder
 *
 * Hidden achievements not unlocked: caller (AchievementsPage) MUST filter
 * them out BEFORE rendering — `AchievementCard` itself doesn't enforce this,
 * since some callers may legitimately want to preview (e.g. dev tools).
 *
 * Spec: openspec/specs/achievement-system/spec.md UI requirements.
 */

import type { Achievement } from '@study-rpg/core'
import { BadgeSprite } from './BadgeSprite'
import { SubjectBadgeSprite } from './SubjectBadgeSprite'

export interface AchievementCardProps {
  achievement: Achievement
  /** Epoch ms of unlock; null if locked. */
  unlockedAt: number | null
}

function formatUnlockDate(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function rewardChip(reward: Achievement['reward']): string {
  switch (reward.kind) {
    case 'cosmetic':
      return `🎨 ${reward.cosmeticId}`
    case 'title':
      return `🏅 ${reward.title}`
    case 'badge':
      return '🥇 勳章'
  }
}

export function AchievementCard({ achievement, unlockedAt }: AchievementCardProps) {
  const locked = unlockedAt === null
  const isSubject =
    achievement.category === 'subject' && achievement.id.startsWith('subject-master-')
  const subjectId = isSubject ? achievement.id.replace('subject-master-', '') : null

  return (
    <article
      className={`achievement-card achievement-card--${achievement.tier} ${
        locked ? 'achievement-card--locked' : 'achievement-card--unlocked'
      }`}
      aria-label={
        locked ? `未解鎖：${achievement.name}` : `已解鎖：${achievement.name}`
      }
    >
      <div className="achievement-card__badge" aria-hidden>
        {isSubject && subjectId ? (
          <SubjectBadgeSprite subjectId={subjectId} size={48} />
        ) : (
          <BadgeSprite category={achievement.category} tier={achievement.tier} size={48} />
        )}
      </div>
      <div className="achievement-card__body">
        <h3 className="achievement-card__name">
          {locked ? '? ? ?' : achievement.name}
        </h3>
        <p className="achievement-card__description">
          {locked ? '達成條件解鎖' : achievement.description}
        </p>
        {!locked && unlockedAt !== null && (
          <div className="achievement-card__meta">
            <span className="achievement-card__date">{formatUnlockDate(unlockedAt)}</span>
            <span className="achievement-card__reward">{rewardChip(achievement.reward)}</span>
          </div>
        )}
      </div>
    </article>
  )
}
