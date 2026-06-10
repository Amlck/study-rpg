import Dexie, { type EntityTable, type Table } from 'dexie'
import { initialGachaStats, type GachaStats } from '@study-rpg/core'
import {
  RECRUITMENT_PITY_RULES,
  RECRUITMENT_WEIGHTS,
  HOSPITAL_CREDIT_CAP,
  INITIAL_HOSPITAL_CREDITS,
  clampHospitalCredits,
  MS_PER_DAY,
  TIER_ROOMS,
  RARITY_POWER_MULTIPLIER,
  type HospitalTier,
  type Rarity,
  type Room,
} from '@study-rpg/content-medexam2-tw'
import {
  EQUIPMENT_PITY_RULES,
  EQUIPMENT_WEIGHTS,
  type EquipmentCategory,
} from '../data/equipment'

const RECRUITMENT_GACHA_CONFIG = {
  tiers: RECRUITMENT_WEIGHTS,
  pityRules: RECRUITMENT_PITY_RULES,
}

const EQUIPMENT_GACHA_CONFIG = {
  tiers: EQUIPMENT_WEIGHTS,
  pityRules: EQUIPMENT_PITY_RULES,
}

export const ALL_SUBJECT_IDS = [
  '內科', '家醫科', '小兒科', '皮膚科', '神經內科', '精神科',
  '外科', '泌尿科', '骨科', '婦產科', '復健科', '眼科', '耳鼻喉科', '麻醉科',
] as const

export interface AffinityRow {
  subjectId: string
  correctCount: number
}

export interface DoctorRow {
  id: string
  subjectId: string
  rarity: Rarity
  powerMultiplier: number
  name: string
  spriteKey: string
  obtainedAt: number
  assignedRoom: string | null
  /**
   * Consecutive training failures since last success. Reset to 0 on success or
   * voluntary retirement. Once ≥ TRAINING_PITY_THRESHOLD, the next attempt is
   * guaranteed to succeed. v6 upgrade backfills existing doctors with 0.
   */
  pityCounter: number
}

export interface GachaStatsRow {
  id: 'global'
  totalRolls: number
  rollsSinceLast: Record<string, number>
}

export interface TicketsRow {
  id: 'global'
  available: number
  lastRefreshDay: number
}

export interface EquipmentTicketsRow {
  id: 'global'
  available: number
  /**
   * UTC epoch day of last daily-free-ticket grant. Matches the same epoch-day
   * cadence as `TicketsRow.lastRefreshDay` (fires at Taiwan local 08:00).
   * Optional: absent on rows created pre-v15; refreshDailyEquipmentTickets
   * treats a missing value as 0 (epoch day 0 = always in the past).
   */
  lastRefreshDay?: number
}

export interface EquipmentRow {
  id: string
  definitionId: string
  category: EquipmentCategory
  rarity: Rarity
  obtainedAt: number
  equippedDoctorId: string | null
}

export interface EquipmentMaterialsRow {
  id: 'global'
  parts: number
}

export type RoomRow = Room

export interface RoomSupportAssignmentRow {
  /** Stable primary key: `${roomId}:${slot}`. */
  id: string
  /** Team-capable room id. */
  roomId: string
  /** 1-indexed support slot inside the room. */
  slot: number
  /** Doctor id. Invariants ensure a doctor supports at most one slot. */
  doctorId: string
  assignedAt: number
  _updatedAt?: number
}

export interface GameCountersRow {
  id: 'singleton'
  revenue: number
  reputation: number
  /** Shared hospital currency replacing normal doctor/equipment tickets. */
  hospitalCredits: number
  /** ms timestamp when legacy ticket balances were converted; absent on old saves. */
  hospitalCreditsMigratedAt?: number
  lastTickAt: number
  tier: HospitalTier
  hasUsedStarterPull: boolean
  /**
   * Timestamp when the currently-running study session began. `null` when no
   * session is active. Tick loop only accumulates progress when this is set.
   */
  currentSessionStartedAt: number | null
  /** Timestamp when the last study session ended (manual stop or auto-pause). */
  lastSessionEndedAt: number | null
  /** Tutorial / onboarding progress. All fields are flag bags (sparse maps). */
  tutorial: {
    completedSteps: Record<string, true>
    firstVisit: Record<string, true>
    firedTips: Record<string, true>
  }
  /**
   * Currently pending modal event id (e.g. 'medical-malpractice', 'vip-patient').
   * `null` when no event waiting for player resolution. Toast events resolve
   * immediately and never set this.
   *
   * Optional (added mid-change) — undefined for pre-event saves; treat as null.
   */
  pendingEventId?: string | null
  /** Wall-clock ms when pendingEventId was set; powers 醫療糾紛 24-hr auto-resolve. */
  pendingEventTriggeredAt?: number | null
  /** Wall-clock ms when the last event resolved; powers 5-min cooldown. */
  lastEventResolvedAt?: number | null
  /** Wall-clock ms when VIP throughput-boost expires. `null` when not active. */
  vipBoostUntil?: number | null
  /** Roll-cadence counter; increments per tick, fires event at EVENT_TICK_INTERVAL. */
  eventRollTickCounter?: number
  /**
   * Currently-active ER consultation. `null` when no consult pending. Spec:
   * `er-consultation` capability. Mutex-checked against `pendingEventId` and
   * other active dialogs in tick.ts before rolling a new consult.
   */
  erConsultActive?: ERConsultActiveState | null
  /** Per-tick countdown to next ER consult roll. Decrements each tick; rolls when ≤ 0. */
  erConsultTicksUntilRoll?: number
}

