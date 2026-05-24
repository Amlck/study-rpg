// Hospital leaderboard page — Top 100 list + 4 filter tabs + my-rank chip.
//
// Spec: openspec/changes/add-hospital-leaderboard/specs/hospital-leaderboard/spec.md
//        §Requirement: Four filter tabs for ranking criteria
//        §Requirement: Top 100 list plus my-rank chip
//        §Requirement: Hourly KV cache refresh (last-updated-at timestamp)
//        §Requirement: Privacy and integrity disclosures (footer)
//
// Phase 6 scope:
//   - 6.2: page render + 4 tabs + Top 100 list + footer disclosure
//   - 6.3: first-time opt-in modal (gated on local profile in IDB)
//   - 6.4: tab switching client-side (no re-fetch — fetch all 4 in parallel
//          on mount, switch tabs is local state change)
//   - 6.5: empty state with player counter
//
// Deferred to later phases:
//   - my-rank chip for opted-in players outside top 100 (needs Worker
//     /my-rank endpoint — Phase 4 follow-up)

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  LEADERBOARD_FILTERS,
  LEADERBOARD_FILTER_LABELS,
  type LeaderboardFilter,
  type LeaderboardRow,
  type LeaderboardSnapshot,
} from '@study-rpg/core'
import { useAuth } from '../lib/auth/AuthContext'
import { fetchLeaderboardSnapshot, upsertLeaderboard } from '../lib/leaderboard/api'
import { BadgeSprite } from '../components/BadgeSprite'
import type { AchievementCategory, AchievementTier } from '@study-rpg/core'
import { EmojiIcon } from '../components/EmojiIcon'
import { LeaderboardOptInModal } from '../components/LeaderboardOptInModal'
import {
  getLeaderboardProfile,
  markDismissedForever,
  markOptedIn,
} from '../services/leaderboard-profile'
import { buildLeaderboardAttributes } from '../lib/sync/leaderboard'

type SnapshotState =
  | { kind: 'loading' }
  | { kind: 'ready'; snapshots: Record<LeaderboardFilter, LeaderboardSnapshot> }
  | { kind: 'error'; message: string }

function parseFilter(raw: string | null): LeaderboardFilter {
  return raw && (LEADERBOARD_FILTERS as readonly string[]).includes(raw)
    ? (raw as LeaderboardFilter)
    : 'composite'
}

