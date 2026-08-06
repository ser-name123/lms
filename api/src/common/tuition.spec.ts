/*
 * Tuition arithmetic. This is the figure a family is actually billed, so the
 * cases below are the ones where being wrong costs somebody money: the hourly
 * formula, the rounding, and every path that must refuse to guess.
 */

import {
  familyDiscountAmount,
  hourlyRateFor,
  monthlyClasses,
  monthlyHours,
  monthlyTuition,
  round2,
} from './tuition';
import type { SubscriptionPricingMode } from '../generated/prisma/enums';

const HOURLY = 'HOURLY' as SubscriptionPricingMode;
const FIXED = 'FIXED_MONTHLY' as SubscriptionPricingMode;

describe('round2', () => {
  it('rounds to two places', () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(10)).toBe(10);
  });

  it('kills the float drift that naive multiplication leaves behind', () => {
    // 0.1 * 3 is 0.30000000000000004 in IEEE-754; stored as money it must not be.
    expect(round2(0.1 * 3)).toBe(0.3);
    expect(round2(19.99 * 3)).toBe(59.97);
  });

  it('keeps negatives negative', () => {
    expect(round2(-1.005)).toBeLessThan(0);
  });
});

describe('monthlyHours', () => {
  // The spec's own package table — if these drift, every hourly invoice drifts.
  it.each([
    [60, 3, 12],
    [30, 2, 4],
    [45, 2, 6],
    [60, 5, 20],
    [30, 1, 2],
    [90, 2, 12],
  ])('a %ip class %i×/week is %i hours a month', (duration, weekly, expected) => {
    expect(monthlyHours(duration, weekly)).toBe(expected);
  });

  it('is zero when either half of the schedule is missing', () => {
    expect(monthlyHours(0, 3)).toBe(0);
    expect(monthlyHours(60, 0)).toBe(0);
  });

  it('rounds an awkward duration rather than carrying float noise into money', () => {
    // 50/60 * 3 * 4 = 9.999999… — must not become the invoice line.
    expect(monthlyHours(50, 3)).toBe(10);
  });
});

describe('monthlyClasses', () => {
  it('is four weeks of the weekly count', () => {
    expect(monthlyClasses(3)).toBe(12);
    expect(monthlyClasses(1)).toBe(4);
  });

  it('never goes negative and treats missing as none', () => {
    expect(monthlyClasses(0)).toBe(0);
    expect(monthlyClasses(-2)).toBe(0);
    expect(monthlyClasses(undefined as unknown as number)).toBe(0);
  });
});

describe('hourlyRateFor', () => {
  const plan = { hourlyRateUSD: 10, hourlyRateAED: 36.7, hourlyRateGBP: '8.5' };

  it('reads the column for the requested currency', () => {
    expect(hourlyRateFor(plan, 'USD')).toBe(10);
    expect(hourlyRateFor(plan, 'AED')).toBe(36.7);
  });

  it('accepts a Prisma Decimal arriving as a string', () => {
    expect(hourlyRateFor(plan, 'GBP')).toBe(8.5);
  });

  /*
   * The null discipline is the point of this function: an unpriced currency has
   * to read as "we do not know", never as the dollar figure. Substituting would
   * bill a London family 8.50 in pounds at the dollar rate.
   */
  it('returns null for a currency the plan has not been priced in', () => {
    expect(hourlyRateFor({ hourlyRateUSD: 10 }, 'AED')).toBeNull();
    expect(hourlyRateFor({ hourlyRateUSD: 10, hourlyRateGBP: '' }, 'GBP')).toBeNull();
    expect(hourlyRateFor({ hourlyRateUSD: 10, hourlyRateAED: 'abc' }, 'AED')).toBeNull();
  });

  it('returns null for no plan at all', () => {
    expect(hourlyRateFor(null, 'USD')).toBeNull();
    expect(hourlyRateFor(undefined, 'USD')).toBeNull();
  });
});

describe('monthlyTuition — HOURLY', () => {
  it('is rate × hours', () => {
    expect(
      monthlyTuition({
        pricingMode: HOURLY,
        currency: 'USD',
        hourlyRate: 10,
        durationMinutes: 60,
        weeklyClasses: 3,
      }),
    ).toBe(120);
  });

  it('rounds the product to money', () => {
    expect(
      monthlyTuition({
        pricingMode: HOURLY,
        currency: 'USD',
        hourlyRate: 12.335,
        durationMinutes: 60,
        weeklyClasses: 1,
      }),
    ).toBe(49.34);
  });

  it('refuses rather than billing zero when the rate is missing', () => {
    expect(
      monthlyTuition({
        pricingMode: HOURLY,
        currency: 'AED',
        hourlyRate: null,
        durationMinutes: 60,
        weeklyClasses: 3,
      }),
    ).toBeNull();
  });

  it('refuses when the schedule buys no hours', () => {
    expect(
      monthlyTuition({ pricingMode: HOURLY, currency: 'USD', hourlyRate: 10, durationMinutes: 60, weeklyClasses: 0 }),
    ).toBeNull();
    expect(
      monthlyTuition({ pricingMode: HOURLY, currency: 'USD', hourlyRate: 10 }),
    ).toBeNull();
  });
});

describe('monthlyTuition — FIXED_MONTHLY', () => {
  it('is the flat price, rounded', () => {
    expect(monthlyTuition({ pricingMode: FIXED, currency: 'USD', monthlyPrice: 99.999 })).toBe(100);
    expect(monthlyTuition({ pricingMode: FIXED, currency: 'GBP', monthlyPrice: 80 })).toBe(80);
  });

  it('ignores the hourly inputs entirely', () => {
    expect(
      monthlyTuition({
        pricingMode: FIXED,
        currency: 'USD',
        monthlyPrice: 80,
        hourlyRate: 999,
        durationMinutes: 60,
        weeklyClasses: 5,
      }),
    ).toBe(80);
  });

  it('refuses when the plan has no price in this currency', () => {
    expect(monthlyTuition({ pricingMode: FIXED, currency: 'AED', monthlyPrice: null })).toBeNull();
  });

  // A free plan is a real thing; it must not be confused with an unpriced one.
  it('treats a genuine zero as a price, not as missing', () => {
    expect(monthlyTuition({ pricingMode: FIXED, currency: 'USD', monthlyPrice: 0 })).toBe(0);
  });
});

describe('familyDiscountAmount', () => {
  /*
   * "More than two children" is a strict boundary the academy set. Two siblings
   * earn nothing; the third child is what unlocks it. Off-by-one here silently
   * discounts every two-child family forever.
   */
  it('needs more than two siblings', () => {
    expect(familyDiscountAmount(100, 10, 1)).toBe(0);
    expect(familyDiscountAmount(100, 10, 2)).toBe(0);
    expect(familyDiscountAmount(100, 10, 3)).toBe(10);
    expect(familyDiscountAmount(100, 10, 4)).toBe(10);
  });

  it('applies the tier percentage', () => {
    expect(familyDiscountAmount(200, 5, 3)).toBe(10);
    expect(familyDiscountAmount(200, 10, 3)).toBe(20);
  });

  it('is nothing for a tier that carries no discount', () => {
    expect(familyDiscountAmount(200, 0, 5)).toBe(0);
  });

  it('is nothing when there is no base to discount', () => {
    expect(familyDiscountAmount(0, 10, 5)).toBe(0);
    expect(familyDiscountAmount(-50, 10, 5)).toBe(0);
  });

  it('rounds to money', () => {
    expect(familyDiscountAmount(99.99, 5, 3)).toBe(5);
    expect(familyDiscountAmount(33.33, 10, 3)).toBe(3.33);
  });
});
