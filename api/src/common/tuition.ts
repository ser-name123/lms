/*
 * How a subscription's monthly tuition is computed from a plan and the choices
 * made at enrolment. Two pricing modes, one formula each:
 *
 *   FIXED_MONTHLY (legacy Monthly Package) — the plan's flat monthly price.
 *   HOURLY        (new Hourly Subscription) — the hourly rate multiplied by how
 *                 many hours a month the chosen duration and weekly frequency add
 *                 up to: rate × (duration ÷ 60) × weeklyClasses × 4 weeks.
 *
 * Like `currency.ts`, there is no conversion here and a figure that cannot be
 * priced in the family's currency returns null rather than a substituted amount —
 * the caller shows "not priced" instead of billing in the wrong money.
 */

import { SubscriptionPricingMode } from '../generated/prisma/enums';
import { Currency } from './currency';

/** Round to 2dp the way money is stored, avoiding float drift. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

type HourlyRated = {
  hourlyRateUSD?: unknown;
  hourlyRateAED?: unknown;
  hourlyRateGBP?: unknown;
};

/**
 * A plan's hourly rate in one currency, or null when it has not been priced
 * there. Mirrors `priceFor`/`amountFor` in `currency.ts` — same null discipline,
 * different columns.
 */
export function hourlyRateFor(
  plan: HourlyRated | null | undefined,
  currency: Currency,
): number | null {
  if (!plan) return null;
  const raw =
    currency === 'AED'
      ? plan.hourlyRateAED
      : currency === 'GBP'
        ? plan.hourlyRateGBP
        : plan.hourlyRateUSD;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Hours of class a month a schedule buys: (duration ÷ 60) × weeklyClasses × 4.
 * A 60-minute class three times a week is 12 hours; a 30-minute class twice a
 * week is 4 hours — matching the package structure tables in the spec.
 */
export function monthlyHours(durationMinutes: number, weeklyClasses: number): number {
  if (!durationMinutes || !weeklyClasses) return 0;
  return round2((durationMinutes / 60) * weeklyClasses * 4);
}

/** How many classes a month a schedule holds: weeklyClasses × 4. */
export function monthlyClasses(weeklyClasses: number): number {
  return Math.max(0, Math.round((weeklyClasses || 0) * 4));
}

export type TuitionInput = {
  pricingMode: SubscriptionPricingMode;
  currency: Currency;
  // FIXED_MONTHLY
  monthlyPrice?: number | null;
  // HOURLY
  hourlyRate?: number | null;
  durationMinutes?: number | null;
  weeklyClasses?: number | null;
};

/**
 * The monthly tuition for a subscription, or null when the inputs it needs are
 * missing/unpriced. FIXED_MONTHLY returns the flat price as-is; HOURLY applies
 * the formula. Callers pass the already-resolved per-currency figure (via
 * `priceFor`/`hourlyRateFor`) so this function stays currency-agnostic.
 */
export function monthlyTuition(input: TuitionInput): number | null {
  if (input.pricingMode === 'HOURLY') {
    const rate = input.hourlyRate;
    const hours = monthlyHours(input.durationMinutes ?? 0, input.weeklyClasses ?? 0);
    if (rate == null || !Number.isFinite(rate) || hours <= 0) return null;
    return round2(rate * hours);
  }
  // FIXED_MONTHLY
  const price = input.monthlyPrice;
  if (price == null || !Number.isFinite(price)) return null;
  return round2(price);
}

/**
 * The family (sibling) discount a subscription earns. The academy grants it only
 * when a family has more than two children enrolled, and only at the percentage
 * the plan's tier carries (0 for Simple/Essential, 5% Premium, 10% Elite in the
 * spec). Returns the amount to subtract, rounded — 0 when it does not apply.
 */
export function familyDiscountAmount(
  base: number,
  familyDiscountPct: number,
  siblingCount: number,
): number {
  if (!base || base <= 0) return 0;
  if (!familyDiscountPct || familyDiscountPct <= 0) return 0;
  if (siblingCount <= 2) return 0;
  return round2((base * familyDiscountPct) / 100);
}
