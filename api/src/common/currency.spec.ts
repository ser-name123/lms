/*
 * Which currency a family is billed in, and how a price is read in it.
 *
 * The invariant worth protecting: an unpriced currency reads as null, never as
 * the dollar figure. A substituted number here is a family charged the wrong
 * amount in a currency nobody checked.
 */

import {
  amountFor,
  currencyForCountry,
  isCurrency,
  missingCurrencies,
  priceFor,
  DEFAULT_CURRENCY,
  STAFF_PAY_CURRENCY,
  SUPPORTED_CURRENCIES,
} from './currency';

describe('isCurrency', () => {
  it('accepts exactly the three supported codes', () => {
    expect(SUPPORTED_CURRENCIES).toEqual(['USD', 'AED', 'GBP']);
    for (const c of SUPPORTED_CURRENCIES) expect(isCurrency(c)).toBe(true);
  });

  it('rejects anything else, including lowercase and junk', () => {
    expect(isCurrency('usd')).toBe(false);
    expect(isCurrency('EUR')).toBe(false);
    expect(isCurrency('')).toBe(false);
    expect(isCurrency(null)).toBe(false);
    expect(isCurrency(undefined)).toBe(false);
    expect(isCurrency(42)).toBe(false);
  });
});

describe('currencyForCountry', () => {
  it('bills the Gulf in AED', () => {
    for (const c of ['AE', 'SA', 'KW', 'QA', 'OM', 'BH']) {
      expect(currencyForCountry(c)).toBe('AED');
    }
  });

  it('bills the UK and Europe in GBP', () => {
    for (const c of ['GB', 'IE', 'FR', 'DE', 'ES', 'IT', 'NL', 'SE', 'PL', 'CH']) {
      expect(currencyForCountry(c)).toBe('GBP');
    }
  });

  it('falls through to USD for the USA and everywhere unlisted', () => {
    expect(currencyForCountry('US')).toBe('USD');
    expect(currencyForCountry('IN')).toBe('USD');
    expect(currencyForCountry('AU')).toBe('USD');
    expect(currencyForCountry('ZZ')).toBe('USD');
  });

  /*
   * Both spellings genuinely reach this: the public booking form saves a country
   * NAME, other paths save the ISO code. A lookup keyed on only one of them
   * silently bills half the customers in dollars.
   */
  it('resolves the stored country name as well as the ISO code', () => {
    expect(currencyForCountry('United Arab Emirates')).toBe('AED');
    expect(currencyForCountry('Saudi Arabia')).toBe('AED');
    expect(currencyForCountry('United Kingdom')).toBe('GBP');
    expect(currencyForCountry('Germany')).toBe('GBP');
  });

  it('is insensitive to case and stray whitespace', () => {
    expect(currencyForCountry('  united kingdom  ')).toBe('GBP');
    expect(currencyForCountry('ae')).toBe('AED');
  });

  it('defaults when the country is unknown or absent', () => {
    expect(currencyForCountry(null)).toBe(DEFAULT_CURRENCY);
    expect(currencyForCountry(undefined)).toBe(DEFAULT_CURRENCY);
    expect(currencyForCountry('')).toBe(DEFAULT_CURRENCY);
  });

  /*
   * Deliberately asserted: staff pay does NOT follow the family's currency. A
   * teacher in Dubai is paid in dollars, and tying payout currency to country
   * once made one payout read as two different amounts on two screens.
   */
  it('does not govern staff pay, which is always USD', () => {
    expect(STAFF_PAY_CURRENCY).toBe('USD');
    expect(currencyForCountry('AE')).not.toBe(STAFF_PAY_CURRENCY);
  });
});

describe('priceFor', () => {
  const pkg = { priceUSD: 50, priceAED: 183.5, priceGBP: '40' };

  it('reads the column for the currency asked for', () => {
    expect(priceFor(pkg, 'USD')).toBe(50);
    expect(priceFor(pkg, 'AED')).toBe(183.5);
  });

  it('accepts a Prisma Decimal arriving as a string', () => {
    expect(priceFor(pkg, 'GBP')).toBe(40);
  });

  it('returns null instead of substituting the dollar price', () => {
    const usdOnly = { priceUSD: 50 };
    expect(priceFor(usdOnly, 'AED')).toBeNull();
    expect(priceFor(usdOnly, 'GBP')).toBeNull();
    expect(priceFor(usdOnly, 'USD')).toBe(50);
  });

  it('treats empty string and unparseable values as unpriced', () => {
    expect(priceFor({ priceUSD: 50, priceAED: '' }, 'AED')).toBeNull();
    expect(priceFor({ priceUSD: 50, priceGBP: 'free' }, 'GBP')).toBeNull();
  });

  it('treats a genuine zero as a price', () => {
    expect(priceFor({ priceUSD: 0 }, 'USD')).toBe(0);
  });

  it('returns null for no package', () => {
    expect(priceFor(null, 'USD')).toBeNull();
    expect(priceFor(undefined, 'USD')).toBeNull();
  });
});

describe('missingCurrencies', () => {
  it('names every currency the package cannot be sold in', () => {
    expect(missingCurrencies({ priceUSD: 50 })).toEqual(['AED', 'GBP']);
    expect(missingCurrencies({ priceUSD: 50, priceAED: 183, priceGBP: 40 })).toEqual([]);
    expect(missingCurrencies({ priceUSD: null, priceAED: 183 })).toEqual(['USD', 'GBP']);
  });
});

describe('amountFor', () => {
  // Same rule, different column names — asserted separately so the two cannot
  // drift apart unnoticed.
  const component = { amountUSD: 25, amountAED: 91.75, amountGBP: '20' };

  it('mirrors priceFor exactly', () => {
    expect(amountFor(component, 'USD')).toBe(25);
    expect(amountFor(component, 'AED')).toBe(91.75);
    expect(amountFor(component, 'GBP')).toBe(20);
    expect(amountFor({ amountUSD: 25 }, 'AED')).toBeNull();
    expect(amountFor(null, 'USD')).toBeNull();
    expect(amountFor({ amountUSD: 0 }, 'USD')).toBe(0);
  });
});
