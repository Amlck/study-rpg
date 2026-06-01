/**
 * Achievement unlock toast queue — minimal pub-sub singleton.
 *
 * Hooks `push()` unlock events. React UI components subscribe via
 * `useAchievementToasts()` (Phase 8 wiring). P4/P3/P2 unlocks render as
 * `AchievementUnlockToast` (8s auto-dismiss); P1 unlocks render as
 * `AchievementUnlockModal` (dismiss-required full screen). UI decides
 * which renderer based on `achievement.tier`.
 *
 * Spec: openspec/specs/achievement-system/spec.md "Unlock toast and
 * full-screen modal UI".
 */

import type { Achievement } from '@study-rpg/core'

type Listener = (snapshot: readonly Achievement[]) => void

class AchievementToastQueueImpl {
  private queue: Achievement[] = []
  private listeners = new Set<Listener>()

  /** Append an unlock; notify all subscribers with the new full queue. */
  push(achievement: Achievement): void {
    this.queue.push(achievement)
    this.emit()
  }

  /** Remove a specific achievement from the queue (called after UI dismiss). */
  dismiss(achievementId: string): void {
    const before = this.queue.length
    this.queue = this.queue.filter((a) => a.id !== achievementId)
    if (this.queue.length !== before) this.emit()
  }

  /** Get current queue snapshot (readonly). */
  snapshot(): readonly Achievement[] {
    return this.queue
  }

  /** Subscribe to queue changes; returns unsubscribe function. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    // Fire immediately with current state so subscriber syncs
    listener(this.queue)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    const snap = [...this.queue]
    for (const l of this.listeners) l(snap)
  }
}

export const achievementToastQueue = new AchievementToastQueueImpl()
