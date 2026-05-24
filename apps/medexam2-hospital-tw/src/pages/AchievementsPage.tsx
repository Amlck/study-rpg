/**
 * Achievements page — `/achievements` route.
 *
 * Two sub-tabs:
 *   1. 成就 (main 6 categories × 4 tier ladder + streak sub-ladder under quiz)
 *   2. 科別精通 (14-subject grid + 1 capstone)
 *
 * Filters: category dropdown (main tab) / tier dropdown / locked-or-unlocked toggle.
 *
 * Hidden achievements are filtered out when locked (strict UI filtering per
 * spec §"Hidden achievement strict UI filtering").
 *
 * Spec: openspec/specs/achievement-system/spec.md "UI" + "Achievement table
 * persistence".
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ACHIEVEMENTS } from '@study-rpg/content-medexam2-tw'
import type { Achievement, AchievementCategory, AchievementTier } from '@study-rpg/core'
import { getHospitalDB } from '../db/schema'
import { AchievementCard } from '../components/AchievementCard'

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  study: '學習里程碑',
  quiz: '答題大師',
  recruit: '招募達人',
  hospital: '醫院經營',
  fortune: '時運與意外',
  hidden: '隱藏 / 彩蛋',
  subject: '科別精通',
}

const TIER_LABELS: Record<AchievementTier, string> = {
  P1: 'P1 💎 鑽石',
  P2: 'P2 🥇 金',
  P3: 'P3 🥈 銀',
  P4: 'P4 🥉 銅',
}

type SubTab = 'main' | 'subject'
type CategoryFilter = 'all' | AchievementCategory
type TierFilter = 'all' | AchievementTier
type LockFilter = 'all' | 'locked' | 'unlocked'

export function AchievementsPage() {
  const [subTab, setSubTab] = useState<SubTab>('main')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [lockFilter, setLockFilter] = useState<LockFilter>('all')

  // Subscribe to achievements table — live updates when new unlocks land.
  const db = getHospitalDB()
  const unlockedRows = useLiveQuery(() => db.achievements.toArray(), [])
  const unlockedMap = useMemo(() => {
    const m = new Map<string, number>()
    if (unlockedRows) {
      for (const r of unlockedRows) m.set(r.id, r.unlockedAt)
    }
    return m
  }, [unlockedRows])

  // Catalog split between main + subject tabs
  const { mainEntries, subjectEntries } = useMemo(() => {
    const main: Achievement[] = []
    const subject: Achievement[] = []
    for (const a of ACHIEVEMENTS) {
      if (a.category === 'subject') subject.push(a)
      else main.push(a)
    }
    return { mainEntries: main, subjectEntries: subject }
  }, [])

  // Strict hidden filter — exclude unrevealed hidden entries before any other
  // filter. Per spec §"Hidden achievement strict UI filtering".
  const visibleMain = useMemo(
    () =>
      mainEntries.filter((a) => {
        if (a.hidden && !unlockedMap.has(a.id)) return false
        return true
      }),
    [mainEntries, unlockedMap],
  )

  // Filter chain
  const filtered = useMemo(() => {
    const source = subTab === 'main' ? visibleMain : subjectEntries
    return source.filter((a) => {
      const isUnlocked = unlockedMap.has(a.id)
      if (categoryFilter !== 'all' && a.category !== categoryFilter) return false
      if (tierFilter !== 'all' && a.tier !== tierFilter) return false
      if (lockFilter === 'locked' && isUnlocked) return false
      if (lockFilter === 'unlocked' && !isUnlocked) return false
      return true
    })
  }, [subTab, visibleMain, subjectEntries, categoryFilter, tierFilter, lockFilter, unlockedMap])

  // Stats summary
  const summary = useMemo(() => {
    const total = ACHIEVEMENTS.length - ACHIEVEMENTS.filter((a) => a.hidden && !unlockedMap.has(a.id)).length
    const unlocked = unlockedMap.size
    return { total, unlocked }
  }, [unlockedMap])

  return (
    <div className="achievements-page">
      <header className="achievements-page__head">
        <Link to="/" className="back-link">← 回主畫面</Link>
        <h1 className="achievements-page__title">成就</h1>
        <p className="achievements-page__summary">
          已解鎖 <strong>{summary.unlocked}</strong> / {summary.total}
        </p>
      </header>

      <div className="achievements-page__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'main'}
          className={`achievements-tab ${subTab === 'main' ? 'achievements-tab--active' : ''}`}
          onClick={() => setSubTab('main')}
        >
          成就
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'subject'}
          className={`achievements-tab ${subTab === 'subject' ? 'achievements-tab--active' : ''}`}
          onClick={() => setSubTab('subject')}
        >
          科別精通 (
          {subjectEntries.filter((a) => unlockedMap.has(a.id)).length}/{subjectEntries.length}
          )
        </button>
      </div>

      <div className="achievements-page__filters">
        {subTab === 'main' && (
          <label className="achievements-filter">
            類別
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
            >
              <option value="all">全部</option>
              {(['study', 'quiz', 'recruit', 'hospital', 'fortune', 'hidden'] as const).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="achievements-filter">
          級別
          <select
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value as TierFilter)}
          >
            <option value="all">全部</option>
            {(['P1', 'P2', 'P3', 'P4'] as const).map((t) => (
              <option key={t} value={t}>
                {TIER_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="achievements-filter">
          狀態
          <select value={lockFilter} onChange={(e) => setLockFilter(e.target.value as LockFilter)}>
            <option value="all">全部</option>
            <option value="unlocked">已解鎖</option>
            <option value="locked">未解鎖</option>
          </select>
        </label>
      </div>

      <div className="achievements-page__grid">
        {filtered.length === 0 ? (
          <p className="achievements-page__empty">沒有符合條件的成就</p>
        ) : (
          filtered.map((a) => (
            <AchievementCard
              key={a.id}
              achievement={a}
              unlockedAt={unlockedMap.get(a.id) ?? null}
            />
          ))
        )}
      </div>
    </div>
  )
}
