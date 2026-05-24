/**
 * Sprite registry scaffold.
 *
 * The 5 contract-required keys (character-base + 4 slot-placeholder-*) are
 * mapped to a 1×1 transparent PNG data URI so the engine boot-time coverage
 * check passes. Real sprites land in `generate-neurons-sprites`, where the
 * Vite glob pattern below will be populated.
 *
 * Future shape (deferred):
 *   const SPRITE_MODULES = import.meta.glob<string>(
 *     '../sprites/**\/*.png',
 *     { eager: true, query: '?url', import: 'default' },
 *   )
 *   // ...build SPRITE_MAP keyed by basename → URL
 */

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

export const SPRITE_MAP: Record<string, string> = {
  'character-base': TRANSPARENT_PIXEL,
  'slot-placeholder-head': TRANSPARENT_PIXEL,
  'slot-placeholder-body': TRANSPARENT_PIXEL,
  'slot-placeholder-weapon': TRANSPARENT_PIXEL,
  'slot-placeholder-charm': TRANSPARENT_PIXEL,
}
