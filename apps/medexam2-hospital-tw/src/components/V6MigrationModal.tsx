/**
 * V6 migration welcome modal — `redesign-hospital-economy` §9.5.8 (audit C5).
 *
 * Fires once per save for players who had a v5 save (tier > 診所 implies actual
 * play). Explains the four mechanical changes shipped in v6:
 *   1. Session-gated tick (was idle accumulation)
 *   2. Salary drain on bench doctors at 區域醫院+
 *   3. Training (進修) — spend revenue to upgrade rarity
 *   4. Diversification gate — multi-subject roster required for tier upgrade
 *
 * Dismiss writes `tutorial.firedTips.v6_welcome = true` so it never re-shows.
 */

import { useEffect } from 'react'
import { getHospitalDB, type GameCountersRow } from '../db/schema'
import { tierLabel } from '../lib/tier-labels'
import { EmojiIcon } from './EmojiIcon'

interface V6MigrationModalProps {
  counters: GameCountersRow
  onDismiss: () => void
}

export function V6MigrationModal({ counters, onDismiss }: V6MigrationModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') void handleDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDismiss() {
    const db = getHospitalDB()
    await db.transaction('rw', db.gameCounters, async () => {
      const c = await db.gameCounters.get('singleton')
      if (!c) return
      await db.gameCounters.put({
        ...c,
        tutorial: {
          ...c.tutorial,
          firedTips: { ...c.tutorial.firedTips, v6_welcome: true },
        },
      })
    })
    onDismiss()
  }

  return (
    <div className="modal-backdrop">
      <div className="modal frame v6-migration-modal">
        <h2 className="modal__title"><EmojiIcon char="🏥" size={24} /> 醫院系統大改版</h2>
        <p>
          歡迎回來，<strong>{tierLabel(counters.tier)}</strong> 院長。本次更新後遊戲機制有四個重大變化：
        </p>
        <ul className="v6-migration-list">
          <li>
            <strong><EmojiIcon char="📖" size={18} /> 唸書 session</strong>
            <p>
              寫題答對會直接賺營收與聲望（依 tier、夥伴醫師同科加成，session 開不開都一樣）。從首頁點「📖 唸書」開啟 session 期間，醫師看患者的 idle 收入會有 1.5× 加成。不開 session 沒 idle 進帳（tick 不跑），但寫題照常賺錢。離開分頁會自動暫停、回到分頁自動繼續。
            </p>
          </li>
          <li>
            <strong><EmojiIcon char="💰" size={18} /> 醫師薪水</strong>
            <p>
              {tierLabel('區域醫院')}以上 tier 開始扣薪水（含板凳）。預設配置每階仍 net positive；
              升級設施 / 房間擴建可放大淨收益。
            </p>
          </li>
          <li>
            <strong><EmojiIcon char="⬆" size={18} /> 醫師進修</strong>
            <p>
              到「進修」頁面先完成同科 10 題進修戰，每答對 1 題會讓本次成功率增加基礎值的 5%。
              挑戰後消耗營收升 rarity（P5→P4→...→P1）。失敗只損營收，連續 5 次失敗的下次必中（保底）。
            </p>
          </li>
          <li>
            <strong><EmojiIcon char="🎯" size={18} /> 升級雙閘門</strong>
            <p>
              升級不只看聲望，還要科別多樣性（{tierLabel('區域醫院')} 5 科、{tierLabel('醫學中心')} 8 科 P3+、
              {tierLabel('國家級教學醫院')} 10 科 P2+ 含 1 P1）。
            </p>
          </li>
        </ul>
        <p className="muted">
          舊存檔資料完整保留。新增的「累積唸書」計數從 0 開始（之前的時間不計）。
        </p>
        <p className="muted">
          顯示說明：tier 名稱改為簡稱（{tierLabel('區域醫院')} / {tierLabel('醫學中心')} / {tierLabel('國家級教學醫院')}），實際資料未變動。
        </p>
        <div className="modal__actions">
          <button className="primary-btn" onClick={() => void handleDismiss()}>
            開始遊玩
          </button>
        </div>
      </div>
    </div>
  )
}
