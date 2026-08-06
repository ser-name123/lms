/*
 * Billing-cycle arithmetic — which 28-day window an assessment belongs to.
 *
 * Every case here has a consequence somebody would complain about: a cycle
 * labelled with the wrong month, a paused student assessed on weeks they were
 * not taught, or a three-day-old student judged against the 15-day rule.
 *
 * Dates are pinned explicitly; nothing reads the clock.
 */

import {
  CYCLE_DAYS,
  assessableCycle,
  currentCycle,
  cycleAt,
  dueDateFor,
  enrolledDaysInCycle,
  labelForCycle,
} from './cycle';

const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);
const day = (d: Date) => d.toISOString().slice(0, 10);

describe('the cycle length', () => {
  it('is 28 days', () => {
    expect(CYCLE_DAYS).toBe(28);
  });
});

describe('currentCycle — anchored on a subscription', () => {
  const anchor = { actualCycleStartDate: utc('2026-01-01') };

  it('is the window containing the date', () => {
    const c = currentCycle(anchor, utc('2026-01-10'));
    expect(day(c.start)).toBe('2026-01-01');
    expect(day(c.end)).toBe('2026-01-29');
    expect(c.index).toBe(0);
    expect(c.fromSubscription).toBe(true);
  });

  it('steps forward in 28-day blocks', () => {
    expect(day(currentCycle(anchor, utc('2026-01-29')).start)).toBe('2026-01-29');
    expect(currentCycle(anchor, utc('2026-01-29')).index).toBe(1);
    expect(day(currentCycle(anchor, utc('2026-03-01')).start)).toBe('2026-02-26');
    expect(currentCycle(anchor, utc('2026-03-01')).index).toBe(2);
  });

  it('treats the end as exclusive, so a boundary day starts the next cycle', () => {
    expect(currentCycle(anchor, utc('2026-01-28')).index).toBe(0);
    expect(currentCycle(anchor, utc('2026-01-29')).index).toBe(1);
  });

  /*
   * A break postpones billing rather than cancelling it, so `renewalDate` moves
   * past the arithmetic end. Without honouring it, the paused weeks would fall
   * into the NEXT cycle and a student would be assessed on a period they were
   * not taught in.
   */
  it('stretches the live cycle to a renewalDate pushed out by a break', () => {
    const paused = { actualCycleStartDate: utc('2026-01-01'), renewalDate: utc('2026-02-12') };
    const c = currentCycle(paused, utc('2026-01-20'));
    expect(day(c.start)).toBe('2026-01-01');
    expect(day(c.end)).toBe('2026-02-12');
  });

  it('ignores a renewalDate that does not extend anything', () => {
    const normal = { actualCycleStartDate: utc('2026-01-01'), renewalDate: utc('2026-01-29') };
    expect(day(currentCycle(normal, utc('2026-01-10')).end)).toBe('2026-01-29');
  });

  /*
   * A long break does not advance the cycle counter. The student has been
   * billed once, so they are still in cycle 0 — it has simply been held open.
   * Counting the paused weeks as further cycles would invent periods nobody
   * paid for and nobody was taught in.
   */
  it('holds one cycle open across a long break instead of advancing the index', () => {
    const paused = { actualCycleStartDate: utc('2026-01-01'), renewalDate: utc('2026-04-01') };
    const c = currentCycle(paused, utc('2026-03-05'));
    expect(day(c.start)).toBe('2026-01-01');
    expect(day(c.end)).toBe('2026-04-01');
    expect(c.index).toBe(0);
  });

  it('survives a corrupt anchor without spinning forever', () => {
    const c = currentCycle({ actualCycleStartDate: utc('1970-01-01') }, utc('2026-01-01'));
    expect(c).toBeDefined();
    expect(c.start).toBeInstanceOf(Date);
  });
});

