/**
 * Room-scene registry — maps room type to a 384x384 interior pixel scene PNG.
 * Used by `StudySessionPage` as a backdrop for the "看診中診間" hero panel.
 *
 * ER / ICU callers still fall back to ward on image-load failure in the app UI.
 */

import outpatientScene from '../sprites/scenes/outpatient-scene.png?url'
import surgeryScene from '../sprites/scenes/surgery-scene.png?url'
import wardScene from '../sprites/scenes/ward-scene.png?url'
import emergencyScene from '../sprites/scenes/emergency-scene.png?url'
import icuScene from '../sprites/scenes/icu-scene.png?url'

export const ROOM_SCENES_MAP: Record<string, string> = {
  outpatient: outpatientScene,
  surgery: surgeryScene,
  ward: wardScene,
  emergency: emergencyScene,
  icu: icuScene,
}

export const ROOM_SCENES: {
  outpatient: string
  surgery: string
  ward: string
  emergency: string
  icu: string
} = {
  outpatient: outpatientScene,
  surgery: surgeryScene,
  ward: wardScene,
  emergency: emergencyScene,
  icu: icuScene,
}
