import { describe, it, expect } from 'vitest';
import { isSessionExpiredError, errorStatus } from '../lib/api-errors';

/**
 * A no-longer-accepted session (401/403) must be recognised as a sign-in problem, so the onboarding
 * guards re-authenticate instead of showing a fully onboarded member the "Finish in the App" screen.
 * Anything else — a missing record (404), a conflict (409), or a network error with no status — must
 * NOT be read as an expired session.
 */
describe('session-expiry classification', () => {
  it('treats 401 and 403 as an expired/refused session', () => {
    expect(isSessionExpiredError({ status: 401 })).toBe(true);
    expect(isSessionExpiredError({ status: 403 })).toBe(true);
    // Smithy SDK exceptions carry the status under $metadata.
    expect(isSessionExpiredError({ $metadata: { httpStatusCode: 401 } })).toBe(true);
  });

  it('does not treat other outcomes as an expired session', () => {
    expect(isSessionExpiredError({ status: 404 })).toBe(false); // no state record yet → onboarding
    expect(isSessionExpiredError({ status: 409 })).toBe(false);
    expect(isSessionExpiredError({ status: 500 })).toBe(false);
    expect(isSessionExpiredError(new Error('network down'))).toBe(false); // no status
    expect(isSessionExpiredError(null)).toBe(false);
    expect(isSessionExpiredError(undefined)).toBe(false);
  });

  it('reads the status the chat REST helper attaches to its errors', () => {
    // chatRest throws a plain Error with a numeric `status`; the classifier must see it.
    const err = Object.assign(new Error('chat device request failed (401 Unauthorized)'), {
      status: 401,
    });
    expect(errorStatus(err)).toBe(401);
    expect(isSessionExpiredError(err)).toBe(true);
  });
});
