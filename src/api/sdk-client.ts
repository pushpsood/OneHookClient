import { OneHookService } from 'onehook-api-client';
import { config, apiBaseUrl } from '../utils/env.config';

async function getAuthToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || session.tokens?.accessToken?.toString() || 'dev-id-token';
  } catch (error) {
    return 'dev-id-token';
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
    return window.location.origin;
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
    const currentEndpoint = resolveEndpoint();
    try {
      const url = new URL(currentEndpoint);
      (args.request as any).protocol = url.protocol;
      (args.request as any).hostname = url.hostname;
      (args.request as any).port = url.port ? Number.parseInt(url.port, 10) : undefined;
    } catch {
      // Ignore URL parse error
    }
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
// Force reload
if (typeof window !== 'undefined') { (window as any).sdkClient = sdkClient; }
