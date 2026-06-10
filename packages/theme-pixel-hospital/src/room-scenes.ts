/**
 * Room-scene registry — maps room type to
 * a 384×384 interior pixel scene PNG. Used by `StudySessionPage` as a backdrop
 * for the "看診中診間" hero panel.
 *
 * Generated via codex `gpt-image-2`:
 *   - Base 3 scenes (2026-05-17 `redesign-hospital-economy` §10 follow-up)
 *   - ER / ICU scenes (2026-06-10 ER + ICU departments)
 *
 * Uses Vite's `import.meta.glob` with `?url`. Returns `undefined` if any scene
 * is missing — caller gracefully degrades by hiding the hero panel.
 * Forks that ship fewer scenes SHALL omit `roomScenes` from their theme pack
 * entirely.
 */

const roomSceneModules = import.meta.glob(
  '../sprites/scenes/{outpatient,emergency,surgery,ward,icu}-scene.png',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
) as Record<string, string>

function extractRoomTypeKey(path: string): string {
  const match = path.match(/\/(outpatient|emergency|surgery|ward|icu)-scene\.png$/)
  return match ? match[1] : ''
}

const roomSceneEntries = Object.entries(roomSceneModules)
  .map(([path, url]) => [extractRoomTypeKey(path), url] as const)
  .filter(([key]) => key)

export const ROOM_SCENES_MAP: Record<string, string> = Object.fromEntries(roomSceneEntries)

export const ROOM_SCENES:
  | { outpatient: string; emergency: string; surgery: string; ward: string; icu: string }
  | undefined =
  ROOM_SCENES_MAP.outpatient &&
  ROOM_SCENES_MAP.emergency &&
  ROOM_SCENES_MAP.surgery &&
  ROOM_SCENES_MAP.ward &&
  ROOM_SCENES_MAP.icu
    ? {
        outpatient: ROOM_SCENES_MAP.outpatient,
        emergency: ROOM_SCENES_MAP.emergency,
        surgery: ROOM_SCENES_MAP.surgery,
        ward: ROOM_SCENES_MAP.ward,
        icu: ROOM_SCENES_MAP.icu,
      }
    : undefined