/**
 * Active ER consultation state — set when tick roller spawns a new consult,
 * cleared on answer / skip / auto-skip / settings-toggle-off.
 */
export interface ERConsultActiveState {
  questionId: string
  subjectId: string
  triggeredAt: number
  /** Sprite key into theme pack. MVP defaults to `'er-doctor'` with fallback. */
  doctorSpriteKey: string
  /** Greeting variant index (0-4) — captured at spawn for stable display. */
  greetingIdx: number
}

/**
 * Monotonic counters split from gameCounters per design D7 / audit B3.
 * These fields must merge via MAX(local, cloud) — LWW would let a "shorter"
 * cloud value overwrite local progress after sync.
 */
export interface MonotonicCountersRow {
  id: 'singleton'
  /** Cumulative minutes spent in active study sessions. Never decreases. */
  totalStudyMinutes: number
  /** Per-tier consecutive bad-luck pity counters for fate card draws. */
  fateCardBadLuckPity: {
    common: number
    rare: number
    epic: number
  }
  /**
   * Per-25-fresh-correct credit-grant counter (add-quiz-economy-redesign).
   * Increments by 1 per fresh-correct quiz answer; on reaching
   * QUIZ_TICKET_GRANT_PER_N_CORRECT, +1 hospital credit granted
   * and counter resets to 0. Field added in v8.
   */
  freshCorrectSinceLastTicket?: number
  /**
   * Snapshot of `totalStudyMinutes` at which the last hourly equipment ticket
   * was granted. Every 60-minute increment past this baseline grants +1 ticket.
   * Optional: absent on rows created pre-v14; treated as 0 by tick loop.
   */
  lastEquipmentTicketStudyMinutes?: number
}

/**
 * Banner first-unlock ticket bonus log (add-quiz-economy-redesign, v8).
 * Local-only — NOT cloud-synced. One row per subject means that subject
 * already received its lifetime +1 ticket bonus on first crossing of
 * RECRUITMENT_THRESHOLDS[subjectId]; design D4 accepts up to 14×N_devices
 * over-grant across devices in exchange for schema simplicity.
 */
export interface BannerUnlockBonusLogRow {
  subjectId: string
  grantedAt: number
}

export interface TrainingHistoryRow {
  id?: number
  doctorId: string
  attemptedAt: number
  fromRarity: Rarity
  toRarity: Rarity
  cost: number
  success: boolean
  pityTriggered: boolean
}

export interface EventLogRow {
  id?: number
  triggeredAt: number
  eventKey: string
  outcome: string
  reputationDelta: number
  revenueDelta: number
}

export interface FateCardHistoryRow {
  id?: number
  drawnAt: number
  tier: 'common' | 'rare' | 'epic' | 'legendary'
  cost: number
  rewardKey: string
  wasBadLuck: boolean
  pityTriggered: boolean
}

export interface RetirementLogRow {
  id?: number
  retiredAt: number
  doctorId: string
  subjectId: string
  rarity: Rarity
  refund: number
}

export type TargetedTicketStatus = 'pending' | 'assigned' | 'consumed'

export type RoomSupportRoleId = 'anesthesia'

export interface RoomSupportAssignmentRow {
  roomId: string
  roleId: RoomSupportRoleId
  doctorId: string
  assignedAt: number
  _updatedAt?: number
}

export interface TargetedTicketRow {
  id: string
  subjectId: string | null
  minRarity: 'P2' | 'P3'
  status: TargetedTicketStatus
  obtainedAt: number
  assignedAt: number | null
  consumedAt: number | null
  resultDoctorId: string | null
  sourceFateCardTier: 'epic' | 'legendary'
  _updatedAt?: number
}

/**
 * Telemetry row for ER consultation outcomes. Local-only — NOT synced to cloud.
 * Capped at 500 rows via rolling cap (oldest deleted on insert overflow).
 * Spec: `er-consultation` capability.
 */
export interface ERConsultLogRow {
  id?: number
  triggeredAt: number
  resolvedAt: number | null
  subjectId: string
  questionId: string
  resolution: 'correct' | 'wrong' | 'skipped' | 'auto-skipped'
  /** Combined revenue + reputation delta granted (sum of both counters). 0 for skip / wrong. */
  rewardGained: number
  reactionTimeMs: number | null
}

export interface TargetedTicketHistoryRow {
  id?: number
  ticketId: string
  event: 'obtained' | 'assigned' | 'consumed'
  at: number
  subjectId?: string
  doctorId?: string
  rarity?: Rarity
  sourceFateCardTier?: 'epic' | 'legendary'
}

export interface MasteryRow {
  subjectId: string
  correct: number
  total: number
}

export interface QuestionHistoryRow {
  questionId: string
  subjectId: string
  attempts: number
  correctCount: number
  lastAnsweredAt: number
  lastResult: 'correct' | 'wrong'
  nextDueAt: number | null
  interval: number
  easeFactor: number
}

export interface BookmarkRow {
  questionId: string
  addedAt: number
  _updatedAt?: number
}

