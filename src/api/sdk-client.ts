import { OneHook } from 'onehook-api-client';
import { apiBaseUrl, cognitoRegion } from '../utils/env.config';
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
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      return window.location.origin;
    }
  }
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

export const sdkClient = new OneHook({
  endpoint: resolveEndpoint(),
  requestHandler: new FetchHttpHandler(),
  // The generated client's config/endpoint resolution requires a region (the model declares
  // `@sigv4`). We don't sign requests (see below), but the SDK still throws "Region is missing"
  // without one, so we pass the API's region. It is not used for auth — the Cognito JWT is.
  region: cognitoRegion || 'ap-south-1',
  // The Smithy model declares `@sigv4`, so the generated client's auth resolver would otherwise
  // demand AWS credentials and SigV4-sign every request. This browser client does NOT use IAM —
  // it authenticates to the API Gateway Cognito authorizer with a Cognito JWT (attached as a
  // Bearer token by `authMiddleware` below). We supply a no-op credentials provider purely so the
  // auth resolver doesn't throw `CredentialsProviderError`, then remove the signing middleware
  // (see below) so the SigV4 signer never runs and never clobbers the Bearer `Authorization` header.
  credentials: async () => ({ accessKeyId: 'unused', secretAccessKey: 'unused' }),
});

// Drop SigV4 request signing: authentication is the Cognito JWT Bearer token added in `authMiddleware`.
// Without this, the signer overwrites `Authorization` with a SigV4 signature and the Cognito
// authorizer rejects the request (and the resolver throws when no AWS credentials are present).
try {
  sdkClient.middlewareStack.remove('httpSigningMiddleware');
} catch {
  /* middleware name stable across the generated SDK; ignore if already absent */
}

function parseJwtSub(token: string): string | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const parsed = JSON.parse(jsonPayload);
    return parsed.sub || parsed['cognito:username'] || null;
  } catch {
    return null;
  }
}

sdkClient.middlewareStack.add(
  (next) => async (args) => {
    const token = await getAuthToken();
    if (token) {
      if (!(args.request as any).headers) {
        (args.request as any).headers = {};
      }
      (args.request as any).headers['Authorization'] = `Bearer ${token}`;
      const sub = parseJwtSub(token);
      if (sub) {
        (args.request as any).headers['X-User-Id'] = sub;
      }
    }
    return next(args);
  },
  { step: 'build', name: 'authMiddleware', override: true }
);

sdkClient.middlewareStack.add(
  (next) => async (args) => {
    const request = args.request as any;
    if (request?.headers) {
      delete request.headers['amz-sdk-request'];
      delete request.headers['amz-sdk-invocation-id'];
    }
    return next(args);
  },
  { step: 'finalizeRequest', name: 'stripAmzSdkHeaders', priority: 'low' }
);
