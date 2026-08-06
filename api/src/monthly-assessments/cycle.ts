/*
 * Which billing cycle an assessment belongs to.
 *
 * A student's period is their 28-day SUBSCRIPTION cycle, anchored on
 * `actualCycleStartDate` (set at first payment, never backdated). Cycles step
 * forward in 28-day blocks from there.
 *
 * Two wrinkles this has to survive:
 *
 *  1. A break EXTENDS `renewalDate` past `anchor + n*28` — billing is postponed,
 *     not lost. So the live cycle's end is `max(computed end, renewalDate)`
 *     rather than the arithmetic alone; otherwise a paused student would be
 *     assessed on a cycle they were not actually taught in.
 *  2. Plenty of students predate the subscription module or were created by
 *     hand and have no `actualCycleStartDate` at all. Rather than making them
 *     un-assessable, they fall back to calendar months — the same period a
 *     human would assume from the phrase "monthly assessment".
 */

import { periodLabelFor } from '../finance/finance.config';

export const CYCLE_DAYS = 28;

export interface Cycle {
  start: Date;
  /** Exclusive. */
  end: Date;
  index: number;
  label: string;
  /** False when derived from calendar months because no subscription anchor exists. */
  fromSubscription: boolean;
}

export interface CycleAnchor {
  actualCycleStartDate?: Date | string | null;
  renewalDate?: Date | string | null;
  /** Fallback anchor when the subscription never activated (enrolment start). */
  fallbackStart?: Date | string | null;
}

function addDaysUtc(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Label a cycle by the month it mostly falls in.
 *
 * A 28-day window straddles two months more often than not, so labelling it by
 * its start date puts a cycle running 28 Jun – 25 Jul under "June" when every
 * class in it but one happened in July. Using the midpoint puts it where a
 * human would.
 */
export function labelForCycle(start: Date, end: Date): string {
  const mid = new Date((start.getTime() + end.getTime()) / 2);
  return periodLabelFor(mid);
}

/** Every cycle boundary from the anchor up to (and including) the one holding `at`. */
function cyclesUpTo(anchorStart: Date, renewalDate: Date | null, at: Date): Cycle[] {
  const out: Cycle[] = [];
  let start = startOfUtcDay(anchorStart);
  let index = 0;
  // A hard ceiling so a corrupt anchor (year 1970) cannot spin forever.
  const MAX = 400;
  while (out.length < MAX) {
    const arithmeticEnd = addDaysUtc(start, CYCLE_DAYS);
    /*
     * A break extends the cycle, so the window it is live for has to be judged
     * against the EXTENDED end, not the arithmetic one.
     *
     * Testing `at < arithmeticEnd` made the extension evaporate on the very day
     * it was meant to be holding: a student paused until 12 Feb read as
     * "1 Jan – 12 Feb" on 28 Jan and as a finished "1 Jan – 29 Jan" on 29 Jan,
     * so the teacher was asked to assess a cycle that had not ended and the
     * student was still on break for.
     */
    const extendedEnd =
      renewalDate && renewalDate > arithmeticEnd ? startOfUtcDay(renewalDate) : arithmeticEnd;
    const isLive = at >= start && at < extendedEnd;
    let end = isLive ? extendedEnd : arithmeticEnd;
    out.push({ start, end, index, label: labelForCycle(start, end), fromSubscription: true });
    if (at < end) break;
    start = end;
    index += 1;
  }
  return out;
}

/** Calendar-month cycles, used when a student has no subscription anchor. */
function calendarCycle(at: Date, offsetMonths = 0): Cycle {
  const base = new Date(
    Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + offsetMonths, 1),
  );
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1));
  return {
    start: base,
    end,
    index: base.getUTCFullYear() * 12 + base.getUTCMonth(),
    label: periodLabelFor(base),
    fromSubscription: false,
  };
}

function anchorOf(a: CycleAnchor): Date | null {
  const raw = a.actualCycleStartDate ?? a.fallbackStart ?? null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/** The cycle that contains `at` — the one currently being taught. */
export function currentCycle(a: CycleAnchor, at: Date = new Date()): Cycle {
  const anchor = anchorOf(a);
  if (!anchor || anchor > at) return calendarCycle(at);
  const renewal = a.renewalDate ? new Date(a.renewalDate) : null;
  const all = cyclesUpTo(anchor, renewal && !isNaN(renewal.getTime()) ? renewal : null, at);
  return all[all.length - 1];
}

/**
 * The cycle an assessment is being raised for: the most recent one that has
 * FINISHED. Assessment happens at the end of a cycle, so the live cycle is not
 * assessable — until it ends there is nothing complete to grade.
 *
 * Returns null when no cycle has finished yet (a student in their first month).
 */
export function assessableCycle(a: CycleAnchor, at: Date = new Date()): Cycle | null {
  const anchor = anchorOf(a);
  if (!anchor || anchor > at) {
    const prev = calendarCycle(at, -1);
    return prev.end <= at ? prev : null;
  }
  const renewal = a.renewalDate ? new Date(a.renewalDate) : null;
  const all = cyclesUpTo(anchor, renewal && !isNaN(renewal.getTime()) ? renewal : null, at);
  const live = all[all.length - 1];
  // The live cycle counts as assessable the moment it ends.
  if (live.end <= at) return live;
  return all.length >= 2 ? all[all.length - 2] : null;
}

/** The cycle whose start matches `start`, rebuilt for history/report views. */
export function cycleAt(a: CycleAnchor, start: Date): Cycle {
  const anchor = anchorOf(a);
  if (!anchor) {
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    return {
      start,
      end,
      index: start.getUTCFullYear() * 12 + start.getUTCMonth(),
      label: periodLabelFor(start),
      fromSubscription: false,
    };
  }
  const end = addDaysUtc(startOfUtcDay(start), CYCLE_DAYS);
  const days = Math.round((startOfUtcDay(start).getTime() - startOfUtcDay(anchor).getTime()) / 86_400_000);
  return {
    start: startOfUtcDay(start),
    end,
    index: Math.max(0, Math.round(days / CYCLE_DAYS)),
    label: labelForCycle(startOfUtcDay(start), end),
    fromSubscription: true,
  };
}

/**
 * Days of the cycle the student was actually enrolled for.
 *
 * This is what the spec's "minimum 15 days must be completed for a new student"
 * measures: a student who joined three days before the cycle closed has nothing
 * meaningful to grade, however long the cycle itself was.
 */
export function enrolledDaysInCycle(
  cycle: Cycle,
  enrolledFrom: Date | string | null | undefined,
): number {
  const from = enrolledFrom ? new Date(enrolledFrom) : null;
  const start = from && !isNaN(from.getTime()) && from > cycle.start ? from : cycle.start;
  const ms = cycle.end.getTime() - start.getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

/** When the teacher's assessment for this cycle is due. */
export function dueDateFor(cycle: Cycle, dueDaysAfterCycleEnd: number): Date {
  return addDaysUtc(cycle.end, Math.max(0, dueDaysAfterCycleEnd));
}
