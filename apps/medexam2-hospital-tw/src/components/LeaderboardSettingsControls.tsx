// Settings-panel controls for the hospital leaderboard (Phase 7.1–7.3).
//
// Embedded inside the HelpMenu「公開到排行榜」accordion section. Hidden for
// players who never opted in — they should use the opt-in modal on the
// leaderboard page instead. Surfaces three actions for opted-in players:
//   - Toggle is_public on/off (opt-out preserves D1 row per design §D5)
//   - Change nickname (re-uses NicknameField + Worker upsert)
//   - "Not opted in" hint with a link to the leaderboard page
//
// Spec: openspec/changes/add-hospital-leaderboard/tasks.md §7.1–7.3
//       openspec/changes/add-hospital-leaderboard/design.md §D5

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth/AuthContext'
import {
  getLeaderboardProfile,
  markOptedIn,
  setLeaderboardPublic,
} from '../services/leaderboard-profile'
import {
  optOutLeaderboard,
  upsertLeaderboard,
} from '../lib/leaderboard/api'
import { buildLeaderboardAttributes, pushLeaderboardIfOptedIn } from '../lib/sync/leaderboard'
import type { LeaderboardProfileRow } from '../db/schema'
import { EmojiIcon } from './EmojiIcon'
import { NicknameField, type NicknameValidity } from './NicknameField'

type ToggleStatus = 'idle' | 'flipping' | 'error'

export function LeaderboardSettingsControls() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<LeaderboardProfileRow | undefined | null>(null)
  const [toggleStatus, setToggleStatus] = useState<ToggleStatus>('idle')
  const [toggleError, setToggleError] = useState<string | null>(null)
  const [editingNickname, setEditingNickname] = useState(false)
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [nicknameValidity, setNicknameValidity] = useState<NicknameValidity>({ state: 'empty' })
  const [submittingNickname, setSubmittingNickname] = useState(false)
  const [nicknameError, setNicknameError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setProfile(undefined)
      return
    }
    let cancelled = false
    void (async () => {
      const p = await getLeaderboardProfile(user.id)
      if (!cancelled) setProfile(p ?? undefined)
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  if (!user) {
    return (
      <p className="muted">
        請先登入 Google 帳號才能管理排行榜設定。
      </p>
    )
  }

  if (profile === null) {
    return <p className="muted">載入中…</p>
  }

  if (!profile || !profile.opted_in) {
    return (
      <p>
        你還沒加入排行榜。前往{' '}
        <Link to="/leaderboard"><EmojiIcon char="🏆" size={16} /> 排名</Link>{' '}
        頁面開啟加入流程。
      </p>
    )
  }

  // Pre-`is_public` v14 rows treated as public (matches sync hook behavior).
  const currentlyPublic = profile.is_public !== false

  async function handleToggle(next: boolean): Promise<void> {
    if (!user || !profile) return
    setToggleStatus('flipping')
    setToggleError(null)
    try {
      if (next) {
        await setLeaderboardPublic(user.id, true)
        // Push immediately so the Worker row goes is_public=1 without waiting
        // for the next gameplay-triggered R2 sync (which could be hours away).
        const res = await pushLeaderboardIfOptedIn(user.id)
        if (res.kind === 'error') throw new Error(res.message)
      } else {
        await optOutLeaderboard()
        await setLeaderboardPublic(user.id, false)
      }
      const refreshed = await getLeaderboardProfile(user.id)
      setProfile(refreshed ?? undefined)
      setToggleStatus('idle')
    } catch (err) {
      setToggleStatus('error')
      setToggleError(err instanceof Error ? err.message : String(err))
    }
  }

  function startEditingNickname(): void {
    setNicknameDraft(profile?.nickname ?? '')
    setEditingNickname(true)
    setNicknameError(null)
  }

  function cancelEditingNickname(): void {
    setEditingNickname(false)
    setNicknameDraft('')
    setNicknameError(null)
  }

  async function submitNickname(): Promise<void> {
    if (!user || !profile) return
    const trimmed = nicknameDraft.trim()
    if (trimmed.length === 0) return
    setSubmittingNickname(true)
    setNicknameError(null)
    try {
      const attrs = await buildLeaderboardAttributes()
      await upsertLeaderboard({
        nickname: trimmed,
        ...attrs,
        is_public: currentlyPublic ? 1 : 0,
        updated_at: Date.now(),
      })
      // markOptedIn doubles as a "rewrite nickname" — overwrites the row.
      // It resets is_public to true, so re-apply the current public state.
      await markOptedIn(user.id, trimmed)
      if (!currentlyPublic) {
        await setLeaderboardPublic(user.id, false)
      }
      const refreshed = await getLeaderboardProfile(user.id)
      setProfile(refreshed ?? undefined)
      setEditingNickname(false)
      setNicknameDraft('')
    } catch (err) {
      setNicknameError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmittingNickname(false)
    }
  }

  // Allow submit only when (a) nickname differs from current AND passes
  // uniqueness, OR (b) same as current (no-op submit just closes editor).
  const isSameAsCurrent = nicknameDraft.trim() === (profile.nickname ?? '')
  const canSubmitNickname =
    !submittingNickname &&
    nicknameDraft.trim().length > 0 &&
    (isSameAsCurrent || nicknameValidity.state === 'available')

  return (
    <div className="leaderboard-settings">
      <p>
        目前暱稱：<strong>{profile.nickname ?? '（未設定）'}</strong>
      </p>

      <label className="help-menu__toggle-row">
        <input
          type="checkbox"
          role="switch"
          checked={currentlyPublic}
          disabled={toggleStatus === 'flipping'}
          onChange={(e) => void handleToggle(e.target.checked)}
        />
        <span>
          {currentlyPublic ? '✓ 公開在排行榜上' : '✗ 已隱藏（紀錄保留）'}
        </span>
      </label>
      {toggleStatus === 'flipping' && <p className="muted">套用中…</p>}
      {toggleError && (
        <p className="leaderboard-optin-modal__error">切換失敗：{toggleError}</p>
      )}

      {!editingNickname ? (
        <button
          type="button"
          className="settings-modal__reset-btn"
          onClick={startEditingNickname}
        >
          <EmojiIcon char="✏" size={16} /> 修改暱稱
        </button>
      ) : (
        <div className="leaderboard-settings__nickname-editor">
          <NicknameField
            value={nicknameDraft}
            onChange={setNicknameDraft}
            onValidityChange={setNicknameValidity}
            skipUniquenessCheck={isSameAsCurrent}
            disabled={submittingNickname}
            autoFocus
          />
          {nicknameError && (
            <p className="leaderboard-optin-modal__error">送出失敗：{nicknameError}</p>
          )}
          <div className="leaderboard-settings__nickname-actions">
            <button
              type="button"
              className="settings-modal__reset-btn"
              onClick={cancelEditingNickname}
              disabled={submittingNickname}
            >
              取消
            </button>
            <button
              type="button"
              className="settings-modal__reset-btn"
              onClick={() => {
                if (isSameAsCurrent) {
                  cancelEditingNickname()
                  return
                }
                void submitNickname()
              }}
              disabled={!canSubmitNickname}
            >
              {submittingNickname ? '送出中…' : '儲存暱稱'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
