/**
 * Content pack scaffold: neurons-themed reskin (M_3rd track).
 *
 * Scaffold stage only — `getContentPack()` returns an empty placeholder
 * satisfying `content-pack-contract` minimums (id / displayName / locale /
 * credits + empty subjects + empty questions).
 *
 * Deferred to follow-up change `wire-neurons-content-and-theme`:
 * - Question corpus reuse (link to medexam-tw built JSON or symlink path)
 * - Subject rename to neuron families (Linnean taxonomy: 4 NT branches × N families)
 * - `ContentPackMeta.statSchema` override (DA / 5-HT / GABA / Glu)
 * - Source credit attribution wiring (陽明國考考古題小組 CC-BY-NC-4.0)
 */

import type { ContentPack } from '@study-rpg/core'

export async function getContentPack(): Promise<ContentPack> {
  return {
    meta: {
      id: 'neurons-tw',
      displayName: '神經元 RPG（scaffold）',
      locale: 'zh-TW',
      credits: [
        {
          name: 'TBD — Yang-Ming 國考考古題小組 (reused from medexam-tw, scaffold placeholder)',
          license: 'CC-BY-NC-4.0',
        },
      ],
    },
    subjects: [],
    questions: [],
  }
}
