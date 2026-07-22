/*
 * The three currencies the academy sells in, and which one a visitor sees.
 *
 * A visitor in the UAE is quoted in dirhams, one in the UK in pounds, and
 * everyone else in dollars. The country comes from `detectCountry()` — the
 * same time-zone-then-locale signal the trial booking form already uses to
 * pre-fill a country, so the site cannot decide a visitor is in two places at
 * once.
 *
 * There is no conversion here and none on the server. Each amount is typed in
 * by the academy, so nothing a family is quoted moves with an exchange rate.
 */
import { detectCountry } from "./countries";

export const SUPPORTED_CURRENCIES = ["USD", "AED", "GBP"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

export const DEFAULT_CURRENCY: Currency = "USD";

export function isCurrency(value: unknown): value is Currency {
  return SUPPORTED_CURRENCIES.includes(value as Currency);
}

const BY_ISO: Record<string, Currency> = { AE: "AED", GB: "GBP" };

/** The currency an ISO-2 country code is quoted in. */
export function currencyForIso(iso?: string | null): Currency {
  if (!iso) return DEFAULT_CURRENCY;
  return BY_ISO[iso.trim().toUpperCase()] ?? DEFAULT_CURRENCY;
}

/**
 * What to quote this visitor in. Client-side only — on the server there is no
 * visitor yet, so it returns the default and the first client render corrects
 * it. Used for people who are not signed in; a signed-in student is quoted in
 * the currency stored on their account instead, which never moves with where
 * they happen to open the site.
 */
export function detectCurrency(): Currency {
  if (typeof window === "undefined") return DEFAULT_CURRENCY;
  return currencyForIso(detectCountry()?.iso2);
}

/**
 * What a fee-plan component costs in one currency, or null when the academy
 * has not priced it there. Mirrors the server's `amountFor`, including
 * returning null rather than falling back to the dollar figure.
 */
export function amountIn(
  component: { amountUSD: number; amountAED: number | null; amountGBP: number | null } | null | undefined,
  currency: Currency,
): number | null {
  if (!component) return null;
  const raw =
    currency === "AED" ? component.amountAED : currency === "GBP" ? component.amountGBP : component.amountUSD;
  return raw == null || !Number.isFinite(Number(raw)) ? null : Number(raw);
}

const SYMBOLS: Record<Currency, string> = { USD: "$", AED: "AED ", GBP: "£" };

/**
 * An amount with its currency attached. Never called with a bare number and an
 * assumed currency — that is how a dirham figure ends up wearing a dollar sign.
 * `null` means the academy has not priced this in that currency, and says so
 * rather than printing a zero.
 */
export function money(
  amount: number | null | undefined,
  currency: Currency = DEFAULT_CURRENCY,
  opts: { emptyText?: string } = {},
): string {
  if (amount == null || !Number.isFinite(Number(amount))) {
    return opts.emptyText ?? "Not priced";
  }
  const n = Number(amount);
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? "−" : ""}${SYMBOLS[currency] ?? ""}${body}`;
}
