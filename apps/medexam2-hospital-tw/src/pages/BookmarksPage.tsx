import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Question, SubjectId } from '@study-rpg/core'
import { ALL_14_SUBJECTS } from '@study-rpg/content-medexam2-tw'
import {
  toggleBookmark,
  triggerBookmarksDownload,
  useAllBookmarks,
  useBookmark,
} from '../services/bookmarks'
import { useWrongAnswers, useEverWrongAnswers } from '../services/wrong-answers'
import { loadQuestionsByIdMap } from '../lib/quiz'
import { EmojiIcon } from '../components/EmojiIcon'
import { ExplanationMarkdown } from '../components/ExplanationMarkdown'
import { SurfaceHint } from '../components/SurfaceHint'
import { BookmarkFilterBar } from '../components/BookmarkFilterBar'
import { matchesFilter, type BookmarkFilterState } from '../lib/bookmarks-filter'
import type { QuestionHistoryRow, BookmarkRow } from '../db/schema'

type TabId = 'manual' | 'wrong'
type WrongSubView = 'current' | 'history'
type FilterState = BookmarkFilterState

const VALID_TABS: readonly TabId[] = ['manual', 'wrong'] as const
const PAGE_SIZE = 50

function parseTab(raw: string | null): TabId {
  return raw && (VALID_TABS as readonly string[]).includes(raw) ? (raw as TabId) : 'manual'
}

// ─── Pagination helper ────────────────────────────────────────────────────────

