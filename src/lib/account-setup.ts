/**
 * Account setup during onboarding (and wherever else a member edits these): the username, an optional
 * first password, and the step order of the onboarding wizard. Pure, so the rules are unit-tested
 * without rendering. API contract: OneHookBackend identity.smithy (CheckUsernameAvailability,
 * UpdateUsername, SetPassword).
 */
import { errorCode, errorMessage, errorStatus } from './api-errors';

// ── Onboarding steps ────────────────────────────────────────────────────────────────────────────

/** Every onboarding step, in order. `password` is skipped for a member who already chose one. */
export const ONBOARDING_STEPS = ['basics', 'photo', 'username', 'password', 'social', 'recovery'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** The steps this member walks through. `hasPassword` comes from GetUser. */
export function onboardingSteps(hasPassword: boolean): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((s) => !(s === 'password' && hasPassword));
}

/** The step after `step`, or null when `step` is the last one (the wizard finishes). */
export function stepAfter(steps: readonly OnboardingStep[], step: OnboardingStep): OnboardingStep | null {
  const i = steps.indexOf(step);
  return i >= 0 && i < steps.length - 1 ? steps[i + 1] : null;
}

/** The step before `step`, or null on the first one. */
export function stepBefore(steps: readonly OnboardingStep[], step: OnboardingStep): OnboardingStep | null {
  const i = steps.indexOf(step);
  return i > 0 ? steps[i - 1] : null;
}

/** The `onboarding.next` telemetry value for completing `step` (the catalog names the photo step `photos`). */
export function onboardingNextValue(step: OnboardingStep): string {
  return step === 'photo' ? 'photos' : step;
}

// ── Username ────────────────────────────────────────────────────────────────────────────────────

/** The backend's username format, applied after lower-casing: 3 to 30 characters. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.]{1,28}[a-z0-9_]$/;

/** What every username field does to its input: trim and lower-case (the backend stores lower case). */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Why a (normalized) username fails the format, or null when it passes. */
export function usernameFormatError(username: string): string | null {
  if (username.length < 3) return 'Use at least 3 characters.';
  if (username.length > 30) return 'Use 30 characters or fewer.';
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use letters, numbers, dots and underscores. Start with a letter or number, and don’t end with a dot.';
  }
  return null;
}

/** The result of the last availability check shown under the field. */
export type UsernameCheck =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available' }
  | { kind: 'current' }
  | { kind: 'taken' }
  | { kind: 'invalid'; reason: string }
  | { kind: 'rate-limited' }
  | { kind: 'error'; message: string };

export const USERNAME_COPY = {
  available: 'Available',
  taken: 'Already taken',
  invalid: 'This username can’t be used.',
  rateLimited: 'Too many checks, try again in a while.',
  checkFailed: 'We couldn’t check that username. You can still continue.',
  saveFailed: 'We couldn’t save your username. Please try again.',
} as const;

/** Maps a CheckUsernameAvailability response onto the inline state. */
export function checkFromResponse(res: { status?: string; reason?: string } | undefined): UsernameCheck {
  switch (res?.status) {
    case 'AVAILABLE':
      return { kind: 'available' };
    case 'CURRENT':
      return { kind: 'current' };
    case 'TAKEN':
      return { kind: 'taken' };
    case 'INVALID':
      return { kind: 'invalid', reason: res.reason?.trim() || USERNAME_COPY.invalid };
    default:
      return { kind: 'error', message: USERNAME_COPY.checkFailed };
  }
}

/** Maps a failed CheckUsernameAvailability call (429, 400, anything else) onto the inline state. */
export function checkFromError(err: unknown): UsernameCheck {
  const status = errorStatus(err);
  if (status === 429) return { kind: 'rate-limited' };
  if (status === 400) return { kind: 'invalid', reason: errorMessage(err, USERNAME_COPY.invalid) };
  return { kind: 'error', message: USERNAME_COPY.checkFailed };
}

/** The line shown under the username field for a check, or null for none (idle, checking, CURRENT). */
export function usernameCheckMessage(check: UsernameCheck): string | null {
  switch (check.kind) {
    case 'available':
      return USERNAME_COPY.available;
    case 'taken':
      return USERNAME_COPY.taken;
    case 'invalid':
      return check.reason;
    case 'rate-limited':
      return USERNAME_COPY.rateLimited;
    case 'error':
      return check.message;
    default:
      return null;
  }
}

/**
 * Whether Continue is enabled on the username step. Disabled while the value fails the format, is being
 * checked, or was reported taken or invalid. An unchecked value (or a failed / rate-limited check) may
 * continue: UpdateUsername is the authority and answers a clean 400 for a taken handle.
 */
export function canContinueUsername(value: string, check: UsernameCheck): boolean {
  if (usernameFormatError(value)) return false;
  return check.kind !== 'checking' && check.kind !== 'taken' && check.kind !== 'invalid';
}

export type UpdateUsernameFailure = { kind: 'taken' } | { kind: 'unchanged' } | { kind: 'error'; message: string };

/**
 * Interprets a failed UpdateUsername. A 400 "already taken / in use" means someone holds it (the backend
 * enforces uniqueness atomically, so a race ends here too); "already set to that value" means there was
 * nothing to change, which the wizard treats as success.
 */
export function updateUsernameFailure(err: unknown): UpdateUsernameFailure {
  const message = errorMessage(err, '');
  if (errorStatus(err) === 400) {
    if (/already (taken|in use)/i.test(message)) return { kind: 'taken' };
    if (/already set to that value/i.test(message)) return { kind: 'unchanged' };
  }
  return { kind: 'error', message: message || USERNAME_COPY.saveFailed };
}

// ── Password ────────────────────────────────────────────────────────────────────────────────────

/** The user pool policy: at least 12 characters and at least one symbol, nothing else. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_RULES_COPY = 'At least 12 characters, including a symbol.';

/** Cognito's symbol set (a non-leading, non-trailing space also counts). */
const PASSWORD_SYMBOL = /[\^$*.[\]{}()?"!@#%&/\\,><':;|_~`=+-]|\S \S/;

/** Why a password (and its confirmation) can't be submitted, or null when it can. */
export function passwordError(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'Use at least 12 characters.';
  if (!PASSWORD_SYMBOL.test(password)) return 'Include at least one symbol, like ! or #.';
  if (password !== confirm) return 'The passwords don’t match.';
  return null;
}

export type SetPasswordFailure = { kind: 'already-set' } | { kind: 'error'; message: string };

/**
 * Interprets a failed SetPassword. 409 PASSWORD_ALREADY_SET means the member chose one already (on
 * another device, or before the app was closed), which onboarding treats as done.
 */
export function setPasswordFailure(err: unknown): SetPasswordFailure {
  const status = errorStatus(err);
  if (status === 409 && (errorCode(err) === 'PASSWORD_ALREADY_SET' || !errorCode(err))) return { kind: 'already-set' };
  if (status === 400) return { kind: 'error', message: `That password doesn’t meet the rules. ${PASSWORD_RULES_COPY}` };
  return { kind: 'error', message: errorMessage(err, 'We couldn’t set your password. Please try again.') };
}

// ── Sign-in options ─────────────────────────────────────────────────────────────────────────────

/** True when the member closed the Google sheet (lib/google-identity rejects with "…was cancelled."). */
export function isProviderCancel(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return /cancel/i.test(message);
}
