/**
 * Clients for the two APIs the web app calls that are not OneHook backend APIs, each from the package its
 * owner publishes:
 *
 *  - `onehook-mr-onehook-client` (OneHookUXEnhancement, MrOneHookService): Mr OneHook on Azure at
 *    `chatbotUrl`. Member routes take the Cognito ID token as a Bearer token; the public product chat
 *    and health routes take none.
 *  - `saha-equation-admin-portal-client` (OneHookAdminPortal): the portal's public feature APIs for any tenant.
 *    OneHook is the tenant `{service, stage}` read from `portalModerationBaseUrl`
 *    (https://admin.onehook.club/api/p/onehook/<stage>/moderation); the portal client binds it.
 *
 * Both are built with `maxAttempts: 1`: a Mr OneHook turn counts against the member's daily quota, and
 * the evidence flow does its own bounded retry of `complete`. The `amz-sdk-*` and `x-amz-user-agent`
 * headers are dropped so neither service has to allow them in CORS.
 */
import { MrOneHookService } from 'onehook-mr-onehook-client';
import { createPortalClient, portalTenantFromUrl, type PortalClient } from 'saha-equation-admin-portal-client';
import { FetchHttpHandler } from '@smithy/fetch-http-handler';
import { chatbotUrl, portalModerationBaseUrl } from '../utils/env.config';

/** The member's Cognito ID token, or null when signed out. */
export async function fetchIdToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() || null;
  } catch {
    return null;
  }
}

/** Bearer token provider for the generated clients; a missing token fails the call before it is sent. */
async function bearerToken(): Promise<{ token: string }> {
  const token = await fetchIdToken();
  if (!token) throw new Error('NOT_AUTHENTICATED');
  return { token };
}

const SDK_HEADERS = ['amz-sdk-request', 'amz-sdk-invocation-id', 'x-amz-user-agent'];

type StrippableClient = {
  middlewareStack: {
    add: (
      mw: (next: (args: { request: unknown }) => Promise<unknown>) => (args: { request: unknown }) => Promise<unknown>,
      opts: { step: 'finalizeRequest'; name: string; priority: 'low' }
    ) => void;
  };
};

function stripSdkHeaders(client: StrippableClient): void {
  client.middlewareStack.add(
    (next) => async (args) => {
      const headers = (args.request as { headers?: Record<string, string> })?.headers;
      if (headers) for (const h of SDK_HEADERS) delete headers[h];
      return next(args);
    },
    { step: 'finalizeRequest', name: 'stripSdkHeaders', priority: 'low' }
  );
}

/** The Smithy client needs an absolute endpoint at construction; tests and SSR get a placeholder. */
function absolute(url: string): string {
  return /^https?:\/\//.test(url) ? url : 'http://localhost:3000';
}

export const mrOneHookClient = new MrOneHookService({
  endpoint: absolute(chatbotUrl),
  requestHandler: new FetchHttpHandler(),
  token: bearerToken,
  maxAttempts: 1,
});
stripSdkHeaders(mrOneHookClient as unknown as StrippableClient);

/** The OneHook tenant's moderation-evidence API: `presignEvidence` / `completeEvidence` with the tenant bound. */
export type EvidenceClient = PortalClient['moderationEvidence'];

export function createModerationEvidenceClient(
  baseUrl: string = portalModerationBaseUrl,
  getToken: () => Promise<string | null> = fetchIdToken,
  /** Tests pass a handler over a fake `fetch`; the app uses the browser `fetch`. */
  requestHandler: NonNullable<Parameters<typeof createPortalClient>[0]['clientConfig']>['requestHandler'] = new FetchHttpHandler()
): EvidenceClient {
  const { endpoint, tenant, feature } = portalTenantFromUrl(absolute(baseUrl));
  if (feature !== 'moderation') throw new Error(`portalModerationBaseUrl must end in /moderation, got ${baseUrl}`);
  const portal = createPortalClient({
    endpoint,
    tenant,
    tokens: {
      moderationEvidence: async () => {
        const token = await getToken();
        if (!token) throw new Error('NOT_AUTHENTICATED');
        return { token };
      },
    },
    clientConfig: { requestHandler, maxAttempts: 1 },
  });
  stripSdkHeaders(portal.clients.moderationEvidence as unknown as StrippableClient);
  return portal.moderationEvidence;
}

/** A failed call's HTTP status and its error body fields (the SDK copies the body onto the exception). */
export interface SdkFailure {
  status: number;
  body: Record<string, unknown>;
}

const NON_BODY_KEYS = new Set(['name', 'message', 'stack', '$fault', '$metadata', '$response', '$retryable']);

/** The HTTP failure inside an SDK exception, or null for a network or client-side error. */
export function sdkFailure(err: unknown): SdkFailure | null {
  const status = (err as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata?.httpStatusCode;
  if (typeof status !== 'number') return null;
  const body: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(err as Record<string, unknown>)) {
    if (!NON_BODY_KEYS.has(k)) body[k] = v;
  }
  return { status, body };
}

/** An SDK output without `$metadata`. */
export function withoutMetadata<T extends object>(out: T): Omit<T, '$metadata'> {
  const { $metadata: _metadata, ...rest } = out as T & { $metadata?: unknown };
  return rest;
}
