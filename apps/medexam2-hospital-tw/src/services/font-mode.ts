import { getHospitalDB } from '../db/schema'

export const FONT_MODE_META_KEY = 'ui.fontMode'

export type FontMode = 'classic' | 'readable' | 'pixel'

export const DEFAULT_FONT_MODE: FontMode = 'classic'

function normalize(value: unknown): FontMode {
  if (value === 'classic' || value === 'readable' || value === 'pixel') return value
  return DEFAULT_FONT_MODE
}

export async function getFontMode(): Promise<FontMode> {
  const row = await getHospitalDB().meta.get(FONT_MODE_META_KEY)
  if (!row) return DEFAULT_FONT_MODE
  return normalize(row.value)
}

export async function setFontMode(mode: FontMode): Promise<void> {
  await getHospitalDB().meta.put({ key: FONT_MODE_META_KEY, value: normalize(mode) })
}
