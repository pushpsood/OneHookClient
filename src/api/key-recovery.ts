import { appSyncClient } from './chat';

/**
 * History-key recovery transport (AppSync GraphQL).
 *
 * This is the ROUTING layer for the flow documented in lib/key-recovery.ts: it carries session state
 * between two of the same user's devices and nothing else. What crosses this boundary is a single-use
 * public key, a random challenge, two device ids and a status. The sealed key bundle never does — it
 * is displayed as a QR code on one device and read by the other's camera.
 *
 * Types are declared locally rather than imported from `onehook-api-client/graphql`, because that
 * package is generated and published from the backend schema; declaring them here keeps the client
 * buildable in the same commit that adds the schema fields.
 */

export type KeyRecoveryStatus = 'PENDING' | 'DISPLAYING' | 'COMPLETED' | 'DECLINED';

export interface KeyRecoverySession {
  userId: string;
  sessionId: string;
  /** The already-registered device asked to hand over the history key. */
  sourceDeviceId: string;
  /** The new device receiving it. */
  targetDeviceId: string;
  /** Base64 SPKI P-256 public key the target minted for this session only. */
  targetEphemeralPublicKey: string;
  /** Base64 32-byte challenge minted by the target; the transfer HKDF salt. */
  challenge: string;
  status: KeyRecoveryStatus;
  /** Epoch milliseconds. */
  createdAt: number;
  /** Epoch milliseconds. After this the session is dead on both sides. */
  expiresAt: number;
}

const SESSION_FIELDS = `
  userId
  sessionId
  sourceDeviceId
  targetDeviceId
  targetEphemeralPublicKey
  challenge
  status
  createdAt
  expiresAt
`;

const REQUEST_KEY_RECOVERY = /* GraphQL */ `
  mutation RequestKeyRecovery(
    $sourceDeviceId: ID!
    $targetDeviceId: ID!
    $targetEphemeralPublicKey: String!
    $challenge: String!
  ) {
    requestKeyRecovery(
      sourceDeviceId: $sourceDeviceId
      targetDeviceId: $targetDeviceId
      targetEphemeralPublicKey: $targetEphemeralPublicKey
      challenge: $challenge
    ) {${SESSION_FIELDS}}
  }
`;

const UPDATE_KEY_RECOVERY = /* GraphQL */ `
  mutation UpdateKeyRecovery(
    $sourceDeviceId: ID!
    $targetDeviceId: ID!
    $sessionId: ID!
    $status: KeyRecoveryStatus!
  ) {
    updateKeyRecovery(
      sourceDeviceId: $sourceDeviceId
      targetDeviceId: $targetDeviceId
      sessionId: $sessionId
      status: $status
    ) {${SESSION_FIELDS}}
  }
`;

const GET_KEY_RECOVERY_REQUESTS = /* GraphQL */ `
  query GetKeyRecoveryRequests($sourceDeviceId: ID!) {
    getKeyRecoveryRequests(sourceDeviceId: $sourceDeviceId) {${SESSION_FIELDS}}
  }
`;

const GET_KEY_RECOVERY_SESSION = /* GraphQL */ `
  query GetKeyRecoverySession($sourceDeviceId: ID!, $targetDeviceId: ID!) {
    getKeyRecoverySession(sourceDeviceId: $sourceDeviceId, targetDeviceId: $targetDeviceId) {${SESSION_FIELDS}}
  }
`;

const ON_KEY_RECOVERY_REQUESTED = /* GraphQL */ `
  subscription OnKeyRecoveryRequested($userId: ID!, $sourceDeviceId: ID!) {
    onKeyRecoveryRequested(userId: $userId, sourceDeviceId: $sourceDeviceId) {${SESSION_FIELDS}}
  }
`;

const ON_KEY_RECOVERY_UPDATED = /* GraphQL */ `
  subscription OnKeyRecoveryUpdated($userId: ID!, $targetDeviceId: ID!) {
    onKeyRecoveryUpdated(userId: $userId, targetDeviceId: $targetDeviceId) {${SESSION_FIELDS}}
  }
`;

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = (await appSyncClient().graphql({ query, variables })) as unknown as { data: T };
  return res.data;
}

