/**
 * Grace toast — fired on a local wrong→correct transition, per
 * add-bookmarks-filters-and-wrong-history-medexam2 Decision 6.
 *
 * Lifecycle:
 *   1. Local quiz answer in QuizModal / ER consultation flips lastResult
 *      'wrong' → 'correct'. recordCorrectAnswer's `onTransitionToCorrect`
 *      callback invokes emitGraceToast({ questionId }).
 *   2. Toast appears for 10 s with a ⭐ promote button.
 *   3. Clicking ⭐ wraps toggleBookmark — adds the row to manual bookmarks
 *      (no-op if already bookmarked, which is fine: idempotent).
 *   4. Auto-dismiss after 10 s OR manual ✕ click.
 *
 * Cross-device sync apply (tables.ts) writes Dexie directly without
 * recordCorrectAnswer → no callback → no toast. Suppression is intrinsic.
 *
 * Max 3 toasts visible at once; further toasts queue.
 */

import { useSyncExternalStore } from 'react'
import { toggleBookmark } from '../services/bookmarks'

export interface GraceToast {
  id: string
  questionId: string
  createdAt: number
  expiresAt: number
}

const VISIBLE_MS = 10_000
const MAX_VISIBLE = 3

let nextId = 1
const visible: GraceToast[] = []
const queued: GraceToast[] = []
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let snapshotCache: readonly GraceToast[] = []
let snapshotDirty = true

function notify(): void {
  snapshotDirty = true
  for (const l of listeners) l()
}

function schedule(toast: GraceToast): void {
  const remaining = Math.max(0, toast.expiresAt - Date.now())
  const t = setTimeout(() => {
    dismissGraceToast(toast.id)
  }, remaining)
  timers.set(toast.id, t)
}

function promote(): void {
  while (visible.length < MAX_VISIBLE && queued.length > 0) {
    const t = queued.shift()!
    // Reset the 10-s window from the moment the toast becomes visible —
    // queued toasts shouldn't burn part of their lifetime in the queue.
    const now = Date.now()
    const refreshed: GraceToast = { ...t, createdAt: now, expiresAt: now + VISIBLE_MS }
    visible.push(refreshed)
    schedule(refreshed)
  }
}

export function emitGraceToast(payload: { questionId: string }): void {
  const now = Date.now()
  const toast: GraceToast = {
    id: `grace-${nextId++}`,
    questionId: payload.questionId,
    createdAt: now,
    expiresAt: now + VISIBLE_MS,
  }
  if (visible.length < MAX_VISIBLE) {
    visible.push(toast)
    schedule(toast)
  } else {
    queued.push(toast)
  }
  notify()
}

export function dismissGraceToast(id: string): void {
  const t = timers.get(id)
  if (t) {
    clearTimeout(t)
    timers.delete(id)
  }
  const i = visible.findIndex((t) => t.id === id)
  if (i >= 0) {
    visible.splice(i, 1)
    promote()
    notify()
    return
  }
  const j = queued.findIndex((t) => t.id === id)
  if (j >= 0) {
    queued.splice(j, 1)
    notify()
  }
}

export async function bookmarkFromGraceToast(id: string, questionId: string): Promise<void> {
  // toggleBookmark is idempotent — if the user already starred the question
  // some other way, this acts as un-star. Spec accepts either as a valid
  // "the player saw the toast and acted on it" outcome.
  await toggleBookmark(questionId)
  dismissGraceToast(id)
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): readonly GraceToast[] {
  // Cache stable reference between notifications — useSyncExternalStore uses
  // Object.is to detect changes. Mutating the array in place + returning the
  // same reference would cause React to skip the render.
  if (snapshotDirty) {
    snapshotCache = visible.slice()
    snapshotDirty = false
  }
  return snapshotCache
}

export function useGraceToasts(): readonly GraceToast[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

// Test helper — never use in production paths.
export function __resetGraceToasts(): void {
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  visible.length = 0
  queued.length = 0
  nextId = 1
  notify()
}
