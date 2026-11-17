/**
 * Live-location AppSync operations (OneHookBackend/packages/api-models/model/schema.graphql, "Live
 * location sharing"; contract in OneHookBackend/docs/chat-location-contact.md).
 *
 * Receiving: running shares on open (`getLiveLocations`), then `onLiveLocation`. Sending: the sharer
 * publishes sealed positions (`publishLiveLocation`) and ends its own share (`stopLiveLocation`).
 * Every selection set carries all seven `LiveLocationUpdate` fields: subscribers only receive the
 * fields the triggering mutation selected, so a publish without `ciphertext` would reach peers empty.
 * `ciphertext` is the sealed `live_location_update` payload, sealed and opened with the same wire-v2
 * envelope and `matchId` AAD as a message body, on device.
 */
import { Amplify } from 'aws-amplify';
import { appSyncClient } from './chat';
import { hasGraphQLErrors, toGraphQLError } from './graphql-error';
import type { LiveLocationRow } from '../lib/live-location';

export type LiveLocationUpdate = LiveLocationRow;

const ROW_FIELDS = /* GraphQL */ `
      matchId
      userId
      sessionId
      ciphertext
      at
      expiresAt
      ended
`;

export const GET_LIVE_LOCATIONS = /* GraphQL */ `
  query GetLiveLocations($matchId: ID!) {
    getLiveLocations(matchId: $matchId) {${ROW_FIELDS}    }
  }
`;

export const ON_LIVE_LOCATION = /* GraphQL */ `
  subscription OnLiveLocation($matchId: ID!) {
    onLiveLocation(matchId: $matchId) {${ROW_FIELDS}    }
  }
`;

export const PUBLISH_LIVE_LOCATION = /* GraphQL */ `
  mutation PublishLiveLocation($matchId: ID!, $sessionId: ID!, $ciphertext: String!, $expiresAt: AWSTimestamp!) {
    publishLiveLocation(matchId: $matchId, sessionId: $sessionId, ciphertext: $ciphertext, expiresAt: $expiresAt) {${ROW_FIELDS}    }
  }
`;

export const STOP_LIVE_LOCATION = /* GraphQL */ `
  mutation StopLiveLocation($matchId: ID!, $sessionId: ID!) {
    stopLiveLocation(matchId: $matchId, sessionId: $sessionId) {${ROW_FIELDS}    }
  }
`;

/** Drops rows that are missing a field the merge relies on (a partial subscription payload). */
function isRow(value: unknown): value is LiveLocationUpdate {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.matchId === 'string' &&
    typeof row.userId === 'string' &&
    typeof row.sessionId === 'string' &&
    typeof row.at === 'number' &&
    typeof row.expiresAt === 'number' &&
    typeof row.ended === 'boolean'
  );
}

/** One GraphQL call over the shared Cognito-authorized client, with the server's errors preserved. */
async function run(query: string, variables: Record<string, unknown>): Promise<unknown> {
  let res: unknown;
  try {
    res = await appSyncClient().graphql({ query, variables });
  } catch (raw) {
    throw toGraphQLError(raw, 'The chat service could not be reached.');
  }
  if (hasGraphQLErrors(res)) {
    throw toGraphQLError(res, 'The chat service rejected the request.');
  }
  return res;
}

// ── Stop on tab close ────────────────────────────────────────────────────────
//
// When the tab closes, the page cannot await anything: Amplify's client resolves the auth token
// asynchronously, so a request started from `pagehide` through it is usually never sent. The only
// request that reliably outlives the page is a `fetch` with `keepalive: true` issued synchronously in
// the handler. `navigator.sendBeacon` cannot be used: it cannot set the `Authorization` header AppSync
// needs. So the sharer keeps a copy of the current Cognito access token (refreshed on every publish,
// through Amplify, which refreshes it when it expires) and the unload path posts `stopLiveLocation`
// with it directly. Best effort by nature: if the browser drops the request, the share still ends at
// `expiresAt` and receivers stop showing it then.

interface UnloadAuth {
  endpoint: string;
  token: string;
  /** Epoch ms after which the token is no longer accepted. */
  expiresAt: number;
}