/**
 * Per-user local leaderboard opt-in / dismiss state. Device-local only —
 * NOT cloud-synced. Lifecycle:
 *   - First leaderboard visit, no row → opt-in modal shown
 *   - User dismisses「不再顯示」→ row written with dismissed_at = now
 *   - User opt-in submits → row written with opted_in = true + nickname
 *   - Settings toggle off (Phase 7) → opted_in stays true (cloud row flips
 *     is_public via Worker); we don't mutate this table on opt-out so the
 *     player can re-enable without re-consent
 *
 * PK = supabase auth.uid() so multi-account on same device stays isolated.
 */
export interface LeaderboardProfileRow {
  user_id: string
  /** Player's chosen nickname (case-preserved). `null` until opted in. */
  nickname: string | null
  /**
   * Consent flag — set true after the first successful `/leaderboard/upsert`.
   * Once true, never goes false (settings toggle uses `is_public` instead so
   * re-enabling doesn't force a re-consent flow per design D5).
   */
  opted_in: boolean
  /**
   * Settings-panel toggle state (true = visible on public leaderboard, false =
   * row preserved but is_public=0 server-side). Defaults to true on opt-in.
   * Optional in TS because v14 rows shipped before this field existed; treat
   * undefined as `true` at read sites (the safe default — already-consented
   * players were public).
   */
  is_public?: boolean
  /** ms timestamp of「不再顯示」dismiss; null = never dismissed. */
  dismissed_at: number | null
  /** ms timestamp of last successful upsert; null = never pushed. */
  last_pushed_at: number | null
}

// v5 cloud-sync support tables — meta (migration choice/paused flags) +
// localBackup (snapshot before destructive sign-in resolution).
export interface HospitalMetaRow {
  key: string
  value: unknown
}

/** Snapshot of hospital state pre-destructive sign-in resolution. */
export interface HospitalLocalBackupRecord {
  key: string  // e.g. snapshot-2026-05-17T12:00:00.000Z
  takenAt: number
  userId: string
  reason: string
  // Snapshotted hospital state — all cloud-synced 二階 tables
  hospitalState: {
    gameCounters: GameCountersRow | null
    gachaStats: GachaStatsRow | null
    tickets: TicketsRow | null
    rooms: RoomRow[]
    /** Optional — present on backups taken post-v18. */
    roomSupportAssignments?: RoomSupportAssignmentRow[]
    affinity: AffinityRow[]
    /** Optional — present on backups taken post-v19 (surgery team slots). */
    roomSupportAssignments?: RoomSupportAssignmentRow[]
  }
  doctors: DoctorRow[]
  mastery: MasteryRow[]
  questionHistory: QuestionHistoryRow[]
  /** Optional — present on backups taken post-v9 (implement-targeted-fate-card-tickets). */
  targetedTickets?: TargetedTicketRow[]
  /** Optional — present on backups taken post-v9. */
  targetedTicketHistory?: TargetedTicketHistoryRow[]
  /** Optional local-only equipment state (added v13). */
  equipment?: EquipmentRow[]
  equipmentTickets?: EquipmentTicketsRow | null
  equipmentGachaStats?: GachaStatsRow | null
  /** Optional local-only equipment materials (added v16). */
  equipmentMaterials?: EquipmentMaterialsRow | null
  /**
   * Optional — present on backups taken post add-monotonic-counters-to-sync
   * (2026-05-19). Older snapshots (taken before this field shipped) MAY omit
   * the key; callers restoring from such snapshots SHALL fall back to a
   * default singleton row.
   */
  monotonicCounters?: MonotonicCountersRow | null
}

export class HospitalDB extends Dexie {
  affinity!: EntityTable<AffinityRow, 'subjectId'>
  doctors!: EntityTable<DoctorRow, 'id'>
  gachaStats!: EntityTable<GachaStatsRow, 'id'>
  tickets!: EntityTable<TicketsRow, 'id'>
  rooms!: EntityTable<RoomRow, 'id'>
  roomSupportAssignments!: EntityTable<RoomSupportAssignmentRow, 'id'>
  gameCounters!: EntityTable<GameCountersRow, 'id'>
  mastery!: EntityTable<MasteryRow, 'subjectId'>
  questionHistory!: EntityTable<QuestionHistoryRow, 'questionId'>
  meta!: EntityTable<HospitalMetaRow, 'key'>
  localBackup!: EntityTable<HospitalLocalBackupRecord, 'key'>
  monotonicCounters!: EntityTable<MonotonicCountersRow, 'id'>
  trainingHistory!: EntityTable<TrainingHistoryRow, 'id'>
  eventLog!: EntityTable<EventLogRow, 'id'>
  fateCardHistory!: EntityTable<FateCardHistoryRow, 'id'>
  retirementLog!: EntityTable<RetirementLogRow, 'id'>
  bookmarks!: EntityTable<BookmarkRow, 'questionId'>
  bannerUnlockBonusLog!: EntityTable<BannerUnlockBonusLogRow, 'subjectId'>
  targetedTickets!: EntityTable<TargetedTicketRow, 'id'>
  targetedTicketHistory!: EntityTable<TargetedTicketHistoryRow, 'id'>
  erConsultLog!: EntityTable<ERConsultLogRow, 'id'>
  equipment!: EntityTable<EquipmentRow, 'id'>
  equipmentTickets!: EntityTable<EquipmentTicketsRow, 'id'>
  equipmentGachaStats!: EntityTable<GachaStatsRow, 'id'>
  equipmentMaterials!: EntityTable<EquipmentMaterialsRow, 'id'>
  leaderboardProfile!: EntityTable<LeaderboardProfileRow, 'user_id'>
  roomSupportAssignments!: Table<RoomSupportAssignmentRow, [string, RoomSupportRoleId]>