type Subscribable<T> = {
  subscribe: (observer: {
    next: (value: { data?: T }) => void;
    error: (error: unknown) => void;
  }) => { unsubscribe: () => void };
};

export const KeyRecoveryApi = {
  /**
   * Opens a session from the NEW device. Idempotent per device pair server-side: calling it again
   * before the previous session expires replaces that session rather than queueing a second one, so a
   * user who taps twice does not leave their other device with two prompts.
   */
  request: async (params: {
    sourceDeviceId: string;
    targetDeviceId: string;
    targetEphemeralPublicKey: string;
    challenge: string;
  }): Promise<KeyRecoverySession> => {
    const data = await graphql<{ requestKeyRecovery: KeyRecoverySession }>(
      REQUEST_KEY_RECOVERY,
      params
    );
    return data.requestKeyRecovery;
  },

  /** Advances a session: DISPLAYING (source), COMPLETED (target), or DECLINED (either). */
  update: async (params: {
    sourceDeviceId: string;
    targetDeviceId: string;
    sessionId: string;
    status: Exclude<KeyRecoveryStatus, 'PENDING'>;
  }): Promise<KeyRecoverySession> => {
    const data = await graphql<{ updateKeyRecovery: KeyRecoverySession }>(
      UPDATE_KEY_RECOVERY,
      params
    );
    return data.updateKeyRecovery;
  },

  /** Cold-start read for the SOURCE device: requests aimed at it that are still live. */
  listRequests: async (sourceDeviceId: string): Promise<KeyRecoverySession[]> => {
    const data = await graphql<{ getKeyRecoveryRequests: (KeyRecoverySession | null)[] | null }>(
      GET_KEY_RECOVERY_REQUESTS,
      { sourceDeviceId }
    );
    return (data.getKeyRecoveryRequests ?? []).filter((s): s is KeyRecoverySession => s != null);
  },

  /** Cold-start read / fallback poll for the TARGET device. `null` once the session is dead. */
  getSession: async (
    sourceDeviceId: string,
    targetDeviceId: string
  ): Promise<KeyRecoverySession | null> => {
    const data = await graphql<{ getKeyRecoverySession: KeyRecoverySession | null }>(
      GET_KEY_RECOVERY_SESSION,
      { sourceDeviceId, targetDeviceId }
    );
    return data.getKeyRecoverySession ?? null;
  },

  /**
   * SOURCE device: incoming requests. Subscribing with this device's own id means AppSync delivers
   * only the requests the user actually pointed at this device.
   */
  subscribeToRequests: (
    userId: string,
    sourceDeviceId: string,
    onRequest: (session: KeyRecoverySession) => void
  ): (() => void) => {
    const sub = (
      appSyncClient().graphql({
        query: ON_KEY_RECOVERY_REQUESTED,
        variables: { userId, sourceDeviceId },
      }) as unknown as Subscribable<{ onKeyRecoveryRequested?: KeyRecoverySession }>
    ).subscribe({
      next: ({ data }) => {
        if (data?.onKeyRecoveryRequested) onRequest(data.onKeyRecoveryRequested);
      },
      error: (err) => console.error('[recovery] onKeyRecoveryRequested subscription error', err),
    });
    return () => sub.unsubscribe();
  },

  /** TARGET device: status changes on its own request (notably the moment the QR goes up). */
  subscribeToUpdates: (
    userId: string,
    targetDeviceId: string,
    onUpdate: (session: KeyRecoverySession) => void
  ): (() => void) => {
    const sub = (
      appSyncClient().graphql({
        query: ON_KEY_RECOVERY_UPDATED,
        variables: { userId, targetDeviceId },
      }) as unknown as Subscribable<{ onKeyRecoveryUpdated?: KeyRecoverySession }>
    ).subscribe({
      next: ({ data }) => {
        if (data?.onKeyRecoveryUpdated) onUpdate(data.onKeyRecoveryUpdated);
      },
      error: (err) => console.error('[recovery] onKeyRecoveryUpdated subscription error', err),
    });
    return () => sub.unsubscribe();
  },
};
