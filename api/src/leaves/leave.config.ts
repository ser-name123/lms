/*
 * Module 9 configuration: which leave types the academy offers, which are paid
 * by default, and how an unpaid day turns into a payroll deduction.
 *
 * Stored as one JSON blob in SystemSetting, the same way FINANCE_CONFIG,
 * ASSESSMENT_CONFIG and MEETING_CONFIG are — there is one of it and it is read
 * on nearly every request.
 *
 * §9.11 says the types are configurable by the admin. They are configured as a
 * SELECTION over the LeaveType enum rather than as free text: a free-text type
 * could not be reasoned about by payroll (is it paid?) or by the availability
 * guard (does it block scheduling?), so "configurable" here means the admin
 * chooses which of the known types are offered and how each is paid.
 */

export const LEAVE_CONFIG_KEY = 'LEAVE_CONFIG';

/** Every type the schema knows, split by the two lists in §9.1. */
export const STAFF_LEAVE_TYPES = [
  'ANNUAL', 'SICK', 'EMERGENCY', 'PERSONAL', 'UNPAID', 'TRAINING', 'CASUAL', 'OTHER',
] as const;

export const UNAVAILABILITY_TYPES = [
  'PERSONAL', 'MEDICAL', 'VACATION', 'TRAINING', 'FAMILY_EMERGENCY',
  'SCHEDULE_CONFLICT', 'RELIGIOUS_HOLIDAY', 'OTHER',
] as const;

export type LeaveTypeName = (typeof STAFF_LEAVE_TYPES)[number] | (typeof UNAVAILABILITY_TYPES)[number];

export interface LeaveConfig {
  /** Staff leave types offered on the request form. */
  staffTypes: string[];
  /** Teacher unavailability types offered on the request form. */
  unavailabilityTypes: string[];
  /**
   * Types the admin's paid/unpaid toggle DEFAULTS to paid for. Only a default —
   * §9.3 makes the call the admin's at approval time, every time.
   */
  paidByDefault: string[];
  /**
   * How an unpaid day becomes money. `DAILY_RATE` multiplies the teacher's own
   * daily rate; `FIXED` uses `fixedDeductionPerDay` for everyone.
   */
  deductionMode: 'DAILY_RATE' | 'FIXED';
  fixedDeductionPerDay: number;
  /**
   * Working days in a month, used to turn a monthly figure into a daily one.
   * Configurable because academies differ on whether weekends count.
   */
  workingDaysPerMonth: number;
  /** Weekday numbers (0=Sun … 6=Sat) that do NOT count towards total days. */
  nonWorkingWeekdays: number[];
  /** Days of notice expected for a non-emergency request; advisory only. */
  noticeDaysExpected: number;
  /** Cap on a single request; 0 disables the check. */
  maxConsecutiveDays: number;
  /** Let staff withdraw their own PENDING request (§9.2 "Cancelled"). */
  allowSelfCancel: boolean;
  /** Auto-restore availability when the window ends (§9.7). */
  autoRestoreOnReturn: boolean;
}

export const DEFAULT_LEAVE_CONFIG: LeaveConfig = {
  staffTypes: [...STAFF_LEAVE_TYPES],
  unavailabilityTypes: [...UNAVAILABILITY_TYPES],
  // UNPAID is absent on purpose: a type literally named unpaid must never
  // default to paid, whatever else the admin changes.
  paidByDefault: ['ANNUAL', 'SICK', 'EMERGENCY', 'PERSONAL', 'TRAINING', 'CASUAL', 'MEDICAL', 'RELIGIOUS_HOLIDAY'],
  deductionMode: 'DAILY_RATE',
  fixedDeductionPerDay: 0,
  workingDaysPerMonth: 22,
  nonWorkingWeekdays: [],
  noticeDaysExpected: 7,
  maxConsecutiveDays: 30,
  allowSelfCancel: true,
  autoRestoreOnReturn: true,
};

/** A UTC midnight for the calendar day `d` falls on. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** The last instant of the calendar day `d` falls on. Leave windows are whole days. */
export function endOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

/**
 * §9.1's auto-calculated Total Days — INCLUSIVE of both ends.
 *
 * A one-day leave is "12th to 12th", which is one day, not zero. Weekdays the
 * academy does not work are skipped, so a Fri–Mon request over a closed weekend
 * is two days rather than four.
 */
export function totalLeaveDays(
  start: Date,
  end: Date,
  nonWorkingWeekdays: number[] = [],
): number {
  const from = startOfUtcDay(start);
  const to = startOfUtcDay(end);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) return 0;
  if (to < from) return 0;

  const skip = new Set(nonWorkingWeekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6));
  // Every weekday excluded would make any window zero days, which reads as a
  // free leave rather than a misconfiguration. Fall back to counting them all.
  if (skip.size >= 7) return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;

  let days = 0;
  for (const cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    if (!skip.has(cursor.getUTCDay())) days += 1;
  }
  return days;
}

/** Whether two whole-day windows share any day. Used for the overlap guard. */
export function windowsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return startOfUtcDay(aStart) <= startOfUtcDay(bEnd) && startOfUtcDay(bStart) <= startOfUtcDay(aEnd);
}

/**
 * §9.3 — what an unpaid leave costs.
 *
 * Returns 0 whenever the inputs cannot produce an honest figure (no rate, no
 * days). Deducting a guess from someone's salary is worse than deducting
 * nothing and letting the admin enter it by hand.
 */
export function unpaidDeduction(
  days: number,
  cfg: Pick<LeaveConfig, 'deductionMode' | 'fixedDeductionPerDay' | 'workingDaysPerMonth'>,
  monthlySalary?: number | null,
  dailyRate?: number | null,
): number {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return 0;

  if (cfg.deductionMode === 'FIXED') {
    const per = Number(cfg.fixedDeductionPerDay);
    return Number.isFinite(per) && per > 0 ? round2(per * d) : 0;
  }

  const explicit = Number(dailyRate);
  if (Number.isFinite(explicit) && explicit > 0) return round2(explicit * d);

  const monthly = Number(monthlySalary);
  const perMonth = Number(cfg.workingDaysPerMonth);
  if (!Number.isFinite(monthly) || monthly <= 0 || !Number.isFinite(perMonth) || perMonth <= 0) return 0;
  return round2((monthly / perMonth) * d);
}

/** Whether this type is paid unless the admin says otherwise. */
export function paidByDefault(type: string, cfg: Pick<LeaveConfig, 'paidByDefault'>): boolean {
  if (type === 'UNPAID') return false;
  return (cfg.paidByDefault ?? []).includes(type);
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
