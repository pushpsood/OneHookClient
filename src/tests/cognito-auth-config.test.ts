import { afterEach, describe, expect, it, vi } from 'vitest';

interface CapturedAmplifyConfig {
  Auth: {
    Cognito: {
      loginWith: {
        phone: boolean;
        email: boolean;
        oauth?: {
          domain: string;
          responseType: string;
          redirectSignIn: string[];
          redirectSignOut: string[];
        };
      };
      identityPoolId?: string;
    };
  };
  API: { GraphQL: { defaultAuthMode: string } };
}

const { configure } = vi.hoisted(() => ({
  configure: vi.fn<(config: CapturedAmplifyConfig) => void>(),
}));

vi.mock('aws-amplify', () => ({ Amplify: { configure } }));
vi.mock('aws-amplify/auth', () => ({
  associateWebAuthnCredential: vi.fn(),
  confirmResetPassword: vi.fn(),
  confirmSignIn: vi.fn(),
  confirmUserAttribute: vi.fn(),
  fetchAuthSession: vi.fn(),
  fetchUserAttributes: vi.fn(),
  resetPassword: vi.fn(),
  signIn: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
  updateUserAttribute: vi.fn(),
}));

import { initializeCognitoAuth } from '../lib/cognito-auth';

const baseConfig = {
  userPoolId: 'ap-south-1_pool',
  clientId: 'client-id',
  identityPoolId: 'ap-south-1:identity-id',
  region: 'ap-south-1',
  endpoint: 'https://cognito-idp.ap-south-1.amazonaws.com',
  cognitoDomain: '',
  cognitoRedirectSignIn: '',
  cognitoRedirectSignOut: '',
  graphqlEndpoint: 'https://graphql.api.gamma.onehook.club/graphql',
};

afterEach(() => configure.mockClear());

describe('Cognito Amplify configuration', () => {
  it('omits OAuth when no Cognito Hosted UI is provisioned', () => {
    initializeCognitoAuth(baseConfig);

    expect(configure).toHaveBeenCalledOnce();
    const configured = configure.mock.calls[0][0];
    expect(configured.Auth.Cognito.loginWith).toEqual({ phone: true, email: true });
    expect(configured.Auth.Cognito.identityPoolId).toBe(baseConfig.identityPoolId);
    expect(configured.API.GraphQL.defaultAuthMode).toBe('userPool');
  });

  it('includes code-flow OAuth only when domain and both redirects are complete', () => {
    initializeCognitoAuth({
      ...baseConfig,
      cognitoDomain: 'auth.gamma.onehook.club',
      cognitoRedirectSignIn: 'https://gamma.onehook.club',
      cognitoRedirectSignOut: 'https://gamma.onehook.club',
    });

    const oauth = configure.mock.calls[0][0].Auth.Cognito.loginWith.oauth;
    expect(oauth.domain).toBe('auth.gamma.onehook.club');
    expect(oauth.responseType).toBe('code');
    expect(oauth.redirectSignIn).toEqual(['https://gamma.onehook.club']);
    expect(oauth.redirectSignOut).toEqual(['https://gamma.onehook.club']);
  });
});
