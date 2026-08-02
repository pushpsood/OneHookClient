// TEMPORARY STUB: @onehook/api-client not built. Export a no-op client.
// import { OneHookService } from '@onehook/api-client';
export const OneHookService = class {
  middlewareStack = {
    add: () => {},
    addRelativeTo: () => {},
    remove: () => {},
  };
  constructor() {}
} as any;
import { apiBaseUrl, useMockApi } from '../utils/env.config';

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return (
    window.localStorage.getItem('id_token') ||
    window.localStorage.getItem('accessToken') ||
    window.sessionStorage.getItem('id_token') ||
    null
  );
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
  if (apiBaseUrl) return apiBaseUrl;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return useMockApi ? `${window.location.origin}/api/mock` : window.location.origin;
  }
  return 'http://localhost:3000';
}

export const sdkClient = new OneHookService({
  endpoint: resolveEndpoint(),
});

sdkClient.middlewareStack.add(
  (next) => async (args) => {
    const token = getAuthToken();
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
