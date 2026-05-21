// Reusable nickname input with debounced uniqueness check.
//
// Used by:
//  - LeaderboardOptInModal (first-time opt-in flow)
//  - SettingsPanel / HelpMenu (Phase 7, change nickname)
//
// Validation:
//  - 2–12 Unicode codepoints (`[...str].length` semantics — matches Worker
//    and @study-rpg/core/leaderboard-types)
//  - Case-insensitive uniqueness via Worker GET /leaderboard/nickname-check
//    (debounced 400ms after last keystroke)
//  - Blank input is treated as "use fallback" — the OptInModal accepts that
//    state and uses the Google display name on submit
//
// Reports validity to the parent via `onValidityChange` so the parent can
// gate its submit button (e.g. only enable submit if state === 'available'
// or state === 'empty' with a fallback name).

import { useEffect, useRef, useState } from 'react'
import {
  LEADERBOARD_NICKNAME_MIN_CODEPOINTS,
  LEADERBOARD_NICKNAME_MAX_CODEPOINTS,
  countNicknameCodepoints,
  isValidNicknameLength,
} from '@study-rpg/core'
import { checkNicknameAvailability } from '../lib/leaderboard/api'

const DEBOUNCE_MS = 400

export type NicknameValidity =
  | { state: 'empty' }
  | { state: 'invalid-length'; codepoints: number }
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'taken' }
  | { state: 'error'; message: string }

interface Props {
  value: string
  onChange: (value: string) => void
  onValidityChange?: (validity: NicknameValidity) => void
  /** Shown in placeholder + empty-state hint to telegraph the fallback. */
  fallbackName?: string
  /** Skip the uniqueness check (e.g. in settings panel when value equals the
   *  player's current nickname, so the existing row would conflict with itself). */
  skipUniquenessCheck?: boolean
  autoFocus?: boolean
  disabled?: boolean
}

export function NicknameField({
  value,
  onChange,
  onValidityChange,
  fallbackName,
  skipUniquenessCheck = false,
  autoFocus = false,
  disabled = false,
}: Props) {
  const [validity, setValidity] = useState<NicknameValidity>({ state: 'empty' })
  const debounceTimerRef = useRef<number | null>(null)
  // Monotonic counter — in-flight fetches whose ID no longer matches the
  // current ref are stale (user typed again) and their result is discarded.
  const requestIdRef = useRef(0)

  // Mirror onValidityChange in a ref so the validity-broadcast effect does
  // NOT need it in the dep array (avoids re-firing when parent re-creates
  // its callback identity on every render).
  const onValidityChangeRef = useRef(onValidityChange)
  useEffect(() => {
    onValidityChangeRef.current = onValidityChange
  }, [onValidityChange])

  useEffect(() => {
    onValidityChangeRef.current?.(validity)
  }, [validity])

  useEffect(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }

    const trimmed = value
    requestIdRef.current += 1
    const myRequestId = requestIdRef.current

    if (trimmed.length === 0) {
      setValidity({ state: 'empty' })
      return
    }

    if (!isValidNicknameLength(trimmed)) {
      setValidity({
        state: 'invalid-length',
        codepoints: countNicknameCodepoints(trimmed),
      })
      return
    }

    if (skipUniquenessCheck) {
      setValidity({ state: 'available' })
      return
    }

    setValidity({ state: 'checking' })
    debounceTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await checkNicknameAvailability(trimmed)
          if (requestIdRef.current !== myRequestId) return
          setValidity(
            result.available ? { state: 'available' } : { state: 'taken' },
          )
        } catch (err) {
          if (requestIdRef.current !== myRequestId) return
          setValidity({
            state: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        } finally {
          debounceTimerRef.current = null
        }
      })()
    }, DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current)
        debounceTimerRef.current = null
      }
    }
  }, [value, skipUniquenessCheck])

  return (
    <div className="nickname-field">
      <label className="nickname-field__label">
        <span>暱稱（{LEADERBOARD_NICKNAME_MIN_CODEPOINTS}–{LEADERBOARD_NICKNAME_MAX_CODEPOINTS} 字元）</span>
        <input
          type="text"
          className="nickname-field__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={fallbackName ? `留空使用「${fallbackName}」` : '輸入暱稱'}
          autoFocus={autoFocus}
          disabled={disabled}
          // Raw-char ceiling to limit DOM input length; codepoint count
          // enforced separately for correctness.
          maxLength={48}
        />
      </label>
      <NicknameValidityHint validity={validity} fallbackName={fallbackName} />
    </div>
  )
}

function NicknameValidityHint({
  validity,
  fallbackName,
}: {
  validity: NicknameValidity
  fallbackName?: string
}) {
  switch (validity.state) {
    case 'empty':
      return (
        <p className="nickname-field__hint nickname-field__hint--neutral">
          {fallbackName
            ? `留空會用 Google 名稱「${fallbackName}」`
            : '請設定一個暱稱'}
        </p>
      )
    case 'invalid-length':
      return (
        <p className="nickname-field__hint nickname-field__hint--error">
          目前 {validity.codepoints} 字 — 需要 {LEADERBOARD_NICKNAME_MIN_CODEPOINTS}–{LEADERBOARD_NICKNAME_MAX_CODEPOINTS} 字元
        </p>
      )
    case 'checking':
      return (
        <p className="nickname-field__hint nickname-field__hint--neutral">
          檢查中…
        </p>
      )
    case 'available':
      return (
        <p className="nickname-field__hint nickname-field__hint--ok">
          ✓ 可用
        </p>
      )
    case 'taken':
      return (
        <p className="nickname-field__hint nickname-field__hint--error">
          ✕ 已被其他玩家使用
        </p>
      )
    case 'error':
      return (
        <p className="nickname-field__hint nickname-field__hint--error">
          檢查失敗：{validity.message}
        </p>
      )
  }
}
