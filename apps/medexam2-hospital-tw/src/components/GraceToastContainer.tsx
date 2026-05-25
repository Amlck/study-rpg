import { useGraceToasts, dismissGraceToast, bookmarkFromGraceToast } from '../lib/grace-toast'

/**
 * Fixed-position toast stack rendered at App root. Stays out of layout flow
 * so it doesn't shift any page content. Empty when no toasts visible.
 *
 * Per add-bookmarks-filters-and-wrong-history-medexam2 Decision 6 + the
 * "grace toast" requirement in wrong-answer-list capability.
 */
export function GraceToastContainer() {
  const toasts = useGraceToasts()
  if (toasts.length === 0) return null
  return (
    <div
      className="grace-toast-stack"
      role="region"
      aria-label="答對提示，可加入收藏"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div key={t.id} className="grace-toast">
          <div className="grace-toast__body">
            <span className="grace-toast__qid">{t.questionId}</span>
            <span className="grace-toast__msg">
              已答對，從「目前未答對」移除（10 秒內可加星）
            </span>
          </div>
          <div className="grace-toast__actions">
            <button
              type="button"
              className="grace-toast__star"
              onClick={() => void bookmarkFromGraceToast(t.id, t.questionId)}
              aria-label="加入手動收藏"
            >
              ⭐
            </button>
            <button
              type="button"
              className="grace-toast__close"
              onClick={() => dismissGraceToast(t.id)}
              aria-label="關閉提示"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
