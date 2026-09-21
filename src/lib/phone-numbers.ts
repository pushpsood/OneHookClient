/**
 * International phone numbers for the web client.
 *
 * A deliberate mirror of the iOS `PhoneNumbers.swift` (same country table, same rules) so a user sees
 * identical behaviour whichever surface they sign in from. Kept dependency-free: the app needs only a
 * country list, a per-country digit length, and normalisation to E.164 for Cognito/SMS.
 *
 * The problem being solved: a single free-text field asking for "+15551234567" leaves a global
 * audience guessing whether the country code is required, whether to keep the leading zero they
 * habitually dial, and how many digits the rest should be. Those three doubts are where sign-in and
 * registration get abandoned.
 */

/** E.164 caps a full international number at 15 digits, calling code included. */
export const E164_MAX_DIGITS = 15;

export interface Country {
  /** ISO 3166-1 alpha-2, e.g. `IN`. Drives the flag and the localised display name. */
  iso2: string;
  /** Calling code without `+`. Not unique — +1 and +7 are shared by several countries. */
  dialCode: number;
  /**
   * Valid national-number digit counts, excluding the calling code. Empty means "not pinned": any
   * E.164-legal length is accepted, because inventing a fixed length would reject real numbers.
   */
  nationalLengths: number[];
  /**
   * Digits a local speaker may type first that are not part of the E.164 number (the national trunk
   * prefix). Almost always '0'; null where there is none (NANP) or where it belongs to the number
   * (Italy).
   */
  trunkPrefix: string | null;
}

const c = (
  iso2: string,
  dialCode: number,
  nationalLengths: number[] = [],
  trunkPrefix: string | null = '0'
): Country => ({ iso2, dialCode, nationalLengths, trunkPrefix });

