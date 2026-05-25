/**
 * Tiny typed EventEmitter for mastery state changes.
 * Mirrors `connectome/events.ts` pattern.
 */

export interface MasteryUpdatedPayload {
  familyId: string
  correct: number
  total: number
}

export type MasteryEventMap = {
  'mastery.updated': MasteryUpdatedPayload
}

export type MasteryEventName = keyof MasteryEventMap

export type MasteryListener<E extends MasteryEventName> = (
  payload: MasteryEventMap[E],
) => void

export class MasteryEventEmitter {
  private listeners = new Map<MasteryEventName, Set<MasteryListener<MasteryEventName>>>()

  on<E extends MasteryEventName>(event: E, listener: MasteryListener<E>): void {
    const set = this.listeners.get(event) ?? new Set()
    set.add(listener as MasteryListener<MasteryEventName>)
    this.listeners.set(event, set)
  }

  off<E extends MasteryEventName>(event: E, listener: MasteryListener<E>): void {
    this.listeners.get(event)?.delete(listener as MasteryListener<MasteryEventName>)
  }

  emit<E extends MasteryEventName>(event: E, payload: MasteryEventMap[E]): void {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        ;(listener as MasteryListener<E>)(payload)
      } catch (err) {
        console.error(`[mastery] listener for ${event} threw:`, err)
      }
    })
  }

  dispose(): void {
    this.listeners.clear()
  }
}