  constructor(name = 'study-rpg-medexam2-hospital-tw') {
    super(name)
    this.version(1).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
    })
    this.version(2).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
    })
    this.version(3).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
    })
    // v4: adds mastery + questionHistory tables; gameCounters gains
    // `hasUsedStarterPull` (JS prop, not indexed). Existing dogfood saves get
    // force-flagged true in ensureSeed so the starter-pull UI never appears for them.
    this.version(4)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
      })
      .upgrade(async (tx) => {
        // Backfill 14 default mastery rows for upgrading saves
        const masteryTable = tx.table<MasteryRow, string>('mastery')
        const existing = new Set((await masteryTable.toArray()).map((r) => r.subjectId))
        const missing = ALL_SUBJECT_IDS.filter((s) => !existing.has(s)).map((subjectId) => ({
          subjectId,
          correct: 0,
          total: 0,
        }))
        if (missing.length > 0) await masteryTable.bulkAdd(missing)
      })
    // v5: cloud-sync support tables — meta (migration choice/paused per-user)
    // + localBackup (snapshot before destructive sign-in resolution). Both
    // tables are additive; no upgrade hook needed.
    this.version(5).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
      meta: '&key',
      localBackup: '&key, takenAt',
    })
    // v6: redesign-hospital-economy — adds monotonic counter row (MAX-merge cloud
    // sync), training / event / fate-card / retirement history tables. Upgrade
    // patches existing rows with new fields (pityCounter, facilityLevel, session
    // metadata, tutorial flags). All additive — no destructive migration.
    this.version(6)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
        meta: '&key',
        localBackup: '&key, takenAt',
        monotonicCounters: '&id',
        trainingHistory: '++id, doctorId, attemptedAt',
        eventLog: '++id, triggeredAt',
        fateCardHistory: '++id, drawnAt',
        retirementLog: '++id, retiredAt, doctorId',
      })
      .upgrade(async (tx) => {
        // 1. Seed monotonicCounters singleton (MAX-merge row split per D7)
        const monotonicTable = tx.table<MonotonicCountersRow, 'singleton'>('monotonicCounters')
        const existing = await monotonicTable.get('singleton')
        if (!existing) {
          await monotonicTable.put({
            id: 'singleton',
            totalStudyMinutes: 0,
            fateCardBadLuckPity: { common: 0, rare: 0, epic: 0 },
          })
        }

        // 2. Patch gameCounters singleton with new LWW-only fields (additive)
        const countersTable = tx.table<GameCountersRow, 'singleton'>('gameCounters')
        const counters = await countersTable.get('singleton')
        if (counters) {
          const c = counters as Partial<GameCountersRow> & GameCountersRow
          await countersTable.put({
            ...counters,
            currentSessionStartedAt: c.currentSessionStartedAt ?? null,
            lastSessionEndedAt: c.lastSessionEndedAt ?? null,
            tutorial: c.tutorial ?? { completedSteps: {}, firstVisit: {}, firedTips: {} },
          })
        }

        // 3. Backfill doctor.pityCounter = 0
        await tx.table<DoctorRow, string>('doctors').toCollection().modify((d) => {
          if ((d as Partial<DoctorRow>).pityCounter === undefined) d.pityCounter = 0
        })

        // 4. Backfill room.facilityLevel = 1 (roomFacility already exists at 1.0)
        await tx.table<RoomRow, string>('rooms').toCollection().modify((r) => {
          if ((r as Partial<RoomRow>).facilityLevel === undefined) r.facilityLevel = 1
        })
      })
    // v7: add-quiz-question-id-and-bookmark — additive bookmarks store.
    // No upgrade hook needed; engine attaches its _updatedAt hook automatically.
    this.version(7).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
    })

    // v8: add-quiz-economy-redesign — local-only bannerUnlockBonusLog table
    // + freshCorrectSinceLastTicket counter on monotonicCounters. Upgrade hook
    // seeds the new monotonic field to 0 for existing rows.
    this.version(8)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
        meta: '&key',
        localBackup: '&key, takenAt',
        monotonicCounters: '&id',
        trainingHistory: '++id, doctorId, attemptedAt',
        eventLog: '++id, triggeredAt',
        fateCardHistory: '++id, drawnAt',
        retirementLog: '++id, retiredAt, doctorId',
        bookmarks: '&questionId, addedAt',
        bannerUnlockBonusLog: '&subjectId',
      })
      .upgrade(async (tx) => {
        const monotonicTable = tx.table<MonotonicCountersRow, 'singleton'>('monotonicCounters')
        const existing = await monotonicTable.get('singleton')
        if (existing && existing.freshCorrectSinceLastTicket === undefined) {
          await monotonicTable.put({ ...existing, freshCorrectSinceLastTicket: 0 })
        }
      })

    // v9: implement-targeted-fate-card-tickets — additive collection tables for
    // epic/legendary fate-card-sourced targeted recruitment tickets (subject pick
    // + rarity floor enforcement). Both tables are net-new; no row backfill needed.
    this.version(9).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
    })

    // v10: add-er-consultation-feature — local-only telemetry table for ER
    // consultation outcomes (no cloud sync per spec). gameCounters.singleton
    // gains `erConsultActive` + `erConsultTicksUntilRoll` JS props (no index).
    this.version(10).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory: '&questionId, subjectId, lastAnsweredAt, nextDueAt',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
      erConsultLog: '++id, triggeredAt, subjectId',
    })

    // v11: questionHistory gains `[lastResult+lastAnsweredAt]` compound index
    // for the 「錯題」 derived view (filter lastResult='wrong' sorted newest-first).
    this.version(11).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory:
        '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
      erConsultLog: '++id, triggeredAt, subjectId',
    })

    // v12: fix-medexam2-doctor-room-pointer-drift — Doctor.assignedRoom becomes
    // the single source of truth for doctor↔room assignment. Room.assignedDoctorId
    // is retained in the type (cloud blob compat + export/import) but always null.
    // Upgrade hook clears any existing non-null values; store schema unchanged.
    this.version(12)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory:
          '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]',
        meta: '&key',
        localBackup: '&key, takenAt',
        monotonicCounters: '&id',
        trainingHistory: '++id, doctorId, attemptedAt',
        eventLog: '++id, triggeredAt',
        fateCardHistory: '++id, drawnAt',
        retirementLog: '++id, retiredAt, doctorId',
        bookmarks: '&questionId, addedAt',
        bannerUnlockBonusLog: '&subjectId',
        targetedTickets: '&id, status, subjectId, obtainedAt',
        targetedTicketHistory: '++id, ticketId, at, event',
        erConsultLog: '++id, triggeredAt, subjectId',
      })
      .upgrade(async (tx) => {
        await tx
          .table<RoomRow, string>('rooms')
          .toCollection()
          .modify((r) => {
            if (r.assignedDoctorId !== null) r.assignedDoctorId = null
          })
      })
    // v13: add-medexam2-year-filter — marks the version that introduces the
    // `quiz.yearFilter` KV in the existing `meta` table. Stores unchanged
    // (KV row is additive); no upgrade hook needed.
    this.version(13).stores({
      affinity: '&subjectId',
      doctors: '&id, subjectId, rarity, obtainedAt',
      gachaStats: '&id',
      tickets: '&id',
      rooms: '&id, type, slot',
      gameCounters: '&id',
      mastery: '&subjectId',
      questionHistory:
        '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]',
      meta: '&key',
      localBackup: '&key, takenAt',
      monotonicCounters: '&id',
      trainingHistory: '++id, doctorId, attemptedAt',
      eventLog: '++id, triggeredAt',
      fateCardHistory: '++id, drawnAt',
      retirementLog: '++id, retiredAt, doctorId',
      bookmarks: '&questionId, addedAt',
      bannerUnlockBonusLog: '&subjectId',
      targetedTickets: '&id, status, subjectId, obtainedAt',
      targetedTicketHistory: '++id, ticketId, at, event',
      erConsultLog: '++id, triggeredAt, subjectId',
    })

    // v14: first-pass equipment inventory. Local-only for now: equipment,
    // legacy equipment tickets, and equipment-specific pity stats are not cloud-synced
    // until a follow-up migration adds server tables.
    this.version(14)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory:
          '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]',
        meta: '&key',
        localBackup: '&key, takenAt',
        monotonicCounters: '&id',
        trainingHistory: '++id, doctorId, attemptedAt',
        eventLog: '++id, triggeredAt',
        fateCardHistory: '++id, drawnAt',
        retirementLog: '++id, retiredAt, doctorId',
        bookmarks: '&questionId, addedAt',
        bannerUnlockBonusLog: '&subjectId',
        targetedTickets: '&id, status, subjectId, obtainedAt',
        targetedTicketHistory: '++id, ticketId, at, event',
        erConsultLog: '++id, triggeredAt, subjectId',
        equipment: '&id, rarity, category, obtainedAt, equippedDoctorId',
        equipmentTickets: '&id',
        equipmentGachaStats: '&id',
      })
      .upgrade(async (tx) => {
        const ticketsTable = tx.table<EquipmentTicketsRow, 'global'>('equipmentTickets')
        if (!(await ticketsTable.get('global'))) {
          await ticketsTable.put({ id: 'global', available: 0 })
        }

        const statsTable = tx.table<GachaStatsRow, 'global'>('equipmentGachaStats')
        if (!(await statsTable.get('global'))) {
          const init = initialGachaStats(EQUIPMENT_GACHA_CONFIG)
          await statsTable.put({ id: 'global', ...init })
        }
      })

    // v15: equipment ticket daily-free grant (lastRefreshDay) +
    //      study-time hourly ticket milestone (lastEquipmentTicketStudyMinutes).
    //      No new tables — schema unchanged; upgrade seeds missing fields only.
    this.version(15)
      .stores({})
      .upgrade(async (tx) => {
        const eqTicketsTable = tx.table<EquipmentTicketsRow, 'global'>('equipmentTickets')
        const eqTickets = await eqTicketsTable.get('global')
        if (eqTickets && eqTickets.lastRefreshDay === undefined) {
          await eqTicketsTable.put({ ...eqTickets, lastRefreshDay: currentEpochDay() })
        }

        const monoTable = tx.table<MonotonicCountersRow, 'singleton'>('monotonicCounters')
        const mono = await monoTable.get('singleton')
        if (mono && mono.lastEquipmentTicketStudyMinutes === undefined) {
          await monoTable.put({ ...mono, lastEquipmentTicketStudyMinutes: mono.totalStudyMinutes })
        }
      })

    // v16: equipment rarity upgrade path — local-only material singleton used
    // by deterministic equipment upgrades. Existing equipment rows are not
    // modified; upgrades continue to use their existing rarity field.
    this.version(16)
      .stores({
        affinity: '&subjectId',
        doctors: '&id, subjectId, rarity, obtainedAt',
        gachaStats: '&id',
        tickets: '&id',
        rooms: '&id, type, slot',
        gameCounters: '&id',
        mastery: '&subjectId',
        questionHistory:
          '&questionId, subjectId, lastAnsweredAt, nextDueAt, [lastResult+lastAnsweredAt]',
        meta: '&key',
        localBackup: '&key, takenAt',
        monotonicCounters: '&id',
        trainingHistory: '++id, doctorId, attemptedAt',
        eventLog: '++id, triggeredAt',
        fateCardHistory: '++id, drawnAt',
        retirementLog: '++id, retiredAt, doctorId',
        bookmarks: '&questionId, addedAt',
        bannerUnlockBonusLog: '&subjectId',
        targetedTickets: '&id, status, subjectId, obtainedAt',
        targetedTicketHistory: '++id, ticketId, at, event',
        erConsultLog: '++id, triggeredAt, subjectId',
        equipment: '&id, rarity, category, obtainedAt, equippedDoctorId',
        equipmentTickets: '&id',
        equipmentGachaStats: '&id',
        equipmentMaterials: '&id',
      })
      .upgrade(async (tx) => {
        const materialsTable = tx.table<EquipmentMaterialsRow, 'global'>('equipmentMaterials')
        if (!(await materialsTable.get('global'))) {
          await materialsTable.put({ id: 'global', parts: 0 })
        }
      })
    // v17: add-hospital-leaderboard — local-only leaderboardProfile table for
    // per-user opt-in / dismissed-forever / last-pushed bookkeeping (Phase
    // 5.5). Additive store; no upgrade hook needed.
    // NOTE: Originally landed as a second this.version(14) on the DrSu-Local
    // branch (conflict with the equipment v14). Renumbered to v17 so there is
    // exactly one definition per version number.
    this.version(17).stores({
      leaderboardProfile: '&user_id',
    })
