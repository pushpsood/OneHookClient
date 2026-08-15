import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEnvConfig, detectEnvironment } from '../utils/env.config';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/**
 * Blank every supported local override so a developer's ignored `.env` cannot influence these
 * committed tests. Blank overrides intentionally fall back to the checked-in deployment config.
 */
function stubBlankOverrides(): void {
  for (const key of [
    'VITE_BACKEND_STAGE',
    'VITE_API_BASE_URL',
    'VITE_GRAPHQL_URL',
    'VITE_CHATBOT_URL',
    'VITE_COGNITO_REGION',
    'VITE_COGNITO_USER_POOL_ID',
    'VITE_COGNITO_CLIENT_ID',
    'VITE_COGNITO_IDENTITY_POOL_ID',
    'VITE_COGNITO_ENDPOINT',
    'VITE_COGNITO_DOMAIN',
    'VITE_COGNITO_REDIRECT_SIGN_IN',
    'VITE_COGNITO_REDIRECT_SIGN_OUT',
    'VITE_ENABLE_ANALYTICS',
    'VITE_ENABLE_DEBUG',
    'VITE_API_TIMEOUT_MS',
    'VITE_LOG_LEVEL',
  ]) {
    vi.stubEnv(key, '');
  }
}

describe('env config', () => {
  it('uses the checked-in Gamma backend config when no local overrides are present', () => {
    stubBlankOverrides();

    const config = createEnvConfig('production');

    expect(config.backendStage).toBe('gamma');
    expect(config.apiBaseUrl).toBe('https://api.gamma.onehook.club');
    expect(config.graphqlUrl).toBe('https://graphql.api.gamma.onehook.club/graphql');
    expect(config.cognitoRegion).toBe('ap-south-1');
    expect(config.cognitoUserPoolId).toBe('ap-south-1_pN10ldNoo');
    expect(config.cognitoClientId).toBe('2rt0v69jq2acjaboom84cinign');
    expect(config.cognitoIdentityPoolId).toBe(
      'ap-south-1:8bfabd43-a446-4b8d-9201-b250cf3b62ef'
    );
    expect(config.cognitoEndpoint).toBe('https://cognito-idp.ap-south-1.amazonaws.com');
    expect(config.enableAnalytics).toBe(false);
    expect(config.enableDebug).toBe(false);
    expect(config.requestTimeoutMs).toBe(30_000);
    expect(config.logLevel).toBe('error');
    expect(config.isProduction).toBe(true);
    expect(config).not.toHaveProperty('wsUrl');
  });

  it('accepts explicit local overrides and strips trailing URL slashes', () => {
    stubBlankOverrides();
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.local.example/');
    vi.stubEnv('VITE_GRAPHQL_URL', 'https://graphql.local.example/graphql/');
    vi.stubEnv('VITE_ENABLE_ANALYTICS', 'true');
    vi.stubEnv('VITE_ENABLE_DEBUG', 'true');
    vi.stubEnv('VITE_API_TIMEOUT_MS', '45000');
    vi.stubEnv('VITE_LOG_LEVEL', 'warn');

    const config = createEnvConfig('development');

    expect(config.apiBaseUrl).toBe('https://api.local.example');
    expect(config.graphqlUrl).toBe('https://graphql.local.example/graphql');
    expect(config.enableAnalytics).toBe(true);
    expect(config.enableDebug).toBe(true);
    expect(config.requestTimeoutMs).toBe(45_000);
    expect(config.logLevel).toBe('warn');
    expect(config.isDevelopment).toBe(true);
  });

  it('fails loudly for an unknown checked-in backend stage', () => {
    stubBlankOverrides();
    vi.stubEnv('VITE_BACKEND_STAGE', 'production');

    expect(() => createEnvConfig('production')).toThrow(
      'Unknown frontend backend stage "production". Available stages: gamma.'
    );
  });

  it('fails loudly for an invalid explicit local override', () => {
    stubBlankOverrides();
    vi.stubEnv('VITE_ENABLE_DEBUG', 'sometimes');

    expect(() => createEnvConfig('development')).toThrow(
      'Invalid boolean value for VITE_ENABLE_DEBUG: sometimes'
    );
  });

  it('detects development from localhost hostnames', () => {
    vi.stubEnv('VITE_APP_ENV', '');
    vi.stubEnv('MODE', 'test');
    vi.stubGlobal('window', {
      location: { hostname: 'localhost' },
    } as unknown as Window & typeof globalThis);

    expect(detectEnvironment()).toBe('development');
  });

  it('falls back to production for unknown public hosts', () => {
    vi.stubEnv('VITE_APP_ENV', '');
    vi.stubEnv('MODE', 'test');
    vi.stubGlobal('window', {
      location: { hostname: 'app.onehook.club' },
    } as unknown as Window & typeof globalThis);

    expect(detectEnvironment()).toBe('production');
  });
});
