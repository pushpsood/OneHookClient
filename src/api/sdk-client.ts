import { OneHookService } from '@onehook/api-client';
import { apiBaseUrl, useMockApi } from '../utils/env.config';

async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || session.tokens?.accessToken?.toString() || null;
  } catch (error) {
    console.error('Failed to fetch auth session:', error);
    return null;
  }
}

/**
 * The Smithy client parses the endpoint with `new URL(...)` at construction
 * time, so it MUST be a valid absolute URL. In local dev / mock mode
 * `apiBaseUrl` is empty, which would throw "Failed to construct 'URL'" and
 * crash the whole app before it renders. Fall back to the current origin (or a
 * localhost default during SSR/tests) so construction always succeeds; real
 * calls are still routed to `apiBaseUrl` in deployed environments and are
 * intercepted by the mock server in dev.
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
    return useMockApi ? `${window.location.origin}/api/mock` : window.location.origin;
  }
  return 'http://localhost:3000';
}

import { FetchHttpHandler } from '@smithy/fetch-http-handler';

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
  { step: 'build', name: 'authMiddleware' }
);
// Force reload
if (typeof window !== 'undefined') { (window as any).sdkClient = sdkClient; }
