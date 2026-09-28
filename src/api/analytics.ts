/**
 * Analytics client-signal ingest transport (`POST /signals`).
 *
 * This is the analytics counterpart to {@link file://./rest.ts}: the generated Smithy SDK
 * (`onehook-api-client`) does not model the ingest endpoint, so — exactly like the block/distance/
 * swipe endpoints — the call goes through a thin authenticated REST helper that authenticates
 * IDENTICALLY to `sdk-client.ts` (the Cognito **ID token**, falling back to the access token, is
 * read from the Amplify auth session and attached as a `Bearer` token). Because the ingest is now
 * routed under the unified `api.<stage>.onehook.club` domain (see api-stack's `signals*` behavior),
 * the request rides the same base URL + Cognito authorizer as every other onehook-api-client call.
 *
 * The server re-stamps identity and time and marks every signal `unverified`, so the client only
 * has to be well-behaved: send the caller's JWT, name the platform via `X-OneHook-Platform`, and
 * POST `{ signals: [...] }`. On any failure this throws {@link ApiError} so the batching client
 * ({@link file://../lib/analytics/analyticsClient.ts}) re-queues and retries.
 */
import { apiBaseUrl } from '../utils/env.config';
import { ApiError } from '../lib/api-client';
import type { AnalyticsTransport, Signal } from '../lib/analytics/analyticsClient';

/**
 * Reads the caller's Cognito JWT the same way `sdk-client.ts`/`rest.ts` do: the ID token first (the
 * API Gateway Cognito authorizer validates it), falling back to the access token. Returns null when
 * unauthenticated so the request is still attempted (and rejected by the server) rather than
 * throwing here.
 */
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
 * Resolve `/signals` against the configured base URL, mirroring `rest.ts`: on localhost the dev
 * origin is used (the Vite proxy forwards to the backend), otherwise the absolute `apiBaseUrl`.
 */
function resolveUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return window.location.origin + suffix;
  }
  if (apiBaseUrl) {
    if (apiBaseUrl.startsWith('http')) return apiBaseUrl + suffix;
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin + suffix;
    }
    return apiBaseUrl + suffix;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin + suffix;
  }
  return `http://localhost:3000${suffix}`;
}

/**
 * POST a batch of behavioural signals to the ingest. Throws {@link ApiError} on transport failure
 * or a non-2xx response so the caller re-queues.
 */
export async function sendSignals(batch: Signal[]): Promise<void> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // Lets the server attribute the platform without trusting the body.
    'X-OneHook-Platform': 'web',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(resolveUrl('/signals'), {
      method: 'POST',
      headers,
      body: JSON.stringify({ signals: batch }),
    });
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : 'Network request failed',
      0,
      'NETWORK_ERROR'
    );
  }
  if (!res.ok) {
    throw new ApiError('analytics ingest failed', res.status, 'ANALYTICS_INGEST_FAILED');
  }
}

/** The {@link AnalyticsTransport} the app's analytics client uses. */
export const signalsTransport: AnalyticsTransport = {
  send: (batch) => sendSignals(batch),
};
