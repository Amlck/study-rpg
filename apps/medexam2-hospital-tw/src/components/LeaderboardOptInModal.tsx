// First-time opt-in modal for the hospital leaderboard tab.
//
// Spec: openspec/changes/add-hospital-leaderboard/specs/hospital-leaderboard/spec.md
//        §Requirement: Opt-in flow on first leaderboard visit
//        §Requirement: Privacy and integrity disclosures
//
// Display rules:
//  - Shown when the player opens /leaderboard for the first time AND has
//    neither opted-in nor explicitly dismissed-don't-show-again.
//  - Lists public fields explicitly so the player sees what becomes visible.
//  - Unchecked consent checkbox required to enable the submit button (spec
//    forbids pre-checked default — that would be a dark pattern).
//  - Nickname is selected here via NicknameField; blank → Google display
//    name fallback.
//  - "不再顯示" persists a device-local dismiss flag so the modal never
//    auto-shows again (player can still opt-in from the settings panel).
//  - Closing without submit re-prompts on the next visit.

import { useState } from 'react'
import { useAuth } from '../lib/auth/AuthContext'
import { NicknameField, type NicknameValidity } from './NicknameField'

interface Props {
  isOpen: boolean
  onClose: () => void
  /** Parent persists the row to D1 via the leaderboard adapter (Phase 4). */
  onSubmit: (data: { nickname: string }) => Promise<void> | void
  /** Parent persists a device-local "never show again" flag. */
  onDismissForever: () => void
}

export function LeaderboardOptInModal({
  isOpen,
  onClose,
  onSubmit,
  onDismissForever,
}: Props) {
  const { user, signInWithGoogle } = useAuth()

  // Google OAuth populates user_metadata.full_name; fall back to email
  // local-part if name is missing (rare but possible).
  const fallbackName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.email as string | undefined) ??
    undefined

  const [consent, setConsent] = useState(false)
  const [nickname, setNickname] = useState('')
  const [validity, setValidity] = useState<NicknameValidity>({ state: 'empty' })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  if (!isOpen) return null

  // Blank nickname is acceptable only if we have a Google name to fall back
  // on (the worker upsert handler enforces the same — submit will fail with
  // 400 invalid_nickname_length if both are missing).
  const nicknameAcceptable =
    validity.state === 'available' ||
    (validity.state === 'empty' && fallbackName !== undefined)

  const canSubmit = consent && nicknameAcceptable && !submitting

  const handleSubmit = async () => {
    setSubmitError(null)
    setSubmitting(true)
    try {
      const finalNickname = nickname.length > 0 ? nickname : (fallbackName ?? '')
      await onSubmit({ nickname: finalNickname })
      onClose()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="加入排行榜"
    >
      <div
        className="modal frame leaderboard-optin-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>🏆 加入排行榜</h2>
          <button
            type="button"
            className="leaderboard-optin-modal__close"
            onClick={onClose}
            aria-label="關閉（下次再決定）"
          >
            ✕
          </button>
        </div>

        {!user ? (
          <div className="leaderboard-optin-modal__login-gate">
            <p>請先登入才能加入排行榜。</p>
            <button
              type="button"
              className="leaderboard-optin-modal__signin-btn"
              onClick={() => void signInWithGoogle()}
            >
              用 Google 登入
            </button>
          </div>
        ) : (
          <div className="leaderboard-optin-modal__body">
            <section className="leaderboard-optin-modal__intro">
              <p>加入後，以下資訊會公開在全二階玩家排行榜：</p>
              <ul className="leaderboard-optin-modal__field-list">
                <li>🏥 醫院等級（tier 1–3）</li>
                <li>📈 累積聲望</li>
                <li>👨‍⚕️ 醫師個數</li>
                <li>📖 累積唸書時間（自 V6 起算）</li>
                <li>🏷️ 你設定的暱稱（留空則用 Google 名稱）</li>
              </ul>
              <p className="leaderboard-optin-modal__note">
                不會公開：email、實際遊戲存檔、任何個資。資料來自你本機記錄，
                <strong>自填無驗證</strong>。
              </p>
            </section>

            <NicknameField
              value={nickname}
              onChange={setNickname}
              onValidityChange={setValidity}
              fallbackName={fallbackName}
              autoFocus
              disabled={submitting}
            />

            <label className="leaderboard-optin-modal__consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                disabled={submitting}
              />
              <span>我同意公開以上資訊到排行榜</span>
            </label>

            {submitError && (
              <p className="leaderboard-optin-modal__error">
                送出失敗：{submitError}
              </p>
            )}

            <div className="leaderboard-optin-modal__actions">
              <button
                type="button"
                className="leaderboard-optin-modal__dismiss-forever"
                onClick={() => {
                  onDismissForever()
                  onClose()
                }}
                disabled={submitting}
              >
                不再顯示
              </button>
              <button
                type="button"
                className="leaderboard-optin-modal__submit"
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
              >
                {submitting ? '送出中…' : '加入排行榜'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
