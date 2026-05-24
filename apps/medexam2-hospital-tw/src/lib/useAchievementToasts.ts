/**
 * React hook subscribing to the global achievement toast queue.
 *
 * Returns the current queue + a `dismiss` function. Each render flushes the
 * latest snapshot. Used by App.tsx top-level layout to fan out queued
 * achievements into AchievementUnlockToast (P4/P3/P2) or
 * AchievementUnlockModal (P1).
 */

import { useEffect, useState } from 'react'
import type { Achievement } from '@study-rpg/core'
import { achievementToastQueue } from './achievement-toast-queue'

export function useAchievementToasts(): {
  queue: readonly Achievement[]
  dismiss: (id: string) => void
} {
  const [queue, setQueue] = useState<readonly Achievement[]>(() =>
    achievementToastQueue.snapshot(),
  )
  useEffect(() => {
    return achievementToastQueue.subscribe(setQueue)
  }, [])
  return { queue, dismiss: (id) => achievementToastQueue.dismiss(id) }
}
