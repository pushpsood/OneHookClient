/**
 * Date of birth: captured once at onboarding and never editable by the member afterwards.
 *
 * The backend derives age from it, rejects any change (400), and allows support to correct it at most
 * twice, with proof. The copy below is deliberately blunt: a member must understand before saving that
 * a mistake here is close to impossible to undo.
 */

export const MIN_AGE = 18;
export const MAX_AGE = 120;

/** Shown wherever the date is entered or displayed. Keep in sync with iOS/Android (DobPolicy). */
export const DOB_PERMANENT_TITLE = 'Your date of birth is permanent';
export const DOB_PERMANENT_BODY =
  'Once saved, your date of birth can never be changed by you. Your age on OneHook is calculated from ' +
  'it, so a wrong date means a wrong age forever. Only our support team can correct it, and only with ' +
  'proof such as a government ID, at most twice. Please check the day, month and year carefully.';
export const DOB_CONFIRM_LABEL =
  'I have checked my date of birth and understand it cannot be changed later.';
export const DOB_LOCKED_HINT =
  'Set at sign-up and cannot be changed. Contact support with ID if it is wrong.';
export const DOB_PROVISIONAL_HINT =
  'We only have an estimate of your birthday. Add your real date of birth: you can do this once, and it cannot be changed afterwards.';

/** Completed years on `today` (UTC calendar), or null for an invalid ISO date. */
export function ageOn(isoDate: string, today: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? '');
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d)
    return null;
  const ty = today.getUTCFullYear();
  const tm = today.getUTCMonth() + 1;
  const td = today.getUTCDate();
  let age = ty - y;
  if (tm < mo || (tm === mo && td < d)) age--;
  return age;
}

/** Error to show for a candidate birth date, or null when it is acceptable. */
export function validateDob(isoDate: string, today: Date = new Date()): string | null {
  if (!isoDate) return 'Please enter your date of birth.';
  const age = ageOn(isoDate, today);
  if (age === null) return 'Please enter a valid date of birth.';
  if (age < MIN_AGE) return `You must be at least ${MIN_AGE} to use OneHook.`;
  if (age > MAX_AGE) return 'Please check the year of your date of birth.';
  return null;
}

/** Latest selectable date (exactly 18 years ago) for the date input's `max`. */
export function latestAllowedDob(today: Date = new Date()): string {
  const d = new Date(
    Date.UTC(today.getUTCFullYear() - MIN_AGE, today.getUTCMonth(), today.getUTCDate())
  );
  return d.toISOString().slice(0, 10);
}

export function earliestAllowedDob(today: Date = new Date()): string {
  return `${today.getUTCFullYear() - MAX_AGE}-01-01`;
}

/** "17 May 1990" in the member's locale, from an ISO date (no time-zone shift). */
export function formatDob(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? '');
  if (!m) return isoDate;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(
    undefined,
    {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }
  );
}

/** Friendly message for State's complete-onboarding 409 codes; null when it is not one of them. */
export function onboardingGateMessage(message: string | undefined): string | null {
  if (!message) return null;
  if (message.startsWith('BIRTH_DATE_REQUIRED'))
    return 'Please add your date of birth on the first step, then tap Finish again.';
  if (message.startsWith('PROFILE_REQUIRED'))
    return 'Your profile was not saved yet. Please tap Finish again.';
  if (message.startsWith('PROFILE_CHECK_UNAVAILABLE'))
    return 'We could not check your profile just now. Your details are saved; tap Finish again in a moment.';
  return null;
}