function formatTimestamp(ms: number | null): string {
  if (ms === null) return '尚未產生'
  const date = new Date(ms)
  return date.toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function LeaderboardPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const activeFilter: LeaderboardFilter = parseFilter(params.get('tab'))

  const [snapshotState, setSnapshotState] = useState<SnapshotState>({ kind: 'loading' })
  const [showOptInModal, setShowOptInModal] = useState(false)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const results = await Promise.all(
          LEADERBOARD_FILTERS.map((f) => fetchLeaderboardSnapshot(f).then((s) => [f, s] as const)),
        )
        if (cancelled) return
        const snapshots = Object.fromEntries(results) as Record<
          LeaderboardFilter,
          LeaderboardSnapshot
        >
        setSnapshotState({ kind: 'ready', snapshots })
      } catch (err) {
        if (cancelled) return
        setSnapshotState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // First-visit opt-in modal — show only when authed + no prior opt-in + no
  // dismiss flag. One-shot read (not useLiveQuery) so we avoid the
  // loading-vs-absent ambiguity; the user's submit / dismiss action mutates
  // local state directly via setShowOptInModal.
  useEffect(() => {
    if (!user) {
      setShowOptInModal(false)
      return
    }
    let cancelled = false
    void (async () => {
      const profile = await getLeaderboardProfile(user.id)
      if (cancelled) return
      if (!profile?.opted_in && !profile?.dismissed_at) {
        setShowOptInModal(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const setFilter = (next: LeaderboardFilter): void => {
    if (next === activeFilter) return
    const nextParams = new URLSearchParams(params)
    nextParams.set('tab', next)
    setParams(nextParams, { replace: true })
  }

  const handleOptInSubmit = async ({ nickname }: { nickname: string }): Promise<void> => {
    if (!user) return
    const attrs = await buildLeaderboardAttributes()
    await upsertLeaderboard({
      nickname,
      ...attrs,
      is_public: 1,
      updated_at: Date.now(),
    })
    await markOptedIn(user.id, nickname)
    setShowOptInModal(false)
  }

  const handleDismissForever = (): void => {
    if (!user) return
    void markDismissedForever(user.id)
    setShowOptInModal(false)
  }

  return (
    <main className="app-shell leaderboard-page">
      <header className="app-header">
        <h1><EmojiIcon char="🏆" size={28} /> 排名</h1>
        <div className="app-header__meta">
          <Link to="/" className="nav-link">
            ← 回首頁
          </Link>
        </div>
      </header>

      <section className="filter-bar" aria-label="排名類別篩選">
        <div className="filter-bar__group">
          <span className="filter-bar__label">類別</span>
          <span className="filter-chip-group" role="group" aria-label="排名類別">
            {LEADERBOARD_FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                className="filter-chip"
                aria-pressed={activeFilter === f}
                onClick={() => setFilter(f)}
              >
                {LEADERBOARD_FILTER_LABELS[f]}
              </button>
            ))}
          </span>
        </div>
      </section>

      <LeaderboardBody
        snapshotState={snapshotState}
        activeFilter={activeFilter}
        currentUserId={user?.id}
      />

      <footer className="leaderboard-footer">
        <p className="leaderboard-footer__disclosure">
          資料為玩家本機記錄、<strong>自填無驗證</strong>。
        </p>
        <p className="leaderboard-footer__disclosure">
          累積唸書時間自 V6 起算（更早的時間不計）。
        </p>
      </footer>

      <LeaderboardOptInModal
        isOpen={showOptInModal}
        onClose={() => setShowOptInModal(false)}
        onSubmit={handleOptInSubmit}
        onDismissForever={handleDismissForever}
      />
    </main>
  )
}

// ─── Body (loading / error / list) ───────────────────────────────────────────

interface BodyProps {
  snapshotState: SnapshotState
  activeFilter: LeaderboardFilter
  currentUserId: string | undefined
}

function LeaderboardBody({ snapshotState, activeFilter, currentUserId }: BodyProps) {
  if (snapshotState.kind === 'loading') {
    return <p className="leaderboard-status">載入中…</p>
  }
  if (snapshotState.kind === 'error') {
    return (
      <p className="leaderboard-status leaderboard-status--error">
        載入失敗：{snapshotState.message}
      </p>
    )
  }

  const snapshot = snapshotState.snapshots[activeFilter]
  const rows = snapshot.rows
  const total = snapshot.total_count

  return (
    <>
      <MyRankChip rows={rows} currentUserId={currentUserId} total={total} />
      <p className="leaderboard-meta">
        上次更新：{formatTimestamp(snapshot.last_updated_at)} ・ 目前 {total} 位玩家加入排行
      </p>
      {rows.length === 0 ? (
        <p className="leaderboard-status">期待第一個上榜的玩家！</p>
      ) : (
        <>
          <LeaderboardList
            rows={rows}
            activeFilter={activeFilter}
            currentUserId={currentUserId}
          />
          <MyRowSticky
            rows={rows}
            activeFilter={activeFilter}
            currentUserId={currentUserId}
          />
        </>
      )}
    </>
  )
}

// ─── My-rank sticky chip ─────────────────────────────────────────────────────

interface MyRankChipProps {
  rows: LeaderboardRow[]
  currentUserId: string | undefined
  total: number
}

function MyRankChip({ rows, currentUserId, total }: MyRankChipProps) {
  // Phase 6.2 simplification: only show rank if user appears in top-100.
  // Out-of-top-100 rank-lookup is a Phase 4 Worker endpoint follow-up.
  // If we don't have a session, we know nothing — show nothing.
  if (!currentUserId) {
    return (
      <div className="leaderboard-my-rank-chip leaderboard-my-rank-chip--muted">
        <span>未登入 — 登入後可查看自己的排名</span>
      </div>
    )
  }

  const myIndex = rows.findIndex((r) => r.user_id === currentUserId)
  if (myIndex < 0) {
    return (
      <div className="leaderboard-my-rank-chip leaderboard-my-rank-chip--muted">
        <span>你不在 Top 100 — 至「設定」加入排行榜或繼續經營吧！</span>
      </div>
    )
  }

  return (
    <div className="leaderboard-my-rank-chip" aria-live="polite">
      <span>
        你目前第 <strong>{myIndex + 1}</strong> 名 ・ 共 {total} 人
      </span>
    </div>
  )
}

// ─── Top-100 tabular grid ────────────────────────────────────────────────────

interface ListProps {
  rows: LeaderboardRow[]
  activeFilter: LeaderboardFilter
  currentUserId: string | undefined
}

type CellKey = 'rank' | 'nickname' | 'tier' | 'reputation' | 'doctors' | 'study'

function isPrimaryFor(filter: LeaderboardFilter, cell: CellKey): boolean {
  switch (filter) {
    case 'composite':
      return cell === 'tier' || cell === 'reputation'
    case 'reputation':
      return cell === 'reputation'
    case 'doctor':
      return cell === 'doctors'
    case 'study':
      return cell === 'study'
  }
}

function cellClass(cell: CellKey, filter: LeaderboardFilter): string {
  return `leaderboard-cell leaderboard-cell--${cell}${
    isPrimaryFor(filter, cell) ? ' leaderboard-cell--primary' : ''
  }`
}

const MEDAL_BY_RANK: Record<1 | 2 | 3, { char: string; title: string }> = {
  1: { char: '🥇', title: '第一名' },
  2: { char: '🥈', title: '第二名' },
  3: { char: '🥉', title: '第三名' },
}

function LeaderboardList({ rows, activeFilter, currentUserId }: ListProps) {
  return (
    <ol className="leaderboard-list" role="list">
      <li className="leaderboard-row leaderboard-row--header" role="row" aria-hidden="true">
        <span className={cellClass('rank', activeFilter)}>排名</span>
        <span className={cellClass('nickname', activeFilter)}>玩家</span>
        <span className={cellClass('tier', activeFilter)}>等級</span>
        <span className={cellClass('reputation', activeFilter)}>聲望</span>
        <span className={cellClass('doctors', activeFilter)}>醫師</span>
        <span className={cellClass('study', activeFilter)}>唸書</span>
      </li>
      {rows.map((row, idx) => {
        const rank = idx + 1
        const isMe = row.user_id === currentUserId
        const medal = rank <= 3 ? MEDAL_BY_RANK[rank as 1 | 2 | 3] : null
        const rowClasses = [
          'leaderboard-row',
          isMe ? 'leaderboard-row--me' : '',
          rank === 1 ? 'leaderboard-row--rank-1' : '',
          rank === 2 ? 'leaderboard-row--rank-2' : '',
          rank === 3 ? 'leaderboard-row--rank-3' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <li key={row.user_id} className={rowClasses} role="row">
            <span className={cellClass('rank', activeFilter)} aria-label={`第 ${rank} 名`}>
              {medal ? (
                <EmojiIcon char={medal.char} title={medal.title} size={28} />
              ) : (
                <span className="leaderboard-rank-number">#{rank}</span>
              )}
            </span>
            <span className={cellClass('nickname', activeFilter)}>
              <NicknameWithBadges
                nickname={row.nickname}
                badgesCsv={row.badges_csv}
                subjectMasteryCount={row.subject_mastery_count}
              />
            </span>
            <span className={cellClass('tier', activeFilter)}>T{row.hospital_tier}</span>
            <span className={cellClass('reputation', activeFilter)}>{row.reputation}</span>
            <span className={cellClass('doctors', activeFilter)}>{row.doctor_count}</span>
            <span className={cellClass('study', activeFilter)}>{row.total_study_min}m</span>
          </li>
        )
      })}
    </ol>
  )
}

// ─── Badge inline renderer (per add-achievement-system, hospital-leaderboard spec) ──

const CATEGORY_ORDER: readonly AchievementCategory[] = [
  'study',
  'quiz',
  'recruit',
  'hospital',
  'fortune',
  'hidden',
]

function parseBadgesCsv(
  csv: string | undefined,
): Array<{ category: AchievementCategory; tier: AchievementTier }> {
  if (!csv) return []
  const result: Array<{ category: AchievementCategory; tier: AchievementTier }> = []
  for (const pair of csv.split(',')) {
    const [cat, tier] = pair.split(':')
    if (!cat || !tier) continue
    if (!CATEGORY_ORDER.includes(cat as AchievementCategory)) continue
    if (!['P1', 'P2', 'P3', 'P4'].includes(tier)) continue
    result.push({ category: cat as AchievementCategory, tier: tier as AchievementTier })
  }
  // Sort to match CATEGORY_ORDER for stable visual layout
  result.sort(
    (a, b) =>
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  )
  return result
}

function NicknameWithBadges({
  nickname,
  badgesCsv,
  subjectMasteryCount,
}: {
  nickname: string
  badgesCsv?: string
  subjectMasteryCount?: number
}) {
  const badges = parseBadgesCsv(badgesCsv)
  const subjectCount = subjectMasteryCount ?? 0
  return (
    <span className="nickname-with-badges">
      <span className="nickname-with-badges__name">{nickname}</span>
      {badges.length > 0 && (
        <span className="nickname-with-badges__badges" aria-hidden={false}>
          {badges.map((b) => (
            <BadgeSprite
              key={`${b.category}:${b.tier}`}
              category={b.category}
              tier={b.tier}
              size={20}
            />
          ))}
        </span>
      )}
      {subjectCount > 0 && (
        <span
          className="nickname-with-badges__subject-chip"
          title={`已寫完 ${subjectCount} 科`}
          aria-label={`科別精通 ${subjectCount} / 14`}
        >
          🩺 {subjectCount}/14
        </span>
      )}
    </span>
  )
}

// ─── My-row sticky duplicate (visible only when inline row is offscreen) ─────

function MyRowSticky({ rows, activeFilter, currentUserId }: ListProps) {
  // Default to `true` so the sticky stays hidden on first paint, before the
  // observer's initial callback fires. Avoids a flash-of-sticky on mount when
  // the user IS in viewport.
  const [inlineVisible, setInlineVisible] = useState(true)

  useEffect(() => {
    if (!currentUserId) return
    const el = document.querySelector('.leaderboard-list .leaderboard-row--me')
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => setInlineVisible(entry.intersectionRatio > 0),
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [currentUserId, rows, activeFilter])

  if (!currentUserId) return null
  const myIdx = rows.findIndex((r) => r.user_id === currentUserId)
  if (myIdx < 0) return null
  if (inlineVisible) return null

  const row = rows[myIdx]
  const rank = myIdx + 1
  const medal = rank <= 3 ? MEDAL_BY_RANK[rank as 1 | 2 | 3] : null

  return (
    <div
      className="leaderboard-row leaderboard-row--me leaderboard-row--me-sticky"
      role="presentation"
      aria-hidden="true"
    >
      <span className={cellClass('rank', activeFilter)}>
        {medal ? (
          <EmojiIcon char={medal.char} title={medal.title} size={28} />
        ) : (
          <span className="leaderboard-rank-number">#{rank}</span>
        )}
      </span>
      <span className={cellClass('nickname', activeFilter)}>
        <NicknameWithBadges
          nickname={row.nickname}
          badgesCsv={row.badges_csv}
          subjectMasteryCount={row.subject_mastery_count}
        />
      </span>
      <span className={cellClass('tier', activeFilter)}>T{row.hospital_tier}</span>
      <span className={cellClass('reputation', activeFilter)}>{row.reputation}</span>
      <span className={cellClass('doctors', activeFilter)}>{row.doctor_count}</span>
      <span className={cellClass('study', activeFilter)}>{row.total_study_min}m</span>
    </div>
  )
}
