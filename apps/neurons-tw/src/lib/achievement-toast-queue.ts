/**
 * Achievement toast / modal queue.
 *
 * Two surfaces:
 * - **Toast** (P2/P3/P4) — pushed to `ConnectomeToastHost` via a subscription
 *   bridge; auto-dismisses after `TOAST_AUTO_DISMISS_MS` (per spec timing)
 * - **Modal** (P1) — full-screen reveal; subscriber pulls one at a time and
 *   awaits user dismiss before pulling the next
 *
 * Singleton — module-level state. Components subscribe via the exported
 * `useAchievementToasts` hook (defined in `hooks/useAchievementToasts.ts`).
 *
 * Capability spec: openspec/specs/neurons-achievements/spec.md
 */

import type { NeuronsAchievement } from '@study-rpg/content-neurons-tw'

export interface QueuedAchievement {
  achievement: NeuronsAchievement
  enqueuedAt: number
}

type Listener = (snapshot: { toasts: QueuedAchievement[]; modal: QueuedAchievement | null }) => void

let toastQueue: QueuedAchievement[] = []
let modalQueue: QueuedAchievement[] = []
let activeModal: QueuedAchievement | null = null
const listeners = new Set<Listener>()

function snapshot() {
  return { toasts: [...toastQueue], modal: activeModal }
}

function notify() {
  const snap = snapshot()
  for (const l of listeners) l(snap)
}

/** Push a newly-unlocked achievement to the appropriate queue (P1 → modal, else toast). */
export function pushAchievementToast(achievement: NeuronsAchievement): void {
  const entry: QueuedAchievement = { achievement, enqueuedAt: Date.now() }
  if (achievement.tier === 'P1') {
    if (activeModal == null) {
      activeModal = entry
    } else {
      modalQueue.push(entry)
    }
  } else {
    toastQueue.push(entry)
  }
  notify()
}

/** Subscriber API — returns unsubscribe. */
export function subscribeAchievementToasts(listener: Listener): () => void {
  listeners.add(listener)
  listener(snapshot())
  return () => {
    listeners.delete(listener)
  }
}

/** Toast component calls this after auto-dismiss timeout. */
export function dismissToast(id: string): void {
  toastQueue = toastQueue.filter((q) => q.achievement.id !== id)
  notify()
}

/** Modal component calls this when user dismisses. Pulls next from queue. */
export function dismissModal(): void {
  activeModal = modalQueue.shift() ?? null
  notify()
}

/** Test helper — clear all queues. */
export function clearAchievementQueues(): void {
  toastQueue = []
  modalQueue = []
  activeModal = null
  notify()
}
