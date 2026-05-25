/**
 * Achievement unlock modal — full-screen reveal for P1 鑽石 tier. Dismiss
 * required (no auto-timeout). Renders BadgeSprite at 128px center + name +
 * description + reward hint.
 *
 * Pattern: mirror RecruitmentResultModal full-screen reveal.
 *
 * Spec: openspec/specs/achievement-system/spec.md "Unlock toast and
 * full-screen modal UI" Scenario "P1 鑽石 triggers full-screen reveal".
 */

import type { Achievement } from '@study-rpg/core'
import { BadgeSprite } from './BadgeSprite'
import { SubjectBadgeSprite } from './SubjectBadgeSprite'

export interface AchievementUnlockModalProps {
  achievement: Achievement
  onDismiss: () => void
}

function rewardLabel(reward: Achievement['reward']): string {
  switch (reward.kind) {
    case 'cosmetic':
      return `造型解鎖：${reward.cosmeticId}`
    case 'title':
      return `稱號：${reward.title}`
    case 'badge':
      return '專屬勳章'
  }
}

export function AchievementUnlockModal({
  achievement,
  onDismiss,
}: AchievementUnlockModalProps) {
  const isSubject = achievement.category === 'subject' && achievement.id.startsWith('subject-master-')
  const subjectId = isSubject ? achievement.id.replace('subject-master-', '') : null

  return (
    <div
      className="modal-backdrop achievement-unlock-modal-backdrop"
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="achievement-unlock-modal-title"
    >
      <div
        className="modal-card achievement-unlock-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="achievement-unlock-modal__head">
          <div className="achievement-unlock-modal__tier-chip">P1 💎 鑽石</div>
          <div className="achievement-unlock-modal__badge" aria-hidden>
            {isSubject && subjectId ? (
              <SubjectBadgeSprite subjectId={subjectId} size={128} />
            ) : (
              <BadgeSprite category={achievement.category} tier="P1" size={128} />
            )}
          </div>
        </header>
        <div className="achievement-unlock-modal__body">
          <h2 id="achievement-unlock-modal-title" className="achievement-unlock-modal__title">
            {achievement.name}
          </h2>
          <p className="achievement-unlock-modal__description">{achievement.description}</p>
          <div className="achievement-unlock-modal__reward">
            <span className="achievement-unlock-modal__reward-label">獎勵</span>
            <span className="achievement-unlock-modal__reward-value">
              {rewardLabel(achievement.reward)}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="primary-btn achievement-unlock-modal__close"
          onClick={onDismiss}
        >
          太強了！
        </button>
      </div>
    </div>
  )
}