function Pager({
  page,
  pageCount,
  onPageChange,
}: {
  page: number
  pageCount: number
  onPageChange: (next: number) => void
}) {
  if (pageCount <= 1) return null
  return (
    <span className="filter-bar__pager bookmarks-pager">
      <button
        type="button"
        className="filter-bar__pager-btn"
        aria-label="上一頁"
        aria-disabled={page === 0}
        onClick={() => {
          if (page > 0) onPageChange(page - 1)
        }}
      >
        ‹
      </button>
      <span className="filter-bar__pager-indicator" aria-live="polite">
        {page + 1} / {pageCount}
      </span>
      <button
        type="button"
        className="filter-bar__pager-btn"
        aria-label="下一頁"
        aria-disabled={page === pageCount - 1}
        onClick={() => {
          if (page < pageCount - 1) onPageChange(page + 1)
        }}
      >
        ›
      </button>
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BookmarksPage() {
  const [params, setParams] = useSearchParams()
  const activeTab: TabId = parseTab(params.get('tab'))

  const [questionsById, setQuestionsById] = useState<ReadonlyMap<string, Question> | null>(null)

  // Filter state — shared across tabs + sub-views; local React state (not
  // persisted) per Decision 2.
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set())
  const [selectedSubjects, setSelectedSubjects] = useState<Set<SubjectId>>(new Set())
  // Sub-view state for the 錯題 tab — lifted here so the filter-bar count
  // badge knows which sub-view's row set to tally.
  const [wrongSubView, setWrongSubView] = useState<WrongSubView>('current')
  const filter: FilterState = { years: selectedYears, subjects: selectedSubjects }

  useEffect(() => {
    let cancelled = false
    void loadQuestionsByIdMap().then((map) => {
      if (!cancelled) setQuestionsById(map)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const availableYears = useMemo<readonly number[]>(() => {
    if (!questionsById) return []
    const years = new Set<number>()
    for (const q of questionsById.values()) {
      const y = (q.meta as { year?: number } | undefined)?.year
      if (typeof y === 'number') years.add(y)
    }
    return Array.from(years).sort((a, b) => b - a)
  }, [questionsById])

  const setTab = (next: TabId): void => {
    if (next === activeTab) return
    const nextParams = new URLSearchParams(params)
    nextParams.set('tab', next)
    setParams(nextParams, { replace: true })
  }

  return (
    <main className="app-shell bookmarks-page">
      <header className="app-header">
        <h1><EmojiIcon char="📚" size={28} /> 我的題目</h1>
        <div className="app-header__meta">
          <Link to="/" className="nav-link">
            ← 回首頁
          </Link>
        </div>
      </header>

      <SurfaceHint surfaceId="bookmarks" />

      <BookmarkFilterBarWrapper
        activeTab={activeTab}
        wrongSubView={wrongSubView}
        questionsById={questionsById}
        availableYears={availableYears}
        filter={filter}
        onYearsChange={setSelectedYears}
        onSubjectsChange={setSelectedSubjects}
      />

      <nav className="bookmarks-tabs" role="tablist" aria-label="收藏分類">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'manual'}
          className={`bookmarks-tabs__tab${activeTab === 'manual' ? ' bookmarks-tabs__tab--active' : ''}`}
          onClick={() => setTab('manual')}
        >
          <EmojiIcon char="⭐" size={18} /> 手動收藏
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'wrong'}
          className={`bookmarks-tabs__tab${activeTab === 'wrong' ? ' bookmarks-tabs__tab--active' : ''}`}
          onClick={() => setTab('wrong')}
        >
          <EmojiIcon char="❌" size={18} /> 錯題
        </button>
      </nav>

      {activeTab === 'manual' ? (
        <ManualBookmarksTab questionsById={questionsById} filter={filter} />
      ) : (
        <WrongAnswersTab
          questionsById={questionsById}
          filter={filter}
          subView={wrongSubView}
          onSubViewChange={setWrongSubView}
        />
      )}
    </main>
  )
}

// Filter bar passes pre/post-filter counts; counts reflect the active
// tab AND (for 錯題 tab) the active sub-view.
function BookmarkFilterBarWrapper({
  activeTab,
  wrongSubView,
  questionsById,
  availableYears,
  filter,
  onYearsChange,
  onSubjectsChange,
}: {
  activeTab: TabId
  wrongSubView: WrongSubView
  questionsById: ReadonlyMap<string, Question> | null
  availableYears: readonly number[]
  filter: FilterState
  onYearsChange: (next: Set<number>) => void
  onSubjectsChange: (next: Set<SubjectId>) => void
}) {
  const allBookmarks = useAllBookmarks()
  const currentWrongs = useWrongAnswers()
  const everWrongs = useEverWrongAnswers()

  const { visible, total } = useMemo(() => {
    const tally = (rows: { questionId: string }[] | undefined) => {
      if (!rows) return { visible: 0, total: 0 }
      const vis = rows.filter((r) => matchesFilter(r.questionId, filter, questionsById)).length
      return { visible: vis, total: rows.length }
    }
    if (activeTab === 'manual') return tally(allBookmarks)
    return tally(wrongSubView === 'current' ? currentWrongs : everWrongs)
  }, [activeTab, wrongSubView, allBookmarks, currentWrongs, everWrongs, filter, questionsById])

  return (
    <BookmarkFilterBar
      availableYears={availableYears}
      availableSubjects={ALL_14_SUBJECTS}
      selectedYears={filter.years}
      selectedSubjects={filter.subjects}
      onYearsChange={onYearsChange}
      onSubjectsChange={onSubjectsChange}
      visibleCount={visible}
      totalCount={total}
    />
  )
}

// ─── Tab: Manual bookmarks ───────────────────────────────────────────────────

function ManualBookmarksTab({
  questionsById,
  filter,
}: {
  questionsById: ReadonlyMap<string, Question> | null
  filter: FilterState
}) {
  const bookmarks = useAllBookmarks()
  const loading = bookmarks === undefined || questionsById === null
  const allRows = bookmarks ?? []
  const filteredRows = useMemo(
    () => allRows.filter((r) => matchesFilter(r.questionId, filter, questionsById)),
    [allRows, filter, questionsById],
  )
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pagedRows = filteredRows.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE)

  // Reset to page 0 when filter changes
  useEffect(() => {
    setPage(0)
  }, [filter.years, filter.subjects])

  const handleRemove = (questionId: string): void => {
    if (!window.confirm('確定要移除這則收藏？')) return
    void toggleBookmark(questionId)
  }

  const handleExport = (): void => {
    if (!questionsById || filteredRows.length === 0) return
    triggerBookmarksDownload(filteredRows as BookmarkRow[], questionsById)
  }

  const hasFilter = filter.years.size > 0 || filter.subjects.size > 0
  const totalBeforeFilter = allRows.length
  const totalAfterFilter = filteredRows.length

  return (
    <section className="bookmarks-tab bookmarks-tab--manual">
      <div className="bookmarks-tab__toolbar">
        <button
          type="button"
          className="bookmarks-page__export"
          onClick={handleExport}
          disabled={totalAfterFilter === 0 || !questionsById}
        >
          <EmojiIcon char="⬇" size={16} /> 匯出 Markdown
        </button>
      </div>

      {loading && <p className="bookmarks-page__loading">載入中…</p>}

      {!loading && totalBeforeFilter === 0 && (
        <p className="bookmarks-page__empty">
          還沒有收藏題目。答題時點右上 ⭐ 把題目收藏起來。
        </p>
      )}

      {!loading && totalBeforeFilter > 0 && totalAfterFilter === 0 && hasFilter && (
        <p className="bookmarks-page__empty">沒有符合篩選條件的收藏題目。</p>
      )}

      {!loading && pagedRows.length > 0 && (
        <>
          <ul className="bookmarks-page__list">
            {pagedRows.map((row) => (
              <EntryRow
                key={row.questionId}
                questionId={row.questionId}
                question={questionsById?.get(row.questionId)}
                rightAction={
                  <button
                    type="button"
                    className="bookmarks-page__entry-remove"
                    onClick={() => handleRemove(row.questionId)}
                  >
                    移除收藏
                  </button>
                }
              />
            ))}
          </ul>
          <Pager page={clampedPage} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </section>
  )
}

// ─── Tab: Wrong answers (with sub-view switcher) ─────────────────────────────

function WrongAnswersTab({
  questionsById,
  filter,
  subView,
  onSubViewChange,
}: {
  questionsById: ReadonlyMap<string, Question> | null
  filter: FilterState
  subView: WrongSubView
  onSubViewChange: (next: WrongSubView) => void
}) {
  return (
    <section className="bookmarks-tab bookmarks-tab--wrong">
      <p className="bookmarks-tab__helper">
        <EmojiIcon char="📌" size={18} /> <strong>目前未答對</strong> = 你最近一次答錯的題，下次答對會自動離開；
        <strong>歷史曾錯</strong> = 任何答錯過的題的永久紀錄，不會自動離開。
        <br />
        答對時會跳 10 秒 ⭐ 視窗讓你加入「手動收藏」；任一題的 <strong>⭐</strong> 也能手動加入。
        <br />
        <em>歷史紀錄從升級當下開始累積；之前的錯題會在下次答到時自動補上紀錄。</em>
      </p>

      <nav
        className="bookmarks-subtabs"
        role="tablist"
        aria-label="錯題子視圖"
      >
        <button
          type="button"
          role="tab"
          aria-selected={subView === 'current'}
          className={`bookmarks-subtabs__tab${subView === 'current' ? ' bookmarks-subtabs__tab--active' : ''}`}
          onClick={() => onSubViewChange('current')}
        >
          目前未答對
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={subView === 'history'}
          className={`bookmarks-subtabs__tab${subView === 'history' ? ' bookmarks-subtabs__tab--active' : ''}`}
          onClick={() => onSubViewChange('history')}
        >
          歷史曾錯
        </button>
      </nav>

      {subView === 'current' ? (
        <CurrentWrongSubView questionsById={questionsById} filter={filter} />
      ) : (
        <EverWrongSubView questionsById={questionsById} filter={filter} />
      )}
    </section>
  )
}

function CurrentWrongSubView({
  questionsById,
  filter,
}: {
  questionsById: ReadonlyMap<string, Question> | null
  filter: FilterState
}) {
  const wrongs = useWrongAnswers()
  const loading = wrongs === undefined || questionsById === null
  const allRows = wrongs ?? []
  const filteredRows = useMemo(
    () => allRows.filter((r) => matchesFilter(r.questionId, filter, questionsById)),
    [allRows, filter, questionsById],
  )
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pagedRows = filteredRows.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE)
  useEffect(() => {
    setPage(0)
  }, [filter.years, filter.subjects])

  const hasFilter = filter.years.size > 0 || filter.subjects.size > 0

  return (
    <>
      {loading && <p className="bookmarks-page__loading">載入中…</p>}
      {!loading && allRows.length === 0 && (
        <p className="bookmarks-page__empty">
          目前還沒有答錯的題目 — 答錯後會自動收進這裡。
        </p>
      )}
      {!loading && allRows.length > 0 && filteredRows.length === 0 && hasFilter && (
        <p className="bookmarks-page__empty">沒有符合篩選條件的題目。</p>
      )}
      {!loading && pagedRows.length > 0 && (
        <>
          <ul className="bookmarks-page__list">
            {pagedRows.map((row) => (
              <EntryRow
                key={row.questionId}
                questionId={row.questionId}
                question={questionsById?.get(row.questionId)}
                rightAction={<PromoteStar questionId={row.questionId} />}
              />
            ))}
          </ul>
          <Pager page={clampedPage} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </>
  )
}

function EverWrongSubView({
  questionsById,
  filter,
}: {
  questionsById: ReadonlyMap<string, Question> | null
  filter: FilterState
}) {
  const ever = useEverWrongAnswers()
  const loading = ever === undefined || questionsById === null
  const allRows = ever ?? []
  const filteredRows = useMemo(
    () => allRows.filter((r) => matchesFilter(r.questionId, filter, questionsById)),
    [allRows, filter, questionsById],
  )
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pagedRows = filteredRows.slice(clampedPage * PAGE_SIZE, (clampedPage + 1) * PAGE_SIZE)
  useEffect(() => {
    setPage(0)
  }, [filter.years, filter.subjects])

  const hasFilter = filter.years.size > 0 || filter.subjects.size > 0

  return (
    <>
      {loading && <p className="bookmarks-page__loading">載入中…</p>}
      {!loading && allRows.length === 0 && (
        <p className="bookmarks-page__empty">
          目前還沒有歷史錯題紀錄 — 答錯題目後會永久記錄在這裡。
        </p>
      )}
      {!loading && allRows.length > 0 && filteredRows.length === 0 && hasFilter && (
        <p className="bookmarks-page__empty">沒有符合篩選條件的題目。</p>
      )}
      {!loading && pagedRows.length > 0 && (
        <>
          <ul className="bookmarks-page__list">
            {pagedRows.map((row) => (
              <EntryRow
                key={row.questionId}
                questionId={row.questionId}
                question={questionsById?.get(row.questionId)}
                rightAction={
                  <span className="bookmarks-page__entry-row-side">
                    <StateChip row={row} />
                    <PromoteStar questionId={row.questionId} />
                  </span>
                }
              />
            ))}
          </ul>
          <Pager page={clampedPage} pageCount={pageCount} onPageChange={setPage} />
        </>
      )}
    </>
  )
}

function StateChip({ row }: { row: QuestionHistoryRow }) {
  if (row.lastResult === 'wrong') {
    return (
      <span className="bookmarks-state-chip bookmarks-state-chip--wrong" aria-label="仍未答對">
        🔴 仍未答對
      </span>
    )
  }
  return (
    <span className="bookmarks-state-chip bookmarks-state-chip--correct" aria-label={`已答對 ${row.correctCount} 次`}>
      ✅ 已答對 {row.correctCount} 次
    </span>
  )
}

function PromoteStar({ questionId }: { questionId: string }) {
  const bookmarked = !!useBookmark(questionId)
  return (
    <button
      type="button"
      className={`bookmarks-page__entry-promote${bookmarked ? ' bookmarks-page__entry-promote--on' : ''}`}
      onClick={() => void toggleBookmark(questionId)}
      aria-pressed={bookmarked}
      aria-label={bookmarked ? '取消手動收藏' : '加入手動收藏'}
      title={bookmarked ? '已加入手動收藏' : '加入手動收藏'}
    >
      <EmojiIcon char={bookmarked ? '⭐' : '☆'} size={18} /> {bookmarked ? '已收藏' : '加入收藏'}
    </button>
  )
}

// ─── Shared per-entry row component ──────────────────────────────────────────

function EntryRow({
  questionId,
  question,
  rightAction,
}: {
  questionId: string
  question: Question | undefined
  rightAction: React.ReactNode
}) {
  return (
    <li className="bookmarks-page__entry">
      <div className="bookmarks-page__entry-head">
        <span className="bookmarks-page__entry-id">{questionId}</span>
        {rightAction}
      </div>
      <hr className="bookmarks-page__entry-divider" />
      {question ? (
        <>
          <p className="bookmarks-page__entry-stem">{question.stem}</p>
          <ul className="bookmarks-page__entry-options">
            {Object.entries(question.options).map(([key, text]) => (
              <li key={key}>
                <span className="bookmarks-page__entry-option-key">({key})</span> {text}
              </li>
            ))}
          </ul>
          <p className="bookmarks-page__entry-answer">
            <strong>正解：</strong>
            {question.disputed ? (
              <><EmojiIcon char="⚖" size={16} /> 送分題（考選部判定全部給分）</>
            ) : (
              `(${question.answer})`
            )}
          </p>
          <div className="bookmarks-page__entry-explanation">
            <strong>詳解：</strong>
            <ExplanationMarkdown text={question.explanation ?? ''} />
          </div>
        </>
      ) : (
        <p className="bookmarks-page__entry-orphan">
          題目已不在題庫（可能因內容版本更新移除）。
        </p>
      )}
    </li>
  )
}
