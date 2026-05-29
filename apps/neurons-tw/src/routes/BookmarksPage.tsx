/**
 * BookmarksPage — `/bookmarks` route listing all ⭐ bookmarked questions.
 *
 * Spec: openspec/specs/neurons-mode/spec.md
 *   "Neurons-tw SHALL persist per-question bookmarks with cross-device sync"
 *
 * Layout: top header + family filter chip bar + scrollable row list (max 200).
 * Each row: family badge / stem (100 chars) / addedAt relative time /
 * unbookmark button / 「重新作答」 button (opens 1-question QuizModal).
 */

import { useMemo, useState } from 'react'
import type { ContentPack, Question } from '@study-rpg/core'
import { QuizModal } from '../components/QuizModal'
import { useAllBookmarks, removeBookmark } from '../lib/services/bookmarks'

interface Props {
  pack: ContentPack
}

const MAX_RENDER = 200
const STEM_TRUNCATE_LEN = 100
const NT_BRANCHES = ['DA', '5HT', 'GABA', 'Glu'] as const

export default function BookmarksPage({ pack }: Props): JSX.Element {
  const bookmarks = useAllBookmarks()
  const [excludedFamilies, setExcludedFamilies] = useState<Set<string>>(new Set())
  const [replayQuestion, setReplayQuestion] = useState<Question | null>(null)

  // Map for fast question lookup by id (avoids re-scanning pack.questions per row).
  const questionMap = useMemo(() => {
    const m = new Map<string, Question>()
    for (const q of pack.questions) m.set(q.id, q)
    return m
  }, [pack.questions])

  // Family display name + color lookup.
  const familyMap = useMemo(() => {
    const m = new Map<string, { displayName: string; color: string; group: string }>()
    for (const s of pack.subjects) {
      m.set(s.id, {
        displayName: s.displayName,
        color: s.color ?? '#8c6d4a',
        group: s.group ?? 'DA',
      })
    }
    return m
  }, [pack.subjects])

  const filteredBookmarks = useMemo(() => {
    return bookmarks.filter((b) => !excludedFamilies.has(b.family))
  }, [bookmarks, excludedFamilies])

  const truncatedBookmarks = filteredBookmarks.slice(0, MAX_RENDER)
  const truncated = filteredBookmarks.length > MAX_RENDER

  function toggleFamilyChip(id: string): void {
    setExcludedFamilies((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleReplay(questionId: string): void {
    const q = questionMap.get(questionId)
    if (q) setReplayQuestion(q)
  }

  function handleRemove(questionId: string): void {
    void removeBookmark(questionId)
  }

  return (
    <>
      <header style={headerStyle}>
        <h1 style={titleStyle}>⭐ 收藏題目</h1>
        <p style={subtitleStyle}>
          所有按 ⭐ 或鍵盤 <kbd style={kbdStyle}>1</kbd> 收藏的題目。共{' '}
          <strong>{bookmarks.length}</strong> 題（顯示 {filteredBookmarks.length} 題
          {truncated && ` ，僅渲染前 ${MAX_RENDER} 題`}）。
        </p>
      </header>

      {/* Family filter — chips grouped by NT branch, click toggles exclusion. */}
      <section style={filterBarStyle} aria-label="科目篩選">
        <div style={filterHeaderStyle}>
          <span style={filterLabelStyle}>📚 篩選</span>
          {excludedFamilies.size > 0 && (
            <button
              type="button"
              style={resetBtnStyle}
              onClick={() => setExcludedFamilies(new Set())}
            >
              重置（顯示全部）
            </button>
          )}
        </div>
        <div style={chipRowStyle}>
          {NT_BRANCHES.flatMap((branch) =>
            pack.subjects
              .filter((s) => s.group === branch)
              .map((s) => {
                const excluded = excludedFamilies.has(s.id)
                const color = s.color ?? '#8c6d4a'
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleFamilyChip(s.id)}
                    style={excluded ? chipExcludedStyle(color) : chipIncludedStyle(color)}
                    aria-pressed={!excluded}
                    title={excluded ? `加入 ${s.id}` : `排除 ${s.id}`}
                  >
                    {s.id}
                  </button>
                )
              }),
          )}
        </div>
      </section>

      {bookmarks.length === 0 ? (
        <EmptyState />
      ) : filteredBookmarks.length === 0 ? (
        <p style={noMatchStyle}>
          目前篩選下沒有收藏題目。點上面的灰色 chip 把該 family 加回來。
        </p>
      ) : (
        <ul style={listStyle} role="list">
          {truncatedBookmarks.map((b) => {
            const q = questionMap.get(b.questionId)
            const family = familyMap.get(b.family)
            return (
              <li key={b.questionId} style={rowStyle}>
                <header style={rowHeaderStyle}>
                  <span
                    style={familyBadgeStyle(family?.color ?? '#8c6d4a')}
                    title={family?.displayName ?? b.family}
                  >
                    {b.family}
                  </span>
                  <span style={timeStyle}>{relativeTime(b.addedAt)}</span>
                </header>
                <p style={stemStyle}>
                  {q ? truncate(q.stem, STEM_TRUNCATE_LEN) : '（題目資料缺失 — 可能是 content pack 已更新）'}
                </p>
                <div style={rowActionsStyle}>
                  <button
                    type="button"
                    style={replayBtnStyle}
                    onClick={() => handleReplay(b.questionId)}
                    disabled={!q}
                    title={q ? '重新作答這一題' : '題目不在當前 content pack'}
                  >
                    🎯 重新作答
                  </button>
                  <button
                    type="button"
                    style={unbookmarkBtnStyle}
                    onClick={() => handleRemove(b.questionId)}
                    aria-label="取消收藏"
                  >
                    ★ 取消
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {replayQuestion && (
        <QuizModal pool={[replayQuestion]} onClose={() => setReplayQuestion(null)} />
      )}
    </>
  )
}

function EmptyState(): JSX.Element {
  return (
    <section style={emptyStyle} aria-label="無收藏題目">
      <p style={{ fontSize: '2.5rem', margin: 0 }} aria-hidden>
        📭
      </p>
      <p>
        目前沒有收藏的題目。在答題時按 <strong>⭐ 收藏</strong> 按鈕或鍵盤{' '}
        <kbd style={kbdStyle}>1</kbd> 加入收藏。
      </p>
      <a href="/" style={emptyLinkStyle}>
        ← 回總覽開始答題
      </a>
    </section>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '…'
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '剛剛'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分鐘前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小時前`
  if (diff < 172_800_000) return '昨天'
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const headerStyle: React.CSSProperties = {
  marginBottom: '1rem',
  padding: '0.85rem 1rem',
  background: 'linear-gradient(135deg, #fdf6e3 0%, #f4ecd8 100%)',
  border: '2px solid #8c6d4a',
  borderRadius: '6px',
}

const titleStyle: React.CSSProperties = {
  fontSize: '1.35rem',
  margin: '0 0 0.25rem',
  color: '#3a2a1a',
}

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: '#5a3f29',
  fontSize: '0.9rem',
}

const kbdStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '0.04rem 0.32rem',
  margin: '0 0.1rem',
  background: '#fdf6e3',
  border: '1px solid #8c6d4a',
  borderBottomWidth: '2px',
  borderRadius: '3px',
  fontFamily: "'VT323', 'Courier New', monospace",
  fontSize: '0.92em',
  color: '#3a2a1a',
  lineHeight: 1,
}

const filterBarStyle: React.CSSProperties = {
  background: '#f4ecd8',
  border: '2px solid #8c6d4a',
  padding: '0.7rem 0.85rem',
  marginBottom: '1rem',
  borderRadius: '4px',
}

const filterHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.5rem',
}

const filterLabelStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#3a2a1a',
  fontWeight: 700,
}

const resetBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #8c6d4a',
  borderRadius: '4px',
  padding: '0.2rem 0.55rem',
  fontSize: '0.75rem',
  color: '#5a3f29',
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const chipRowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem',
}

function chipIncludedStyle(color: string): React.CSSProperties {
  return {
    padding: '0.25rem 0.6rem',
    background: color,
    color: '#fff',
    border: `1px solid ${color}`,
    borderRadius: '999px',
    fontSize: '0.78rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
  }
}

function chipExcludedStyle(color: string): React.CSSProperties {
  return {
    padding: '0.25rem 0.6rem',
    background: 'transparent',
    color: '#8c6d4a',
    border: `1px dashed ${color}`,
    borderRadius: '999px',
    fontSize: '0.78rem',
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    opacity: 0.55,
  }
}

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))',
  gap: '0.7rem',
}

const rowStyle: React.CSSProperties = {
  background: '#fff',
  border: '2px solid #d4c4a0',
  borderRadius: '6px',
  padding: '0.7rem 0.85rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  boxShadow: '0 1px 2px rgba(58, 42, 26, 0.06)',
}

const rowHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: '0.5rem',
}

function familyBadgeStyle(color: string): React.CSSProperties {
  return {
    padding: '0.15rem 0.5rem',
    background: color,
    color: '#fff',
    borderRadius: '4px',
    fontSize: '0.78rem',
    fontWeight: 700,
  }
}

const timeStyle: React.CSSProperties = {
  fontSize: '0.75rem',
  color: '#8c6d4a',
}

const stemStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '0.9rem',
  lineHeight: 1.5,
  color: '#3a2a1a',
  whiteSpace: 'pre-wrap',
}

const rowActionsStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  marginTop: 'auto',
}

const replayBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.4rem 0.6rem',
  background: '#d4a04d',
  color: '#fff',
  border: '1px solid #b8893a',
  borderRadius: '4px',
  fontSize: '0.85rem',
  fontWeight: 700,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const unbookmarkBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.7rem',
  background: 'transparent',
  color: '#c44d4d',
  border: '1px solid #c44d4d',
  borderRadius: '4px',
  fontSize: '0.82rem',
  fontWeight: 600,
  fontFamily: 'inherit',
  cursor: 'pointer',
}

const emptyStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '3rem 1rem',
  background: '#f4ecd8',
  border: '2px dashed #c4a878',
  borderRadius: '6px',
  color: '#5a3f29',
}

const emptyLinkStyle: React.CSSProperties = {
  display: 'inline-block',
  marginTop: '0.8rem',
  color: '#b8893a',
  textDecoration: 'underline',
  fontWeight: 600,
}

const noMatchStyle: React.CSSProperties = {
  padding: '1rem',
  background: '#fdf6e3',
  border: '1px dashed #c4a878',
  borderRadius: '4px',
  textAlign: 'center',
  color: '#8c6d4a',
}