describe('currentCycle — no subscription anchor', () => {
  /*
   * Students predating the subscription module have no anchor. Making them
   * un-assessable would quietly exclude them from every report, so they fall
   * back to calendar months.
   */
  it('falls back to the calendar month', () => {
    const c = currentCycle({}, utc('2026-07-15'));
    expect(day(c.start)).toBe('2026-07-01');
    expect(day(c.end)).toBe('2026-08-01');
    expect(c.fromSubscription).toBe(false);
    expect(c.label).toBe('July 2026');
  });

  it('uses the enrolment start when the subscription never activated', () => {
    const c = currentCycle({ fallbackStart: utc('2026-01-01') }, utc('2026-01-10'));
    expect(c.fromSubscription).toBe(true);
    expect(day(c.start)).toBe('2026-01-01');
  });

  it('falls back when the anchor is in the future or unparseable', () => {
    expect(currentCycle({ actualCycleStartDate: utc('2027-01-01') }, utc('2026-07-15')).fromSubscription).toBe(false);
    expect(currentCycle({ actualCycleStartDate: 'not a date' }, utc('2026-07-15')).fromSubscription).toBe(false);
  });
});

describe('assessableCycle', () => {
  const anchor = { actualCycleStartDate: utc('2026-01-01') };

  /*
   * Assessment happens at the END of a cycle. Grading the live one would judge
   * a student on weeks that have not been taught yet.
   */
  it('is null while the very first cycle is still running', () => {
    expect(assessableCycle(anchor, utc('2026-01-15'))).toBeNull();
  });

  it('becomes assessable the moment the cycle ends', () => {
    const c = assessableCycle(anchor, utc('2026-01-29'));
    expect(c).not.toBeNull();
    expect(day(c!.start)).toBe('2026-01-01');
    expect(day(c!.end)).toBe('2026-01-29');
  });

  it('is the most recent FINISHED cycle, not the live one', () => {
    const c = assessableCycle(anchor, utc('2026-02-10'));
    expect(day(c!.start)).toBe('2026-01-01');
    expect(c!.index).toBe(0);
  });

  it('moves on once the next cycle finishes too', () => {
    const c = assessableCycle(anchor, utc('2026-02-26'));
    expect(day(c!.start)).toBe('2026-01-29');
    expect(c!.index).toBe(1);
  });

  /*
   * Regression: the extension used to be tested against the ARITHMETIC end, so
   * it vanished on the exact day it was meant to be holding. A student paused
   * until 12 Feb read as "1 Jan – 12 Feb, not finished" on 28 Jan and as
   * "1 Jan – 29 Jan, finished — please assess" on 29 Jan, while they were still
   * on break and had not been billed for the next cycle.
   */
  it('does not ask for an assessment while a break is still holding the cycle open', () => {
    const paused = { actualCycleStartDate: utc('2026-01-01'), renewalDate: utc('2026-02-12') };
    for (const at of ['2026-01-20', '2026-01-28', '2026-01-29', '2026-02-01', '2026-02-11']) {
      expect(assessableCycle(paused, utc(at))).toBeNull();
    }
  });

  it('keeps the stretched cycle live right up to the extended end', () => {
    const paused = { actualCycleStartDate: utc('2026-01-01'), renewalDate: utc('2026-02-12') };
    for (const at of ['2026-01-28', '2026-01-29', '2026-02-11']) {
      const c = currentCycle(paused, utc(at));
      expect(`${at}:${day(c.start)}→${day(c.end)}`).toBe(`${at}:2026-01-01→2026-02-12`);
      expect(c.index).toBe(0);
    }
  });

  it('becomes assessable once the extended cycle actually ends', () => {
    const paused = { actualCycleStartDate: utc('2026-01-01'), renewalDate: utc('2026-02-12') };
    const c = assessableCycle(paused, utc('2026-02-12'));
    expect(c).not.toBeNull();
    expect(day(c!.start)).toBe('2026-01-01');
  });

  /*
   * The assessment row is keyed `@@unique([studentId, courseId, cycleStart])`,
   * so a cycle START that moved depending on when it was asked for would let one
   * period be assessed twice. Ends may stretch; starts must not drift.
   */
  it('reports a stable cycle start whenever it is asked', () => {
    const paused = { actualCycleStartDate: utc('2026-01-01'), renewalDate: utc('2026-02-12') };
    const starts = ['2026-01-02', '2026-01-20', '2026-01-28', '2026-01-29', '2026-02-11'].map((at) =>
      day(currentCycle(paused, utc(at)).start),
    );
    expect(new Set(starts).size).toBe(1);
  });

  it('on the calendar fallback, offers last month once it is over', () => {
    const c = assessableCycle({}, utc('2026-07-15'));
    expect(day(c!.start)).toBe('2026-06-01');
    expect(c!.label).toBe('June 2026');
  });
});

