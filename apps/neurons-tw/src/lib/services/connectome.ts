import { db, todayISO, type FamilyAccrualRow, type SynapseRow, type SynapseState } from '../db'
import {
  AP_THRESHOLDS,
  ConnectomeEventEmitter,
  N_THRESHOLD,
  decodePairKey,
  nextStateOnDecay,
  nextStateOnStrengthen,
  pairKey,
  shouldFire,
  slotsCrossedByIncrement,
  type ConnectomeEventMap,
  type ConnectomeEventName,
  type ConnectomeListener,
} from '../connectome'

export const events = new ConnectomeEventEmitter()

type PendingEvent =
  | { name: 'connectome.synapseFormed'; payload: ConnectomeEventMap['connectome.synapseFormed'] }
  | {
      name: 'connectome.synapseStrengthened'
      payload: ConnectomeEventMap['connectome.synapseStrengthened']
    }
  | {
      name: 'connectome.synapseDecayed'
      payload: ConnectomeEventMap['connectome.synapseDecayed']
    }
  | {
      name: 'connectome.variantSlotUnlocked'
      payload: ConnectomeEventMap['connectome.variantSlotUnlocked']
    }

function daysBetweenISO(earlier: string, later: string): number {
  const ms = Date.parse(later) - Date.parse(earlier)
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

async function performDailyReset(today: string): Promise<PendingEvent[]> {
  const pending: PendingEvent[] = []

  await db.familyAccrual.toCollection().modify((row) => {
    row.firedToday = false
    row.sameDayCorrect = 0
  })

  const synapses = await db.synapses.toArray()
  for (const synapse of synapses) {
    const daysSince = daysBetweenISO(synapse.lastCoFireDate, today)
    if (daysSince > 7 && synapse.state !== 'dormant') {
      const fromState = synapse.state
      const toState = nextStateOnDecay(fromState)
      await db.synapses.update(synapse.pairKey, {
        state: toState,
        lastCoFireDate: today,
      })
      pending.push({
        name: 'connectome.synapseDecayed',
        payload: { pairKey: synapse.pairKey, fromState, toState },
      })
    }
  }

  await db.meta.put({ key: 'lastResetDate', value: today })
  return pending
}

async function runDailyResetIfNeededInTx(today: string): Promise<PendingEvent[]> {
  const lastReset = await db.meta.get('lastResetDate')
  if (lastReset?.value === today) return []
  return performDailyReset(today)
}

export async function runDailyResetIfNeeded(): Promise<void> {
  const today = todayISO()
  let pending: PendingEvent[] = []
  await db.transaction('rw', db.synapses, db.familyAccrual, db.meta, async () => {
    pending = await runDailyResetIfNeededInTx(today)
  })
  emitAll(pending)
}

export async function recordCorrectAnswer(familyId: string): Promise<void> {
  const today = todayISO()
  let pending: PendingEvent[] = []

  await db.transaction('rw', db.synapses, db.familyAccrual, db.meta, async () => {
    pending.push(...(await runDailyResetIfNeededInTx(today)))

    const accrual = await db.familyAccrual.get(familyId)
    if (!accrual) {
      throw new Error(
        `[connectome] no familyAccrual row for "${familyId}" — call initFamilyAccrualIfEmpty(pack) before recording answers`,
      )
    }

    const prevAp = accrual.ap
    const newAp = prevAp + 1
    const prevFiredToday = accrual.firedToday
    const newSameDayCorrect = accrual.sameDayCorrect + 1

    const newlyUnlockedSlots = slotsCrossedByIncrement(prevAp, newAp, accrual.unlockedSlots)
    const updatedUnlockedSlots = [...accrual.unlockedSlots, ...newlyUnlockedSlots]

    const justFired = !prevFiredToday && shouldFire(newSameDayCorrect)
    const updatedAccrual: FamilyAccrualRow = {
      familyId,
      ap: newAp,
      firedToday: prevFiredToday || justFired,
      lastFireDate: today,
      unlockedSlots: updatedUnlockedSlots,
      sameDayCorrect: newSameDayCorrect,
    }
    await db.familyAccrual.put(updatedAccrual)

    for (const slotIndex of newlyUnlockedSlots) {
      pending.push({
        name: 'connectome.variantSlotUnlocked',
        payload: { familyId, slotIndex, apAtUnlock: newAp },
      })
    }

    if (justFired) {
      const firedNow = await db.familyAccrual.toArray()
      const firedFamilyIds = firedNow
        .filter((row) => row.firedToday && row.familyId !== familyId)
        .map((row) => row.familyId)

      for (const otherFamilyId of firedFamilyIds) {
        const key = pairKey(familyId, otherFamilyId)
        const existing = await db.synapses.get(key)
        if (!existing) {
          const newSynapse: SynapseRow = {
            pairKey: key,
            state: 'dormant',
            lastCoFireDate: today,
            createdAt: today,
          }
          await db.synapses.put(newSynapse)
          pending.push({
            name: 'connectome.synapseFormed',
            payload: { pairKey: key, state: 'dormant' },
          })
        } else if (existing.lastCoFireDate !== today) {
          const fromState: SynapseState = existing.state
          const toState = nextStateOnStrengthen(fromState)
          await db.synapses.update(key, {
            state: toState,
            lastCoFireDate: today,
          })
          if (toState !== fromState) {
            pending.push({
              name: 'connectome.synapseStrengthened',
              payload: { pairKey: key, fromState, toState },
            })
          }
        } else if (existing.state === 'strong') {
          await db.synapses.update(key, { lastCoFireDate: today })
        }
      }
    }
  })

  emitAll(pending)
}

export async function recordIncorrectAnswer(_familyId: string): Promise<void> {
  // Intentional no-op per spec: incorrect answers SHALL NOT change AP / firedToday / synapse state.
  // Hook retained for future-proofing (e.g. future change may want incorrect telemetry).
  return Promise.resolve()
}

export interface ConnectomeSnapshot {
  familyAccrual: FamilyAccrualRow[]
  synapses: SynapseRow[]
  today: string
}

export async function loadConnectome(): Promise<ConnectomeSnapshot> {
  await runDailyResetIfNeeded()
  const [familyAccrual, synapses] = await Promise.all([
    db.familyAccrual.toArray(),
    db.synapses.toArray(),
  ])
  return { familyAccrual, synapses, today: todayISO() }
}

export interface ConnectomeSubscription {
  dispose: () => void
}

export function subscribeConnectomeEvents(
  handlers: Partial<{ [K in ConnectomeEventName]: ConnectomeListener<K> }>,
): ConnectomeSubscription {
  const bound: Array<[ConnectomeEventName, ConnectomeListener<ConnectomeEventName>]> = []
  for (const event of Object.keys(handlers) as ConnectomeEventName[]) {
    const listener = handlers[event] as ConnectomeListener<typeof event> | undefined
    if (!listener) continue
    events.on(event, listener)
    bound.push([event, listener as ConnectomeListener<ConnectomeEventName>])
  }
  return {
    dispose: () => {
      for (const [event, listener] of bound) events.off(event, listener)
    },
  }
}

function shiftIsoDateBackward(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() - days)
  return d.toLocaleDateString('en-CA')
}

