/**
 * Standalone smoke for the achievement catalog validator.
 *
 * Run via: `pnpm --filter @study-rpg/content-neurons-tw verify:validator`
 * Or:      `tsx scripts/verify-validator.ts`
 *
 * Exits non-zero on assertion failure. Mirror of unit-test coverage for
 * monorepos without vitest yet — drop in favor of vitest when the repo
 * gains a test runner.
 */

import { validateNeuronsAchievementCatalog } from '../src/achievement-validator'
import { NEURONS_ACHIEVEMENTS } from '../src/achievements'
import type { NeuronsAchievement } from '../src/achievement-types'

let passed = 0
let failed = 0

function assertThrows(label: string, fn: () => void, expectedRule: string) {
  try {
    fn()
    failed += 1
    console.error(`  ❌ ${label} — expected throw with rule "${expectedRule}", got success`)
  } catch (e) {
    const msg = (e as Error).message
    if (msg.includes(expectedRule)) {
      passed += 1
      console.log(`  ✓ ${label}`)
    } else {
      failed += 1
      console.error(`  ❌ ${label} — threw but missing rule "${expectedRule}":\n     ${msg.split('\n')[0]}`)
    }
  }
}

function assertNoThrow(label: string, fn: () => void) {
  try {
    fn()
    passed += 1
    console.log(`  ✓ ${label}`)
  } catch (e) {
    failed += 1
    console.error(`  ❌ ${label} — unexpected throw: ${(e as Error).message.split('\n')[0]}`)
  }
}

console.log('# Neurons achievement validator smoke\n')

// Positive: real catalog must pass
assertNoThrow('real NEURONS_ACHIEVEMENTS catalog passes', () =>
  validateNeuronsAchievementCatalog(NEURONS_ACHIEVEMENTS),
)

// Negative 1: P1 missing composite
assertThrows(
  'P1 entry without composite fails',
  () =>
    validateNeuronsAchievementCatalog([
      {
        id: 'bad-p1',
        name: 'bad',
        description: 'P1 missing composite',
        tier: 'P1',
        category: 'study',
        hidden: false,
        predicate: () => true,
        reward: { kind: 'leaderboard' },
      },
    ] as NeuronsAchievement[]),
  'P1_REQUIRES_COMPOSITE',
)

// Negative 2: P4 with composite=true
assertThrows(
  'P4 entry with composite=true fails',
  () =>
    validateNeuronsAchievementCatalog([
      ...NEURONS_ACHIEVEMENTS,
      {
        id: 'bad-p4',
        name: 'bad',
        description: 'P4 with composite=true',
        tier: 'P4',
        category: 'study',
        hidden: false,
        predicate: () => true,
        reward: { kind: 'leaderboard' },
        composite: true,
      },
    ] as NeuronsAchievement[]),
  'NON_P1_FORBIDS_COMPOSITE',
)

// Negative 3: missing description
assertThrows(
  'Entry with empty description fails',
  () =>
    validateNeuronsAchievementCatalog([
      ...NEURONS_ACHIEVEMENTS,
      {
        id: 'bad-empty-desc',
        name: 'bad',
        description: '',
        tier: 'P4',
        category: 'study',
        hidden: false,
        predicate: () => true,
        reward: { kind: 'leaderboard' },
      },
    ] as NeuronsAchievement[]),
  'MISSING_DESCRIPTION',
)

// Negative 4: duplicate id
assertThrows(
  'Duplicate id fails',
  () => {
    const entry = NEURONS_ACHIEVEMENTS[0]!
    validateNeuronsAchievementCatalog([entry, entry])
  },
  'DUPLICATE_ID',
)

// Negative 5: category empty
assertThrows(
  'Empty category fails',
  () =>
    validateNeuronsAchievementCatalog(
      NEURONS_ACHIEVEMENTS.filter((a) => a.category !== 'hidden'),
    ),
  'CATEGORY_EMPTY',
)

console.log(`\n# Results: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  process.exit(1)
}
