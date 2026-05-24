/**
 * Achievement catalog for 二階 hospital mode.
 *
 * 7 categories × 4 tiers (P1 鑽石 / P2 金 / P3 銀 / P4 銅) per design.md.
 * 49 entries: 16 main (study + quiz累計 + quiz streak + recruit + hospital +
 * fortune + hidden) + 14 subject-mastery + 1 全科 capstone + 18 across the
 * remaining main categories at varying tiers.
 *
 * Authoring rules (per achievement-system spec):
 * - Every P1 tier entry MUST set `composite: true` (validator rejects otherwise)
 * - Predicates are pure functions of (player, stats)
 * - Subject mastery uses 100% threshold (per design.md D5 ritual-moment decision)
 * - Streak achievements share quiz category but display as separate sub-ladder
 *
 * Subject question totals mirror `dist/subjects.json` at time of authoring
 * (2026-05-23). If corpus regenerates, re-sync via:
 *   `pnpm --filter @study-rpg/content-medexam2-tw run validate:achievements`
 */

import type {
  Achievement,
  AchievementStats,
  Player,
  SubjectId,
} from '@study-rpg/core'

// ─── Subject question totals (snapshot from dist/subjects.json 2026-05-23) ──

const SUBJECT_QUESTION_TOTALS: Record<SubjectId, number> = {
  內科: 1306,
  家醫科: 214,
  小兒科: 710,
  皮膚科: 202,
  神經內科: 296,
  精神科: 312,
  外科: 1154,
  泌尿科: 174,
  骨科: 192,
  婦產科: 644,
  復健科: 313,
  眼科: 182,
  耳鼻喉科: 189,
  麻醉科: 192,
}

const ALL_14_SUBJECTS: readonly SubjectId[] = Object.keys(SUBJECT_QUESTION_TOTALS)

// ─── Helper: per-subject mastery predicate (100% fresh attempts) ────────────

function subjectMasteryPredicate(subject: SubjectId) {
  const total = SUBJECT_QUESTION_TOTALS[subject]
  return (_player: Player, stats: AchievementStats): boolean => {
    const attempted = stats.subjectAttemptCounts[subject] ?? 0
    return attempted >= total
  }
}

// ─── Helper: build 14 subject-mastery entries ───────────────────────────────

function buildSubjectMasteryEntries(): Achievement[] {
  return ALL_14_SUBJECTS.map((subject) => ({
    id: `subject-master-${subject}`,
    name: `${subject}達人`,
    description: `寫完${subject}全部 ${SUBJECT_QUESTION_TOTALS[subject]} 題（任一作答即計入）`,
    tier: 'P2' as const,
    category: 'subject' as const,
    hidden: false,
    predicate: subjectMasteryPredicate(subject),
    reward: { kind: 'badge' as const },
  }))
}

// ─── Main catalog ───────────────────────────────────────────────────────────