<<<<<<< Updated upstream
=======
<<<<<<< HEAD
>>>>>>> Stashed changes
    // v18: surgery rooms may carry one support doctor via an additive
    // assignment table. Primary doctor assignment remains Doctor.assignedRoom.
    this.version(18).stores({
      roomSupportAssignments: '&roomId, doctorId, assignedAt',
    })
    // v19: ER/ICU team staffing generalizes support assignments from
    // one-row-per-room to slot-aware rows (`id = roomId:slot`).
    this.version(19)
      .stores({
        roomSupportAssignments: '&id, roomId, doctorId, assignedAt',
      })
      .upgrade(async (tx) => {
        const table = tx.table<Partial<RoomSupportAssignmentRow> & { roomId: string; doctorId: string }, string>(
          'roomSupportAssignments',
        )
        const legacyRows = await table.toArray()
        await table.clear()
        if (legacyRows.length > 0) {
          await table.bulkPut(
            legacyRows
              .filter((row) => row.roomId && row.doctorId)
              .map((row) => {
                const slot = Number.isFinite(row.slot) && row.slot! > 0 ? Math.floor(row.slot!) : 1
                return {
                  ...row,
                  id: `${row.roomId}:${slot}`,
                  slot,
                  assignedAt: row.assignedAt ?? Date.now(),
                }
              }),
          )
        }
      })
