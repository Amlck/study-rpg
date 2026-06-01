/**
 * Build-time validator for the neurons achievement catalog.
 *
 * Rules (per spec Req "P1 composite condition enforcement"):
 * 1. P1 entries MUST set `composite: true`
 * 2. Non-P1 entries MUST NOT set `composite: true` (composite is meaningful only at P1)
 * 3. Every entry MUST have non-empty `id` / `name` / `description`
 * 4. `id` SHALL be unique across catalog
 * 5. Every category in NEURONS_ACHIEVEMENT_CATEGORIES SHALL have ≥ 1 entry
 *
 * Throws Error with offending entry id + rule violated. Caller wires into
 * `packages/content-neurons-tw` build script so build fails on rule violation.
 */

import {
  NEURONS_ACHIEVEMENT_CATEGORIES,
  type NeuronsAchievement,
} from './achievement-types'

export interface ValidationFailure {
  rule: string
  entryId?: string
  message: string
}

export function validateNeuronsAchievementCatalog(
  catalog: readonly NeuronsAchievement[],
): void {
  const failures: ValidationFailure[] = []

  // R1 + R2: composite flag rules
  for (const a of catalog) {
    if (a.tier === 'P1' && a.composite !== true) {
      failures.push({
        rule: 'P1_REQUIRES_COMPOSITE',
        entryId: a.id,
        message: `P1 entry "${a.id}" must declare \`composite: true\`. Reason: anti-grind enforcement — P1 鑽石 entries must combine ≥ 2 dimensions (量/質/持續/廣度).`,
      })
    }
    if (a.tier !== 'P1' && a.composite === true) {
      failures.push({
        rule: 'NON_P1_FORBIDS_COMPOSITE',
        entryId: a.id,
        message: `${a.tier} entry "${a.id}" must not declare \`composite: true\`. Reason: composite flag is meaningful only at P1; remove the flag.`,
      })
    }
  }

  // R3: required fields populated
  for (const a of catalog) {
    if (!a.id || a.id.trim().length === 0) {
      failures.push({ rule: 'MISSING_ID', message: `Entry has empty id` })
    }
    if (!a.name || a.name.trim().length === 0) {
      failures.push({ rule: 'MISSING_NAME', entryId: a.id, message: `Entry "${a.id}" has empty name` })
    }
    if (!a.description || a.description.trim().length === 0) {
      failures.push({
        rule: 'MISSING_DESCRIPTION',
        entryId: a.id,
        message: `Entry "${a.id}" has empty description`,
      })
    }
  }

  // R4: id uniqueness
  const seen = new Map<string, number>()
  for (const a of catalog) {
    seen.set(a.id, (seen.get(a.id) ?? 0) + 1)
  }
  for (const [id, count] of seen.entries()) {
    if (count > 1) {
      failures.push({
        rule: 'DUPLICATE_ID',
        entryId: id,
        message: `id "${id}" appears ${count} times — ids must be globally unique`,
      })
    }
  }

  // R5: every category has ≥ 1 entry
  const categoriesPresent = new Set(catalog.map((a) => a.category))
  for (const cat of NEURONS_ACHIEVEMENT_CATEGORIES) {
    if (!categoriesPresent.has(cat)) {
      failures.push({
        rule: 'CATEGORY_EMPTY',
        message: `Category "${cat}" has no entries — every neurons category must ship ≥ 1 achievement`,
      })
    }
  }

  if (failures.length > 0) {
    const lines = failures.map((f) => `  - [${f.rule}] ${f.message}`)
    throw new Error(
      `Neurons achievement catalog validation failed (${failures.length} violation${
        failures.length === 1 ? '' : 's'
      }):\n${lines.join('\n')}`,
    )
  }
}
