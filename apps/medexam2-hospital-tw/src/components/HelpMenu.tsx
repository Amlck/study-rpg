/**
 * Help menu — `redesign-hospital-economy` §9.5.3.
 *
 * Floating `❓` FAB at top-right opens a modal with 8 collapsible accordion
 * sections explaining each major mechanic. Always available — players who
 * dismissed onboarding or forgot mechanics can re-read at any time.
 *
 * Per spec hospital-tutorial Req 4: the Help menu is the L4 "Always-available"
 * fallback for emergent confusion. Modal can be opened from any route.
 */

import { useEffect, useRef, useState } from 'react'
import { TIER_UPGRADE_THRESHOLDS } from '@study-rpg/content-medexam2-tw'
import { getHospitalDB } from '../db/schema'
import { tierLabel } from '../lib/tier-labels'
import { snapshotLocalToBackup } from '../lib/sync/migration'
import { BugReportModal } from './BugReportModal'
import { EmojiIcon } from './EmojiIcon'
import {
  discardActiveERConsult,
  getERConsultSettings,
  setERConsultSettings,
} from '../services/er-consultation'
import { getFontMode, setFontMode, type FontMode } from '../services/font-mode'
import { LeaderboardSettingsControls } from './LeaderboardSettingsControls'

interface AccordionSection {
  id: string
  icon: string
  title: string
  /** Body kept short — 1-2 paragraphs per section per design D10. */
  body: string[]
}

// Sourced from TIER_UPGRADE_THRESHOLDS so future recalibrations propagate
// automatically — see `fix-helpmenu-copy-stale` (2026-05-19).
const tierUpgradeBody = `升級不只看聲望，還要科別多樣性。${tierLabel('診所')}（診所）→ ${tierLabel('區域醫院')}（區域醫院）：${(
  TIER_UPGRADE_THRESHOLDS.診所! / 1000
).toFixed(0)}k 聲望 + 5 不同科別；${tierLabel('區域醫院')} → ${tierLabel('醫學中心')}（醫學中心）：${(
  TIER_UPGRADE_THRESHOLDS.區域醫院! / 1000
).toFixed(0)}k + 8 P3+ 不同科別；${tierLabel('醫學中心')} → ${tierLabel('國家級教學醫院')}（國家級教學醫院）：${(
  TIER_UPGRADE_THRESHOLDS.醫學中心! / 1000
).toFixed(0)}k + 10 P2+ + 至少 1 位 P1。`

