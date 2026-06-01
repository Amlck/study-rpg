import { describe, expect, it } from 'vitest'
import {
  dispatchKey,
  PHASE_COOLDOWN_MS,
  type DispatchContext,
} from '../lib/use-quiz-hotkeys'

const baseAsking: DispatchContext = {
  phase: 'asking',
  optionKeys: ['A', 'B', 'C', 'D'],
  highlightedKey: null,
  qualityAvailable: false,
  isInputFocused: false,
  msSincePhaseChange: 99_999,
}

const baseAnswered: DispatchContext = {
  ...baseAsking,
  phase: 'answered',
  qualityAvailable: true,
  msSincePhaseChange: 1000, // safely past cooldown
}

describe('dispatchKey — input field guard', () => {
  it('skips all keys when input is focused', () => {
    expect(dispatchKey('1', false, { ...baseAsking, isInputFocused: true })).toEqual({
      kind: 'skip',
    })
    expect(dispatchKey('Enter', false, { ...baseAnswered, isInputFocused: true })).toEqual({
      kind: 'skip',
    })
    expect(dispatchKey(' ', false, { ...baseAsking, isInputFocused: true })).toEqual({
      kind: 'skip',
    })
  })
})

describe('dispatchKey — asking phase', () => {
  it('1/2/3/4 highlight A/B/C/D respectively', () => {
    expect(dispatchKey('1', false, baseAsking)).toEqual({ kind: 'highlight', key: 'A' })
    expect(dispatchKey('2', false, baseAsking)).toEqual({ kind: 'highlight', key: 'B' })
    expect(dispatchKey('3', false, baseAsking)).toEqual({ kind: 'highlight', key: 'C' })
    expect(dispatchKey('4', false, baseAsking)).toEqual({ kind: 'highlight', key: 'D' })
  })

  it('number key beyond optionKeys length is no-op', () => {
    expect(
      dispatchKey('4', false, { ...baseAsking, optionKeys: ['A', 'B', 'C'] }),
    ).toEqual({ kind: 'noop' })
  })

  it('5-9 and 0 are no-op', () => {
    for (const k of ['0', '5', '6', '7', '8', '9']) {
      expect(dispatchKey(k, false, baseAsking)).toEqual({ kind: 'noop' })
    }
  })

  it('Enter without highlight is no-op', () => {
    expect(dispatchKey('Enter', false, baseAsking)).toEqual({ kind: 'noop' })
  })

  it('Enter with highlight submits that key', () => {
    expect(
      dispatchKey('Enter', false, { ...baseAsking, highlightedKey: 'C' }),
    ).toEqual({ kind: 'submit', key: 'C' })
  })

  it('non-mapped keys are no-op', () => {
    expect(dispatchKey('a', false, baseAsking)).toEqual({ kind: 'noop' })
    expect(dispatchKey('Escape', false, baseAsking)).toEqual({ kind: 'noop' })
  })
})

describe('dispatchKey — answered phase', () => {
  it('1 toggles bookmark regardless of qualityAvailable', () => {
    expect(dispatchKey('1', false, baseAnswered)).toEqual({ kind: 'toggle-bookmark' })
    expect(
      dispatchKey('1', false, { ...baseAnswered, qualityAvailable: false }),
    ).toEqual({ kind: 'toggle-bookmark' })
  })

  it('2 toggles easy only when qualityAvailable', () => {
    expect(dispatchKey('2', false, baseAnswered)).toEqual({ kind: 'toggle-easy' })
    expect(
      dispatchKey('2', false, { ...baseAnswered, qualityAvailable: false }),
    ).toEqual({ kind: 'noop' })
  })

  it('3 toggles guessed only when qualityAvailable', () => {
    expect(dispatchKey('3', false, baseAnswered)).toEqual({ kind: 'toggle-guessed' })
    expect(
      dispatchKey('3', false, { ...baseAnswered, qualityAvailable: false }),
    ).toEqual({ kind: 'noop' })
  })

  it('Enter advances when past cooldown', () => {
    expect(dispatchKey('Enter', false, baseAnswered)).toEqual({ kind: 'advance' })
  })

  it('Enter within cooldown is no-op (prevents key-repeat skipping past explanation)', () => {
    expect(
      dispatchKey('Enter', false, {
        ...baseAnswered,
        msSincePhaseChange: PHASE_COOLDOWN_MS - 1,
      }),
    ).toEqual({ kind: 'noop' })
    expect(
      dispatchKey('Enter', false, {
        ...baseAnswered,
        msSincePhaseChange: PHASE_COOLDOWN_MS,
      }),
    ).toEqual({ kind: 'advance' })
  })
})

describe('dispatchKey — scroll keys (work in both phases)', () => {
  it('Space scrolls down by page', () => {
    expect(dispatchKey(' ', false, baseAsking)).toEqual({
      kind: 'scroll',
      direction: 'down',
      amount: 'page',
    })
    expect(dispatchKey(' ', false, baseAnswered)).toEqual({
      kind: 'scroll',
      direction: 'down',
      amount: 'page',
    })
  })

  it('Shift+Space scrolls up by page', () => {
    expect(dispatchKey(' ', true, baseAsking)).toEqual({
      kind: 'scroll',
      direction: 'up',
      amount: 'page',
    })
  })

  it('ArrowDown / ArrowUp micro-scroll', () => {
    expect(dispatchKey('ArrowDown', false, baseAsking)).toEqual({
      kind: 'scroll',
      direction: 'down',
      amount: 'step',
    })
    expect(dispatchKey('ArrowUp', false, baseAnswered)).toEqual({
      kind: 'scroll',
      direction: 'up',
      amount: 'step',
    })
  })

  it('Home / End jump to edges', () => {
    expect(dispatchKey('Home', false, baseAsking)).toEqual({
      kind: 'scroll',
      direction: 'up',
      amount: 'edge-top',
    })
    expect(dispatchKey('End', false, baseAnswered)).toEqual({
      kind: 'scroll',
      direction: 'down',
      amount: 'edge-bottom',
    })
  })

  it('Space is no-op when input is focused (input guard wins over scroll)', () => {
    expect(dispatchKey(' ', false, { ...baseAsking, isInputFocused: true })).toEqual({
      kind: 'skip',
    })
  })
})
