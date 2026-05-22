// Always-visible Import entry for anonymous users on the new domain.
//
// Necessary because SettingsPanel (where the authed Import lives) is gated
// behind sign-in via AuthButton — anonymous users cannot reach it. The whole
// point of the bake-period Import flow is to bring local-only state across
// origins for users who never signed in, so we need an Import entry that does
// NOT require authentication.

import { useRef, useState } from 'react'
import { getDB } from '@study-rpg/core'
import { snapshotLocalToBackup } from '../lib/sync/migration'

export function LocalDataImportButton(): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function triggerPicker(): void {
    if (!inputRef.current) return
    inputRef.current.value = ''
    inputRef.current.click()
  }

  async function handleFile(file: File): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      const text = await file.text()
      let payload: Record<string, unknown>
      try {
        payload = JSON.parse(text) as Record<string, unknown>
      } catch {
        throw new Error('檔案不是合法 JSON')
      }
      if (payload.schema_version !== 'local-bake-export-v1') {
        throw new Error(`不支援的 schema 版本：${String(payload.schema_version ?? '未知')}`)
      }
      if (payload.app !== 'medexam-tw') {
        throw new Error(`此 JSON 是給 ${String(payload.app ?? '未知 app')} 用的，無法匯入一階`)
      }
      const ok = window.confirm(
        '⚠ 匯入會覆寫本機目前資料（角色 / 物品 / SRS / 導師背景）。\n\n' +
          '匯入前會先快照到 localBackup 安全網。\n\n' +
          '確定要匯入嗎？',
      )
      if (!ok) {
        setError('已取消')
        return
      }
      const db = getDB()
      await snapshotLocalToBackup(db, 'anonymous-import', 'before-domain-migration-import')
      await db.transaction(
        'rw',
        db.players,
        db.itemInstances,
        db.srs,
        db.mentorBacklog,
        async () => {
          await db.players.clear()
          await db.itemInstances.clear()
          await db.srs.clear()
          await db.mentorBacklog.clear()
          if (payload.player && typeof payload.player === 'object') {
            await db.players.put(payload.player as Parameters<typeof db.players.put>[0])
          }
          if (Array.isArray(payload.itemInstances)) {
            await db.itemInstances.bulkPut(
              payload.itemInstances as Parameters<typeof db.itemInstances.bulkPut>[0],
            )
          }
          if (Array.isArray(payload.srsCards)) {
            await db.srs.bulkPut(payload.srsCards as Parameters<typeof db.srs.bulkPut>[0])
          }
          if (payload.mentorBacklog && typeof payload.mentorBacklog === 'object') {
            await db.mentorBacklog.put(
              payload.mentorBacklog as Parameters<typeof db.mentorBacklog.put>[0],
            )
          }
        },
      )
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : '匯入失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className="auth-button"
        onClick={triggerPicker}
        disabled={busy}
        title="從舊網址（fireman333.github.io）匯出的本機 JSON 匯入到此網域"
      >
        {busy ? '匯入中…' : '⬆ 匯入'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />
      {error && (
        <span style={{ fontSize: '0.75rem', color: '#c44d4d', marginLeft: '0.5rem' }}>
          ⚠ {error}
        </span>
      )}
    </>
  )
}
