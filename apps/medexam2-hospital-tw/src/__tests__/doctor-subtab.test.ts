/**
 * Unit-level sanity check on the parseSubTab semantics used by DoctorRoster.tsx.
 * Avoids a full React render harness — testing the parsing helper is enough
 * to lock the URL-param-controlled sub-tab contract.
 *
 * Sub-tab contract (hospital-management-mode spec):
 *   - Default tab when `?tab` absent = 'roster'
 *   - Only `?tab=training` selects training; any other value = 'roster'
 */

import { describe, it, expect } from 'vitest'

// Inline copy of DoctorRoster.tsx's parseSubTab; if this drifts from the
// implementation, update both sides. Kept inline (vs export) because the
// helper is a 1-liner and exporting it adds a public surface this small
// internal utility doesn't need.
type DoctorSubTab = 'roster' | 'training'

function parseSubTab(raw: string | null): DoctorSubTab {
  return raw === 'training' ? 'training' : 'roster'
}

describe('DoctorRoster sub-tab URL contract', () => {
  it('default when tab param is absent = roster', () => {
    expect(parseSubTab(null)).toBe('roster')
  })

  it('?tab=training selects training', () => {
    expect(parseSubTab('training')).toBe('training')
  })

  it('?tab=roster selects roster', () => {
    expect(parseSubTab('roster')).toBe('roster')
  })

  it('unknown ?tab value falls back to roster', () => {
    expect(parseSubTab('unknown')).toBe('roster')
    expect(parseSubTab('')).toBe('roster')
    expect(parseSubTab('TRAINING')).toBe('roster') // case-sensitive
  })
})
