import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  E164_MAX_DIGITS,
  countryFlag,
  defaultCountry,
  dialCodeDisplay,
  findCountry,
  groupDigits,
  lengthHint,
  maxNationalLength,
  nationalPart,
  placeholderMask,
  searchCountries,
  splitE164,
  toE164,
  validateNational,
} from '../lib/phone-numbers';
import {
  evaluateRegistrationPrerequisites,
  describeMissingPrerequisites,
} from '../lib/registration-prerequisites';
import type { HistoryState } from '../api/chat';

/**
 * Phone entry and the web onboarding gate.
 *
 * Both exist to stop a silent failure. The phone rules stop a user guessing whether the country code
 * is required (and stop us mangling a number that merely begins with its own calling code). The gate
 * stops the web finishing onboarding for an account that never got the escrowed key backup only a
 * native app can create — which would leave that account with one key holder and no way back if the
 * device were lost.
 */

const country = (iso: string) => {
  const found = findCountry(iso);
  if (!found) throw new Error(`missing country ${iso}`);
  return found;
};

describe('phone number rules', () => {
  it('has a unique, well-formed entry per country', () => {
    const codes = COUNTRIES.map((c) => c.iso2);
    expect(new Set(codes).size).toBe(codes.length);
    for (const c of COUNTRIES) {
      expect(c.iso2).toMatch(/^[A-Z]{2}$/);
    }
  });

  it('never demands more digits than E.164 allows', () => {
    for (const c of COUNTRIES) {
      const codeDigits = String(c.dialCode).length;
      for (const length of c.nationalLengths) {
        expect(codeDigits + length).toBeLessThanOrEqual(E164_MAX_DIGITS);
      }
    }
  });

  it('covers major markets and tiny territories alike, so nobody is a dead end', () => {
    for (const iso of ['US', 'IN', 'GB', 'BR', 'NG', 'ID', 'CN', 'DE', 'JP', 'NR', 'TV', 'GL', 'XK']) {
      expect(findCountry(iso), iso).toBeDefined();
    }
    expect(COUNTRIES.length).toBeGreaterThan(190);
  });

  it('matches the iOS country table size, so the two clients behave the same', () => {
    // A drift here means one platform silently accepts a number the other rejects. iOS
    // `PhoneNumbers.swift` carries the same 238 entries; update both together.
    expect(COUNTRIES.length).toBe(238);
  });

  it('enforces a fixed national length where one exists', () => {
    expect(validateNational('9876543210', country('IN'))).toBeNull();
    expect(validateNational('987654321', country('IN'))).toBe('TOO_SHORT');
    expect(validateNational('98765432101', country('IN'))).toBe('TOO_LONG');
    expect(lengthHint(country('IN'))).toBe('10 digits');
  });

  it('accepts every length a country genuinely uses', () => {
    expect(validateNational('1132345678', country('BR'))).toBeNull();
    expect(validateNational('11987654321', country('BR'))).toBeNull();
    expect(lengthHint(country('BR'))).toBe('10–11 digits');
  });

  it('reports a length between two valid values as wrong, not short or long', () => {
    expect(validateNational('1234567', country('AD'))).toBe('WRONG_LENGTH');
    expect(lengthHint(country('AD'))).toBe('6 or 9 digits');
  });

  it('accepts any legal length where the plan is not fixed', () => {
    expect(country('DE').nationalLengths).toHaveLength(0);
    expect(validateNational('15112345678', country('DE'))).toBeNull();
    expect(validateNational('30123456', country('DE'))).toBeNull();
  });

  it('treats blank input as empty rather than too short', () => {
    expect(validateNational('', country('IN'))).toBe('EMPTY');
    expect(validateNational('   ', country('IN'))).toBe('EMPTY');
  });

  it('does not count a pasted international prefix twice', () => {
    expect(nationalPart('+91 98765 43210', country('IN'))).toBe('9876543210');
    expect(nationalPart('0091 9876543210', country('IN'))).toBe('9876543210');
    expect(nationalPart('919876543210', country('IN'))).toBe('9876543210');
  });

  it('strips the national trunk prefix people habitually dial', () => {
    expect(nationalPart('09876543210', country('IN'))).toBe('9876543210');
    expect(nationalPart('07911123456', country('GB'))).toBe('7911123456');
  });

  it('keeps the leading zero where it belongs to the number', () => {
    // Italian numbers keep it; stripping would break the number.
    expect(nationalPart('0612345678', country('IT'))).toBe('0612345678');
  });

  it('leaves a number that merely starts with its own calling code alone', () => {
    expect(nationalPart('9198765432', country('IN'))).toBe('9198765432');
  });

  it('ignores separators and stray symbols', () => {
    expect(nationalPart('(415) 555-1234', country('US'))).toBe('4155551234');
  });

  it('produces E.164 for the backend', () => {
    expect(toE164('9876543210', country('IN'))).toBe('+919876543210');
    expect(toE164('415 555 1234', country('US'))).toBe('+14155551234');
  });

  it('splits a stored number back into country and national part', () => {
    expect(splitE164('+919876543210')?.country.iso2).toBe('IN');
    expect(splitE164('+919876543210')?.national).toBe('9876543210');
    expect(splitE164('+12125551234')?.country.iso2).toBe('US');
    // Longest calling code must win: +1242 is the Bahamas, not the US with a stray 242.
    expect(splitE164('+12425551234')?.country.iso2).toBe('BS');
    expect(splitE164('')).toBeNull();
  });

  it('groups digits for readability', () => {
    expect(groupDigits('9876543210', 91)).toBe('98765 43210');
    expect(groupDigits('4155551234', 1)).toBe('415 555 1234');
    expect(groupDigits('', 91)).toBe('');
  });

  it('shows the expected length in the placeholder and the dial code with a plus', () => {
    expect([...placeholderMask(country('IN'))].filter((ch) => ch === '•')).toHaveLength(10);
    expect(maxNationalLength(country('SG'))).toBe(8);
    expect(dialCodeDisplay(country('IN'))).toBe('+91');
    expect(dialCodeDisplay(country('BS'))).toBe('+1242');
  });

  it('derives the flag from the ISO code', () => {
    expect(countryFlag(country('IN'))).toBe('🇮🇳');
    expect(countryFlag(country('US'))).toBe('🇺🇸');
  });

  it('searches by name, ISO code and calling code', () => {
    expect(searchCountries('india')).toContainEqual(country('IN'));
    expect(searchCountries('IN')).toContainEqual(country('IN'));
    expect(searchCountries('91')).toContainEqual(country('IN'));
    expect(searchCountries('+91')).toContainEqual(country('IN'));
    expect(searchCountries('zzzz')).toHaveLength(0);
  });

  it('always resolves a default country', () => {
    expect(findCountry(defaultCountry().iso2)).toBeDefined();
  });
});

