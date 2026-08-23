import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Google sign-in must follow the backend's custom-auth design, NOT a Cognito Hosted UI redirect
 * (no user-pool domain or Google IdP federation is provisioned — `signInWithRedirect` would fail
 * Amplify's `assertOAuthConfig` with "oauth param not configured").
 *
 * The account is never chosen by the client: `POST /identity/auth/social` resolves it from the
 * token's verified `sub`, and the Cognito trigger re-verifies the same token and re-matches `sub`
 * against `custom:google_id` before any session is issued.
 */

const { authSocial, signIn, confirmSignIn, signInWithRedirect, requestGoogleIdToken } = vi.hoisted(
  () => ({
    authSocial: vi.fn(),
    signIn: vi.fn(),
    confirmSignIn: vi.fn(),
    signInWithRedirect: vi.fn(),
    requestGoogleIdToken: vi.fn(),
  })
);

vi.mock('aws-amplify', () => ({ Amplify: { configure: vi.fn() } }));
vi.mock('aws-amplify/auth', () => ({
  associateWebAuthnCredential: vi.fn(),
  confirmResetPassword: vi.fn(),
  confirmSignIn,
  confirmUserAttribute: vi.fn(),
  fetchAuthSession: vi.fn(),
  fetchUserAttributes: vi.fn(),
  resetPassword: vi.fn(),
  signIn,
  signInWithRedirect,
  signOut: vi.fn(),
  updateUserAttribute: vi.fn(),
}));
vi.mock('../api/identity', () => ({ IdentityApi: { authSocial } }));
vi.mock('../lib/google-identity', () => ({ requestGoogleIdToken }));

import { initializeCognitoAuth } from '../lib/cognito-auth';

const GOOGLE_ID_TOKEN = 'google.id.token';

function auth() {
  return initializeCognitoAuth({
    userPoolId: 'ap-south-1_pool',
    clientId: 'client-id',
    region: 'ap-south-1',
    cognitoDomain: '',
    cognitoRedirectSignIn: '',
    cognitoRedirectSignOut: '',
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('Google sign-in', () => {
  it('exchanges the Google identity token through the Cognito custom-auth challenge', async () => {
    requestGoogleIdToken.mockResolvedValue(GOOGLE_ID_TOKEN);
    authSocial.mockResolvedValue({ status: 'SUCCESS', userId: 'usr_123', isNewUser: false });

    await auth().signInWithGoogle();

    expect(authSocial).toHaveBeenCalledWith('GOOGLE', GOOGLE_ID_TOKEN);
    expect(signIn).toHaveBeenCalledWith({
      username: 'usr_123',
      options: { authFlowType: 'CUSTOM_WITHOUT_SRP' },
    });
    expect(confirmSignIn).toHaveBeenCalledWith({
      challengeResponse: JSON.stringify({ provider: 'google', token: GOOGLE_ID_TOKEN }),
    });
  });

  it('never uses the Hosted UI redirect flow', async () => {
    requestGoogleIdToken.mockResolvedValue(GOOGLE_ID_TOKEN);
    authSocial.mockResolvedValue({ userId: 'usr_123' });

    await auth().signInWithGoogle();

    expect(signInWithRedirect).not.toHaveBeenCalled();
  });

  it('stops with an actionable error when no account is linked to the Google identity', async () => {
    requestGoogleIdToken.mockResolvedValue(GOOGLE_ID_TOKEN);
    authSocial.mockResolvedValue({ status: 'SUCCESS', userId: undefined });

    await expect(auth().signInWithGoogle()).rejects.toThrow(/No OneHook account is linked/i);
    expect(signIn).not.toHaveBeenCalled();
    expect(confirmSignIn).not.toHaveBeenCalled();
  });

  it('does not start a Cognito session when the identity token cannot be obtained', async () => {
    requestGoogleIdToken.mockRejectedValue(new Error('Google sign-in was cancelled.'));

    await expect(auth().signInWithGoogle()).rejects.toThrow(/cancelled/i);
    expect(authSocial).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it('does not answer the challenge when account resolution fails', async () => {
    requestGoogleIdToken.mockResolvedValue(GOOGLE_ID_TOKEN);
    authSocial.mockRejectedValue(new Error('Account not found.'));

    await expect(auth().signInWithGoogle()).rejects.toThrow(/Account not found/i);
    expect(confirmSignIn).not.toHaveBeenCalled();
  });
});