const SECTIONS: ReadonlyArray<AccordionSection> = Object.freeze([
  {
    id: 'study-session',
    icon: '📖',
    title: '唸書 session — 醫師看患者 1.5× idle 加成',
    body: [
      '兩個進帳管道：寫題答對直接賺營收/聲望（依 tier 與夥伴醫師同科加成，session 開不開都一樣）；開「📖 唸書」session 期間，醫師看患者的 idle 收入（throughput）會有 1.5× 加成（薪水照舊全額）。不開 session 沒 idle 進帳（tick 不跑），但寫題照常賺錢。',
      '離開分頁會自動暫停、回到分頁自動繼續；手動暫停則需主動點「繼續唸書」。累積唸書時間（min）會雲端同步並跨裝置累加；按「重置此帳號進度」或「使用雲端覆蓋本機」會一併清空。',
    ],
  },
  {
    id: 'recruitment',
    icon: '🎫',
    title: '招募醫師（gacha + 親和值）',
    body: [
      '每個科別有「親和值」門檻 — 答對該科考古題達門檻後，招募 banner 解鎖。每日台灣早上 08:00 自動發放 +1 張免費招募券（持有上限 99）；用券抽 P5/P4/P3/P2/P1 醫師（rarity 越高機率越低）。',
      '保底（pity）：每 N 抽必出 P3+；每 100 抽必出 SSR (P1)。詳見 RECRUITMENT_PITY_RULES。',
    ],
  },
  {
    id: 'assignment',
    icon: '🩺',
    title: '醫師指派與適性加成',
    body: [
      '在「醫院」頁面點任一房間 → 選一位醫師指派。每位醫師有 subject（科別）和 powerMultiplier。',
      '科別匹配 room type（如 內科 → 門診、外科 → 手術房）有適性加成 1.1×–1.5×（依 rarity）。產能 = 基礎 × 醫師力 × 設施 × 適性。',
    ],
  },
  {
    id: 'training',
    icon: '⬆️',
    title: '醫師進修（消耗營收升 rarity）',
    body: [
      '在「進修」頁面先打同科 10 題進修戰；每答對 1 題，本次成功率增加基礎值的 5%。滿分時 P4→P3 會從 30% 變 45%。',
      '進修戰後消耗營收升 rarity（P5→P4 50% / P4→P3 30% / P3→P2 15% / P2→P1 5%，再套用答題加成）。',
      '失敗只損營收，醫師 rarity 不變；連續失敗 5 次後下次必中（保底）。pity counter 每位醫師獨立追蹤。',
    ],
  },
  {
    id: 'retire',
    icon: '👋',
    title: '醫師退休與返還',
    body: [
      '在「進修」頁面點醫師卡片的「AAD」按鈕（自願離院 / 退休）→ 確認後該醫師永久移除，返還 powerMultiplier × 1000 💰 到營收。',
      '24 小時內 AAD 的醫師仍計入升級多樣性門檻（grace period），避免短期 AAD 後被卡升級。',
    ],
  },
  {
    id: 'facility',
    icon: '🏗️',
    title: '設施升級 + 房間擴建',
    body: [
      '在「醫院」頁面點任一房間 → modal 內有「升級設施」按鈕。Lv.1 → Lv.5 共 4 階，每階產能乘數 1.0→3.0。Cost ladder：10K / 50K / 200K / 1M。',
      `房間擴建：${tierLabel('區域醫院')} tier 開始解鎖，每種房型可加 2-3 間 extra（門診 +3 / 手術房 +2 / 病房 +2）。`,
    ],
  },
  {
    id: 'tier-upgrade',
    icon: '🎯',
    title: '升級雙閘門（聲望 + 多樣性）',
    body: [
      tierUpgradeBody,
      '雙閘設計確保你的醫院全方位發展，不會只靠單科衝刺。',
    ],
  },
  {
    id: 'fate-cards',
    icon: '🎴',
    title: '命運卡',
    body: [
      '消耗 reputation 抽 4 階卡包（普通 / 稀有 / 史詩 / 傳奇）— 內容池含招募券、進修保證券、設施加成、特殊事件券。任何 tier 都可抽，僅 reputation 不足會 disable 該階卡包。',
      '保底：每階獨立追蹤連續衰運次數，連 3 次衰運後第 4 次必中 reward。',
    ],
  },
  {
    id: 'leaderboard-info',
    icon: '🏆',
    title: '排名 — 全二階玩家對位',
    body: [
      'Opt-in 流程：從 HomePage 點「排名」進「🏆 排名」頁面，第一次會跳同意視窗列出 5 個公開欄位（醫院 tier / 聲望 / 醫師數 / 累積唸書時間 / 2–12 字元暱稱）。同意後雲端同步成功時會自動上傳，Cloudflare cron 每小時整點重算 Top 100 快照（複合 / 聲望 / 醫師數 / 唸書時間 4 個分頁）。',
      '隱私：除這 5 個欄位以外的存檔（科別掌握度、SRS、收藏、bug report、Google email）都不公開。資料只存 Cloudflare D1（亞太節點），公開列表只有 4 個分頁的 Top 100；上不了榜的玩家完全不可見。',
      '改名：在下一格「公開到排行榜」section 的暱稱欄位直接編輯 + 送出，會檢查跟現有暱稱是否撞名（NFKC + lowercase 比對）。長度限制 2–12 個 Unicode codepoint，emoji 與 ZWJ sequence 也算長度。',
      '停用：把下一格的 toggle 關掉就行 — 下次 cron 過後從快照消失，D1 紀錄保留（之後重新打開不必再同意一次）。要完全刪除請走「♻ 重置此帳號進度」— 會 DELETE D1 row 並清掉本機 profile（暱稱重新可供他人使用）。',
    ],
  },
  {
    id: 'leaderboard-settings',
    icon: '⚙️',
    title: '公開到排行榜（設定）',
    body: [
      '公開後，全二階玩家可以在「排名」頁面看到你的醫院 tier、聲望、醫師數、累積唸書時間和你設定的暱稱。',
      '隨時可以在下方關掉公開（紀錄保留，再次打開不必重新同意）；想完全刪除排行榜紀錄請走「重置此帳號進度」。還沒加入排行榜的話請到「🏆 排名」頁面開啟流程。',
    ],
  },
  {
    id: 'bug-report',
    icon: '💬',
    title: '回報問題 / 建議',
    body: [
      '碰到 bug、數字怪、UI 跑版，或想許願新功能？打開下方表單回報，30 秒內送出。',
      '系統會自動附帶當下遊戲狀態（tier、營收、聲望、進行中 session 等）、route、近期錯誤與瀏覽器資訊，你可以逐欄取消勾選。需先登入。',
    ],
  },
  {
    id: 'er-consult',
    icon: '🚨',
    title: '急診照會設定',
    body: [
      '唸書 session 期間，急診醫師會不定時跳出一題「冷門科別」的考古題請你 consult。答對給 1.8× 加成的營收 + 聲望（高於一般答題），可從下方關閉。',
      '冷門科別 = 你最近 7 天答比較少 + 掌握度比較低的科。10 分鐘內沒回應會自動跳過、不會扣分。',
    ],
  },
  {
    id: 'font-mode',
    icon: '🔤',
    title: '字型偏好（題目 / 選項 / 詳解）',
    body: [
      '預設用易讀的 Noto Sans TC 顯示答題系統內的年份科別、題目、選項與詳解，方便長時間閱讀。如果想要原本 GBA 風的全像素字型，可以切到「像素 (Cubic 11)」。',
      '這個設定只影響答題系統內的閱讀區域 — 標題、按鈕、招募 banner、醫師卡片等其他 UI 永遠保持像素字體，維持遊戲整體美術調性。偏好只存在當前裝置，不會雲端同步。',
    ],
  },
  {
    id: 'data-import',
    icon: '📥',
    title: '跨網域搬遷 — 匯入本機 JSON',
    body: [
      '從舊網址（fireman333.github.io/study-rpg/hospital/）的搬遷公告匯出的本機 JSON 可以在這裡匯入到新網址。本機 IndexedDB 是 per-origin 的、不會自動跟著搬遷，需要這個手動匯入步驟。',
      '匯入會覆寫本機所有醫院 sync 資料（19 個表 — tier / 收益 / 聲望 / 醫師 / 答題記錄 / 命運卡 / SRS / 收藏 / 排行榜 profile 等）。匯入前會先快照到 localBackup 安全網（但這個安全網只包含 11 個核心表，非完整覆蓋）。',
    ],
  },
  {
    id: 'account-reset',
    icon: '♻',
    title: '重置此帳號進度',
    body: [
      '想重新開始一份乾淨的存檔但不想登出 Google 帳號？這個動作會清掉這個帳號的雲端與本地遊戲資料（醫院經營 tier / 收益 / 聲望、醫師名冊、答題紀錄、命運卡、SRS 排程、收藏題目），但保留你的 Google 登入。',
      '本機會先快照到 localBackup 安全網（保險），但雲端 delete 後無法恢復。下方按鈕會先彈確認，再要你輸入 RESET 二次確認才執行。',
    ],
  },
  {
    id: 'achievements',
    icon: '🏆',
    title: '成就系統 — 4 tier 像素勳章',
    body: [
      '7 大類別（學習 / 答題 / 招募 / 經營 / 時運 / 隱藏 / 科別精通） × 4 tier（P1 💎 鑽石 / P2 🥇 金 / P3 🥈 銀 / P4 🥉 銅）。共 ~42 條成就。',
      'P1 鑽石需「composite 條件」（量 × 質 / 量 × 持續 / 量 × 廣度，e.g.「答對 3000 題 + 整體 accuracy ≥ 80%」），不是每個人都拿得到。P4 銅 一週內就能拿到。',
      '14 科精通需該科 100% 全寫完（內科 1306 題 / 外科 1154 題 ... 麻醉科 192 題）— 速通玩家（1 個月破關）拿不到任何科別勳章；慢通玩家（6 個月）才能 14 科都解。',
      '解鎖會跳通知（P4-P2 為角落 toast、P1 為全屏揭示）。「成就」分頁可看完整列表 + 篩選；解鎖的稱號可在排行榜設定區挑選顯示。',
    ],
  },
])