describe('web onboarding prerequisites', () => {
  const epoch = (n: number) => ({
    epoch: n,
    keyId: `k${n}`,
    publicKey: 'pub',
    createdAt: 1,
  });
  const wrap = (epochNumber: number, method: 'ESCROW' | 'PRF' | 'DEVICE') => ({
    epoch: epochNumber,
    method,
    wrapId: `${method}#1`,
    createdAt: 1,
  });

  it('passes an account registered in the app', () => {
    const state: HistoryState = {
      epochs: [epoch(1)],
      activeEpoch: 1,
      wraps: [wrap(1, 'ESCROW'), wrap(1, 'PRF'), wrap(1, 'DEVICE')],
    };
    expect(evaluateRegistrationPrerequisites(state)).toEqual({
      satisfied: true,
      missing: [],
      recommended: [],
    });
  });

  it('passes on escrow alone, since no client can write a PRF wrap yet', () => {
    // Apple's PRF API needs iOS 18 while the app targets 17, and existing passkeys lack the extension.
    // Requiring PRF would block every real user for a rung that cannot exist — so it is reported as a
    // recommendation instead of a blocker.
    const result = evaluateRegistrationPrerequisites({
      epochs: [epoch(1)],
      activeEpoch: 1,
      wraps: [wrap(1, 'ESCROW'), wrap(1, 'DEVICE')],
    });
    expect(result.satisfied).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.recommended).toEqual(['PRF']);
  });

  it('fails closed when there is no history state at all', () => {
    expect(evaluateRegistrationPrerequisites(null).satisfied).toBe(false);
    expect(evaluateRegistrationPrerequisites(undefined).missing).toContain('EPOCH');
  });

  it('fails when no epoch was ever established', () => {
    const result = evaluateRegistrationPrerequisites({ epochs: [] });
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual(['EPOCH', 'ESCROW']);
  });

  it('fails when the escrowed backup is missing, since only an app can write it', () => {
    const result = evaluateRegistrationPrerequisites({
      epochs: [epoch(1)],
      activeEpoch: 1,
      wraps: [wrap(1, 'PRF'), wrap(1, 'DEVICE')],
    });
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual(['ESCROW']);
  });

  it('blocks when the escrowed backup is missing even if a passkey wrap exists', () => {
    // Escrow is the app-only rung, so its absence is what indicates the account did not come from an app.
    const result = evaluateRegistrationPrerequisites({
      epochs: [epoch(1)],
      activeEpoch: 1,
      wraps: [wrap(1, 'PRF'), wrap(1, 'DEVICE')],
    });
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual(['ESCROW']);
  });

  it('does not accept a device wrap as a substitute', () => {
    // Every platform writes a DEVICE wrap at sign-in, so it proves nothing about how the account began.
    const result = evaluateRegistrationPrerequisites({
      epochs: [epoch(1)],
      activeEpoch: 1,
      wraps: [wrap(1, 'DEVICE')],
    });
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual(['ESCROW']);
  });

  it('ignores wraps against a superseded epoch', () => {
    // A wrap on an old epoch cannot open current history, so counting it would pass an account that is
    // in practice unprotected.
    const result = evaluateRegistrationPrerequisites({
      epochs: [epoch(1), epoch(2)],
      activeEpoch: 2,
      wraps: [wrap(1, 'ESCROW'), wrap(2, 'DEVICE')],
    });
    expect(result.satisfied).toBe(false);
    expect(result.missing).toEqual(['ESCROW']);
  });

  it('infers the active epoch as the highest when the pointer is absent', () => {
    const result = evaluateRegistrationPrerequisites({
      epochs: [epoch(1), epoch(2)],
      wraps: [wrap(2, 'ESCROW')],
    });
    expect(result.satisfied).toBe(true);
  });

  it('explains each gap in terms the user can act on', () => {
    const reasons = describeMissingPrerequisites(['EPOCH', 'ESCROW', 'PRF']);
    expect(reasons).toHaveLength(3);
    expect(reasons.join(' ')).toMatch(/iCloud Keychain|Block Store/);
    expect(reasons.join(' ')).toMatch(/passkey/i);
    // No wire jargon leaking into user-facing copy.
    expect(reasons.join(' ')).not.toMatch(/PRF|ESCROW|epoch|wrap/);
  });
});