/** Every ISO country and dialable territory, matching the iOS table entry for entry. */
export const COUNTRIES: Country[] = [
  // North America (NANP)
  c('US', 1, [10], null), c('CA', 1, [10], null), c('AG', 1268, [7], null), c('AI', 1264, [7], null),
  c('AS', 1684, [7], null), c('BB', 1246, [7], null), c('BM', 1441, [7], null), c('BS', 1242, [7], null),
  c('DM', 1767, [7], null), c('DO', 1809, [7], null), c('GD', 1473, [7], null), c('GU', 1671, [7], null),
  c('JM', 1876, [7], null), c('KN', 1869, [7], null), c('KY', 1345, [7], null), c('LC', 1758, [7], null),
  c('MP', 1670, [7], null), c('MS', 1664, [7], null), c('PR', 1787, [7], null), c('SX', 1721, [7], null),
  c('TC', 1649, [7], null), c('TT', 1868, [7], null), c('VC', 1784, [7], null), c('VG', 1284, [7], null),
  c('VI', 1340, [7], null),

  // Europe
  c('AD', 376, [6, 9]), c('AL', 355, [9]), c('AT', 43), c('AX', 358), c('BA', 387, [8]),
  c('BE', 32, [9]), c('BG', 359, [9]), c('BY', 375, [9]), c('CH', 41, [9]), c('CY', 357, [8], null),
  c('CZ', 420, [9], null), c('DE', 49), c('DK', 45, [8], null), c('EE', 372, [7, 8], null),
  c('ES', 34, [9], null), c('FI', 358), c('FO', 298, [6], null), c('FR', 33, [9]), c('GB', 44, [10]),
  c('GG', 44, [10]), c('GI', 350, [8], null), c('GR', 30, [10], null), c('HR', 385, [8, 9]),
  c('HU', 36, [9]), c('IE', 353, [9]), c('IM', 44, [10]), c('IS', 354, [7], null),
  // Italy keeps its leading zero, so there is no trunk prefix to strip.
  c('IT', 39, [], null),
  c('JE', 44, [10]), c('LI', 423, [7], null), c('LT', 370, [8]), c('LU', 352, [], null),
  c('LV', 371, [8], null), c('MC', 377), c('MD', 373, [8]), c('ME', 382, [8]), c('MK', 389, [8]),
  c('MT', 356, [8], null), c('NL', 31, [9]), c('NO', 47, [8], null), c('PL', 48, [9], null),
  c('PT', 351, [9], null), c('RO', 40, [9]), c('RS', 381), c('RU', 7, [10]), c('SE', 46),
  c('SI', 386, [8]), c('SK', 421, [9]), c('SM', 378), c('UA', 380, [9]), c('VA', 39, [], null),
  c('XK', 383),

  // Asia
  c('AE', 971, [9]), c('AF', 93, [9]), c('AM', 374, [8]), c('AZ', 994, [9]), c('BD', 880, [10]),
  c('BH', 973, [8], null), c('BN', 673, [7], null), c('BT', 975, [8], null), c('CN', 86, [11]),
  c('GE', 995, [9]), c('HK', 852, [8], null), c('ID', 62), c('IL', 972, [9]), c('IN', 91, [10]),
  c('IQ', 964, [10]), c('IR', 98, [10]), c('JO', 962, [9]), c('JP', 81, [10]), c('KG', 996, [9]),
  c('KH', 855), c('KP', 850), c('KR', 82), c('KW', 965, [8], null), c('KZ', 7, [10]), c('LA', 856),
  c('LB', 961), c('LK', 94, [9]), c('MM', 95), c('MN', 976, [8]), c('MO', 853, [8], null),
  c('MV', 960, [7], null), c('MY', 60), c('NP', 977, [10]), c('OM', 968, [8], null), c('PH', 63, [10]),
  c('PK', 92, [10]), c('PS', 970, [9]), c('QA', 974, [8], null), c('SA', 966, [9]),
  c('SG', 65, [8], null), c('SY', 963, [9]), c('TH', 66, [9]), c('TJ', 992, [9]),
  c('TL', 670, [8], null), c('TM', 993, [8]), c('TR', 90, [10]), c('TW', 886, [9]), c('UZ', 998, [9]),
  c('VN', 84, [9]), c('YE', 967),

  // Oceania
  c('AU', 61, [9]), c('CK', 682, [5], null), c('FJ', 679, [7], null), c('FM', 691, [7], null),
  c('KI', 686), c('MH', 692, [7], null), c('NC', 687, [6], null), c('NF', 672),
  c('NR', 674, [], null), c('NU', 683, [], null), c('NZ', 64), c('PF', 689, [8], null),
  c('PG', 675, [8], null), c('PW', 680, [7], null), c('SB', 677, [], null), c('TO', 676, [], null),
  c('TV', 688, [], null), c('VU', 678, [], null), c('WF', 681, [], null), c('WS', 685, [], null),

  // Africa
  c('AO', 244, [9], null), c('BF', 226, [8], null), c('BI', 257, [8], null), c('BJ', 229, [8], null),
  c('BW', 267, [8], null), c('CD', 243, [9]), c('CF', 236, [8], null), c('CG', 242, [9], null),
  c('CI', 225, [10], null), c('CM', 237, [9], null), c('CV', 238, [7], null), c('DJ', 253, [8], null),
  c('DZ', 213, [9]), c('EG', 20, [10]), c('EH', 212, [9]), c('ER', 291, [7]), c('ET', 251, [9]),
  c('GA', 241), c('GH', 233, [9]), c('GM', 220, [7], null), c('GN', 224, [9], null),
  c('GQ', 240, [9], null), c('GW', 245, [9], null), c('KE', 254, [9]), c('KM', 269, [7], null),
  c('LR', 231), c('LS', 266, [8], null), c('LY', 218, [9]), c('MA', 212, [9]), c('MG', 261, [9]),
  c('ML', 223, [8], null), c('MR', 222, [8], null), c('MU', 230, [8], null), c('MW', 265),
  c('MZ', 258, [9], null), c('NA', 264), c('NE', 227, [8], null), c('NG', 234), c('RW', 250, [9], null),
  c('SC', 248, [7], null), c('SD', 249, [9]), c('SL', 232, [8]), c('SN', 221, [9], null), c('SO', 252),
  c('SS', 211, [9]), c('ST', 239, [7], null), c('SZ', 268, [8], null), c('TD', 235, [8], null),
  c('TG', 228, [8], null), c('TN', 216, [8], null), c('TZ', 255, [9]), c('UG', 256, [9]),
  c('ZA', 27, [9]), c('ZM', 260, [9]), c('ZW', 263),

  // Latin America & Caribbean
  c('AR', 54), c('AW', 297, [7], null), c('BO', 591, [8]), c('BR', 55, [10, 11]),
  c('BZ', 501, [7], null), c('CL', 56, [9]), c('CO', 57, [10]), c('CR', 506, [8], null), c('CU', 53),
  c('CW', 599, [], null), c('EC', 593, [9]), c('FK', 500, [], null), c('GF', 594, [9]),
  c('GP', 590, [9]), c('GT', 502, [8], null), c('GY', 592, [7], null), c('HN', 504, [8], null),
  c('HT', 509, [8], null), c('MQ', 596, [9]), c('MX', 52, [10]), c('NI', 505, [8], null),
  c('PA', 507, [], null), c('PE', 51, [9]), c('PY', 595, [9]), c('SR', 597, [], null),
  c('SV', 503, [8], null), c('UY', 598, [8]), c('VE', 58, [10]),

  // Remaining territories & dependencies
  c('BL', 590, [9]), c('BQ', 599, [], null), c('GL', 299, [6], null), c('MF', 590, [9]),
  c('PM', 508, [6], null), c('RE', 262, [9]), c('SH', 290, [], null), c('YT', 262, [9]),
];