<<<<<<< Updated upstream
=======
=======

    // v18: shared-hospital-credits — normal doctor/equipment tickets are
    // converted into gameCounters.hospitalCredits, then zeroed to avoid
    // double-spend. Legacy ticket tables stay for backup/import compatibility.
    this.version(18)
      .stores({})
      .upgrade(async (tx) => {
        const countersTable = tx.table<GameCountersRow, 'singleton'>('gameCounters')
        const ticketsTable = tx.table<TicketsRow, 'global'>('tickets')
        const equipmentTicketsTable = tx.table<EquipmentTicketsRow, 'global'>('equipmentTickets')
        const [counters, tickets, equipmentTickets] = await Promise.all([
          countersTable.get('singleton'),
          ticketsTable.get('global'),
          equipmentTicketsTable.get('global'),
        ])
        const now = Date.now()

        if (counters && counters.hospitalCredits === undefined) {
          const legacyDoctor = Math.max(0, Math.floor(tickets?.available ?? 0))
          const legacyEquipment = Math.max(0, Math.floor(equipmentTickets?.available ?? 0))
          await countersTable.put({
            ...counters,
            hospitalCredits: clampHospitalCredits(legacyDoctor + legacyEquipment),
            hospitalCreditsMigratedAt: now,
          })
        }

        if (tickets && tickets.available !== 0) {
          await ticketsTable.put({ ...tickets, available: 0, lastRefreshDay: currentEpochDay() })
        }
        if (equipmentTickets && equipmentTickets.available !== 0) {
          await equipmentTicketsTable.put({
            ...equipmentTickets,
            available: 0,
            lastRefreshDay: currentEpochDay(),
          })
        }
      })

    // v19: surgery team slots — one support assignment per room+role. The lead
    // doctor remains `Doctor.assignedRoom`; this table only stores assistant
    // roles such as surgery anesthesia support.
    this.version(19).stores({
      roomSupportAssignments: '[roomId+roleId], roomId, doctorId, roleId, assignedAt',
    })
