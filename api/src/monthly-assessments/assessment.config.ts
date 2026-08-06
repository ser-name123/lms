/*
 * Module 7 configuration: the grade ladder, the assessment deadline rules and
 * the ranking weightage. All of it is data an admin edits, not code — the whole
 * point of the module is that a new course or a changed policy needs no deploy.
 *
 * Two storage strategies, deliberately different:
 *
 *  - Grading scales are ROWS (GradingScale/GradeBand), because a template picks
 *    one and different courses may grade differently.
 *  - The assessment + ranking policy is a single JSON blob in SystemSetting,
 *    exactly like FINANCE_CONFIG — there is one of it, it is read on nearly
 *    every request, and a row per field would be four joins for no gain.
 */

import { RankingBadgeRule } from '../generated/prisma/enums';

export const ASSESSMENT_CONFIG_KEY = 'ASSESSMENT_CONFIG';

export interface RankingWeightage {
  /** Monthly assessment percentage. Spec default 50%. */
  assessment: number;
  /** Attendance percentage for the cycle. Spec default 20%. */
  attendance: number;
  /** Assignment average score. Spec default 15%. */
  assignment: number;
  /** Homework completion. Spec default 10%. */
  homework: number;
  /** Teacher's system rating, rescaled 0..5 → 0..100. Spec default 5%. */
  teacherRating: number;
}

export interface AssessmentConfig {
  /*
   * A student must have been enrolled this many days into the cycle before an
   * assessment can be raised. The spec's "minimum 15 days for a new student".
   */
  minDaysBeforeAssessment: number;
  /** Days after the cycle ends that the assessment is due. */
  dueDaysAfterCycleEnd: number;
  /** Send the teacher a heads-up this many days before the due date. */
  reminderDaysBefore: number;
  /** Keep nagging daily once the due date has passed. */
  overdueReminders: boolean;
  /**
   * Whether a supervisor must approve before a report reaches the family.
   *
   * OFF (the academy's rule): the teacher's submission IS the report — it
   * publishes the moment they submit, and the supervisor reads it afterwards.
   * ON: submitting queues the report for approval, and a supervisor has to
   * approve and publish it before anyone outside the staff sees it.
   *
   * Either way a supervisor can reopen a published report to have it corrected.
   */
  requireSupervisorApproval: boolean;
  /** Auto-generate rankings when every assessment in a cycle is published. */
  autoRankOnPublish: boolean;
  /** How many leaderboard places a student may see besides their own. */
  studentVisibleTopN: number;
  ranking: RankingWeightage;
}

export const DEFAULT_ASSESSMENT_CONFIG: AssessmentConfig = {
  minDaysBeforeAssessment: 15,
  dueDaysAfterCycleEnd: 5,
  reminderDaysBefore: 3,
  overdueReminders: true,
  requireSupervisorApproval: false,
  autoRankOnPublish: true,
  studentVisibleTopN: 10,
  ranking: {
    assessment: 50,
    attendance: 20,
    assignment: 15,
    homework: 10,
    teacherRating: 5,
  },
};

/** The A+..F ladder the spec ships with. Seeded once, then admin-editable. */
export const DEFAULT_GRADE_BANDS: {
  grade: string;
  minPercent: number;
  maxPercent: number;
}[] = [
  { grade: 'A+', minPercent: 95, maxPercent: 100 },
  { grade: 'A', minPercent: 90, maxPercent: 94.99 },
  { grade: 'B+', minPercent: 80, maxPercent: 89.99 },
  { grade: 'B', minPercent: 70, maxPercent: 79.99 },
  { grade: 'C', minPercent: 60, maxPercent: 69.99 },
  { grade: 'D', minPercent: 50, maxPercent: 59.99 },
  { grade: 'F', minPercent: 0, maxPercent: 49.99 },
];

export const DEFAULT_GRADING_SCALE_NAME = 'Standard (A+ – F)';

export const DEFAULT_BADGES: {
  rule: RankingBadgeRule;
  label: string;
  icon: string;
  threshold: number | null;
  displayOrder: number;
}[] = [
  { rule: 'RANK_1' as RankingBadgeRule, label: 'Gold Star', icon: '🥇', threshold: null, displayOrder: 1 },
  { rule: 'RANK_2' as RankingBadgeRule, label: 'Silver Star', icon: '🥈', threshold: null, displayOrder: 2 },
  { rule: 'RANK_3' as RankingBadgeRule, label: 'Bronze Star', icon: '🥉', threshold: null, displayOrder: 3 },
  { rule: 'TOP_10' as RankingBadgeRule, label: 'Top Performer', icon: '⭐', threshold: 10, displayOrder: 4 },
  { rule: 'PERFECT_ATTENDANCE' as RankingBadgeRule, label: 'Perfect Attendance', icon: '🎖', threshold: 100, displayOrder: 5 },
  { rule: 'MOST_IMPROVED' as RankingBadgeRule, label: 'Most Improved Student', icon: '🚀', threshold: 3, displayOrder: 6 },
];