let unloadAuth: UnloadAuth | null = null;

/** Refreshes the token copy the unload path uses. Never throws. */
async function primeUnloadAuth(): Promise<void> {
  try {
    const endpoint = (Amplify.getConfig() as { API?: { GraphQL?: { endpoint?: string } } }).API?.GraphQL?.endpoint;
    if (!endpoint) return;
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    const access = session.tokens?.accessToken;
    if (!access) return;
    const exp = typeof access.payload?.exp === 'number' ? access.payload.exp * 1000 : Date.now() + 5 * 60_000;
    unloadAuth = { endpoint, token: access.toString(), expiresAt: exp };
  } catch {
    /* the unload stop is best effort; expiry ends the share anyway */
  }
}

/** Forgets the token copy (signed out, or nothing left to stop). */
function clearUnloadAuth(): void {
  unloadAuth = null;
}

/**
 * Sends `stopLiveLocation` from a `pagehide` handler. Synchronous: it only starts a keepalive fetch.
 * Returns false when it could not even be attempted (no fresh token, no fetch keepalive support).
 */
function stopOnUnload(matchId: string, sessionId: string, now = Date.now()): boolean {
  const auth = unloadAuth;
  if (!auth || auth.expiresAt - 10_000 <= now) return false;
  try {
    // A direct request to the AppSync endpoint (not a Smithy route), listed in the EXCEPTIONS of
    // src/tests/api-route-contract.test.ts.
    void fetch(auth.endpoint, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json', Authorization: auth.token },
      body: JSON.stringify({ query: STOP_LIVE_LOCATION, variables: { matchId, sessionId } }),
    }).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

export const LiveLocationApi = {
  /** Running shares of both members (not ended, not expired). Empty while the chat is suspended. */
  getLiveLocations: async (matchId: string): Promise<LiveLocationUpdate[]> => {
    const res = await run(GET_LIVE_LOCATIONS, { matchId });
    const rows = (res as { data?: { getLiveLocations?: unknown[] | null } }).data?.getLiveLocations ?? [];
    return rows.filter(isRow);
  },

  /**
   * Stores the caller's latest sealed position for one share and fans it out. The first accepted
   * publish of a `sessionId` starts the share. Errors keep their `errorType` (`Throttled`,
   * `LIVE_LOCATION_ENDED`, `CONVERSATION_SUSPENDED`, `Unauthorized`, `BadRequest`).
   */
  publishLiveLocation: async (
    matchId: string,
    sessionId: string,
    ciphertext: string,
    expiresAt: number
  ): Promise<LiveLocationUpdate | null> => {
    const res = await run(PUBLISH_LIVE_LOCATION, { matchId, sessionId, ciphertext, expiresAt });
    void primeUnloadAuth();
    const row = (res as { data?: { publishLiveLocation?: unknown } }).data?.publishLiveLocation;
    return isRow(row) ? row : null;
  },

  /** Ends one of the caller's own shares. Idempotent, and allowed while the chat is suspended. */
  stopLiveLocation: async (matchId: string, sessionId: string): Promise<LiveLocationUpdate | null> => {
    const res = await run(STOP_LIVE_LOCATION, { matchId, sessionId });
    const row = (res as { data?: { stopLiveLocation?: unknown } }).data?.stopLiveLocation;
    return isRow(row) ? row : null;
  },

  primeUnloadAuth,
  clearUnloadAuth,
  stopOnUnload,

  /** Follows live-location updates and ends for a match. Returns an unsubscribe function. */
  subscribe: (matchId: string, onUpdate: (row: LiveLocationUpdate) => void): (() => void) => {
    const sub = (
      appSyncClient().graphql({ query: ON_LIVE_LOCATION, variables: { matchId } }) as unknown as {
        subscribe: (o: {
          next: (v: { data?: { onLiveLocation?: unknown } }) => void;
          error: (e: unknown) => void;
        }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: ({ data }) => {
        const row = data?.onLiveLocation;
        if (isRow(row)) onUpdate(row);
      },
      error: (err) => console.error('[chat] onLiveLocation subscription error', err),
    });
    return () => sub.unsubscribe();
  },
};