>>>>>>> 082a356aabc9653a22663510ebb18fca31c68dec
>>>>>>> Stashed changes
  }
}

let _db: HospitalDB | undefined
export function getHospitalDB(): HospitalDB {
  if (!_db) _db = new HospitalDB()
  return _db
}

function currentEpochDay(): number {
  return Math.floor(Date.now() / MS_PER_DAY)
}

// ─── Bootstrap & daily refresh ───────────────────────────────────────────────

function makeStarterDoctor(subjectId: '內科' | '外科', seqIndex: number): DoctorRow {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `starter-${subjectId}-${Date.now()}-${seqIndex}`,
    subjectId,
    rarity: 'P5',
    powerMultiplier: RARITY_POWER_MULTIPLIER.P5,
    name: `${subjectId} 醫師 #1`,
    spriteKey: `doctor-${subjectId}-P5`,
    obtainedAt: Date.now() + seqIndex,
    assignedRoom: null,
    pityCounter: 0,
  }
}

export async function ensureSeed(): Promise<void> {
  const db = getHospitalDB()
  await db.transaction(
    'rw',
    [
      db.tickets,
      db.gachaStats,
      db.equipmentTickets,
      db.equipmentGachaStats,
      db.equipmentMaterials,
      db.roomSupportAssignments,
      db.rooms,
      db.gameCounters,
      db.doctors,
      db.mastery,
      db.monotonicCounters,
    ],
    async () => {
      // Always ensure monotonicCounters singleton exists (covers both fresh save
      // and the rare case where v6 upgrade didn't run before ensureSeed)
      const mono = await db.monotonicCounters.get('singleton')
      if (!mono) {
        await db.monotonicCounters.put({
          id: 'singleton',
          totalStudyMinutes: 0,
          fateCardBadLuckPity: { common: 0, rare: 0, epic: 0 },
          freshCorrectSinceLastTicket: 0,
        })
      }

      const t = await db.tickets.get('global')
      if (!t) {
        await db.tickets.put({
          id: 'global',
          available: 0,
          lastRefreshDay: currentEpochDay(),
        })
      }
      const s = await db.gachaStats.get('global')
      if (!s) {
        const init = initialGachaStats(RECRUITMENT_GACHA_CONFIG)
        await db.gachaStats.put({ id: 'global', ...init })
      }
      const equipmentTickets = await db.equipmentTickets.get('global')
      if (!equipmentTickets) {
        await db.equipmentTickets.put({
          id: 'global',
          available: 0,
          lastRefreshDay: currentEpochDay(),
        })
      }
      const equipmentStats = await db.equipmentGachaStats.get('global')
      if (!equipmentStats) {
        const init = initialGachaStats(EQUIPMENT_GACHA_CONFIG)
        await db.equipmentGachaStats.put({ id: 'global', ...init })
      }
      const equipmentMaterials = await db.equipmentMaterials.get('global')
      if (!equipmentMaterials) {
        await db.equipmentMaterials.put({ id: 'global', parts: 0 })
      }
      const roomCount = await db.rooms.count()
      if (roomCount === 0) {
        await db.rooms.bulkPut(TIER_ROOMS['診所'])
      }

      const doctorCount = await db.doctors.count()
      const counters = await db.gameCounters.get('singleton')

      if (!counters) {
        // Fresh save — seed 2 P5 starter doctors + starter pull available
        await db.gameCounters.put({
          id: 'singleton',
          revenue: 0,
          reputation: 0,
          hospitalCredits: INITIAL_HOSPITAL_CREDITS,
          hospitalCreditsMigratedAt: Date.now(),
          lastTickAt: Date.now(),
          tier: '診所',
          hasUsedStarterPull: false,
          currentSessionStartedAt: null,
          lastSessionEndedAt: null,
          tutorial: { completedSteps: {}, firstVisit: {}, firedTips: {} },
          pendingEventId: null,
          pendingEventTriggeredAt: null,
          lastEventResolvedAt: null,
          vipBoostUntil: null,
          eventRollTickCounter: 0,
          erConsultActive: null,
          erConsultTicksUntilRoll: 0,
        })
        if (doctorCount === 0) {
          await db.doctors.bulkPut([makeStarterDoctor('內科', 0), makeStarterDoctor('外科', 1)])
        }
      } else {
        const c = counters as Partial<GameCountersRow>
        const patches: Partial<GameCountersRow> = {}
        if (c.hospitalCredits === undefined) {
          const legacyTickets = await db.tickets.get('global')
          const legacyEquipmentTickets = await db.equipmentTickets.get('global')
          patches.hospitalCredits = clampHospitalCredits(
            (legacyTickets?.available ?? 0) + (legacyEquipmentTickets?.available ?? 0),
          )
          patches.hospitalCreditsMigratedAt = Date.now()
          if (legacyTickets && legacyTickets.available !== 0) {
            await db.tickets.put({ ...legacyTickets, available: 0, lastRefreshDay: currentEpochDay() })
          }
          if (legacyEquipmentTickets && legacyEquipmentTickets.available !== 0) {
            await db.equipmentTickets.put({
              ...legacyEquipmentTickets,
              available: 0,
              lastRefreshDay: currentEpochDay(),
            })
          }
        }
        if (c.tier === undefined) patches.tier = '診所'
        // Recovery branch — see `fix-v3-to-v4-starter-pull-migration` design.md D4 matrix.
        // The original v3→v4 patcher unconditionally force-set hasUsedStarterPull=true,
        // which softlocked v3 saves whose doctors table was empty (no starter pull UI +
        // no doctors = unplayable). Branch on actual doctorCount instead of flag value:
        //   - doctorCount === 0  → seed 2 P5 starters + set flag false (recovery, fires
        //                          for both undefined and already-true flag victims;
        //                          self-terminating because doctorCount > 0 next boot)
        //   - doctorCount > 0    → preserve original intent: set flag true if undefined,
        //                          no-op if already defined
        if (doctorCount === 0) {
          await db.doctors.bulkPut([makeStarterDoctor('內科', 0), makeStarterDoctor('外科', 1)])
          patches.hasUsedStarterPull = false
        } else if (c.hasUsedStarterPull === undefined) {
          patches.hasUsedStarterPull = true
        }
        if (Object.keys(patches).length > 0) {
          await db.gameCounters.put({ ...counters, ...patches } as GameCountersRow)
        }
      }

      // Backfill mastery for any subject missing (safety net beyond upgrade hook)
      const existingMastery = new Set((await db.mastery.toArray()).map((r) => r.subjectId))
      const missing = ALL_SUBJECT_IDS.filter((s) => !existingMastery.has(s)).map((subjectId) => ({
        subjectId,
        correct: 0,
        total: 0,
      }))
      if (missing.length > 0) await db.mastery.bulkAdd(missing)
    },
  )
}