describe('labelForCycle', () => {
  /*
   * A 28-day window straddles two months more often than not. Labelling by the
   * start date files a 28 Jun – 25 Jul cycle under "June" when all but one of
   * its classes happened in July, which is what a family would dispute.
   */
  it('labels a straddling cycle by the month it mostly falls in', () => {
    expect(labelForCycle(utc('2026-06-28'), utc('2026-07-26'))).toBe('July 2026');
  });

  it('labels a cycle wholly inside a month with that month', () => {
    expect(labelForCycle(utc('2026-07-01'), utc('2026-07-29'))).toBe('July 2026');
  });

  it('rolls the year over correctly', () => {
    expect(labelForCycle(utc('2025-12-20'), utc('2026-01-17'))).toBe('January 2026');
  });
});

describe('cycleAt — rebuilding a historical cycle', () => {
  const anchor = { actualCycleStartDate: utc('2026-01-01') };

  it('reconstructs the window and its index from the start date', () => {
    const c = cycleAt(anchor, utc('2026-01-29'));
    expect(day(c.start)).toBe('2026-01-29');
    expect(day(c.end)).toBe('2026-02-26');
    expect(c.index).toBe(1);
    expect(c.fromSubscription).toBe(true);
  });

  it('agrees with currentCycle for the same window', () => {
    const live = currentCycle(anchor, utc('2026-02-10'));
    const rebuilt = cycleAt(anchor, live.start);
    expect(day(rebuilt.start)).toBe(day(live.start));
    expect(rebuilt.index).toBe(live.index);
    expect(rebuilt.label).toBe(live.label);
  });

  it('rebuilds a calendar month when there is no anchor', () => {
    const c = cycleAt({}, utc('2026-07-01'));
    expect(day(c.end)).toBe('2026-08-01');
    expect(c.fromSubscription).toBe(false);
    expect(c.label).toBe('July 2026');
  });
});

describe('enrolledDaysInCycle — the spec’s 15-day rule', () => {
  const cycle = currentCycle({ actualCycleStartDate: utc('2026-01-01') }, utc('2026-01-10'));

  it('is the whole cycle for a student enrolled before it started', () => {
    expect(enrolledDaysInCycle(cycle, utc('2025-12-01'))).toBe(28);
  });

  it('counts only from the day the student joined', () => {
    expect(enrolledDaysInCycle(cycle, utc('2026-01-15'))).toBe(14);
    expect(enrolledDaysInCycle(cycle, utc('2026-01-14'))).toBe(15);
  });

  /*
   * The boundary the rule turns on: 14 days blocks an assessment, 15 allows it.
   * An off-by-one here either lets a three-week-old student be graded or blocks
   * one who has been there almost the whole cycle.
   */
  it('places the 15-day boundary where the spec does', () => {
    const MIN = 15;
    expect(enrolledDaysInCycle(cycle, utc('2026-01-14')) >= MIN).toBe(true);
    expect(enrolledDaysInCycle(cycle, utc('2026-01-15')) >= MIN).toBe(false);
  });

  it('is zero for a student who joined after the cycle closed', () => {
    expect(enrolledDaysInCycle(cycle, utc('2026-03-01'))).toBe(0);
  });

  it('assumes the full cycle when no enrolment date is known', () => {
    expect(enrolledDaysInCycle(cycle, null)).toBe(28);
    expect(enrolledDaysInCycle(cycle, undefined)).toBe(28);
    expect(enrolledDaysInCycle(cycle, 'nonsense')).toBe(28);
  });
});

describe('dueDateFor', () => {
  const cycle = currentCycle({ actualCycleStartDate: utc('2026-01-01') }, utc('2026-01-10'));

  it('is the configured number of days after the cycle ends', () => {
    expect(day(dueDateFor(cycle, 5))).toBe('2026-02-03');
    expect(day(dueDateFor(cycle, 0))).toBe('2026-01-29');
  });

  it('never lands before the cycle ends, even on a negative setting', () => {
    expect(day(dueDateFor(cycle, -10))).toBe('2026-01-29');
  });
});
