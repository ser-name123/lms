import {
  DEFAULT_LEAVE_CONFIG, endOfUtcDay, paidByDefault, startOfUtcDay,
  totalLeaveDays, unpaidDeduction, windowsOverlap,
} from './leave.config';

const d = (iso: string) => new Date(iso);

describe('totalLeaveDays (§9.1 auto-calculated Total Days)', () => {
  it('counts a single-day leave as one day, not zero', () => {
    // The whole point of the inclusive count: "12th to 12th" is a day off.
    expect(totalLeaveDays(d('2026-03-12T00:00:00Z'), d('2026-03-12T00:00:00Z'))).toBe(1);
  });

  it('includes both ends', () => {
    expect(totalLeaveDays(d('2026-03-12T00:00:00Z'), d('2026-03-14T00:00:00Z'))).toBe(3);
  });

  it('ignores the time of day on either end', () => {
    // A picker that sends 00:00 for the start and 23:59 for the end must not
    // produce a different answer from one that sends midnight for both.
    expect(totalLeaveDays(d('2026-03-12T23:59:00Z'), d('2026-03-14T00:00:00Z'))).toBe(3);
    expect(totalLeaveDays(d('2026-03-12T00:00:00Z'), d('2026-03-14T23:59:59Z'))).toBe(3);
  });

  it('returns 0 when the end is before the start', () => {
    expect(totalLeaveDays(d('2026-03-14T00:00:00Z'), d('2026-03-12T00:00:00Z'))).toBe(0);
  });

  it('skips non-working weekdays', () => {
    // Fri 13 → Mon 16 March 2026, with Sat+Sun closed, is two working days.
    expect(totalLeaveDays(d('2026-03-13T00:00:00Z'), d('2026-03-16T00:00:00Z'), [0, 6])).toBe(2);
  });

  it('counts every day when the whole week is marked non-working', () => {
    // A config that excludes all seven days is a misconfiguration, and reading
    // it literally would grant an unlimited free leave.
    expect(totalLeaveDays(d('2026-03-12T00:00:00Z'), d('2026-03-14T00:00:00Z'), [0, 1, 2, 3, 4, 5, 6])).toBe(3);
  });

  it('ignores out-of-range weekday numbers rather than dropping days', () => {
    expect(totalLeaveDays(d('2026-03-12T00:00:00Z'), d('2026-03-14T00:00:00Z'), [9, -1])).toBe(3);
  });

  it('spans a month boundary', () => {
    expect(totalLeaveDays(d('2026-03-30T00:00:00Z'), d('2026-04-02T00:00:00Z'))).toBe(4);
  });

  it('spans a leap day', () => {
    expect(totalLeaveDays(d('2028-02-27T00:00:00Z'), d('2028-03-01T00:00:00Z'))).toBe(4);
  });

  it('returns 0 for an unparseable date rather than a wild number', () => {
    expect(totalLeaveDays(new Date('nonsense'), d('2026-03-14T00:00:00Z'))).toBe(0);
  });
});

describe('windowsOverlap (double-booking guard)', () => {
  it('sees a shared day', () => {
    expect(windowsOverlap(
      d('2026-03-10T00:00:00Z'), d('2026-03-14T00:00:00Z'),
      d('2026-03-14T00:00:00Z'), d('2026-03-18T00:00:00Z'),
    )).toBe(true);
  });

  it('treats touching-but-not-shared days as no overlap', () => {
    expect(windowsOverlap(
      d('2026-03-10T00:00:00Z'), d('2026-03-13T00:00:00Z'),
      d('2026-03-14T00:00:00Z'), d('2026-03-18T00:00:00Z'),
    )).toBe(false);
  });

  it('sees full containment either way round', () => {
    const outer = [d('2026-03-01T00:00:00Z'), d('2026-03-31T00:00:00Z')] as const;
    const inner = [d('2026-03-10T00:00:00Z'), d('2026-03-12T00:00:00Z')] as const;
    expect(windowsOverlap(outer[0], outer[1], inner[0], inner[1])).toBe(true);
    expect(windowsOverlap(inner[0], inner[1], outer[0], outer[1])).toBe(true);
  });

  it('is not fooled by the time of day on the boundary', () => {
    // 14th 23:59 and 14th 00:00 are the same day; a raw instant compare would
    // call this no overlap and let someone book leave twice.
    expect(windowsOverlap(
      d('2026-03-10T00:00:00Z'), d('2026-03-14T23:59:59Z'),
      d('2026-03-14T00:00:00Z'), d('2026-03-18T00:00:00Z'),
    )).toBe(true);
  });
});

