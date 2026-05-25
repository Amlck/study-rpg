/**
 * Achievement unlock toast — 8s auto-dismiss, celebratory polarity, used for
 * P4/P3/P2 unlocks. P1 unlocks go to AchievementUnlockModal (full-screen)
 * instead — caller (App.tsx) routes based on `achievement.tier`.
 *
 * Mirror pattern: MilestoneTipToast (8s timeout + top-center pinned + ×
 * dismiss button).
 *
 * Spec: openspec/specs/achievement-system/spec.md "Unlock toast and
 * full-screen modal UI"
 */

import { useEffect } from 'react'
import type { Achievement } from '@study-rpg/core'
import { BadgeSprite } from './BadgeSprite'
import { SubjectBadgeSprite } from './SubjectBadgeSprite'

export interface AchievementUnlockToastProps {
  achievement: Achievement
  onDismiss: () => void
}

export function AchievementUnlockToast({
  achievement,
  onDismiss,
}: AchievementUnlockToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 8000)
    return () => clearTimeout(t)
  }, [achievement.id, onDismiss])

  // Subject mastery achievements use SubjectBadgeSprite; everything else uses
  // BadgeSprite (category × tier). Subject id is parsed from the achievement
  // id `subject-master-<subjectId>`.
  const isSubject = achievement.category === 'subject' && achievement.id.startsWith('subject-master-')
  const subjectId = isSubject ? achievement.id.replace('subject-master-', '') : null

  return (
    <div
      className={`achievement-unlock-toast achievement-unlock-toast--${achievement.tier}`}
      role="status"
      aria-live="polite"
    >
      <div className="achievement-unlock-toast__badge" aria-hidden>
        {isSubject && subjectId ? (
          <SubjectBadgeSprite subjectId={subjectId} size={64} />
        ) : (
          <BadgeSprite category={achievement.category} tier={achievement.tier} size={64} />
        )}
      </div>
      <div className="achievement-unlock-toast__body">
        <strong className="achievement-unlock-toast__title">解鎖：{achievement.name}</strong>
        <span className="achievement-unlock-toast__detail">{achievement.description}</span>
      </div>
      <button
        type="button"
        className="achievement-unlock-toast__close"
        onClick={onDismiss}
        aria-label="關閉"
      >
        ×
      </button>
    </div>
  )
}
