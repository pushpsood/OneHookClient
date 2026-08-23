import { Amplify } from 'aws-amplify';
import {
  signIn,
  confirmSignIn,
  fetchAuthSession,
  fetchUserAttributes,
  updateUserAttribute,
  confirmUserAttribute,
  signOut,
  associateWebAuthnCredential,
  signInWithRedirect,
  resetPassword,
  confirmResetPassword,
} from 'aws-amplify/auth';
import { IdentityApi } from '../api/identity';
import { requestGoogleIdToken } from './google-identity';
import { googleClientId } from '../utils/env.config';

interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  identityPoolId?: string;
  region: string;
  endpoint?: string;
  cognitoDomain: string;
  cognitoRedirectSignIn: string;
  cognitoRedirectSignOut: string;
  graphqlEndpoint?: string;
}

interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
}

interface CognitoUser {
  username: string;
  email: string;
  sub: string;
}

class CognitoAuthService {
  constructor(config: CognitoConfig) {
    const loginWith: Record<string, unknown> = {
      phone: true,
      email: true,
    };
    if (
      config.cognitoDomain &&
      config.cognitoRedirectSignIn &&
      config.cognitoRedirectSignOut
    ) {
      loginWith.oauth = {
        responseType: 'code',
        scopes: ['phone', 'email', 'openid', 'profile', 'aws.cognito.signin.user.admin'],
        redirectSignIn: [config.cognitoRedirectSignIn],
        redirectSignOut: [config.cognitoRedirectSignOut],
        domain: config.cognitoDomain,
      };
    }

    // Built as a loose object because Amplify's Auth config is a discriminated
    // union that doesn't accept conditionally-spread Identity Pool/OAuth values cleanly.
    const cognito: Record<string, unknown> = {
      userPoolId: config.userPoolId,
      userPoolClientId: config.clientId,
      userPoolEndpoint: config.endpoint,
      loginWith,
    };

    // Identity Pool provides temporary AWS credentials for services like
    // Rekognition Face Liveness video streaming.
    if (config.identityPoolId) {
      cognito.identityPoolId = config.identityPoolId;
      cognito.allowGuestAccess = false;
    }

    Amplify.configure({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Auth: { Cognito: cognito as any },
      // Chat messaging is served by AppSync GraphQL (see OneHookBackend/packages/chat).
      // We authenticate to it with the Cognito user pool JWT (defaultAuthMode 'userPool').
      ...(config.graphqlEndpoint
        ? {
            API: {
              GraphQL: {
                endpoint: config.graphqlEndpoint,
                region: config.region,
                defaultAuthMode: 'userPool' as const,
              },
            },
          }
        : {}),
    });
  }

  private isEmail(identifier: string): boolean {
    return identifier.includes('@');
  }

  /**
   * Request a one-time code for a phone number OR email. Cognito's USER_AUTH
   * flow picks the matching factor (EMAIL_OTP vs SMS_OTP) and delivers the code;
   * finish with {@link confirmLogin}.
   */
  async requestOtp(identifier: string): Promise<any> {
    return signIn({
      username: identifier,
      options: {
        authFlowType: 'CUSTOM_WITHOUT_SRP',
        clientMetadata: {
          authStrategy: this.isEmail(identifier) ? 'email' : 'phone',
        },
      },
    });
  }

  /**
   * Sign in with a password (only works if the user has set one). Uses Cognito's
   * USER_AUTH flow with the PASSWORD_SRP factor. May still return a follow-up
   * challenge (e.g. MFA), which the caller handles via {@link confirmLogin}.
   */
  async loginWithPassword(identifier: string, password: string): Promise<any> {
    return signIn({
      username: identifier,
      password,
      options: {
        authFlowType: 'USER_AUTH',
        preferredChallenge: 'PASSWORD_SRP',
      },
    });
  }

  /** @deprecated Use {@link requestOtp}. Kept for backward compatibility. */
  async login(phoneOrEmail: string): Promise<any> {
    return this.requestOtp(phoneOrEmail);
  }

  /**
   * Set (or reset) an account password using Cognito's code-based flow. Sends a
   * verification code to the account's email/phone. Works for passwordless
   * accounts setting a password for the first time — no old password required.
   */
  async requestPasswordReset(username: string): Promise<any> {
    return resetPassword({ username });
  }

