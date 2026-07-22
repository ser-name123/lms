/*
 * The three currencies the academy sells in, and how a package's price is read
 * in one of them.
 *
 * There is deliberately no conversion anywhere in this file. Each amount is
 * typed in by the academy, so a rate moving overnight cannot change what a
 * family is billed next cycle — and a figure shown in the wrong currency is
 * worse than no figure, so a currency nobody has priced returns null rather
 * than quietly falling back to the dollar amount.
 */

export const SUPPORTED_CURRENCIES = ['USD', 'AED', 'GBP'] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = 'USD';

/**
 * What staff are paid in — always USD, wherever they live.
 *
 * Families are billed in their own currency; the people the academy pays are
 * not. Salary, hourly rate, payroll rates and every payout are one currency, so
 * payroll totals add up without a conversion nobody stored. Deliberately a
 * constant and not `currencyForCountry`: a teacher in Dubai is still paid in
 * dollars, and stamping their payout AED made the same row read as two
 * different amounts on two different screens.
 */
export const STAFF_PAY_CURRENCY: Currency = 'USD';

export function isCurrency(value: unknown): value is Currency {
  return SUPPORTED_CURRENCIES.includes(value as Currency);
}

/**
 * The currency a country is billed in. Matches ISO codes and the country
 * names this database stores, because both reach it — the public booking form
 * saves a name, other paths save a code.
 */
const BY_COUNTRY: Record<string, Currency> = {
  AE: 'AED',
  UAE: 'AED',
  'UNITED ARAB EMIRATES': 'AED',
  GB: 'GBP',
  UK: 'GBP',
  'UNITED KINGDOM': 'GBP',
  'GREAT BRITAIN': 'GBP',
};

export function currencyForCountry(country?: string | null): Currency {
  if (!country) return DEFAULT_CURRENCY;
  return BY_COUNTRY[country.trim().toUpperCase()] ?? DEFAULT_CURRENCY;
}

type PricedPackage = {
  priceUSD: unknown;
  priceAED?: unknown;
  priceGBP?: unknown;
};

/**
 * What this package costs in one currency, or null when the academy has not
 * priced it there yet. Callers must handle the null — see the note above.
 */
export function priceFor(pkg: PricedPackage | null | undefined, currency: Currency): number | null {
  if (!pkg) return null;
  const raw =
    currency === 'AED' ? pkg.priceAED : currency === 'GBP' ? pkg.priceGBP : pkg.priceUSD;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Every currency this package is sellable in, for a "not priced yet" warning. */
export function missingCurrencies(pkg: PricedPackage): Currency[] {
  return SUPPORTED_CURRENCIES.filter((c) => priceFor(pkg, c) == null);
}

type PricedComponent = {
  amountUSD: unknown;
  amountAED?: unknown;
  amountGBP?: unknown;
};

/**
 * The same rule for a fee plan's line items. Separate from `priceFor` only
 * because the column names differ — the behaviour, including returning null
 * rather than substituting the dollar figure, is deliberately identical.
 */
export function amountFor(
  component: PricedComponent | null | undefined,
  currency: Currency,
): number | null {
  if (!component) return null;
  const raw =
    currency === 'AED'
      ? component.amountAED
      : currency === 'GBP'
        ? component.amountGBP
        : component.amountUSD;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
