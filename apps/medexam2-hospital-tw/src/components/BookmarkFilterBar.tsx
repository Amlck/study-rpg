import { useEffect, useMemo, useState } from 'react'
import type { SubjectId } from '@study-rpg/core'

/**
 * Filter bar for `/bookmarks` route — visually mirrors YearFilterBar + the
 * rarity-chip filter in DoctorRoster (single 全部 button per group, no
 * 全不選 / 反選). State is owned by BookmarksPage and passed down via props;
 * the bar itself is purely controlled — NO Dexie persistence, NO interaction
 * with services/year-filter.ts.
 *
 * Per add-bookmarks-filters-and-wrong-history-medexam2:
 *   - Decision 1: shared CSS classes (.filter-bar / .filter-chip / etc.)
 *   - Decision 2: single 全部 control per group; visible-count badge
 *   - Decision 3: year chip pagination via PAGES of 5; subject wraps naturally
 *   - Decision 4: empty selection = match-all per dimension; AND across dims
 */

const YEAR_CHIPS_PER_PAGE = 5
// Subject chips are wider (2-4 char Chinese subject names like 神經內科) than
// year digits — drop to 4-per-page on mobile so the pager stays inline with
// chips at ~390 px iPhone widths. Year row still fits 5 because digits are narrow.
const SUBJECT_CHIPS_PER_PAGE_MOBILE = 3
const SUBJECT_CHIPS_PER_PAGE_DESKTOP = 5
// 768 px matches the global mobile breakpoint used elsewhere in styles.css
// (and matches iPad portrait). Anything narrower → drop a subject chip so the
// pager stays inline with the chip group.
const MOBILE_BREAKPOINT_PX = 768

function paginate<T>(items: readonly T[], perPage: number): readonly (readonly T[])[] {
  const pages: T[][] = []
  for (let i = 0; i < items.length; i += perPage) {
    pages.push(items.slice(i, i + perPage))
  }
  return pages.length === 0 ? [[]] : pages
}

function useSubjectChipsPerPage(): number {
  const [count, setCount] = useState(SUBJECT_CHIPS_PER_PAGE_DESKTOP)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)
    const update = () =>
      setCount(mq.matches ? SUBJECT_CHIPS_PER_PAGE_MOBILE : SUBJECT_CHIPS_PER_PAGE_DESKTOP)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return count
}

export interface BookmarkFilterBarProps {
  availableYears: readonly number[]
  availableSubjects: readonly SubjectId[]
  selectedYears: ReadonlySet<number>
  selectedSubjects: ReadonlySet<SubjectId>
  onYearsChange: (next: Set<number>) => void
  onSubjectsChange: (next: Set<SubjectId>) => void
  visibleCount: number
  totalCount: number
}

export function BookmarkFilterBar(props: BookmarkFilterBarProps) {
  const {
    availableYears,
    availableSubjects,
    selectedYears,
    selectedSubjects,
    onYearsChange,
    onSubjectsChange,
    visibleCount,
    totalCount,
  } = props

  const subjectChipsPerPage = useSubjectChipsPerPage()
  const yearPages = useMemo(
    () => paginate(availableYears, YEAR_CHIPS_PER_PAGE),
    [availableYears],
  )
  const subjectPages = useMemo(
    () => paginate(availableSubjects, subjectChipsPerPage),
    [availableSubjects, subjectChipsPerPage],
  )
  const [yearPage, setYearPage] = useState(0)
  const [subjectPage, setSubjectPage] = useState(0)
  const clampedYearPage = Math.min(yearPage, Math.max(0, yearPages.length - 1))
  const clampedSubjectPage = Math.min(subjectPage, Math.max(0, subjectPages.length - 1))
  const yearsAllEmpty = selectedYears.size === 0
  const subjectsAllEmpty = selectedSubjects.size === 0

  function toggleYear(year: number) {
    const next = new Set(selectedYears)
    if (next.has(year)) next.delete(year)
    else next.add(year)
    onYearsChange(next)
  }
  function clearYears() {
    onYearsChange(new Set())
  }
  function toggleSubject(subject: SubjectId) {
    const next = new Set(selectedSubjects)
    if (next.has(subject)) next.delete(subject)
    else next.add(subject)
    onSubjectsChange(next)
  }
  function clearSubjects() {
    onSubjectsChange(new Set())
  }

  return (
    <section className="filter-bar filter-bar--stacked" aria-label="收藏題目篩選">
      <div className="filter-bar__group">
        <span className="filter-bar__label">年份</span>
        <span className="filter-chip-group" role="group" aria-label="民國年多選">
          <button
            type="button"
            className="filter-chip"
            aria-pressed={yearsAllEmpty}
            onClick={clearYears}
          >
            全部
          </button>
          {yearPages[clampedYearPage]?.map((year) => (
            <button
              key={year}
              type="button"
              className="filter-chip"
              aria-pressed={selectedYears.has(year)}
              onClick={() => toggleYear(year)}
            >
              {year}
            </button>
          ))}
        </span>
        {yearPages.length > 1 && (
          <span className="filter-bar__pager">
            <button
              type="button"
              className="filter-bar__pager-btn"
              aria-label="上一頁"
              aria-disabled={clampedYearPage === 0}
              onClick={() => {
                if (clampedYearPage > 0) setYearPage(clampedYearPage - 1)
              }}
            >
              ‹
            </button>
            <span className="filter-bar__pager-indicator" aria-live="polite">
              {clampedYearPage + 1} / {yearPages.length}
            </span>
            <button
              type="button"
              className="filter-bar__pager-btn"
              aria-label="下一頁"
              aria-disabled={clampedYearPage === yearPages.length - 1}
              onClick={() => {
                if (clampedYearPage < yearPages.length - 1) setYearPage(clampedYearPage + 1)
              }}
            >
              ›
            </button>
          </span>
        )}
      </div>
      <div className="filter-bar__group">
        <span className="filter-bar__label">科別</span>
        <span className="filter-chip-group" role="group" aria-label="科別多選">
          <button
            type="button"
            className="filter-chip"
            aria-pressed={subjectsAllEmpty}
            onClick={clearSubjects}
          >
            全部
          </button>
          {subjectPages[clampedSubjectPage]?.map((subject) => (
            <button
              key={subject}
              type="button"
              className="filter-chip"
              aria-pressed={selectedSubjects.has(subject)}
              onClick={() => toggleSubject(subject)}
            >
              {subject}
            </button>
          ))}
        </span>
        {subjectPages.length > 1 && (
          <span className="filter-bar__pager">
            <button
              type="button"
              className="filter-bar__pager-btn"
              aria-label="上一頁"
              aria-disabled={clampedSubjectPage === 0}
              onClick={() => {
                if (clampedSubjectPage > 0) setSubjectPage(clampedSubjectPage - 1)
              }}
            >
              ‹
            </button>
            <span className="filter-bar__pager-indicator" aria-live="polite">
              {clampedSubjectPage + 1} / {subjectPages.length}
            </span>
            <button
              type="button"
              className="filter-bar__pager-btn"
              aria-label="下一頁"
              aria-disabled={clampedSubjectPage === subjectPages.length - 1}
              onClick={() => {
                if (clampedSubjectPage < subjectPages.length - 1) setSubjectPage(clampedSubjectPage + 1)
              }}
            >
              ›
            </button>
          </span>
        )}
      </div>
      <span className="filter-bar__count">
        {visibleCount} / {totalCount} 題
      </span>
    </section>
  )
}
