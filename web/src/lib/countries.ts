/*
 * Countries with their international dial codes, plus a best-effort guess at
 * which one a visitor is in.
 *
 * The guess is deliberately local: it reads the browser's own locale and time
 * zone rather than calling an IP-geolocation service. That keeps a public form
 * from shipping every visitor's address to a third party, works offline, and
 * cannot fail or rate-limit. It is only a default — the spec requires manual
 * selection either way, and the picker is always there.
 *
 * Stored as compact "Name|ISO2|dial" rows so the full list stays readable.
 */

const ROWS = `Afghanistan|AF|93
Albania|AL|355
Algeria|DZ|213
Argentina|AR|54
Armenia|AM|374
Australia|AU|61
Austria|AT|43
Azerbaijan|AZ|994
Bahrain|BH|973
Bangladesh|BD|880
Belarus|BY|375
Belgium|BE|32
Bosnia and Herzegovina|BA|387
Brazil|BR|55
Brunei|BN|673
Bulgaria|BG|359
Cambodia|KH|855
Cameroon|CM|237
Canada|CA|1
Chad|TD|235
Chile|CL|56
China|CN|86
Colombia|CO|57
Comoros|KM|269
Croatia|HR|385
Cyprus|CY|357
Czechia|CZ|420
Denmark|DK|45
Djibouti|DJ|253
Egypt|EG|20
Eritrea|ER|291
Estonia|EE|372
Ethiopia|ET|251
Finland|FI|358
France|FR|33
Gambia|GM|220
Georgia|GE|995
Germany|DE|49
Ghana|GH|233
Greece|GR|30
Guinea|GN|224
Hong Kong|HK|852
Hungary|HU|36
Iceland|IS|354
India|IN|91
Indonesia|ID|62
Iran|IR|98
Iraq|IQ|964
Ireland|IE|353
Israel|IL|972
Italy|IT|39
Ivory Coast|CI|225
Japan|JP|81
Jordan|JO|962
Kazakhstan|KZ|7
Kenya|KE|254
Kuwait|KW|965
Kyrgyzstan|KG|996
Latvia|LV|371
Lebanon|LB|961
Libya|LY|218
Lithuania|LT|370
Luxembourg|LU|352
Malaysia|MY|60
Maldives|MV|960
Mali|ML|223
Malta|MT|356
Mauritania|MR|222
Mauritius|MU|230
Mexico|MX|52
Morocco|MA|212
Mozambique|MZ|258
Myanmar|MM|95
Nepal|NP|977
Netherlands|NL|31
New Zealand|NZ|64
Niger|NE|227
Nigeria|NG|234
North Macedonia|MK|389
Norway|NO|47
Oman|OM|968
Pakistan|PK|92
Palestine|PS|970
Philippines|PH|63
Poland|PL|48
Portugal|PT|351
Qatar|QA|974
Romania|RO|40
Russia|RU|7
Saudi Arabia|SA|966
Senegal|SN|221
Serbia|RS|381
Singapore|SG|65
Slovakia|SK|421
Slovenia|SI|386
Somalia|SO|252
South Africa|ZA|27
South Korea|KR|82
Spain|ES|34
Sri Lanka|LK|94
Sudan|SD|249
Sweden|SE|46
Switzerland|CH|41
Syria|SY|963
Taiwan|TW|886
Tajikistan|TJ|992
Tanzania|TZ|255
Thailand|TH|66
Tunisia|TN|216
Turkey|TR|90
Turkmenistan|TM|993
Uganda|UG|256
Ukraine|UA|380
United Arab Emirates|AE|971
United Kingdom|GB|44
United States|US|1
Uzbekistan|UZ|998
Vietnam|VN|84
Yemen|YE|967
Zambia|ZM|260
Zimbabwe|ZW|263`;

export interface Country {
  name: string;
  iso2: string;
  dial: string;
}

export const COUNTRIES: Country[] = ROWS.split('\n').map((row) => {
  const [name, iso2, dial] = row.split('|');
  return { name, iso2, dial: `+${dial}` };
});

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso2, c]));

/*
 * Time zones whose country the locale often gets wrong — a visitor in Dubai
 * browsing with en-GB would otherwise be defaulted to the United Kingdom.
 * Only zones that matter for this academy's audience are listed; anything else
 * falls through to the locale.
 */
const ZONE_TO_ISO: Record<string, string> = {
  'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA',
  'Asia/Qatar': 'QA',
  'Asia/Kuwait': 'KW',
  'Asia/Bahrain': 'BH',
  'Asia/Muscat': 'OM',
  'Asia/Karachi': 'PK',
  'Asia/Kolkata': 'IN',
  'Asia/Calcutta': 'IN',
  'Asia/Dhaka': 'BD',
  'Asia/Colombo': 'LK',
  'Asia/Kathmandu': 'NP',
  'Asia/Jakarta': 'ID',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Singapore': 'SG',
  'Asia/Istanbul': 'TR',
  'Europe/Istanbul': 'TR',
  'Africa/Cairo': 'EG',
  'Africa/Lagos': 'NG',
  'Africa/Nairobi': 'KE',
  'Africa/Johannesburg': 'ZA',
  'Africa/Casablanca': 'MA',
  'Europe/London': 'GB',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
};

/** The visitor's IANA zone, or "" when it cannot be read. */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/**
 * Best guess at the visitor's country. Time zone first (it reflects where they
 * are), then the locale's region (which reflects language settings and is more
 * often wrong). Returns null rather than guessing badly.
 */
export function detectCountry(): Country | null {
  if (typeof window === 'undefined') return null;

  const zone = detectTimeZone();
  const byZone = ZONE_TO_ISO[zone];
  if (byZone && BY_ISO.has(byZone)) return BY_ISO.get(byZone)!;

  try {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const region = new Intl.Locale(tag).region;
      if (region && BY_ISO.has(region)) return BY_ISO.get(region)!;
    }
  } catch {
    /* Intl.Locale is unavailable on old browsers — fall through. */
  }
  return null;
}
