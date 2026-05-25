import { pairKey } from './state-machine'

export const N_THRESHOLD = 5

export function shouldFire(currentCount: number, threshold = N_THRESHOLD): boolean {
  return currentCount >= threshold
}

export function pairsToCheck(firedFamilyIds: string[]): string[] {
  const sorted = [...new Set(firedFamilyIds)].sort()
  const pairs: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      pairs.push(pairKey(sorted[i], sorted[j]))
    }
  }
  return pairs
}
