import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Onboarding account steps and username sign-in (spec: username, password, sign-in options, account
 * recovery): the pure rules in lib/account-setup.ts and lib/account-recovery.ts, and the Identity
 * wrappers against a fake generated SDK.
 */
const sdk = vi.hoisted(() => ({
  checkUsernameAvailability: vi.fn(),
  updateUsername: vi.fn(),
  setPassword: vi.fn(),
}));
vi.mock('../api/sdk-client', () => ({ sdkClient: sdk }));

import { IdentityApi } from '../api/identity';
import {
  ONBOARDING_STEPS,
  canContinueUsername,
  checkFromError,
  checkFromResponse,
  isProviderCancel,
  normalizeUsername,
  onboardingNextValue,
  onboardingSteps,
  passwordError,
  setPasswordFailure,
  stepAfter,
  stepBefore,
  updateUsernameFailure,
  usernameCheckMessage,
  usernameFormatError,
} from '../lib/account-setup';
import {
  RecoverySetupDeps,
  isCancelError,
  recoveryStatusFrom,
  setUpAccountRecovery,
} from '../lib/account-recovery';
import { UI_ELEMENTS } from '../lib/analytics/generated/telemetryCatalog';

/** What the SDK throws for `{error, code}`: body fields copied, message = "UnknownError". */
const sdkError = (status: number, error: string, code?: string) =>
  Object.assign(new Error('UnknownError'), {
    name: code ?? 'UnknownError',
    error,
    ...(code ? { code } : {}),
    $metadata: { httpStatusCode: status },
  });

beforeEach(() => Object.values(sdk).forEach((fn) => fn.mockReset()));

describe('IdentityApi account operations', () => {
  it('CheckUsernameAvailability sends the handle as the path label (the SDK escapes it)', async () => {
    sdk.checkUsernameAvailability.mockResolvedValue({ username: 'a.b', status: 'AVAILABLE' });
    await expect(IdentityApi.checkUsernameAvailability('a.b')).resolves.toMatchObject({ status: 'AVAILABLE' });
    expect(sdk.checkUsernameAvailability).toHaveBeenCalledWith({ username: 'a.b' });
  });

  it('UpdateUsername and SetPassword send their request bodies', async () => {
    sdk.updateUsername.mockResolvedValue({ status: 'UPDATED', username: 'asha' });
    sdk.setPassword.mockResolvedValue({ status: 'PASSWORD_SET' });
    await IdentityApi.updateUsername('asha');
    await IdentityApi.setPassword('correct horse!');
    expect(sdk.updateUsername).toHaveBeenCalledWith({ username: 'asha' });
    expect(sdk.setPassword).toHaveBeenCalledWith({ password: 'correct horse!' });
  });
});

describe('onboarding steps', () => {
  it('runs basics, photo, username, password, social, recovery', () => {
    expect(onboardingSteps(false)).toEqual(['basics', 'photo', 'username', 'password', 'social', 'recovery']);
    expect(ONBOARDING_STEPS).toEqual(onboardingSteps(false));
  });

  it('skips the password step when GetUser says a password exists', () => {
    const steps = onboardingSteps(true);
    expect(steps).not.toContain('password');
    expect(stepAfter(steps, 'username')).toBe('social');
    expect(stepBefore(steps, 'social')).toBe('username');
  });

  it('finishes after recovery and has no step before basics', () => {
    const steps = onboardingSteps(false);
    expect(stepAfter(steps, 'recovery')).toBeNull();
    expect(stepBefore(steps, 'basics')).toBeNull();
  });

  it('reports each Continue with a catalog value of onboarding.next', () => {
    const allowed = UI_ELEMENTS['onboarding.next'].values ?? [];
    for (const step of ONBOARDING_STEPS) expect(allowed).toContain(onboardingNextValue(step));
    expect(onboardingNextValue('photo')).toBe('photos');
  });
});

describe('username rules', () => {
  it('trims and lower-cases whatever is typed', () => {
    expect(normalizeUsername('  BrightLantern6751 ')).toBe('brightlantern6751');
  });

  it('accepts the backend format and explains every rejection', () => {
    for (const ok of ['abc', 'a.b_c', 'bright_', 'x'.repeat(30), '9lives']) expect(usernameFormatError(ok)).toBeNull();
    expect(usernameFormatError('ab')).toMatch(/at least 3/);
    expect(usernameFormatError('x'.repeat(31))).toMatch(/30 characters/);
    for (const bad of ['_abc', '.abc', 'abc.', 'a-b', 'a b', 'ab!']) expect(usernameFormatError(bad)).not.toBeNull();
  });

  it('maps every availability status to the inline line', () => {
    expect(usernameCheckMessage(checkFromResponse({ status: 'AVAILABLE' }))).toBe('Available');
    expect(usernameCheckMessage(checkFromResponse({ status: 'TAKEN' }))).toBe('Already taken');
    expect(usernameCheckMessage(checkFromResponse({ status: 'INVALID', reason: 'That handle is reserved' }))).toBe(
      'That handle is reserved'
    );
    expect(usernameCheckMessage(checkFromResponse({ status: 'CURRENT' }))).toBeNull();
  });

  it('a 429 asks the member to wait; a 400 shows its reason', () => {
    expect(usernameCheckMessage(checkFromError(sdkError(429, 'slow down', 'TOO_MANY_REQUESTS')))).toBe(
      'Too many checks, try again in a while.'
    );
    expect(usernameCheckMessage(checkFromError(sdkError(400, 'Username is too short')))).toBe('Username is too short');
  });

  it('disables Continue while invalid, taken or checking', () => {
    expect(canContinueUsername('ab', { kind: 'idle' })).toBe(false);
    expect(canContinueUsername('asha', { kind: 'checking' })).toBe(false);
    expect(canContinueUsername('asha', { kind: 'taken' })).toBe(false);
    expect(canContinueUsername('asha', { kind: 'invalid', reason: 'reserved' })).toBe(false);
    expect(canContinueUsername('asha', { kind: 'available' })).toBe(true);
    expect(canContinueUsername('asha', { kind: 'current' })).toBe(true);
    // Unchecked or a failed check: UpdateUsername decides.
    expect(canContinueUsername('asha', { kind: 'idle' })).toBe(true);
    expect(canContinueUsername('asha', { kind: 'rate-limited' })).toBe(true);
  });

  it('a 400 "already taken" is Already taken; "already set to that value" is nothing to do', () => {
    expect(updateUsernameFailure(sdkError(400, 'Username already taken', 'BAD_REQUEST'))).toEqual({ kind: 'taken' });
    expect(updateUsernameFailure(sdkError(400, 'Username already in use'))).toEqual({ kind: 'taken' });
    expect(updateUsernameFailure(sdkError(400, 'Username is already set to that value'))).toEqual({ kind: 'unchanged' });
    expect(updateUsernameFailure(sdkError(400, 'That username is reserved'))).toEqual({
      kind: 'error',
      message: 'That username is reserved',
    });
    expect(updateUsernameFailure(sdkError(500, ''))).toEqual({
      kind: 'error',
      message: 'We couldn’t save your username. Please try again.',
    });
  });
});

