import { describe, expect, it } from 'vitest';
import { API_OPERATIONS } from '../lib/analytics/generated/apiManifest';
import { devApiProxy, DEV_API_TARGET, isProxied } from '../config/dev-proxy';

/**
 * On localhost the SDK calls the dev-server origin, so a REST prefix missing from the Vite proxy
 * silently breaks that feature in local development (as `/signals` once did). Every operation a
 * member's browser can call (Cognito or public auth) on the REST ingress must be proxied.
 */
describe('local dev proxy', () => {
  // The backend's manifest lists only REST-ingress services (Mr OneHook and the portal have their own).
  const browserCallable = API_OPERATIONS.filter((op) => op.auth === 'cognito' || op.auth === 'none');

  it('covers every Cognito and public route of the REST ingress', () => {
    const missing = browserCallable
      .filter((op) => !isProxied(op.path))
      .map((op) => `${op.method} ${op.path} (${op.operationId})`);
    expect(missing).toEqual([]);
  });

  it('forwards analytics ingest and photo stats', () => {
    expect(isProxied('/signals')).toBe(true);
    expect(isProxied('/signals/media-stats')).toBe(true);
  });

  it('sends every prefix to the Gamma ingress', () => {
    for (const entry of Object.values(devApiProxy())) {
      expect(entry).toEqual({ target: DEV_API_TARGET, changeOrigin: true, secure: true });
    }
  });
});
