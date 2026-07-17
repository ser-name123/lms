// Configurable weights + thresholds for the progress engine, persisted as a
// JSON blob in SystemSetting (key PROGRESS_CONFIG). Admin-editable.

export const PROGRESS_CONFIG_KEY = 'PROGRESS_CONFIG';

export type ProgressWeights = {
  attendance: number;
  assignments: number;
  assessments: number;
  feedback: number;
  coach: number;
};

export type ProgressThresholds = {
  excellent: number; // score >= → EXCELLENT
  good: number;
  average: number;
  needsAttention: number; // below this → CRITICAL
};

export type ProgressRiskThresholds = {
  attendance: number; // below → risk reason
  assignment: number;
  assessment: number;
};

export type ProgressConfig = {
  weights: ProgressWeights;
  thresholds: ProgressThresholds;
  risk: ProgressRiskThresholds;
};

// Spec defaults: attendance 20 / assignments 25 / assessments 35 / feedback 10 / coach 10.
export const DEFAULT_PROGRESS_CONFIG: ProgressConfig = {
  weights: { attendance: 20, assignments: 25, assessments: 35, feedback: 10, coach: 10 },
  thresholds: { excellent: 85, good: 70, average: 50, needsAttention: 35 },
  risk: { attendance: 70, assignment: 60, assessment: 50 },
};

export const PROGRESS_STATUSES = [
  'EXCELLENT',
  'GOOD',
  'AVERAGE',
  'NEEDS_ATTENTION',
  'CRITICAL',
  'NO_DATA',
] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

export function statusFromScore(
  score: number,
  t: ProgressThresholds,
): ProgressStatus {
  if (score >= t.excellent) return 'EXCELLENT';
  if (score >= t.good) return 'GOOD';
  if (score >= t.average) return 'AVERAGE';
  if (score >= t.needsAttention) return 'NEEDS_ATTENTION';
  return 'CRITICAL';
}

// Assessment attempt statuses that count as "attempted/completed".
export const COMPLETED_ATTEMPT_STATUSES = [
  'SUBMITTED',
  'UNDER_EVALUATION',
  'EVALUATED',
  'PUBLISHED',
];
