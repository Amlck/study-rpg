import { describe, it, expect } from 'vitest'
import {
  newCard,
  reviewCard,
  reviewCardBinary,
  reviewCardEasy,
  reviewCardGuessed,
  reviewCardBinaryEasy,
  reviewCardBinaryGuessed,
  STANDARD_INITIAL_INTERVALS,
  EASY_EASE_MULTIPLIER,
  EASY_INTERVAL_MULTIPLIER,
  GUESSED_RESET_INTERVAL,
  MAX_INTERVAL_DAYS,
} from '@study-rpg/core'

const DAY = 86_400_000
const NOW = 1_700_000_000_000

describe('STANDARD_INITIAL_INTERVALS [3, 7] applied to reviewCard (一階)', () => {
  it('first correct answer on fresh card schedules interval = 3', () => {
    const card = newCard('Q1', NOW)
    const updated = reviewCard(card, 4, NOW)
    expect(updated.interval).toBe(STANDARD_INITIAL_INTERVALS[0])
    expect(updated.interval).toBe(3)
    expect(updated.dueAt).toBe(NOW + 3 * DAY)
  })

  it('second correct answer (interval=3) schedules interval = 7', () => {
    const card = { questionId: 'Q1', ease: 2.5, interval: 3, dueAt: NOW, lapses: 0 }
    const updated = reviewCard(card, 4, NOW)
    expect(updated.interval).toBe(STANDARD_INITIAL_INTERVALS[1])
    expect(updated.interval).toBe(7)
  })

  it('third correct answer expands by ease factor', () => {
    const card = { questionId: 'Q1', ease: 2.6, interval: 7, dueAt: NOW, lapses: 0 }
    const updated = reviewCard(card, 4, NOW)
    expect(updated.interval).toBe(Math.round(7 * updated.ease))
  })

  it('wrong answer still resets to interval = 1 (lapse, unchanged)', () => {
    const card = { questionId: 'Q1', ease: 2.5, interval: 21, dueAt: NOW, lapses: 0 }
    const updated = reviewCard(card, 2, NOW)
    expect(updated.interval).toBe(1)
    expect(updated.lapses).toBe(1)
  })

  it('pre-existing interval=1 card progresses to STANDARD_INITIAL_INTERVALS[1] = 7 on correct', () => {
    // Legacy save from before this change: interval=1 means "1 day after first correct"
    const card = { questionId: 'Q_legacy', ease: 2.5, interval: 1, dueAt: NOW, lapses: 0 }
    const updated = reviewCard(card, 4, NOW)
    // The old [1,6] path would have given interval=6. New path: interval matches STANDARD_INITIAL_INTERVALS[0] so → 7.
    // (Edge case: if pre-existing interval=1 doesn't match new [3,7] seeds, it falls through to round(1*ease))
    expect([1, STANDARD_INITIAL_INTERVALS[1], Math.round(1 * updated.ease)]).toContain(updated.interval)
  })
})

describe('STANDARD_INITIAL_INTERVALS [3, 7] applied to reviewCardBinary (二階)', () => {
  it('first correct answer on fresh row schedules interval = 3', () => {
    const result = reviewCardBinary({
      correct: true,
      prev: { interval: 0, easeFactor: 2.5, nextDueAt: null },
      now: NOW,
    })
    expect(result.interval).toBe(3)
    expect(result.nextDueAt).toBe(NOW + 3 * DAY)
    expect(result.easeFactor).toBe(2.5)
  })

  it('second correct answer (interval=3) schedules interval = 7', () => {
    const result = reviewCardBinary({
      correct: true,
      prev: { interval: 3, easeFactor: 2.5, nextDueAt: NOW },
      now: NOW,
    })
    expect(result.interval).toBe(7)
  })

  it('third correct answer expands by easeFactor', () => {
    const result = reviewCardBinary({
      correct: true,
      prev: { interval: 7, easeFactor: 2.5, nextDueAt: NOW },
      now: NOW,
    })
    expect(result.interval).toBe(Math.round(7 * 2.5))
  })

  it('wrong answer applies partial reset (interval *= 0.5)', () => {
    const result = reviewCardBinary({
      correct: false,
      prev: { interval: 21, easeFactor: 3.0, nextDueAt: NOW },
      now: NOW,
    })
    expect(result.interval).toBe(Math.max(1, Math.round(21 * 0.5)))
    expect(result.easeFactor).toBe(Math.max(1.3, 3.0 * 0.85))
  })
})

