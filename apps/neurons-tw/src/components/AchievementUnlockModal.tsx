/**
 * Subscriber bridge between achievement modal queue and the motion library
 * `<AchievementUnlockModal>` primitive. Renders P1 鑽石-tier unlocks only.
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import { useEffect, useState } from 'react'
import { AchievementUnlockModal as MotionModal } from '../lib/motion'
import {
  dismissModal,
  subscribeAchievementToasts,
  type QueuedAchievement,
} from '../lib/achievement-toast-queue'
import { BadgeSprite } from './BadgeSprite'
import { TIER_LABEL } from '@study-rpg/content-neurons-tw'

export default function AchievementUnlockModal(): JSX.Element | null {
  const [active, setActive] = useState<QueuedAchievement | null>(null)

  useEffect(() => {
    return subscribeAchievementToasts((snap) => setActive(snap.modal))
  }, [])

  if (!active) return null
  const { achievement } = active

  const rewardLabel =
    achievement.reward.kind === 'title'
      ? `稱號解鎖：${achievement.reward.title}`
      : '勳章已上排行榜'

  return (
    <MotionModal
      onDismiss={dismissModal}
      achievement={{
        tierLabel: TIER_LABEL[achievement.tier],
        badge: <BadgeSprite category={achievement.category} tier={achievement.tier} size={128} />,
        title: achievement.name,
        description: achievement.description,
        rewardLabel,
        ctaLabel: '太棒了',
      }}
    />
  )
}
