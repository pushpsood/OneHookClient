import { describe, it, expect } from 'vitest';
import {
  ageOn,
  validateDob,
  latestAllowedDob,
  onboardingGateMessage,
  DOB_PERMANENT_BODY,
} from '../utils/dob';

const TODAY = new Date(Date.UTC(2026, 9, 27)); // 2026-10-27

describe('date of birth', () => {
  it('computes completed years, including leap-day birthdays', () => {
    expect(ageOn('1990-05-17', TODAY)).toBe(36);
    expect(ageOn('2000-02-29', new Date(Date.UTC(2025, 1, 28)))).toBe(24);
    expect(ageOn('2000-02-29', new Date(Date.UTC(2025, 2, 1)))).toBe(25);
    expect(ageOn('1990-02-30', TODAY)).toBeNull();
    expect(ageOn('17/05/1990', TODAY)).toBeNull();
  });

  it('accepts adults only, exactly from the 18th birthday', () => {
    expect(validateDob('2008-10-27', TODAY)).toBeNull();
    expect(validateDob('2008-10-28', TODAY)).toMatch(/at least 18/);
    expect(validateDob('', TODAY)).toMatch(/enter your date of birth/);
    expect(validateDob('1890-01-01', TODAY)).toMatch(/check the year/);
    expect(latestAllowedDob(TODAY)).toBe('2008-10-27');
  });

  it('warns that the date is effectively permanent', () => {
    expect(DOB_PERMANENT_BODY).toMatch(/can never be changed/);
    expect(DOB_PERMANENT_BODY).toMatch(/support/);
  });

  it('maps the onboarding gate codes', () => {
    expect(onboardingGateMessage('BIRTH_DATE_REQUIRED: Add your date of birth')).toMatch(
      /date of birth/
    );
    expect(onboardingGateMessage('PROFILE_REQUIRED: Create your profile')).toMatch(/not saved/);
    expect(onboardingGateMessage('PROFILE_CHECK_UNAVAILABLE: x')).toMatch(/could not check/);
    expect(onboardingGateMessage('Your sign-in credentials are not fully set up')).toBeNull();
  });
});
