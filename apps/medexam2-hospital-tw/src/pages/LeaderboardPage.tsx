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

import { useEffect, useMemo, useState } from 'react'
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
        <LeaderboardList
          rows={rows}
          activeFilter={activeFilter}
          currentUserId={currentUserId}
        />
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

// ─── Top-100 list ────────────────────────────────────────────────────────────

interface ListProps {
  rows: LeaderboardRow[]
  activeFilter: LeaderboardFilter
  currentUserId: string | undefined
}

function LeaderboardList({ rows, activeFilter, currentUserId }: ListProps) {
  // Precompute per-row primary stat shown depending on active filter — the
  // other 3 stats render in secondary positions for context.
  const primaryStatFor = useMemo(
    () =>
      ({
        composite: (r: LeaderboardRow) => `T${r.hospital_tier}・聲望 ${r.reputation}`,
        reputation: (r: LeaderboardRow) => `聲望 ${r.reputation}`,
        doctor: (r: LeaderboardRow) => `醫師 ${r.doctor_count}`,
        study: (r: LeaderboardRow) => `${r.total_study_min} 分鐘`,
      }) satisfies Record<LeaderboardFilter, (r: LeaderboardRow) => string>,
    [],
  )

  return (
    <ol className="leaderboard-list">
      {rows.map((row, idx) => {
        const isMe = row.user_id === currentUserId
        return (
          <li
            key={row.user_id}
            className={`leaderboard-list__row${isMe ? ' leaderboard-list__row--me' : ''}`}
          >
            <span className="leaderboard-list__rank">#{idx + 1}</span>
            <span className="leaderboard-list__nickname">{row.nickname}</span>
            <span className="leaderboard-list__primary-stat">
              {primaryStatFor[activeFilter](row)}
            </span>
            <span className="leaderboard-list__secondary-stats">
              T{row.hospital_tier}・聲 {row.reputation}・醫 {row.doctor_count}・讀 {row.total_study_min}m
            </span>
          </li>
        )
      })}
    </ol>
  )
}
