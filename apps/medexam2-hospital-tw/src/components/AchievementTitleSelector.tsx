/**
 * Title selector — lets player pick which unlocked achievement title shows
 * next to their nickname on the leaderboard. Reads titles from Dexie meta
 * key `achievement-titles-unlocked` (written by achievement-reward dispatcher).
 *
 * Stored player choice: `leaderboardProfile.selectedTitle`. Null = no title.
 *
 * Pattern: simple `<select>` dropdown — embed inside LeaderboardSettingsControls.
 *
 * Spec: openspec/specs/achievement-system/spec.md "Reward dispatcher — three
 * channels" + hospital-leaderboard spec (selectedTitle field).
 */

import { useCallback, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getHospitalDB } from '../db/schema'

export interface AchievementTitleSelectorProps {
  userId: string
}

export function AchievementTitleSelector({ userId }: AchievementTitleSelectorProps) {
  const db = getHospitalDB()

  const profile = useLiveQuery(() => db.leaderboardProfile.get(userId), [userId])
  const meta = useLiveQuery(() => db.meta.get('achievement-titles-unlocked'), [])

  const titles = useMemo(() => {
    if (!meta || !Array.isArray(meta.value)) return [] as string[]
    return meta.value as string[]
  }, [meta])

  const selected = profile?.selectedTitle ?? ''

  const handleChange = useCallback(
    async (next: string) => {
      const existing = await db.leaderboardProfile.get(userId)
      // Profile must exist (created by leaderboard opt-in flow); silently no-op
      // if missing (player hasn't opted in yet).
      if (!existing) return
      await db.leaderboardProfile.put({
        ...existing,
        selectedTitle: next === '' ? null : next,
      })
    },
    [db, userId],
  )

  if (titles.length === 0) {
    return (
      <div className="title-selector title-selector--empty">
        <span className="title-selector__label">顯示稱號</span>
        <span className="title-selector__hint">解鎖成就以獲得稱號</span>
      </div>
    )
  }

  return (
    <label className="title-selector">
      <span className="title-selector__label">顯示稱號</span>
      <select
        className="title-selector__select"
        value={selected}
        onChange={(e) => void handleChange(e.target.value)}
      >
        <option value="">不顯示</option>
        {titles.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </label>
  )
}