export async function advanceDayForDebug(days = 1): Promise<void> {
  if (days < 1) throw new Error('advanceDayForDebug: days must be >= 1')
  const today = todayISO()
  const fakedLastReset = shiftIsoDateBackward(today, days)

  let pending: PendingEvent[] = []
  await db.transaction('rw', db.synapses, db.familyAccrual, db.meta, async () => {
    await db.meta.put({ key: 'lastResetDate', value: fakedLastReset })

    // Age every synapse's lastCoFireDate backward by `days` so that next co-fire
    // is treated as a new day (per spec: strengthening requires lastCoFireDate !== today).
    // Also ages decay clock — 8 advance-day clicks = 8-day gap → triggers LTD on next reset.
    const synapses = await db.synapses.toArray()
    for (const s of synapses) {
      await db.synapses.update(s.pairKey, {
        lastCoFireDate: shiftIsoDateBackward(s.lastCoFireDate, days),
      })
    }
    // Age every accrual's lastFireDate too so firedToday is treated as stale on reset
    const accruals = await db.familyAccrual.toArray()
    for (const a of accruals) {
      if (a.lastFireDate) {
        await db.familyAccrual.update(a.familyId, {
          lastFireDate: shiftIsoDateBackward(a.lastFireDate, days),
        })
      }
    }

    pending = await performDailyReset(today)
  })
  emitAll(pending)
}

export async function resetConnectomeForDebug(): Promise<void> {
  await db.transaction('rw', db.synapses, db.familyAccrual, db.meta, async () => {
    await db.synapses.clear()
    await db.familyAccrual.toCollection().modify((row) => {
      row.ap = 0
      row.firedToday = false
      row.lastFireDate = null
      row.unlockedSlots = []
      row.sameDayCorrect = 0
    })
    await db.meta.put({ key: 'lastResetDate', value: todayISO() })
  })
}

export async function dumpStateForDebug(): Promise<void> {
  const snapshot = await loadConnectome()
  const meta = await db.meta.toArray()
  // eslint-disable-next-line no-console
  console.log('[connectome] state dump', {
    today: snapshot.today,
    familyAccrual: snapshot.familyAccrual,
    synapses: snapshot.synapses,
    meta,
    AP_THRESHOLDS,
    N_THRESHOLD,
  })
}

function emitAll(pending: PendingEvent[]): void {
  for (const event of pending) {
    events.emit(event.name, event.payload as never)
  }
}

export { decodePairKey }
