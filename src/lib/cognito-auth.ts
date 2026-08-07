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
    // Built as a loose object because Amplify's Auth config is a discriminated
    // union that doesn't accept a conditionally-spread identityPoolId cleanly.
    const cognito: Record<string, unknown> = {
      userPoolId: config.userPoolId,
      userPoolClientId: config.clientId,
      userPoolEndpoint: config.endpoint,
      loginWith: {
        phone: true,
        email: true,
        oauth: {
          responseType: 'code',
          scopes: ['phone', 'email', 'openid', 'profile', 'aws.cognito.signin.user.admin'],
          redirectSignIn: [config.cognitoRedirectSignIn],
          redirectSignOut: [config.cognitoRedirectSignOut],
          domain: config.cognitoDomain,
        },
      },
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

  async federatedSignInGoogle(): Promise<void> {
    await signInWithRedirect({ provider: 'Google' });
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

  isAuthenticated(): boolean {
    return true; // We will check properly on app load using fetchAuthSession in the store or component.
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