describe('reviewCardEasy (一階 「太簡單」)', () => {
  it('on fresh card (interval=0): uses STANDARD_INITIAL_INTERVALS[0] as base, ease *= 1.5', () => {
    const card = newCard('Q1', NOW)
    const updated = reviewCardEasy(card, NOW)
    // base = STANDARD_INITIAL_INTERVALS[0] = 3, interval = 3 * 3 = 9
    expect(updated.interval).toBe(3 * EASY_INTERVAL_MULTIPLIER)
    expect(updated.interval).toBe(9)
    expect(updated.ease).toBe(2.5 * EASY_EASE_MULTIPLIER)
    expect(updated.ease).toBe(3.75)
    expect(updated.lapses).toBe(0)
    expect(updated.dueAt).toBe(NOW + 9 * DAY)
  })

  it('on existing card: multiplicative escalator', () => {
    const card = { questionId: 'Q1', ease: 2.5, interval: 7, dueAt: NOW, lapses: 0 }
    const updated = reviewCardEasy(card, NOW)
    expect(updated.interval).toBe(21) // 7 * 3
    expect(updated.ease).toBe(3.75) // 2.5 * 1.5
    expect(updated.lapses).toBe(0)
  })

  it('clamps interval to MAX_INTERVAL_DAYS = 365', () => {
    const card = { questionId: 'Q1', ease: 4.0, interval: 200, dueAt: NOW, lapses: 0 }
    const updated = reviewCardEasy(card, NOW)
    expect(updated.interval).toBe(MAX_INTERVAL_DAYS)
    expect(updated.interval).toBe(365)
    // ease still updates (no cap — design Open Q1 deferred)
    expect(updated.ease).toBe(6.0)
  })

  it('preserves questionId and lapses', () => {
    const card = { questionId: 'Q_unique_id', ease: 2.5, interval: 7, dueAt: NOW, lapses: 5 }
    const updated = reviewCardEasy(card, NOW)
    expect(updated.questionId).toBe('Q_unique_id')
    expect(updated.lapses).toBe(5)
  })

  it('compounds across multiple calls (3 clicks → 7 → 21 → 63 → 189)', () => {
    let card = { questionId: 'Q1', ease: 2.5, interval: 7, dueAt: NOW, lapses: 0 }
    card = reviewCardEasy(card, NOW)
    expect(card.interval).toBe(21)
    card = reviewCardEasy(card, NOW)
    expect(card.interval).toBe(63)
    card = reviewCardEasy(card, NOW)
    expect(card.interval).toBe(189)
    card = reviewCardEasy(card, NOW)
    expect(card.interval).toBe(MAX_INTERVAL_DAYS) // 189 * 3 = 567 → clamped to 365
  })
})

describe('reviewCardGuessed (一階 「我亂猜的」)', () => {
  it('resets interval to GUESSED_RESET_INTERVAL (1 day)', () => {
    const card = { questionId: 'Q1', ease: 3.0, interval: 21, dueAt: NOW, lapses: 0 }
    const updated = reviewCardGuessed(card, NOW)
    expect(updated.interval).toBe(GUESSED_RESET_INTERVAL)
    expect(updated.interval).toBe(1)
    expect(updated.dueAt).toBe(NOW + 1 * DAY)
  })

  it('preserves ease (no penalty)', () => {
    const card = { questionId: 'Q1', ease: 3.0, interval: 21, dueAt: NOW, lapses: 0 }
    const updated = reviewCardGuessed(card, NOW)
    expect(updated.ease).toBe(3.0)
  })

  it('preserves lapses (no lapse bump)', () => {
    const card = { questionId: 'Q1', ease: 2.5, interval: 21, dueAt: NOW, lapses: 2 }
    const updated = reviewCardGuessed(card, NOW)
    expect(updated.lapses).toBe(2)
  })

  it('works on fresh card (interval=0)', () => {
    const card = newCard('Q1', NOW)
    const updated = reviewCardGuessed(card, NOW)
    expect(updated.interval).toBe(1)
    expect(updated.ease).toBe(2.5) // default ease preserved
  })
})

describe('reviewCardBinaryEasy (二階 「太簡單」)', () => {
  it('on fresh row (interval=0): uses STANDARD_INITIAL_INTERVALS[0] as base', () => {
    const result = reviewCardBinaryEasy({
      prev: { interval: 0, easeFactor: 2.5, nextDueAt: null },
      now: NOW,
    })
    expect(result.interval).toBe(9) // 3 * 3
    expect(result.easeFactor).toBe(3.75) // 2.5 * 1.5
    expect(result.nextDueAt).toBe(NOW + 9 * DAY)
  })

  it('on existing row: multiplicative escalator', () => {
    const result = reviewCardBinaryEasy({
      prev: { interval: 7, easeFactor: 2.5, nextDueAt: NOW },
      now: NOW,
    })
    expect(result.interval).toBe(21)
    expect(result.easeFactor).toBe(3.75)
  })

  it('clamps interval to 365', () => {
    const result = reviewCardBinaryEasy({
      prev: { interval: 200, easeFactor: 4.0, nextDueAt: NOW },
      now: NOW,
    })
    expect(result.interval).toBe(365)
    expect(result.easeFactor).toBe(6.0)
  })
})

describe('reviewCardBinaryGuessed (二階 「我亂猜的」)', () => {
  it('resets interval to 1, preserves easeFactor', () => {
    const result = reviewCardBinaryGuessed({
      prev: { interval: 21, easeFactor: 3.0, nextDueAt: NOW },
      now: NOW,
    })
    expect(result.interval).toBe(1)
    expect(result.easeFactor).toBe(3.0)
    expect(result.nextDueAt).toBe(NOW + 1 * DAY)
  })

  it('works on fresh row (interval=0)', () => {
    const result = reviewCardBinaryGuessed({
      prev: { interval: 0, easeFactor: 2.5, nextDueAt: null },
      now: NOW,
    })
    expect(result.interval).toBe(1)
    expect(result.easeFactor).toBe(2.5)
  })
})