export async function refreshDailyTickets(): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', [db.tickets, db.gameCounters], async () => {
    const t = await db.tickets.get('global')
    if (!t) return
    const today = currentEpochDay()
    const delta = today - t.lastRefreshDay
    if (delta <= 0) return
    const counters = await db.gameCounters.get('singleton')
    if (counters) {
      const current = clampHospitalCredits(counters.hospitalCredits ?? 0)
      const grant = Math.min(delta, HOSPITAL_CREDIT_CAP - current)
      if (grant > 0) {
        await db.gameCounters.put({
          ...counters,
          hospitalCredits: clampHospitalCredits(current + grant),
        })
      }
    }
    await db.tickets.put({
      ...t,
      available: 0,
      lastRefreshDay: today,
    })
  })
}

/**
 * Legacy equipment ticket refresh. Shared credits own the active daily grant;
 * this only advances/zeros the deprecated equipment ticket row so old state
 * cannot become spendable again.
 */
export async function refreshDailyEquipmentTickets(): Promise<void> {
  const db = getHospitalDB()
  await db.transaction('rw', db.equipmentTickets, async () => {
    const t = await db.equipmentTickets.get('global')
    if (!t) return
    const today = currentEpochDay()
    const delta = today - (t.lastRefreshDay ?? 0)
    if (delta <= 0) return
    await db.equipmentTickets.put({
      ...t,
      available: 0,
      lastRefreshDay: today,
    })
  })
}

// ─── Quiz-reward ticket helpers (add-quiz-economy-redesign) ─────────────────

/**
 * Grant N shared hospital credits, clamped at HOSPITAL_CREDIT_CAP.
 * Caller MUST run this inside an outer Dexie transaction that already holds
 * write-lock on `gameCounters`. Returns the actually-granted delta (may be < count
 * if cap is hit) so callers can decide whether to emit a `+1 院務點數` toast vs
 * a `已達上限` toast.
 */
export async function grantTicketsForCorrect(count: number): Promise<number> {
  const db = getHospitalDB()
  const counters = await db.gameCounters.get('singleton')
  if (!counters) return 0
  const current = clampHospitalCredits(counters.hospitalCredits ?? 0)
  const next = clampHospitalCredits(current + count)
  const actuallyGranted = next - current
  if (actuallyGranted > 0) {
    await db.gameCounters.put({ ...counters, hospitalCredits: next })
  }
  return actuallyGranted
}

/**
 * Grant the one-time banner-first-unlock credit bonus for `subjectId`, idempotent
 * via `bannerUnlockBonusLog`. Returns true if a bonus was newly granted (caller
 * should toast), false if already granted previously. Caller MUST run inside a
 * Dexie transaction holding write-lock on `gameCounters` and `bannerUnlockBonusLog`.
 */
export async function grantBannerUnlockBonus(subjectId: string): Promise<boolean> {
  const db = getHospitalDB()
  const existing = await db.bannerUnlockBonusLog.get(subjectId)
  if (existing) return false
  await db.bannerUnlockBonusLog.put({ subjectId, grantedAt: Date.now() })
  await grantTicketsForCorrect(1)
  return true
}

// ─── Affinity helpers ────────────────────────────────────────────────────────

export async function getAffinity(subjectId: string): Promise<number> {
  const row = await getHospitalDB().affinity.get(subjectId)
  return row?.correctCount ?? 0
}

export async function incrementAffinity(subjectId: string): Promise<number> {
  const db = getHospitalDB()
  return db.transaction('rw', db.affinity, async () => {
    const row = await db.affinity.get(subjectId)
    const next = (row?.correctCount ?? 0) + 1
    await db.affinity.put({ subjectId, correctCount: next })
    return next
  })
}

// ─── Gacha stats helpers ─────────────────────────────────────────────────────

export async function getGachaStats(): Promise<GachaStats> {
  const row = await getHospitalDB().gachaStats.get('global')
  if (!row) return initialGachaStats(RECRUITMENT_GACHA_CONFIG)
  return { totalRolls: row.totalRolls, rollsSinceLast: { ...row.rollsSinceLast } }
}