  /** Confirm the code + new password to finish setting the account password. */
  async confirmPasswordSet(
    username: string,
    confirmationCode: string,
    newPassword: string
  ): Promise<void> {
    await confirmResetPassword({ username, confirmationCode, newPassword });
  }

  async confirmLogin(challengeResponse: string): Promise<any> {
    return confirmSignIn({ challengeResponse });
  }

  async updateUserEmail(email: string): Promise<any> {
    const result = await updateUserAttribute({
      userAttribute: { attributeKey: 'email', value: email },
    });
    return result;
  }

  async verifyEmail(code: string): Promise<void> {
    await confirmUserAttribute({ userAttributeKey: 'email', confirmationCode: code });
  }

  async registerWebAuthn(): Promise<void> {
    await associateWebAuthnCredential();
  }

  /**
   * Signs in with Google.
   *
   * The Cognito Hosted UI is intentionally not provisioned, so this does NOT use OAuth redirects.
   * Instead it follows the backend's custom-auth design:
   *
   *   1. obtain a Google ID token in-page (Google Identity Services);
   *   2. resolve the linked OneHook account — `POST /identity/auth/social` verifies the token
   *      server-side (signature, issuer, pinned audience) and returns the userId whose
   *      `custom:google_id` matches the token's `sub`;
   *   3. start the Cognito CUSTOM_AUTH flow for that user, which issues a PROVIDE_SOCIAL_TOKEN
   *      challenge;
   *   4. answer the challenge with the same token. The trigger re-verifies it and matches `sub`
   *      against `custom:google_id` before Cognito issues any session.
   *
   * The token is verified twice by the backend, and the account is never chosen by the client:
   * `sub` decides it on both hops.
   */
  async signInWithGoogle(): Promise<void> {
    const idToken = await requestGoogleIdToken(googleClientId);

    const account = await IdentityApi.authSocial('GOOGLE', idToken);
    const userId = account?.userId;
    if (!userId) {
      throw new Error(
        'No OneHook account is linked to this Google account. Sign in with your phone number, then link Google from your profile.'
      );
    }

    await signIn({ username: userId, options: { authFlowType: 'CUSTOM_WITHOUT_SRP' } });
    return this.answerSocialChallenge('google', idToken);
  }

  /** Answers a PROVIDE_SOCIAL_TOKEN challenge; the trigger matches the token's `sub` server-side. */
  private async answerSocialChallenge(provider: 'google' | 'apple', token: string): Promise<void> {
    await confirmSignIn({ challengeResponse: JSON.stringify({ provider, token }) });
  }

  async federatedSignInApple(): Promise<void> {
    await signInWithRedirect({ provider: 'Apple' });
  }

  async getStoredTokens(): Promise<CognitoTokens | null> {
    try {
      const session = await fetchAuthSession();
      if (!session.tokens) return null;
      return {
        idToken: session.tokens.idToken?.toString() || '',
        accessToken: session.tokens.accessToken?.toString() || '',
      };
    } catch {
      return null;
    }
  }

  async getCurrentUser(): Promise<CognitoUser | null> {
    try {
      const session = await fetchAuthSession();
      if (!session.tokens) return null;
      const attributes = await fetchUserAttributes();
      return {
        username: session.tokens.idToken?.payload['cognito:username'] as string || '',
        email: attributes.email || '',
        sub: attributes.sub || '',
      };
    } catch (err) {
      console.error('getCurrentUser error:', err);
      return null;
    }
  }

  async refreshAccessToken(): Promise<CognitoTokens | null> {
    return this.getStoredTokens(); // fetchAuthSession handles refresh automatically in Amplify
  }

  async logout(): Promise<void> {
    await signOut();
  }
}

let cognitoAuthService: CognitoAuthService | null = null;

export function initializeCognitoAuth(config: CognitoConfig): CognitoAuthService {
  cognitoAuthService = new CognitoAuthService(config);
  return cognitoAuthService;
}

export function getCognitoAuth(): CognitoAuthService {
  if (!cognitoAuthService) {
    throw new Error('Cognito auth service not initialized');
  }
  return cognitoAuthService;
}

export type { CognitoTokens, CognitoUser };