/** Everything that is not a digit, dropped: pasted numbers carry spaces, dashes, brackets, NBSPs. */
export function onlyDigits(input: string): string {
  return (input || '').replace(/\D+/g, '');
}

export function dialCodeDisplay(country: Country): string {
  return `+${country.dialCode}`;
}

/** The flag, derived from the ISO code's regional-indicator symbols — no assets, no upkeep. */
export function countryFlag(country: Country): string {
  return country.iso2
    .split('')
    .map((ch) => String.fromCodePoint(ch.charCodeAt(0) + 0x1f1e6 - 65))
    .join('');
}

/** Localised country name, so the picker reads in the user's own language. */
export function countryName(country: Country): string {
  try {
    const display = new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' });
    return display.of(country.iso2) || country.iso2;
  } catch {
    return country.iso2;
  }
}

export function maxNationalLength(country: Country): number {
  const ceiling = E164_MAX_DIGITS - String(country.dialCode).length;
  return country.nationalLengths.length ? Math.min(Math.max(...country.nationalLengths), ceiling) : ceiling;
}

export function minNationalLength(country: Country): number {
  return country.nationalLengths.length ? Math.min(...country.nationalLengths) : 4;
}

/** "10 digits", "8–10 digits", or "6 or 9 digits" — what to expect for this country. */
export function lengthHint(country: Country): string {
  const lengths = [...country.nationalLengths].sort((a, b) => a - b);
  if (!lengths.length) return `${minNationalLength(country)}–${maxNationalLength(country)} digits`;
  if (lengths.length === 1) return `${lengths[0]} digits`;
  if (lengths.length === lengths[lengths.length - 1] - lengths[0] + 1) {
    return `${lengths[0]}–${lengths[lengths.length - 1]} digits`;
  }
  return `${lengths.join(' or ')} digits`;
}