interface HelpMenuProps {
  /** Optional class to position the FAB; defaults to fixed top-right corner. */
  className?: string
  /** Provided when cloud sync is wired; missing/undefined disables reset entry. */
  onResetProgress?: () => Promise<void>
  /** True when a user is currently signed in (gates the reset entry). */
  signedIn?: boolean
}

export function HelpMenu({ className, onResetProgress, signedIn = false }: HelpMenuProps) {
  const [open, setOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [resetMsg, setResetMsg] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [bugReportOpen, setBugReportOpen] = useState(false)
  const [erConsultEnabled, setErConsultEnabledState] = useState<boolean | null>(null)
  const [fontMode, setFontModeState] = useState<FontMode | null>(null)
  const [accountResetMsg, setAccountResetMsg] = useState<string | null>(null)
  const [accountResetting, setAccountResetting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  function triggerImport(): void {
    const input = importInputRef.current
    if (!input) return
    input.value = ''
    input.click()
  }

  async function handleImportFile(file: File): Promise<void> {
    setImportMsg(null)
    setImporting(true)
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
      if (payload.app !== 'medexam2-hospital-tw') {
        throw new Error(`此 JSON 是給 ${String(payload.app ?? '未知 app')} 用的，無法匯入二階`)
      }
      const ok = window.confirm(
        '⚠ 匯入會覆寫本機所有 19 個醫院 sync 表（聲望 / 醫師 / 答題 / 命運卡 / SRS / 收藏 等）。\n\n' +
          '匯入前會先快照 localBackup 安全網（但只覆蓋 11 個核心表）。\n' +
          '建議在乾淨裝置或先匯出當前資料後再匯入。\n\n' +
          '確定要匯入嗎？',
      )
      if (!ok) {
        setImportMsg('已取消')
        return
      }
      const db = getHospitalDB()
      await snapshotLocalToBackup(db, 'anonymous-import', 'before-domain-migration-import')
      await db.transaction(
        'rw',
        [
          db.affinity,
          db.doctors,
          db.gachaStats,
          db.tickets,
          db.rooms,
          db.gameCounters,
          db.mastery,
          db.questionHistory,
          db.bookmarks,
          db.monotonicCounters,
          db.trainingHistory,
          db.eventLog,
          db.fateCardHistory,
          db.retirementLog,
          db.targetedTickets,
          db.targetedTicketHistory,
          db.erConsultLog,
          db.leaderboardProfile,
          db.bannerUnlockBonusLog,
        ],
        async () => {
          await Promise.all([
            db.affinity.clear(),
            db.doctors.clear(),
            db.gachaStats.clear(),
            db.tickets.clear(),
            db.rooms.clear(),
            db.gameCounters.clear(),
            db.mastery.clear(),
            db.questionHistory.clear(),
            db.bookmarks.clear(),
            db.monotonicCounters.clear(),
            db.trainingHistory.clear(),
            db.eventLog.clear(),
            db.fateCardHistory.clear(),
            db.retirementLog.clear(),
            db.targetedTickets.clear(),
            db.targetedTicketHistory.clear(),
            db.erConsultLog.clear(),
            db.leaderboardProfile.clear(),
            db.bannerUnlockBonusLog.clear(),
          ])
          const rows = (key: string): unknown[] | null => {
            const v = payload[key]
            return Array.isArray(v) && v.length > 0 ? v : null
          }
          const affinityRows = rows('affinity')
          if (affinityRows) await db.affinity.bulkPut(affinityRows as Parameters<typeof db.affinity.bulkPut>[0])
          const doctorsRows = rows('doctors')
          if (doctorsRows) await db.doctors.bulkPut(doctorsRows as Parameters<typeof db.doctors.bulkPut>[0])
          const gachaStatsRows = rows('gachaStats')
          if (gachaStatsRows) await db.gachaStats.bulkPut(gachaStatsRows as Parameters<typeof db.gachaStats.bulkPut>[0])
          const ticketsRows = rows('tickets')
          if (ticketsRows) await db.tickets.bulkPut(ticketsRows as Parameters<typeof db.tickets.bulkPut>[0])
          const roomsRows = rows('rooms')
          if (roomsRows) await db.rooms.bulkPut(roomsRows as Parameters<typeof db.rooms.bulkPut>[0])
          const gameCountersRows = rows('gameCounters')
          if (gameCountersRows) await db.gameCounters.bulkPut(gameCountersRows as Parameters<typeof db.gameCounters.bulkPut>[0])
          const masteryRows = rows('mastery')
          if (masteryRows) await db.mastery.bulkPut(masteryRows as Parameters<typeof db.mastery.bulkPut>[0])
          const questionHistoryRows = rows('questionHistory')
          if (questionHistoryRows) await db.questionHistory.bulkPut(questionHistoryRows as Parameters<typeof db.questionHistory.bulkPut>[0])
          const bookmarksRows = rows('bookmarks')
          if (bookmarksRows) await db.bookmarks.bulkPut(bookmarksRows as Parameters<typeof db.bookmarks.bulkPut>[0])
          const monotonicCountersRows = rows('monotonicCounters')
          if (monotonicCountersRows) await db.monotonicCounters.bulkPut(monotonicCountersRows as Parameters<typeof db.monotonicCounters.bulkPut>[0])
          const trainingHistoryRows = rows('trainingHistory')
          if (trainingHistoryRows) await db.trainingHistory.bulkPut(trainingHistoryRows as Parameters<typeof db.trainingHistory.bulkPut>[0])
          const eventLogRows = rows('eventLog')
          if (eventLogRows) await db.eventLog.bulkPut(eventLogRows as Parameters<typeof db.eventLog.bulkPut>[0])
          const fateCardHistoryRows = rows('fateCardHistory')
          if (fateCardHistoryRows) await db.fateCardHistory.bulkPut(fateCardHistoryRows as Parameters<typeof db.fateCardHistory.bulkPut>[0])
          const retirementLogRows = rows('retirementLog')
          if (retirementLogRows) await db.retirementLog.bulkPut(retirementLogRows as Parameters<typeof db.retirementLog.bulkPut>[0])
          const targetedTicketsRows = rows('targetedTickets')
          if (targetedTicketsRows) await db.targetedTickets.bulkPut(targetedTicketsRows as Parameters<typeof db.targetedTickets.bulkPut>[0])
          const targetedTicketHistoryRows = rows('targetedTicketHistory')
          if (targetedTicketHistoryRows) await db.targetedTicketHistory.bulkPut(targetedTicketHistoryRows as Parameters<typeof db.targetedTicketHistory.bulkPut>[0])
          const erConsultLogRows = rows('erConsultLog')
          if (erConsultLogRows) await db.erConsultLog.bulkPut(erConsultLogRows as Parameters<typeof db.erConsultLog.bulkPut>[0])
          const leaderboardProfileRows = rows('leaderboardProfile')
          if (leaderboardProfileRows) await db.leaderboardProfile.bulkPut(leaderboardProfileRows as Parameters<typeof db.leaderboardProfile.bulkPut>[0])
          const bannerUnlockBonusLogRows = rows('bannerUnlockBonusLog')
          if (bannerUnlockBonusLogRows) await db.bannerUnlockBonusLog.bulkPut(bannerUnlockBonusLogRows as Parameters<typeof db.bannerUnlockBonusLog.bulkPut>[0])
        },
      )
      setImportMsg('✓ 匯入完成，重新載入中…')
      window.location.reload()
    } catch (err) {
      setImportMsg(`✗ 匯入失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setImporting(false)
    }
  }

  async function handleAccountReset(): Promise<void> {
    if (!onResetProgress) return
    setAccountResetMsg(null)
    const ok1 = window.confirm(
      '⚠ 重置進度將清除這個帳號的雲端與本地遊戲資料：\n\n' +
        '・醫院經營（tier / 收益 / 聲望）\n' +
        '・醫師名冊\n' +
        '・答題紀錄\n' +
        '・命運卡與抽卡保底\n' +
        '・SRS 卡片排程\n' +
        '・收藏題目\n\n' +
        '本機會先快照到 localBackup 安全網（保險），但雲端 delete 後無法恢復。\n' +
        '你的 Google 帳號本身不會被刪。\n\n' +
        '確定要重置這個帳號的進度嗎？',
    )
    if (!ok1) {
      setAccountResetMsg('已取消')
      return
    }
    const typed = window.prompt('請輸入 RESET 確認重置：')
    if (typed !== 'RESET') {
      setAccountResetMsg('已取消（未輸入 RESET）')
      return
    }
    setAccountResetting(true)
    try {
      await onResetProgress()
      setAccountResetMsg('✓ 進度已重置')
    } catch (err) {
      setAccountResetMsg(`✗ 重置失敗：${err instanceof Error ? err.message : '未知錯誤'}`)
    } finally {
      setAccountResetting(false)
    }
  }

  useEffect(() => {
    void (async () => {
      const settings = await getERConsultSettings()
      setErConsultEnabledState(settings.enabled)
      const mode = await getFontMode()
      setFontModeState(mode)
    })()
  }, [])

  async function toggleErConsult(next: boolean): Promise<void> {
    setErConsultEnabledState(next)
    await setERConsultSettings({ enabled: next })
    if (!next) {
      // Discard any pending consult — user intent is "stop the feature now",
      // not "skip this one". No log row written.
      await discardActiveERConsult()
    }
  }

  async function handleFontModeChange(next: FontMode): Promise<void> {
    setFontModeState(next)
    await setFontMode(next)
    // body[data-font-mode] is driven by App.tsx live-query effect; no manual
    // DOM write needed here.
  }

  function toggle(id: string) {
    setExpandedId((cur) => (cur === id ? null : id))
  }

  // §9.5.6 — reset surface-hint + milestone-tip flags so they re-fire.
  // `completedSteps` (onboarding) intentionally NOT touched; players who want
  // to redo onboarding should clear local storage.
  async function resetHints() {
    setResetting(true)
    setResetMsg(null)
    const db = getHospitalDB()
    await db.transaction('rw', db.gameCounters, async () => {
      const row = await db.gameCounters.get('singleton')
      if (!row) return
      const completedSteps = row.tutorial?.completedSteps ?? {}
      await db.gameCounters.put({
        ...row,
        tutorial: { completedSteps, firstVisit: {}, firedTips: {} },
      })
    })
    setResetting(false)
    setResetMsg('✓ 已重設提示。返回各頁面會再次看到 💡 卡片與里程碑 toast。')
  }

  return (
    <>
      <button
        type="button"
        className={`help-menu-fab ${className ?? ''}`}
        onClick={() => setOpen(true)}
        aria-label="開啟說明選單"
        title="說明"
      >
        <EmojiIcon char="❓" size={28} />
      </button>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div
            className="modal frame help-menu-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="遊戲說明"
          >
            <header className="help-menu__head">
              <h2 className="modal__title">遊戲說明</h2>
              <button
                type="button"
                className="help-menu__close"
                onClick={() => setOpen(false)}
                aria-label="關閉"
              >
                ×
              </button>
            </header>
            <ul className="help-menu__sections" role="list">
              {SECTIONS.map((section) => {
                const expanded = expandedId === section.id
                return (
                  <li key={section.id} className="help-menu__section">
                    <button
                      type="button"
                      className={`help-menu__row ${expanded ? 'help-menu__row--expanded' : ''}`}
                      onClick={() => toggle(section.id)}
                      aria-expanded={expanded}
                    >
                      <span className="help-menu__icon" aria-hidden>
                        <EmojiIcon char={section.icon} size={24} />
                      </span>
                      <span className="help-menu__title">{section.title}</span>
                      <span className="help-menu__chevron" aria-hidden>{expanded ? '▼' : '▶'}</span>
                    </button>
                    {expanded && (
                      <div className="help-menu__body">
                        {section.body.map((paragraph, i) => (
                          <p key={i}>{paragraph}</p>
                        ))}
                        {section.id === 'leaderboard-settings' && (
                          <LeaderboardSettingsControls />
                        )}
                        {section.id === 'bug-report' && (
                          <button
                            type="button"
                            className="settings-modal__reset-btn"
                            onClick={() => setBugReportOpen(true)}
                          >
                            <EmojiIcon char="💬" size={18} /> 開啟回報表單
                          </button>
                        )}
                        {section.id === 'er-consult' && erConsultEnabled !== null && (
                          <label className="help-menu__toggle-row">
                            <input
                              type="checkbox"
                              role="switch"
                              checked={erConsultEnabled}
                              onChange={(e) => void toggleErConsult(e.target.checked)}
                            />
                            <span>
                              {erConsultEnabled ? '✓ 已啟用急診照會' : '✗ 已關閉急診照會'}
                            </span>
                          </label>
                        )}
                        {section.id === 'font-mode' && fontMode !== null && (
                          <div className="help-menu__radio-group" role="radiogroup" aria-label="字型偏好">
                            <label className="help-menu__radio-row">
                              <input
                                type="radio"
                                name="font-mode"
                                value="readable"
                                checked={fontMode === 'readable'}
                                onChange={() => void handleFontModeChange('readable')}
                              />
                              <span>易讀（Noto Sans TC，預設）</span>
                            </label>
                            <label className="help-menu__radio-row">
                              <input
                                type="radio"
                                name="font-mode"
                                value="pixel"
                                checked={fontMode === 'pixel'}
                                onChange={() => void handleFontModeChange('pixel')}
                              />
                              <span>像素（Cubic 11，GBA 風）</span>
                            </label>
                          </div>
                        )}
                        {section.id === 'data-import' && (
                          <>
                            <button
                              type="button"
                              className="settings-modal__reset-btn"
                              onClick={triggerImport}
                              disabled={importing}
                            >
                              {importing ? (
                                '匯入中…'
                              ) : (
                                <>
                                  <EmojiIcon char="📥" size={18} /> 選擇本機 JSON 匯入
                                </>
                              )}
                            </button>
                            <input
                              ref={importInputRef}
                              type="file"
                              accept="application/json,.json"
                              style={{ display: 'none' }}
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) void handleImportFile(file)
                              }}
                            />
                            {importMsg && (
                              <p className="settings-modal__reset-msg">{importMsg}</p>
                            )}
                          </>
                        )}
                        {section.id === 'account-reset' && (
                          <>
                            <button
                              type="button"
                              className="settings-modal__reset-btn"
                              onClick={() => void handleAccountReset()}
                              disabled={!signedIn || !onResetProgress || accountResetting}
                              title={
                                !signedIn
                                  ? '請先登入 Google 帳號'
                                  : !onResetProgress
                                    ? '雲端同步未啟用'
                                    : '重置此帳號進度（雙重確認）'
                              }
                            >
                              {accountResetting ? (
                                '重置中…'
                              ) : (
                                <>
                                  <EmojiIcon char="🔁" size={18} /> 重置此帳號進度
                                </>
                              )}
                            </button>
                            {accountResetMsg && (
                              <p className="settings-modal__reset-msg">{accountResetMsg}</p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            <footer className="help-menu__foot">
              <p className="muted">
                提示：完成首次教學後可在此查閱所有機制。
              </p>
              <button
                type="button"
                className="settings-modal__reset-btn"
                onClick={() => void resetHints()}
                disabled={resetting}
              >
                {resetting ? '重設中…' : '重新顯示所有提示'}
              </button>
              {resetMsg && <p className="settings-modal__reset-msg">{resetMsg}</p>}
            </footer>
          </div>
        </div>
      )}
      <BugReportModal isOpen={bugReportOpen} onClose={() => setBugReportOpen(false)} />
    </>
  )
}
