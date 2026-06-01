// QuizHotkeysAnnouncementBanner — homepage announcement for the keyboard
// hotkey feature shipped via add-quiz-number-hotkeys-medexam2.
//
// Per-device dismissal via localStorage (mirrors DomainMigrationBanner pattern).
// CSS gates display to desktop-only (`@media (hover: hover) and (pointer: fine)`)
// since the underlying feature is desktop-only — touch users seeing this would
// be confusing.
//
// Spec: openspec/changes/add-quiz-number-hotkeys-medexam2/specs/hospital-quiz/spec.md
//       — "QuizModal SHALL announce keyboard shortcuts via dismissible homepage banner"

import { useState } from 'react'

const STORAGE_KEY = 'quiz-hotkeys-banner-dismissed-v1'

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function markDismissed(): void {
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch {
    // localStorage unavailable — banner re-renders next load, acceptable.
  }
}

export function QuizHotkeysAnnouncementBanner(): JSX.Element | null {
  const [hidden, setHidden] = useState<boolean>(() => isDismissed())

  if (hidden) return null

  function handleDismiss(): void {
    markDismissed()
    setHidden(true)
  }

  return (
    <div
      className="quiz-hotkeys-banner"
      role="region"
      aria-label="新功能公告：鍵盤快捷鍵"
    >
      <span className="quiz-hotkeys-banner__icon" aria-hidden="true">
        ⌨️
      </span>
      <span className="quiz-hotkeys-banner__msg">
        <strong>新功能：答題系統鍵盤快捷鍵</strong> — 題目階段 <kbd>1</kbd>–<kbd>4</kbd> 選答案、
        <kbd>Enter</kbd> 送出；答題後 <kbd>1</kbd> 收藏、<kbd>2</kbd> 太簡單、
        <kbd>3</kbd> 我亂猜的；<kbd>Space</kbd> 翻頁、<kbd>↓↑</kbd> 微捲。
        詳見右下 <span className="quiz-hotkeys-banner__inline-icon">❓</span> →「⌨️ 鍵盤快捷鍵」。
      </span>
      <button
        type="button"
        className="quiz-hotkeys-banner__dismiss"
        onClick={handleDismiss}
        aria-label="關閉公告"
      >
        ✕
      </button>
    </div>
  )
}
