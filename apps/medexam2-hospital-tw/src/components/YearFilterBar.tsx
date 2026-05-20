import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  ALL_YEARS,
  effectiveYearSet,
  getYearFilter,
  setYearFilter,
} from '../services/year-filter'

const PAGES: readonly (readonly number[])[] = [
  [115, 114, 113, 112, 111],
  [110, 109, 108, 107, 106],
]

export function YearFilterBar() {
  const persisted = useLiveQuery(() => getYearFilter(), [], null) ?? null
  const effective = effectiveYearSet(persisted)
  const [pageIdx, setPageIdx] = useState<0 | 1>(0)

  const allSelected = effective.size === ALL_YEARS.length

  function handleToggleYear(year: number) {
    const next = new Set(effective)
    if (next.has(year)) next.delete(year)
    else next.add(year)
    void setYearFilter(Array.from(next).sort((a, b) => b - a))
  }

  function handleSelectAll() {
    void setYearFilter([...ALL_YEARS].sort((a, b) => b - a))
  }

  return (
    <section className="filter-bar" aria-label="年份篩選">
      <div className="filter-bar__group">
        <span className="filter-bar__label">年份</span>
        <span className="filter-chip-group" role="group" aria-label="民國年多選">
          <button
            type="button"
            className="filter-chip"
            aria-pressed={allSelected}
            onClick={handleSelectAll}
          >
            全部
          </button>
          {PAGES[pageIdx].map((year) => (
            <button
              key={year}
              type="button"
              className="filter-chip"
              aria-pressed={effective.has(year)}
              onClick={() => handleToggleYear(year)}
            >
              {year}
            </button>
          ))}
        </span>
        <span className="filter-bar__pager">
          <button
            type="button"
            className="filter-bar__pager-btn"
            aria-label="上一頁"
            aria-disabled={pageIdx === 0}
            onClick={() => {
              if (pageIdx > 0) setPageIdx(0)
            }}
          >
            ‹
          </button>
          <span className="filter-bar__pager-indicator" aria-live="polite">
            {pageIdx + 1} / {PAGES.length}
          </span>
          <button
            type="button"
            className="filter-bar__pager-btn"
            aria-label="下一頁"
            aria-disabled={pageIdx === PAGES.length - 1}
            onClick={() => {
              if (pageIdx < PAGES.length - 1) setPageIdx(1)
            }}
          >
            ›
          </button>
        </span>
      </div>
      <span className="filter-bar__count">
        {effective.size} / {ALL_YEARS.length} 年
      </span>
    </section>
  )
}