export const ACHIEVEMENTS: readonly Achievement[] = [
  // ─── 學習里程碑 (study) — 4 entries P4→P1 ────────────────────────────────
  {
    id: 'study-hours-5',
    name: '初入院',
    description: '累積唸書 5 小時',
    tier: 'P4',
    category: 'study',
    hidden: false,
    predicate: (_p, s) => s.totalStudyMinutes >= 5 * 60,
    reward: { kind: 'badge' },
  },
  {
    id: 'study-hours-30',
    name: '勤學見習',
    description: '累積唸書 30 小時',
    tier: 'P3',
    category: 'study',
    hidden: false,
    predicate: (_p, s) => s.totalStudyMinutes >= 30 * 60,
    reward: { kind: 'badge' },
  },
  {
    id: 'study-hours-80',
    name: '住院醫師魂',
    description: '累積唸書 80 小時',
    tier: 'P2',
    category: 'study',
    hidden: false,
    predicate: (_p, s) => s.totalStudyMinutes >= 80 * 60,
    reward: { kind: 'title', title: '熬夜冠軍' },
  },
  {
    id: 'study-composite-p1',
    name: '苦學主治',
    description: '累積唸書 100 小時，且連續登入 30 天以上',
    tier: 'P1',
    category: 'study',
    hidden: false,
    composite: true,
    predicate: (_p, s) => s.totalStudyMinutes >= 100 * 60 && s.maxDailyStreak >= 30,
    reward: { kind: 'title', title: '苦學主治' },
  },

  // ─── 答題大師 (quiz, cumulative ladder) — 4 entries ─────────────────────
  {
    id: 'quiz-correct-50',
    name: '初試啼聲',
    description: '累積答對 50 題',
    tier: 'P4',
    category: 'quiz',
    hidden: false,
    predicate: (_p, s) => s.totalQuestionsCorrect >= 50,
    reward: { kind: 'badge' },
  },
  {
    id: 'quiz-correct-500',
    name: '答題熟手',
    description: '累積答對 500 題',
    tier: 'P3',
    category: 'quiz',
    hidden: false,
    predicate: (_p, s) => s.totalQuestionsCorrect >= 500,
    reward: { kind: 'badge' },
  },
  {
    id: 'quiz-correct-2000',
    name: '答題大師',
    description: '累積答對 2000 題',
    tier: 'P2',
    category: 'quiz',
    hidden: false,
    predicate: (_p, s) => s.totalQuestionsCorrect >= 2000,
    reward: { kind: 'title', title: '答題大師' },
  },
  {
    id: 'quiz-correct-composite-p1',
    name: '考神附體',
    description: '累積答對 3000 題，且整體正確率 ≥ 80%',
    tier: 'P1',
    category: 'quiz',
    hidden: false,
    composite: true,
    predicate: (_p, s) => s.totalQuestionsCorrect >= 3000 && s.overallAccuracy >= 0.8,
    reward: { kind: 'title', title: '考神' },
  },

  // ─── 答題大師 (quiz, streak sub-ladder) — 4 entries ─────────────────────
  {
    id: 'streak-correct-5',
    name: '順手',
    description: '單次連續答對 5 題',
    tier: 'P4',
    category: 'quiz',
    hidden: false,
    predicate: (_p, s) => s.maxQuizCorrectStreak >= 5,
    reward: { kind: 'badge' },
  },
  {
    id: 'streak-correct-10',
    name: '連對之手',
    description: '單次連續答對 10 題',
    tier: 'P3',
    category: 'quiz',
    hidden: false,
    predicate: (_p, s) => s.maxQuizCorrectStreak >= 10,
    reward: { kind: 'badge' },
  },
  {
    id: 'streak-correct-20',
    name: '連對之心',
    description: '單次連續答對 20 題',
    tier: 'P2',
    category: 'quiz',
    hidden: false,
    predicate: (_p, s) => s.maxQuizCorrectStreak >= 20,
    reward: { kind: 'title', title: '連對之心' },
  },
  {
    id: 'streak-correct-composite-p1',
    name: '神之手',
    description: '單次連續答對 40 題，且整體正確率 ≥ 85%',
    tier: 'P1',
    category: 'quiz',
    hidden: false,
    composite: true,
    predicate: (_p, s) => s.maxQuizCorrectStreak >= 40 && s.overallAccuracy >= 0.85,
    reward: { kind: 'title', title: '神之手' },
  },

  // ─── 招募達人 (recruit) — 4 entries ─────────────────────────────────────
  {
    id: 'recruit-first',
    name: '首位醫師',
    description: '招募到第 1 位醫師',
    tier: 'P4',
    category: 'recruit',
    hidden: false,
    predicate: (_p, s) => s.totalDoctorsRecruited >= 1,
    reward: { kind: 'badge' },
  },
  {
    id: 'recruit-all-14-subjects',
    name: '科系齊全',
    description: '14 科各招到至少 1 位醫師',
    tier: 'P3',
    category: 'recruit',
    hidden: false,
    // Use mastery count proxy — if attempt counts exist for all 14, we've
    // touched all subjects; recruit-side coverage actually proxies via player
    // unlocks. For MVP we approximate via subjectAttemptCounts having all 14
    // keys with non-zero. Caller must populate stats.subjectAttemptCounts with
    // at least all subject keys (zero allowed) for this to work.
    // TODO(post-MVP): plumb true per-subject doctor coverage from
    //   apps/medexam2-hospital-tw doctor table into AchievementStats.
    predicate: (_p, s) =>
      ALL_14_SUBJECTS.every((subj) => (s.subjectAttemptCounts[subj] ?? 0) > 0),
    reward: { kind: 'badge' },
  },
  {
    id: 'recruit-first-p1-doctor',
    name: '主治登場',
    description: '招到 1 位 P1 醫師',
    tier: 'P2',
    category: 'recruit',
    hidden: false,
    predicate: (_p, s) => s.totalP1DoctorsRecruited >= 1,
    reward: { kind: 'title', title: '主治招募者' },
  },
  {
    id: 'recruit-composite-p1',
    name: '名院之選',
    description: '招齊 3 位 P1 醫師，且全部都分派到 specialty 對應科室',
    tier: 'P1',
    category: 'recruit',
    hidden: false,
    composite: true,
    predicate: (_p, s) =>
      s.totalP1DoctorsRecruited >= 3 && s.allP1DoctorsSpecialtyMatched,
    reward: { kind: 'title', title: '名院之選' },
  },

  // ─── 醫院經營 (hospital) — 4 entries ─────────────────────────────────────
  {
    id: 'hospital-tier-regional',
    name: '區域醫院升格',
    description: '升格為區域醫院',
    tier: 'P4',
    category: 'hospital',
    hidden: false,
    predicate: (_p, s) =>
      s.currentHospitalTier !== undefined &&
      ['區域醫院', '醫學中心', '國家級教學醫院'].includes(s.currentHospitalTier),
    reward: { kind: 'badge' },
  },
  {
    id: 'hospital-tier-medical-center',
    name: '醫學中心',
    description: '升格為醫學中心',
    tier: 'P3',
    category: 'hospital',
    hidden: false,
    predicate: (_p, s) =>
      s.currentHospitalTier !== undefined &&
      ['醫學中心', '國家級教學醫院'].includes(s.currentHospitalTier),
    reward: { kind: 'badge' },
  },
  {
    id: 'hospital-tier-national',
    name: '國家級教學醫院',
    description: '升格為國家級教學醫院',
    tier: 'P2',
    category: 'hospital',
    hidden: false,
    predicate: (_p, s) => s.currentHospitalTier === '國家級教學醫院',
    reward: { kind: 'title', title: '國教院長' },
  },
  {
    id: 'hospital-pristine-composite-p1',
    name: '清譽院長',
    description: '國家級教學醫院 + 累積營收 ≥ 500 萬 + 零醫療糾紛失敗',
    tier: 'P1',
    category: 'hospital',
    hidden: false,
    composite: true,
    predicate: (_p, s) =>
      s.currentHospitalTier === '國家級教學醫院' &&
      s.cumulativeRevenue >= 5_000_000 &&
      s.medicalDisputesFailed === 0,
    reward: { kind: 'title', title: '清譽院長' },
  },

  // ─── 時運與意外 (fortune) — 4 entries ────────────────────────────────────
  {
    id: 'fortune-first-malpractice-survived',
    name: '臨危不亂',
    description: '撐過第一次醫療糾紛事件',
    tier: 'P4',
    category: 'fortune',
    hidden: false,
    predicate: (_p, s) => s.malpracticeEventsSurvived >= 1,
    reward: { kind: 'badge' },
  },
  {
    id: 'fortune-malpractice-3-survived',
    name: '糾紛剋星',
    description: '撐過 3 次醫療糾紛事件',
    tier: 'P3',
    category: 'fortune',
    hidden: false,
    predicate: (_p, s) => s.malpracticeEventsSurvived >= 3,
    reward: { kind: 'badge' },
  },
  {
    id: 'fortune-epic-fate-card',
    name: '稀有命運',
    description: '抽到 epic-tier 命運卡',
    tier: 'P2',
    category: 'fortune',
    hidden: false,
    predicate: (_p, s) => s.epicFateCardsDrawn >= 1,
    reward: { kind: 'badge' },
  },
  {
    id: 'fortune-legendary-composite-p1',
    name: '不離不棄',
    description: '抽到 legendary-tier 命運卡，且本帳號從未退休過 P1 醫師',
    tier: 'P1',
    category: 'fortune',
    hidden: false,
    composite: true,
    predicate: (_p, s) => s.legendaryFateCardsDrawn >= 1 && s.p1DoctorsRetired === 0,
    reward: { kind: 'title', title: '不離不棄' },
  },

  // ─── 隱藏 / 彩蛋 (hidden) — 3 entries ───────────────────────────────────
  // Note: design.md mentions a 4th "真畢業典禮" capstone (capstone-style P1
  // hidden). Deferred — requires unlockedAchievementIds in stats which
  // creates engine→content circular dependency. Revisit post-MVP.
  {
    id: 'hidden-night-owl',
    name: '夜貓子',
    description: '在凌晨 3 點仍在唸書（彩蛋）',
    tier: 'P4',
    category: 'hidden',
    hidden: true,
    // Predicate reads player.todayProgress; caller must update progress
    // synchronously before evaluating. The clock check happens at the hook
    // call site (we can't safely encode time-of-day in a pure predicate).
    // Hook in lib/tick.ts SHALL set a transient flag in stats when the
    // current minute crosses 03:00–03:59 local time AND a session is active.
    // For now, predicate just reads a placeholder counter that the hook
    // increments; concrete plumbing finalized in Phase 7.
    predicate: (_p, _s) => false, // wired in trigger hook phase
    reward: { kind: 'title', title: '夜貓子' },
  },
  {
    id: 'hidden-burnout-eight-hours',
    name: '爆肝實習',
    description: '單日唸書時數 ≥ 8 小時（彩蛋）',
    tier: 'P3',
    category: 'hidden',
    hidden: true,
    predicate: (p, _s) => (p.todayProgress?.readingMinutes ?? 0) >= 8 * 60,
    reward: { kind: 'title', title: '爆肝實習生' },
  },
  {
    id: 'hidden-cant-bear-retire-p1',
    name: '捨不得',
    description: '嘗試退休 P1 醫師卻取消（彩蛋）',
    tier: 'P2',
    category: 'hidden',
    hidden: true,
    // Wired via a transient flag set in services/training.ts when player opens
    // retire modal for P1 doctor then cancels. Stats shape would need a
    // `cancelledP1Retire: boolean` field. Deferred to Phase 7 wiring.
    predicate: (_p, _s) => false, // wired in trigger hook phase
    reward: { kind: 'title', title: '捨不得' },
  },

  // ─── 科別精通 (subject) — 14 entries built from helper + 1 capstone ─────
  ...buildSubjectMasteryEntries(),

  {
    id: 'all-subjects-mastered',
    name: '全科精通',
    description: '14 科全部 100% 寫完',
    tier: 'P1',
    category: 'subject',
    hidden: false,
    composite: true,
    predicate: (_p, s) =>
      ALL_14_SUBJECTS.every(
        (subj) => (s.subjectAttemptCounts[subj] ?? 0) >= SUBJECT_QUESTION_TOTALS[subj],
      ),
    reward: { kind: 'title', title: '全科精通' },
  },
]