describe('unpaidDeduction (§9.3)', () => {
  const cfg = { ...DEFAULT_LEAVE_CONFIG };

  it('uses the teacher daily rate when there is one', () => {
    expect(unpaidDeduction(3, cfg, null, 20)).toBe(60);
  });

  it('derives a daily rate from the monthly salary when there is none', () => {
    // 2200 / 22 working days = 100/day.
    expect(unpaidDeduction(2, cfg, 2200, null)).toBe(200);
  });

  it('prefers an explicit daily rate over the derived one', () => {
    expect(unpaidDeduction(1, cfg, 2200, 25)).toBe(25);
  });

  it('uses the fixed per-day amount in FIXED mode, ignoring salary', () => {
    expect(unpaidDeduction(4, { ...cfg, deductionMode: 'FIXED', fixedDeductionPerDay: 15 }, 9999, 999)).toBe(60);
  });

  it('deducts nothing when there is no rate to work from', () => {
    // Deducting a guess from someone's pay is worse than deducting nothing and
    // making the admin type it in.
    expect(unpaidDeduction(3, cfg, null, null)).toBe(0);
    expect(unpaidDeduction(3, cfg, 0, 0)).toBe(0);
  });

  it('deducts nothing in FIXED mode with no amount configured', () => {
    expect(unpaidDeduction(3, { ...cfg, deductionMode: 'FIXED', fixedDeductionPerDay: 0 }, 2200, 20)).toBe(0);
  });

  it('never returns a negative or non-finite figure', () => {
    expect(unpaidDeduction(0, cfg, 2200, 20)).toBe(0);
    expect(unpaidDeduction(-2, cfg, 2200, 20)).toBe(0);
    expect(unpaidDeduction(Number.NaN, cfg, 2200, 20)).toBe(0);
    expect(unpaidDeduction(Number.POSITIVE_INFINITY, cfg, 2200, 20)).toBe(0);
  });

  it('guards against a broken workingDaysPerMonth instead of dividing by zero', () => {
    expect(unpaidDeduction(3, { ...cfg, workingDaysPerMonth: 0 }, 2200, null)).toBe(0);
  });

  it('rounds to whole cents', () => {
    // 1000 / 3 days = 333.333…; money must not carry a repeating fraction.
    expect(unpaidDeduction(1, { ...cfg, workingDaysPerMonth: 3 }, 1000, null)).toBe(333.33);
  });
});

describe('paidByDefault', () => {
  it('never defaults a type literally called UNPAID to paid', () => {
    // Even if an admin ticks it in the config by mistake.
    expect(paidByDefault('UNPAID', { paidByDefault: ['UNPAID', 'SICK'] })).toBe(false);
  });

  it('follows the configured list otherwise', () => {
    expect(paidByDefault('SICK', DEFAULT_LEAVE_CONFIG)).toBe(true);
    expect(paidByDefault('SCHEDULE_CONFLICT', DEFAULT_LEAVE_CONFIG)).toBe(false);
  });

  it('survives a config with no list at all', () => {
    expect(paidByDefault('SICK', {} as never)).toBe(false);
  });
});

describe('day boundaries', () => {
  it('startOfUtcDay strips the time', () => {
    expect(startOfUtcDay(d('2026-03-12T17:45:12Z')).toISOString()).toBe('2026-03-12T00:00:00.000Z');
  });

  it('endOfUtcDay reaches the last millisecond, so the final day is inside the window', () => {
    expect(endOfUtcDay(d('2026-03-12T00:00:00Z')).toISOString()).toBe('2026-03-12T23:59:59.999Z');
  });
});
