import { apiBaseUrl, requestTimeoutMs } from '../utils/env.config';
import type { UserStateSnapshot } from '../types';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestConfig extends RequestInit {
  retry?: boolean;
  retries?: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function getStorageValue(storage: Storage | undefined, key: string): string | null {
  if (!storage) return null;

  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function mergeHeaders(...sources: Array<HeadersInit | undefined>): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const source of sources) {
    if (!source) continue;

    if (source instanceof Headers) {
      source.forEach((value, key) => {
        merged[key] = value;
      });
      continue;
    }

    if (Array.isArray(source)) {
      for (const [key, value] of source) {
        merged[key] = value;
      }
      continue;
    }

    Object.assign(merged, source);
  }

  return merged;
}

async function getAuthToken(): Promise<string | null> {
  if (!isBrowser()) return null;

  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    console.log('[api-client] fetchAuthSession result:', session);
    const token = session.tokens?.idToken?.toString() || session.tokens?.accessToken?.toString() || null;
    console.log('[api-client] resolved token:', token ? 'exists' : 'null');
    return token;
  } catch (error) {
    console.error('[api-client] Failed to fetch auth session:', error);
    return null;
  }
}

async function refreshToken(): Promise<string | null> {
  if (!isBrowser()) return null;

  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession({ forceRefresh: true });
    return session.tokens?.idToken?.toString() || session.tokens?.accessToken?.toString() || null;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
}

export async function apiRequest<T>(endpoint: string, options: RequestConfig = {}): Promise<T> {
  const { retry = true, retries = 0, ...fetchOptions } = options;

  const token = await getAuthToken();
  let url = `${apiBaseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = mergeHeaders({ 'Content-Type': 'application/json' }, fetchOptions.headers);

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), requestTimeoutMs);
    let response: Response;

    try {
      response = await fetch(url, {
        ...fetchOptions,
        headers,
        signal: fetchOptions.signal ?? controller.signal,
      });
    } finally {
      globalThis.clearTimeout(timeout);
    }

    if (response.status === 401 && retry) {
      const newToken = await refreshToken();
      if (newToken) {
        headers['Authorization'] = `Bearer ${newToken}`;
        const retryResponse = await fetch(url, { ...fetchOptions, headers });
        if (retryResponse.ok) {
          return parseResponse<T>(retryResponse);
        }
      }
      if (isBrowser()) {
        window.location.assign('/login');
      }
      throw new ApiError('Authentication required', 401, 'UNAUTHORIZED');
    }

    if (response.status === 429 && retry && retries < MAX_RETRIES) {
      const retryAfter = response.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_DELAY * (retries + 1);
      await sleep(delay);
      return apiRequest<T>(endpoint, { ...options, retries: retries + 1 });
    }

    if (response.status >= 500 && retry && retries < MAX_RETRIES) {
      await sleep(RETRY_DELAY * (retries + 1));
      return apiRequest<T>(endpoint, { ...options, retries: retries + 1 });
    }

    if (!response.ok) {
      let errorData: any;
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }

      throw new ApiError(
        errorData.message || `Request failed with status ${response.status}`,
        response.status,
        errorData.code,
        errorData.details
      );
    }

    return parseResponse<T>(response);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof TypeError) {
      throw new ApiError('Network error. Please check your connection.', 0, 'NETWORK_ERROR');
    }

    throw new ApiError('An unexpected error occurred', 0, 'UNKNOWN_ERROR', error);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) {
    return undefined as T;
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return response.text() as unknown as T;
}

/**
 * Triggers a synchronous entitlement reconciliation and returns the caller's freshly reconciled
 * state. Deliberately body-less: the caller is taken from the verified JWT and the tier is resolved
 * from the billing source of truth, so a client can request a re-check but never assert the outcome.
 */
export async function upgradeSubscription(): Promise<UserStateSnapshot> {
  return apiRequest<UserStateSnapshot>('/state/upgrade', {
    method: 'POST',
  });
}



export const api = {
  get: <T>(endpoint: string, options?: RequestConfig) =>
    apiRequest<T>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, data?: unknown, options?: RequestConfig) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data?: unknown, options?: RequestConfig) =>
    apiRequest<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestConfig) =>
    apiRequest<T>(endpoint, { ...options, method: 'DELETE' }),
};