/*
 * The three rubrics the spec ships with, verbatim.
 *
 * These are STARTER templates, not built-in behaviour: they are copied into
 * ordinary AssessmentTemplate rows and are fully editable afterwards, exactly
 * like one an admin types by hand. The module's promise — a new course needs no
 * deploy — is unaffected; this only spares whoever opens the screen first from
 * retyping 24 criteria out of a document.
 *
 * `match` is how the boot-time seed finds the course to attach a preset to. It
 * is matched case-insensitively against the course title, and a course that
 * already has a template is never touched.
 */
export interface StarterTemplate {
  key: string;
  name: string;
  match: string[];
  maxMarks: number;
  passingMarks: number;
  criteria: { name: string; maxMarks: number }[];
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: 'QURAN',
    name: 'Quran Monthly Assessment',
    match: ['quran', "qur'an", 'quraan', 'hifz', 'tajweed', 'nazra'],
    maxMarks: 100,
    passingMarks: 40,
    criteria: [
      { name: 'Attendance & Punctuality', maxMarks: 10 },
      { name: 'Tajweed Rules', maxMarks: 20 },
      { name: 'Pronunciation (Makharij)', maxMarks: 20 },
      { name: 'Fluency', maxMarks: 15 },
      { name: 'Memorization (Hifz)', maxMarks: 15 },
      { name: 'Revision', maxMarks: 10 },
      { name: 'Behaviour & Discipline', maxMarks: 5 },
      { name: 'Homework', maxMarks: 5 },
    ],
  },
  {
    key: 'ARABIC',
    name: 'Arabic Language Monthly Assessment',
    match: ['arabic'],
    maxMarks: 100,
    passingMarks: 40,
    criteria: [
      { name: 'Attendance', maxMarks: 10 },
      { name: 'Reading', maxMarks: 15 },
      { name: 'Writing', maxMarks: 15 },
      { name: 'Listening', maxMarks: 10 },
      { name: 'Speaking', maxMarks: 20 },
      { name: 'Vocabulary', maxMarks: 10 },
      { name: 'Grammar', maxMarks: 10 },
      { name: 'Homework', maxMarks: 5 },
      { name: 'Class Participation', maxMarks: 5 },
    ],
  },
  {
    key: 'ISLAMIC_STUDIES',
    name: 'Islamic Studies Monthly Assessment',
    match: ['islamic studies', 'islamiat', 'islamiyat', 'islamic'],
    maxMarks: 100,
    passingMarks: 40,
    criteria: [
      { name: 'Attendance', maxMarks: 10 },
      { name: 'Islamic Knowledge', maxMarks: 25 },
      { name: 'Understanding', maxMarks: 20 },
      { name: 'Practical Application', maxMarks: 20 },
      { name: 'Duas & Memorization', maxMarks: 10 },
      { name: 'Behaviour & Manners', maxMarks: 10 },
      { name: 'Homework', maxMarks: 5 },
    ],
  },
];

/**
 * The starter template for a course title, or null.
 *
 * Longest match wins, so "Islamic Studies" is not claimed by a shorter keyword
 * belonging to another preset.
 */
export function starterFor(courseTitle: string): StarterTemplate | null {
  const title = (courseTitle || '').toLowerCase();
  let best: { t: StarterTemplate; len: number } | null = null;
  for (const t of STARTER_TEMPLATES) {
    for (const m of t.match) {
      if (title.includes(m) && (!best || m.length > best.len)) best = { t, len: m.length };
    }
  }
  return best?.t ?? null;
}

/** Round to 2dp the same way the finance module does. */
export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * The grade for a percentage.
 *
 * Bands are matched inclusively at both ends, then the highest matching band
 * wins — so a scale whose bands touch (94.99 / 95) and one whose bands overlap
 * both give a sane answer instead of depending on row order. A percentage that
 * matches nothing returns null rather than a wrong grade.
 */
export function gradeFor(
  percentage: number,
  bands: { grade: string; minPercent: number | string; maxPercent: number | string }[],
): string | null {
  const pct = Number(percentage);
  const matches = bands.filter(
    (b) => pct >= Number(b.minPercent) && pct <= Number(b.maxPercent),
  );
  if (!matches.length) return null;
  return matches.sort((a, b) => Number(b.minPercent) - Number(a.minPercent))[0].grade;
}

/**
 * Weighted ranking score, 0..100.
 *
 * Every component arrives already normalised to 0..100, so the weights read
 * exactly as the spec's percentages. Weights are re-normalised against their
 * own sum: an admin who sets them to 60/20/15/10/5 (=110) gets a proportional
 * blend rather than a score above 100, and one who zeroes a component simply
 * redistributes its share.
 */
export function rankingScore(
  parts: {
    assessment: number;
    attendance: number;
    assignment: number;
    homework: number;
    teacherRating: number;
  },
  w: RankingWeightage,
): number {
  const pairs: [number, number][] = [
    [parts.assessment, w.assessment],
    [parts.attendance, w.attendance],
    [parts.assignment, w.assignment],
    [parts.homework, w.homework],
    [parts.teacherRating, w.teacherRating],
  ];
  const totalWeight = pairs.reduce((a, [, weight]) => a + Math.max(0, weight), 0);
  if (totalWeight <= 0) return 0;
  const raw = pairs.reduce(
    (a, [value, weight]) => a + clamp100(value) * Math.max(0, weight),
    0,
  );
  return round2(raw / totalWeight);
}

export function clamp100(n: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}