/** Groups digits for readability while typing. */
export function groupDigits(digits: string, dialCode: number): string {
  let sizes: number[];
  if (dialCode === 1 && digits.length === 10) sizes = [3, 3, 4];
  else if (dialCode === 91 && digits.length === 10) sizes = [5, 5];
  else if (dialCode === 44 && digits.length === 10) sizes = [4, 6];
  else if (digits.length <= 6) sizes = [3, 3];
  else if (digits.length <= 8) sizes = [4, 4];
  else if (digits.length <= 10) sizes = [3, 3, 4];
  else sizes = [3, 3, 3, 3, 3];

  const parts: string[] = [];
  let rest = digits;
  for (const size of sizes) {
    if (!rest) break;
    parts.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  if (rest) parts.push(rest);
  return parts.join(' ');
}

/** A mask conveying how many digits are expected, without pretending to be a real number. */
export function placeholderMask(country: Country): string {
  return groupDigits('•'.repeat(maxNationalLength(country)), country.dialCode);
}

function isPlausibleLength(value: string, country: Country): boolean {
  if (!country.nationalLengths.length) {
    return value.length >= minNationalLength(country) && value.length <= maxNationalLength(country);
  }
  return country.nationalLengths.includes(value.length);
}

function stripTrunk(value: string, country: Country): string {
  const trunk = country.trunkPrefix;
  if (!trunk || !value.startsWith(trunk)) return value;
  const remainder = value.slice(trunk.length);
  // Only strip when doing so yields a length the country actually uses; otherwise the leading digit
  // is part of the number.
  return isPlausibleLength(remainder, country) ? remainder : value;
}

/**
 * Strips whatever the user typed in FRONT of their subscriber number: an international prefix
 * (`+91`, `0091`, `01191`), a duplicated calling code, or a national trunk prefix (`0`).
 */
export function nationalPart(input: string, country: Country): string {
  let value = onlyDigits(input);
  const code = String(country.dialCode);

  for (const access of ['00', '011']) {
    if (value.startsWith(access + code)) {
      return stripTrunk(value.slice(access.length + code.length), country);
    }
  }

  // A bare calling code, as produced by pasting "+91 98…". Guarded on length so a national number
  // that merely BEGINS with those digits survives.
  if (value.startsWith(code) && value.length > code.length) {
    const remainder = value.slice(code.length);
    if (isPlausibleLength(remainder, country) || !isPlausibleLength(value, country)) {
      return stripTrunk(remainder, country);
    }
  }

  return stripTrunk(value, country);
}

export type PhoneValidationError = 'EMPTY' | 'TOO_SHORT' | 'TOO_LONG' | 'WRONG_LENGTH';

export function validateNational(national: string, country: Country): PhoneValidationError | null {
  const value = onlyDigits(national);
  if (!value) return 'EMPTY';

  if (!country.nationalLengths.length) {
    if (value.length < minNationalLength(country)) return 'TOO_SHORT';
    if (value.length > maxNationalLength(country)) return 'TOO_LONG';
    return null;
  }

  if (country.nationalLengths.includes(value.length)) return null;
  if (value.length < minNationalLength(country)) return 'TOO_SHORT';
  if (value.length > maxNationalLength(country)) return 'TOO_LONG';
  // Between the shortest and longest but not a length this country uses (e.g. 7 where 6 or 9 apply).
  return 'WRONG_LENGTH';
}

export function validationMessage(error: PhoneValidationError, country: Country): string {
  const expected = lengthHint(country);
  switch (error) {
    case 'EMPTY':
      return 'Enter your phone number.';
    case 'TOO_SHORT':
      return `That looks too short — ${expected} expected.`;
    case 'TOO_LONG':
      return `That looks too long — ${expected} expected.`;
    case 'WRONG_LENGTH':
      return `Check the number — ${expected} expected.`;
  }
}

/** The value to send to Cognito / the backend. */
export function toE164(national: string, country: Country): string {
  return `+${country.dialCode}${onlyDigits(national)}`;
}

/** Splits a full international number into country + national part, longest calling code first. */
export function splitE164(value: string): { country: Country; national: string } | null {
  const digits = onlyDigits(value);
  if (!digits) return null;

  const candidates = [...COUNTRIES].sort(
    (a, b) => String(b.dialCode).length - String(a.dialCode).length
  );
  for (const country of candidates) {
    const code = String(country.dialCode);
    if (!digits.startsWith(code)) continue;
    const national = digits.slice(code.length);
    if (isPlausibleLength(national, country)) return { country, national };
  }
  return null;
}

export function findCountry(iso2: string): Country | undefined {
  return COUNTRIES.find((country) => country.iso2 === iso2.toUpperCase());
}

/** The browser's region, so the field opens on the country the user is almost certainly in. */
export function defaultCountry(): Country {
  const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  const region = locale?.split('-')[1]?.toUpperCase();
  return (region ? findCountry(region) : undefined) ?? findCountry('US') ?? COUNTRIES[0];
}

/** Alphabetical by localised name, matching the language the names are shown in. */
export function countriesByName(): Country[] {
  return [...COUNTRIES].sort((a, b) => countryName(a).localeCompare(countryName(b)));
}

/** Matches name, ISO code and calling code, so "india", "IN", "91" and "+91" all find India. */
export function searchCountries(query: string): Country[] {
  const trimmed = (query || '').trim();
  if (!trimmed) return countriesByName();
  const needle = trimmed.toLowerCase();
  const digits = onlyDigits(trimmed);

  return countriesByName().filter((country) => {
    if (countryName(country).toLowerCase().includes(needle)) return true;
    if (country.iso2.toLowerCase().startsWith(needle)) return true;
    if (digits && String(country.dialCode).startsWith(digits)) return true;
    return false;
  });
}