// ─── Build-time validator ───────────────────────────────────────────────────

/**
 * Validate the catalog against authoring rules. Called from the package build
 * script + exported for test reuse.
 *
 * Rules:
 * 1. Every entry MUST have a unique id
 * 2. Every P1-tier entry MUST set `composite: true`
 * 3. Every entry's predicate MUST be a function (sanity)
 * 4. (Pragma) Hidden capstone-type predicates that are stubs (`() => false`)
 *    are accepted as TODO markers; caller-of-validator can opt-in stricter
 *    check via `requireWiredPredicates: true`.
 *
 * Throws Error with all collected issues joined; caller should let the
 * build fail loudly per Karpathy principle 5 (no silent errors).
 */
export function validateAchievementCatalog(
  catalog: readonly Achievement[],
  opts: { requireWiredPredicates?: boolean } = {},
): void {
  const issues: string[] = []

  // Rule 1: unique ids
  const seen = new Set<string>()
  for (const a of catalog) {
    if (seen.has(a.id)) issues.push(`Duplicate achievement id: "${a.id}"`)
    seen.add(a.id)
  }

  // Rule 2 + 3: P1 composite + predicate sanity
  for (const a of catalog) {
    if (typeof a.predicate !== 'function') {
      issues.push(`"${a.id}": predicate is not a function`)
    }
    if (a.tier === 'P1' && a.composite !== true) {
      issues.push(
        `"${a.id}" (P1 鑽石): missing \`composite: true\` — P1 tier requires a composite predicate (量 × 質 / 量 × 持續 / 量 × 廣度)`,
      )
    }
  }

  // Rule 4: optional strict predicate wiring check
  if (opts.requireWiredPredicates) {
    for (const a of catalog) {
      const src = a.predicate.toString()
      // Heuristic: stub form `(_p, _s) => false` returns false unconditionally
      if (/=>\s*false\s*$/.test(src.replace(/\s+/g, ' '))) {
        issues.push(`"${a.id}": predicate is a stub (returns false) — wire it in trigger hook phase`)
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Achievement catalog validation failed (${issues.length} issue${issues.length === 1 ? '' : 's'}):\n` +
        issues.map((s) => `  • ${s}`).join('\n'),
    )
  }
}

// Run validator at module load so any CI / build / dev that imports this
// catches authoring mistakes immediately. Non-strict mode (allows TODO stubs).
validateAchievementCatalog(ACHIEVEMENTS, { requireWiredPredicates: false })

// ─── Re-export for callers ──────────────────────────────────────────────────

export { SUBJECT_QUESTION_TOTALS, ALL_14_SUBJECTS }