describe('password rules', () => {
  it('needs 12 characters, a symbol and a matching confirmation, nothing else', () => {
    expect(passwordError('short!', 'short!')).toMatch(/12 characters/);
    expect(passwordError('longenoughpassword', 'longenoughpassword')).toMatch(/symbol/);
    expect(passwordError('longenough#pass', 'longenough#pasS')).toMatch(/don’t match/);
    expect(passwordError('longenough#pass', 'longenough#pass')).toBeNull();
    // No upper-case, digit or other rules.
    expect(passwordError('all lower case', 'all lower case')).toBeNull();
  });

  it('409 PASSWORD_ALREADY_SET counts as done; 400 shows the policy', () => {
    expect(setPasswordFailure(sdkError(409, 'A password is already set', 'PASSWORD_ALREADY_SET'))).toEqual({
      kind: 'already-set',
    });
    const policy = setPasswordFailure(sdkError(400, 'Password does not conform to policy', 'BAD_REQUEST'));
    expect(policy.kind).toBe('error');
    expect(policy.kind === 'error' && policy.message).toMatch(/At least 12 characters, including a symbol\./);
  });
});

describe('sign-in options', () => {
  it('a closed Google sheet is a dismiss, not an error', () => {
    expect(isProviderCancel(new Error('Google sign-in was cancelled.'))).toBe(true);
    expect(isProviderCancel(new Error('Could not reach Google sign-in.'))).toBe(false);
  });
});

describe('account recovery setup', () => {
  const deps = (over: Partial<RecoverySetupDeps> = {}): RecoverySetupDeps => ({
    initialize: vi.fn(async () => undefined),
    unlockMethods: vi.fn(async () => ({ prf: 0, escrow: 0, prfSupportedHere: true })),
    registerPasskey: vi.fn(async () => undefined),
    addPasskeyUnlock: vi.fn(async () => 'cred-1'),
    ...over,
  });

  it('is on with a passkey or escrow wrap', () => {
    expect(recoveryStatusFrom({ prf: 1, escrow: 0 })).toBe('on');
    expect(recoveryStatusFrom({ prf: 0, escrow: 1 })).toBe('on');
    expect(recoveryStatusFrom({ prf: 0, escrow: 0 })).toBe('not-set-up');
  });

  it('registers this device, creates a passkey and seals the history key to it', async () => {
    const d = deps();
    await expect(setUpAccountRecovery(d)).resolves.toEqual({ kind: 'protected' });
    expect(d.initialize).toHaveBeenCalled();
    expect(d.registerPasskey).toHaveBeenCalled();
    expect(d.addPasskeyUnlock).toHaveBeenCalled();
  });

  it('is idempotent: an account that already has recovery is not prompted again', async () => {
    const d = deps({ unlockMethods: vi.fn(async () => ({ prf: 1, escrow: 0, prfSupportedHere: true })) });
    await expect(setUpAccountRecovery(d)).resolves.toEqual({ kind: 'protected' });
    expect(d.registerPasskey).not.toHaveBeenCalled();
  });

  it('reports an unsupported browser without prompting', async () => {
    const d = deps({ unlockMethods: vi.fn(async () => ({ prf: 0, escrow: 0, prfSupportedHere: false })) });
    await expect(setUpAccountRecovery(d)).resolves.toEqual({ kind: 'unsupported' });
    expect(d.registerPasskey).not.toHaveBeenCalled();
  });

  it('a cancelled passkey sheet is cancelled, not an error', async () => {
    const cancel = Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' });
    await expect(setUpAccountRecovery(deps({ registerPasskey: vi.fn(async () => Promise.reject(cancel)) }))).resolves.toEqual({
      kind: 'cancelled',
    });
    await expect(setUpAccountRecovery(deps({ addPasskeyUnlock: vi.fn(async () => null) }))).resolves.toEqual({
      kind: 'cancelled',
    });
    expect(isCancelError({ name: 'PasskeyRegistrationCanceled' })).toBe(true);
  });

  it('never throws: a failed device registration is an error result', async () => {
    const d = deps({ initialize: vi.fn(async () => Promise.reject(new Error('offline'))) });
    await expect(setUpAccountRecovery(d)).resolves.toMatchObject({ kind: 'error' });
  });
});
