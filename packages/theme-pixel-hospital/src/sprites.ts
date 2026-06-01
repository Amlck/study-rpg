/**
 * Sprite registry — maps theme sprite keys to runtime URLs.
 *
 * Generated via codex `gpt-image-2` per 2026-05-15 `add-doctor-sprite-roster`
 * change; full prompts + regen procedure in `../SPRITE_GENERATION.md`.
 *
 * Uses Vite's `import.meta.glob` with `?url` to bundle PNGs with cache-busting
 * hashes in production builds. Filenames use Chinese subject characters
 * (`doctor-內科-P3.png` etc.); glob handles UTF-8 paths cleanly while keeping
 * the TS code free of unicode identifiers.
 */

const spriteModules = import.meta.glob('../sprites/doctor-*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

// add-hospital-equipment-medexam2 (2026-05-24): equipment sprites live in a
// dedicated subfolder for organization. Keys get `equipment-` prefix to
// namespace away from doctor-* sprites in the shared SPRITES_MAP.
const equipmentSpriteModules = import.meta.glob('../sprites/equipment/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

const doctorSprites = Object.fromEntries(
  Object.entries(spriteModules).map(([path, url]) => {
    const key = path.replace(/.*\/(.+)\.png$/, '$1')
    return [key, url]
  }),
)

const equipmentSprites = Object.fromEntries(
  Object.entries(equipmentSpriteModules).map(([path, url]) => {
    const key = path.replace(/.*\/(.+)\.png$/, '$1')
    return [`equipment-${key}`, url]
  }),
)

export const SPRITES_MAP: Record<string, string> = {
  ...doctorSprites,
  ...equipmentSprites,
}
