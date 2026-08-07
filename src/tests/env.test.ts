import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEnvConfig, detectEnvironment } from '../utils/env.config';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('env config', () => {
  it('uses the development defaults when no overrides are supplied', () => {
    // Hermetic: a developer's local .env must never influence a committed test, so every
    // variable this assertion depends on is stubbed explicitly.
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_API_TIMEOUT_MS', '');
    vi.stubEnv('VITE_LOG_LEVEL', '');

    const config = createEnvConfig('development');

    expect(config.isDevelopment).toBe(true);
    expect(config.apiBaseUrl).toBe('/api/localstack');
    expect(config.requestTimeoutMs).toBe(30000);
    expect(config.logLevel).toBe('debug');
  });

  it('normalizes production overrides and strips trailing slashes', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://example.com/v1/');
    vi.stubEnv('VITE_WS_URL', 'wss://ws.example.com/');
    vi.stubEnv('VITE_ENABLE_ANALYTICS', 'false');
    vi.stubEnv('VITE_ENABLE_DEBUG', 'true');
    vi.stubEnv('VITE_LOG_LEVEL', 'warn');

    const config = createEnvConfig('production');

    expect(config.apiBaseUrl).toBe('https://example.com/v1');
    expect(config.wsUrl).toBe('wss://ws.example.com');
    expect(config.enableAnalytics).toBe(false);
    expect(config.enableDebug).toBe(true);
    expect(config.logLevel).toBe('warn');
    expect(config.isProduction).toBe(true);
  });

  it('detects staging from the current hostname when no explicit env is set', () => {
    vi.stubEnv('VITE_APP_ENV', '');
    vi.stubEnv('MODE', 'test');
    vi.stubGlobal('window', {
      location: { hostname: 'app-staging.onehook.club' },
    } as unknown as Window & typeof globalThis);

    expect(detectEnvironment()).toBe('staging');
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
