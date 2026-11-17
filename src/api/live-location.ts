/**
 * Live-location AppSync operations (OneHookBackend/packages/api-models/model/schema.graphql, "Live
 * location sharing"; contract in OneHookBackend/docs/chat-location-contact.md).
 *
 * Web receives and opens only, so it reads running shares on open (`getLiveLocations`) and follows
 * `onLiveLocation`. It never publishes or stops a share. Every selection set carries all seven
 * `LiveLocationUpdate` fields. `ciphertext` is the sealed `live_location_update` payload: it is opened
 * with the same wire-v2 envelope and `matchId` AAD as a message body, on device.
 */
import { appSyncClient } from './chat';
import { hasGraphQLErrors, toGraphQLError } from './graphql-error';
import type { LiveLocationRow } from '../lib/live-location';

export type LiveLocationUpdate = LiveLocationRow;

export const GET_LIVE_LOCATIONS = /* GraphQL */ `
  query GetLiveLocations($matchId: ID!) {
    getLiveLocations(matchId: $matchId) {
      matchId
      userId
      sessionId
      ciphertext
      at
      expiresAt
      ended
    }
  }
`;

export const ON_LIVE_LOCATION = /* GraphQL */ `
  subscription OnLiveLocation($matchId: ID!) {
    onLiveLocation(matchId: $matchId) {
      matchId
      userId
      sessionId
      ciphertext
      at
      expiresAt
      ended
    }
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

export const LiveLocationApi = {
  /** Running shares of both members (not ended, not expired). Empty while the chat is suspended. */
  getLiveLocations: async (matchId: string): Promise<LiveLocationUpdate[]> => {
    let res: unknown;
    try {
      res = await appSyncClient().graphql({ query: GET_LIVE_LOCATIONS, variables: { matchId } });
    } catch (raw) {
      throw toGraphQLError(raw, 'The chat service could not be reached.');
    }
    if (hasGraphQLErrors(res)) {
      throw toGraphQLError(res, 'The chat service rejected the request.');
    }
    const rows = (res as { data?: { getLiveLocations?: unknown[] | null } }).data?.getLiveLocations ?? [];
    return rows.filter(isRow);
  },

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
