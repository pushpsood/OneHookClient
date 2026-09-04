import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { APP_STORE_LINKS, WEB_SIGNUP_ENABLED } from '../config/signup.config';

/**
 * Where an account may be CREATED.
 *
 * Sign-up is native-only so the first device is always an app, which is what guarantees the
 * account-history key lands in platform escrow (iCloud Keychain / Android Block Store) from the moment
 * the account exists. That guarantee is the reason it is safe to ship without a user-held recovery code:
 * every account starts with two independent holders before it has any history to lose.
 *
 * A web-created account would start with exactly ONE holder, on a platform with no escrow — the single
 * point of failure the whole design removes. So this is a security property, and these tests exist to
 * stop it being flipped back casually.
 *
 * Signing IN on the web must remain untouched.
 */

describe('signup surface', () => {
  it('does not allow accounts to be created on the web', () => {
    expect(WEB_SIGNUP_ENABLED).toBe(false);
  });

  it('offers both stores, so neither platform is a dead end', () => {
    expect(APP_STORE_LINKS.ios).toMatch(/^https:\/\//);
    expect(APP_STORE_LINKS.android).toMatch(/^https:\/\//);
  });

  it('routes the web registration screen to the app notice while the gate is closed', () => {
    const source = readFileSync(new URL('../components/auth/RedeemInvite.tsx', import.meta.url), 'utf8');
    // The flow itself is retained rather than deleted: the native clients drive the same contract, and
    // re-enabling should be a one-line config change, not a rewrite.
    expect(source).toContain('WEB_SIGNUP_ENABLED');
    expect(source).toContain('SignupInAppNotice');
    expect(source).toContain('registerPhone');
  });

  it('keeps a sign-in route on the app notice, since only sign-up moved', () => {
    const source = readFileSync(
      new URL('../components/auth/SignupInAppNotice.tsx', import.meta.url),
      'utf8'
    );
    expect(source).toContain("'/login'");
  });

  it('explains WHY signup is native-only where the flag lives', () => {
    // A future reader deleting this flag should have to read the reason first.
    const source = readFileSync(new URL('../config/signup.config.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/escrow/i);
    expect(source).toMatch(/account-key-recovery/);
  });
});
