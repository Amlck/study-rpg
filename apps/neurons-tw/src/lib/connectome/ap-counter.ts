export const AP_THRESHOLDS: readonly number[] = [10, 30, 80, 200, 500] as const

export function slotsCrossedByIncrement(
  prevAp: number,
  newAp: number,
  alreadyUnlocked: number[],
): number[] {
  const unlockedSet = new Set(alreadyUnlocked)
  const crossed: number[] = []
  AP_THRESHOLDS.forEach((threshold, index) => {
    const slotIndex = index + 1
    if (unlockedSet.has(slotIndex)) return
    if (prevAp < threshold && newAp >= threshold) {
      crossed.push(slotIndex)
    }
  })
  return crossed
}

export function nextSlotThreshold(unlockedSlots: number[]): number | null {
  for (let i = 0; i < AP_THRESHOLDS.length; i++) {
    const slotIndex = i + 1
    if (!unlockedSlots.includes(slotIndex)) {
      return AP_THRESHOLDS[i]
    }
  }
  return null
}
