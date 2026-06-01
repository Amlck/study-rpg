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

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ACHIEVEMENTS } from '@study-rpg/content-medexam2-tw'
import type { Achievement, AchievementCategory, AchievementTier } from '@study-rpg/core'
import { getHospitalDB } from '../db/schema'
import { AchievementCard } from '../components/AchievementCard'
import { SurfaceHint } from '../components/SurfaceHint'
import { StatsPanel } from '../components/StatsPanel'

// Category chip pagination (avoid 3-row wrap on iPhone SE widths). Mirror
// BookmarkFilterBar's responsive page-size pattern: 3 chips/page on mobile,
// full set (6) on desktop = single page (no pager).
const CATEGORY_CHIPS_PER_PAGE_MOBILE = 3
const CATEGORY_CHIPS_PER_PAGE_DESKTOP = 6
const CATEGORY_MOBILE_BREAKPOINT_PX = 768

const CATEGORY_OPTIONS: ReadonlyArray<AchievementCategory> = [
  'study',
  'quiz',
  'recruit',
  'hospital',
  'fortune',
  'hidden',
]

function useCategoryChipsPerPage(): number {
  const [count, setCount] = useState(CATEGORY_CHIPS_PER_PAGE_DESKTOP)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${CATEGORY_MOBILE_BREAKPOINT_PX}px)`)
    const update = () =>
      setCount(mq.matches ? CATEGORY_CHIPS_PER_PAGE_MOBILE : CATEGORY_CHIPS_PER_PAGE_DESKTOP)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return count
}

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

type SubTab = 'main' | 'subject' | 'stats'
type CategoryFilter = 'all' | AchievementCategory
type TierFilter = 'all' | AchievementTier
type LockFilter = 'all' | 'locked' | 'unlocked'

export function AchievementsPage() {
  const [subTab, setSubTab] = useState<SubTab>('main')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [tierFilter, setTierFilter] = useState<TierFilter>('all')
  const [lockFilter, setLockFilter] = useState<LockFilter>('all')
  const categoryChipsPerPage = useCategoryChipsPerPage()
  const categoryPages = useMemo<ReadonlyArray<ReadonlyArray<AchievementCategory>>>(() => {
    const pages: AchievementCategory[][] = []
    for (let i = 0; i < CATEGORY_OPTIONS.length; i += categoryChipsPerPage) {
      pages.push(CATEGORY_OPTIONS.slice(i, i + categoryChipsPerPage))
    }
    return pages.length === 0 ? [[]] : pages
  }, [categoryChipsPerPage])
  const [categoryPageIdx, setCategoryPageIdx] = useState(0)
  const clampedCategoryPage = Math.min(
    categoryPageIdx,
    Math.max(0, categoryPages.length - 1),
  )

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
      <header className="app-header">
        <h1>成就</h1>
        <div className="app-header__meta">
          <span className="achievements-page__summary">
            已解鎖 <strong>{summary.unlocked}</strong> / {summary.total}
          </span>
          <Link to="/" className="nav-link">← 回首頁</Link>
        </div>
      </header>

      <SurfaceHint surfaceId="achievements" />

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
        <button
          type="button"
          role="tab"
          aria-selected={subTab === 'stats'}
          className={`achievements-tab ${subTab === 'stats' ? 'achievements-tab--active' : ''}`}
          onClick={() => setSubTab('stats')}
        >
          統計
        </button>
      </div>

      {subTab !== 'stats' && (
        <div className="achievements-page__filters">
          {subTab === 'main' && (
            <div className="filter-bar__group">
              <span className="filter-bar__label">類別</span>
              <span className="filter-chip-group" role="group" aria-label="類別篩選">
                <button
                  type="button"
                  className="filter-chip"
                  aria-pressed={categoryFilter === 'all'}
                  onClick={() => setCategoryFilter('all')}
                >
                  全部
                </button>
                {categoryPages[clampedCategoryPage]?.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="filter-chip"
                    aria-pressed={categoryFilter === c}
                    onClick={() => setCategoryFilter(c)}
                  >
                    {CATEGORY_LABELS[c]}
                  </button>
                ))}
              </span>
              {categoryPages.length > 1 && (
                <span className="filter-bar__pager">
                  <button
                    type="button"
                    className="filter-bar__pager-btn"
                    aria-label="上一頁"
                    aria-disabled={clampedCategoryPage === 0}
                    onClick={() => {
                      if (clampedCategoryPage > 0) setCategoryPageIdx(clampedCategoryPage - 1)
                    }}
                  >
                    ‹
                  </button>
                  <span className="filter-bar__pager-indicator" aria-live="polite">
                    {clampedCategoryPage + 1} / {categoryPages.length}
                  </span>
                  <button
                    type="button"
                    className="filter-bar__pager-btn"
                    aria-label="下一頁"
                    aria-disabled={clampedCategoryPage === categoryPages.length - 1}
                    onClick={() => {
                      if (clampedCategoryPage < categoryPages.length - 1)
                        setCategoryPageIdx(clampedCategoryPage + 1)
                    }}
                  >
                    ›
                  </button>
                </span>
              )}
            </div>
          )}
          <div className="filter-bar__group">
            <span className="filter-bar__label">級別</span>
            <span className="filter-chip-group" role="group" aria-label="級別篩選">
              <button
                type="button"
                className="filter-chip"
                aria-pressed={tierFilter === 'all'}
                onClick={() => setTierFilter('all')}
              >
                全部
              </button>
              {(['P1', 'P2', 'P3', 'P4'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="filter-chip"
                  aria-pressed={tierFilter === t}
                  onClick={() => setTierFilter(t)}
                >
                  {TIER_LABELS[t]}
                </button>
              ))}
            </span>
          </div>
          <div className="filter-bar__group">
            <span className="filter-bar__label">狀態</span>
            <span className="filter-chip-group" role="group" aria-label="狀態篩選">
              <button
                type="button"
                className="filter-chip"
                aria-pressed={lockFilter === 'all'}
                onClick={() => setLockFilter('all')}
              >
                全部
              </button>
              <button
                type="button"
                className="filter-chip"
                aria-pressed={lockFilter === 'unlocked'}
                onClick={() => setLockFilter('unlocked')}
              >
                已解鎖
              </button>
              <button
                type="button"
                className="filter-chip"
                aria-pressed={lockFilter === 'locked'}
                onClick={() => setLockFilter('locked')}
              >
                未解鎖
              </button>
            </span>
          </div>
        </div>
      )}

      {subTab === 'main' ? (
        <MainLaddersView filtered={filtered} unlockedMap={unlockedMap} />
      ) : subTab === 'subject' ? (
        <SubjectGridView filtered={filtered} unlockedMap={unlockedMap} />
      ) : (
        <StatsPanel />
      )}
    </div>
  )
}

// ─── Ladder grouping for 成就 tab ──────────────────────────────────────────

/**
 * Each main-tab achievement belongs to exactly one "ladder" — a P4→P1
 * progression on the same metric. Quiz splits into 2 sub-ladders
 * (累計 vs streak) since they measure different things.
 */
function ladderKey(a: Achievement): string {
  if (a.id.startsWith('streak-correct-')) return 'quiz-streak'
  if (a.id.startsWith('quiz-correct-')) return 'quiz-accumulative'
  return a.category
}

const LADDER_ORDER: readonly string[] = [
  'study',
  'quiz-accumulative',
  'quiz-streak',
  'recruit',
  'hospital',
  'fortune',
  'hidden',
]

const LADDER_LABELS: Record<string, string> = {
  study: '學習里程碑',
  'quiz-accumulative': '答題大師 — 累計',
  'quiz-streak': '答題大師 — 連續答對',
  recruit: '招募達人',
  hospital: '醫院經營',
  fortune: '時運與意外',
  hidden: '隱藏 / 彩蛋',
}

const TIER_RANK: Record<AchievementTier, number> = { P4: 1, P3: 2, P2: 3, P1: 4 }

interface ViewProps {
  filtered: Achievement[]
  unlockedMap: Map<string, number>
}

function MainLaddersView({ filtered, unlockedMap }: ViewProps) {
  const groups = useMemo(() => {
    const m = new Map<string, Achievement[]>()
    for (const a of filtered) {
      const key = ladderKey(a)
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(a)
    }
    for (const list of m.values()) list.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier])
    return m
  }, [filtered])

  if (filtered.length === 0) {
    return <p className="achievements-page__empty">沒有符合條件的成就</p>
  }

  return (
    <div className="achievements-page__ladders">
      {LADDER_ORDER.map((key) => {
        const entries = groups.get(key)
        if (!entries || entries.length === 0) return null
        return (
          <section key={key} className="achievement-ladder">
            <h2 className="achievement-ladder__title">{LADDER_LABELS[key]}</h2>
            <div className="achievement-ladder__row">
              {entries.map((a) => (
                <AchievementCard
                  key={a.id}
                  achievement={a}
                  unlockedAt={unlockedMap.get(a.id) ?? null}
                />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

// ─── Subject mastery view (14 subjects + 1 capstone) ──────────────────────

function SubjectGridView({ filtered, unlockedMap }: ViewProps) {
  const { subjects, capstone } = useMemo(() => {
    const subj = filtered.filter((a) => a.id.startsWith('subject-master-'))
    const cap = filtered.find((a) => a.id === 'all-subjects-mastered') ?? null
    return { subjects: subj, capstone: cap }
  }, [filtered])

  if (filtered.length === 0) {
    return <p className="achievements-page__empty">沒有符合條件的成就</p>
  }

  return (
    <div className="achievements-page__subject-view">
      {subjects.length > 0 && (
        <section className="achievement-ladder">
          <h2 className="achievement-ladder__title">14 科精通</h2>
          <div className="achievement-ladder__subject-grid">
            {subjects.map((a) => (
              <AchievementCard
                key={a.id}
                achievement={a}
                unlockedAt={unlockedMap.get(a.id) ?? null}
              />
            ))}
          </div>
        </section>
      )}
      {capstone && (
        <section className="achievement-ladder achievement-ladder--capstone">
          <h2 className="achievement-ladder__title">全科精通 (capstone)</h2>
          <div className="achievement-ladder__capstone-row">
            <AchievementCard
              achievement={capstone}
              unlockedAt={unlockedMap.get(capstone.id) ?? null}
            />
          </div>
        </section>
      )}
    </div>
  )
}
