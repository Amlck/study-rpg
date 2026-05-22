// Dismissible homepage banner that surfaces the leaderboard feature to all
// visitors (authed + anonymous). Dismiss persists in localStorage forever
// (no snooze, no re-show) per owner direction.
//
// Spec: openspec/changes/add-leaderboard-promo-banner/specs/hospital-leaderboard/spec.md
//       §Requirement: Homepage promo banner promotes leaderboard discovery
//
// Versioned localStorage key — bump suffix (-v2 etc.) to force re-show after
// a major leaderboard redesign worth re-promoting.

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmojiIcon } from './EmojiIcon'

const STORAGE_KEY = 'leaderboard-promo-banner-dismissed-v1'

function readDismissed(): boolean {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function writeDismissed(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, 'true')
  } catch (err) {
    console.warn('[LeaderboardPromoBanner] localStorage write failed', err)
  }
}

export function LeaderboardPromoBanner() {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    setDismissed(readDismissed())
  }, [])

  if (dismissed) return null

  const handleDismiss = () => {
    writeDismissed()
    setDismissed(true)
  }

  return (
    <div className="leaderboard-promo-banner" role="region" aria-label="排名榜宣傳">
      <span className="leaderboard-promo-banner__icon" aria-hidden="true">
        <EmojiIcon char="✨" size={24} />
      </span>
      <div className="leaderboard-promo-banner__text">
        <span className="leaderboard-promo-banner__headline">新功能：全二階排名榜上線</span>
        <span className="leaderboard-promo-banner__sub">對戰其他玩家、看你的醫院經營成績排名</span>
      </div>
      <Link to="/leaderboard" className="leaderboard-promo-banner__cta">
        立刻看排名 →
      </Link>
      <button
        type="button"
        className="leaderboard-promo-banner__dismiss"
        onClick={handleDismiss}
        aria-label="關閉排名榜宣傳"
        title="不再顯示"
      >
        ✕
      </button>
    </div>
  )
}
