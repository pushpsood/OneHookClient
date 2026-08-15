import { OneHookService } from 'onehook-api-client';
import { apiBaseUrl } from '../utils/env.config';
import { FetchHttpHandler } from '@smithy/fetch-http-handler';

async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || session.tokens?.accessToken?.toString() || null;
  } catch {
    return null;
  }
}

/**
 * The Smithy client parses the endpoint with `new URL(...)` at construction time, so it MUST be a
 * valid absolute URL. All services are served behind a single REST domain (`VITE_API_BASE_URL`,
 * e.g. https://api.onehook.club), so there is exactly one endpoint and no per-service routing.
 * Fall back to the current origin (or a localhost default during SSR/tests) so construction always
 * succeeds even when `apiBaseUrl` is not an absolute URL.
 */
function resolveEndpoint(): string {
  if (apiBaseUrl) {
    if (apiBaseUrl.startsWith('http')) return apiBaseUrl;
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin + (apiBaseUrl.startsWith('/') ? '' : '/') + apiBaseUrl;
    }
    return apiBaseUrl;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

export const sdkClient = new OneHookService({
  endpoint: resolveEndpoint(),
  requestHandler: new FetchHttpHandler(),
});

sdkClient.middlewareStack.add(
  (next) => async (args) => {
    const token = await getAuthToken();
    if (token) {
      if (!(args.request as any).headers) {
        (args.request as any).headers = {};
      }
      (args.request as any).headers['Authorization'] = `Bearer ${token}`;
    }
    return next(args);
  },
  { step: 'build', name: 'authMiddleware', override: true }
);
