import type { SynapseState } from '../db'

export function nextStateOnStrengthen(current: SynapseState): SynapseState {
  if (current === 'dormant') return 'weak'
  if (current === 'weak') return 'strong'
  return 'strong'
}

export function nextStateOnDecay(current: SynapseState): SynapseState {
  if (current === 'strong') return 'weak'
  if (current === 'weak') return 'dormant'
  return 'dormant'
}

export function pairKey(familyA: string, familyB: string): string {
  if (familyA === familyB) {
    throw new Error(`pairKey requires two distinct family ids; got "${familyA}" twice`)
  }
  const [first, second] = [familyA, familyB].sort()
  return `${first}|${second}`
}

export function decodePairKey(key: string): [string, string] {
  const [a, b] = key.split('|')
  if (!a || !b) {
    throw new Error(`Invalid pairKey: "${key}"`)
  }
  return [a, b]
}
