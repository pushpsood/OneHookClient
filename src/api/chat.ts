import { generateClient } from 'aws-amplify/api';
import { sdkClient } from './sdk-client';
import { apiBaseUrl } from '../utils/env.config';
import type {
  Message as ChatMessage,
  MessageReceipt,
  DeletedMessage,
} from 'onehook-api-client/graphql';

export type { ChatMessage, MessageReceipt, DeletedMessage };

/**
 * Chat service client.
 *
 * Design philosophy (see OneHookBackend/packages/chat):
 *  - Real-time messaging is served by AWS AppSync GraphQL over WebSocket (NOT
 *    REST). History is read ONLY via the `getMessages` query. Delivery/read
 *    receipts and message deletion are PREMIUM-tier mutations (the server
 *    enforces the tier from the caller's JWT).
 *  - Messages carry only `ciphertext`; the server never sees plaintext (E2EE).
 *  - REST (via the generated SDK) is used only for multi-device key management and
 *    bulk match-message deletion:
 *      POST   /chat/devices                     -> register/refresh this device
 *      GET    /chat/devices                     -> own device registry
 *      DELETE /chat/devices/{deviceId}          -> revoke a device
 *      GET    /chat/registry/{userId}?matchId=  -> a peer's device registry
 *      DELETE /chat/match/{matchId}             -> hard-delete a match's messages
 */

// ─────────────────────────────────────────────────────────────────────────────
// GraphQL documents (AppSync schema: OneHookBackend/packages/api-models/model/schema.graphql)
// ─────────────────────────────────────────────────────────────────────────────

const GET_MESSAGES = /* GraphQL */ `
  query GetMessages($matchId: ID!, $after: AWSTimestamp) {
    getMessages(matchId: $matchId, after: $after) {
      messageId
      matchId
      senderId
      ciphertext
      timestamp
      status
      deliveredAt
      readAt
    }
  }
`;

const SEND_MESSAGE = /* GraphQL */ `
  mutation SendMessage($matchId: ID!, $senderId: String!, $ciphertext: String!) {
    sendMessage(matchId: $matchId, senderId: $senderId, ciphertext: $ciphertext) {
      messageId
      matchId
      senderId
      ciphertext
      timestamp
      status
    }
  }
`;

const MARK_AS_DELIVERED = /* GraphQL */ `
  mutation MarkAsDelivered($matchId: ID!, $timestamp: AWSTimestamp!, $messageId: ID!, $userId: String!) {
    markAsDelivered(matchId: $matchId, timestamp: $timestamp, messageId: $messageId, userId: $userId) {
      messageId
      status
      timestamp
    }
  }
`;

const MARK_AS_READ = /* GraphQL */ `
  mutation MarkAsRead($matchId: ID!, $timestamp: AWSTimestamp!, $messageId: ID!, $userId: String!) {
    markAsRead(matchId: $matchId, timestamp: $timestamp, messageId: $messageId, userId: $userId) {
      messageId
      status
      timestamp
    }
  }
`;

const DELETE_MESSAGE = /* GraphQL */ `
  mutation DeleteMessage($matchId: ID!, $timestamp: AWSTimestamp!) {
    deleteMessage(matchId: $matchId, timestamp: $timestamp) {
      matchId
      messageId
      timestamp
    }
  }
`;

const ON_NEW_MESSAGE = /* GraphQL */ `
  subscription OnNewMessage($matchId: ID!) {
    onNewMessage(matchId: $matchId) {
      messageId
      matchId
      senderId
      ciphertext
      timestamp
      status
    }
  }
`;

const ON_MESSAGE_STATUS_UPDATE = /* GraphQL */ `
  subscription OnMessageStatusUpdate($matchId: ID!) {
    onMessageStatusUpdate(matchId: $matchId) {
      messageId
      status
      timestamp
    }
  }
`;

const ON_MESSAGE_DELETED = /* GraphQL */ `
  subscription OnMessageDeleted($matchId: ID!) {
    onMessageDeleted(matchId: $matchId) {
      matchId
      messageId
      timestamp
    }
  }
`;

let _client: ReturnType<typeof generateClient> | null = null;
function client() {
  if (!_client) {
    _client = generateClient();
  }
  return _client;
}

/**
 * The shared AppSync client. Exported so sibling modules (history-key recovery) issue their
 * operations over the same configured, Cognito-authorized connection instead of standing up a
 * second one.
 */
export function appSyncClient() {
  return client();
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = (await client().graphql({ query, variables })) as unknown as { data: T };
  return res.data;
}

/**
 * AppSync GraphQL messaging API. Message bodies are encrypted on the device before they are sent
 * (see lib/chat-encryption.ts), so every value crossing this boundary is ciphertext.
 */
export const ChatMessagingApi = {
  getMessages: async (matchId: string, after?: number): Promise<ChatMessage[]> => {
    const data = await graphql<{ getMessages: (ChatMessage | null)[] | null }>(GET_MESSAGES, {
      matchId,
      after,
    });
    return (data.getMessages ?? []).filter((m): m is ChatMessage => m != null);
  },

  sendMessage: async (
    matchId: string,
    senderId: string,
    ciphertext: string
  ): Promise<ChatMessage> => {
    const data = await graphql<{ sendMessage: ChatMessage }>(SEND_MESSAGE, {
      matchId,
      senderId,
      ciphertext,
    });
    return data.sendMessage;
  },

  /** PREMIUM only — the server rejects FREE-tier callers. */
  markAsDelivered: async (
    matchId: string,
    timestamp: number,
    messageId: string,
    userId: string
  ): Promise<MessageReceipt | null> => {
    const data = await graphql<{ markAsDelivered: MessageReceipt }>(MARK_AS_DELIVERED, {
      matchId,
      timestamp,
      messageId,
      userId,
    });
    return data.markAsDelivered;
  },

  /** PREMIUM only — the server rejects FREE-tier callers. */
  markAsRead: async (
    matchId: string,
    timestamp: number,
    messageId: string,
    userId: string
  ): Promise<MessageReceipt | null> => {
    const data = await graphql<{ markAsRead: MessageReceipt }>(MARK_AS_READ, {
      matchId,
      timestamp,
      messageId,
      userId,
    });
    return data.markAsRead;
  },

  /** PREMIUM only — deletes a single message for everyone. */
  deleteMessage: async (matchId: string, timestamp: number): Promise<DeletedMessage | null> => {
    const data = await graphql<{ deleteMessage: DeletedMessage }>(DELETE_MESSAGE, {
      matchId,
      timestamp,
    });
    return data.deleteMessage;
  },

  /** Subscribe to new messages for a match. Returns an unsubscribe function. */
  subscribeToNewMessages: (matchId: string, onMessage: (m: ChatMessage) => void): (() => void) => {
    const sub = (
      client().graphql({ query: ON_NEW_MESSAGE, variables: { matchId } }) as unknown as {
        subscribe: (o: { next: (v: { data?: { onNewMessage?: ChatMessage } }) => void; error: (e: unknown) => void }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: ({ data }) => {
        if (data?.onNewMessage) onMessage(data.onNewMessage);
      },
      error: (err) => console.error('[chat] onNewMessage subscription error', err),
    });
    return () => sub.unsubscribe();
  },

  /** Subscribe to delivery/read receipt updates. Returns an unsubscribe function. */
  subscribeToStatusUpdates: (
    matchId: string,
    onUpdate: (r: MessageReceipt) => void
  ): (() => void) => {
    const sub = (
      client().graphql({ query: ON_MESSAGE_STATUS_UPDATE, variables: { matchId } }) as unknown as {
        subscribe: (o: { next: (v: { data?: { onMessageStatusUpdate?: MessageReceipt } }) => void; error: (e: unknown) => void }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: ({ data }) => {
        if (data?.onMessageStatusUpdate) onUpdate(data.onMessageStatusUpdate);
      },
      error: (err) => console.error('[chat] onMessageStatusUpdate subscription error', err),
    });
    return () => sub.unsubscribe();
  },

  /** Subscribe to message deletions. Returns an unsubscribe function. */
  subscribeToDeletions: (
    matchId: string,
    onDelete: (d: DeletedMessage) => void
  ): (() => void) => {
    const sub = (
      client().graphql({ query: ON_MESSAGE_DELETED, variables: { matchId } }) as unknown as {
        subscribe: (o: { next: (v: { data?: { onMessageDeleted?: DeletedMessage } }) => void; error: (e: unknown) => void }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: ({ data }) => {
        if (data?.onMessageDeleted) onDelete(data.onMessageDeleted);
      },
      error: (err) => console.error('[chat] onMessageDeleted subscription error', err),
    });
    return () => sub.unsubscribe();
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Multi-device registry (wire v2)
//
// The generated Smithy SDK does not (yet) model the `/chat/devices` routes, so these are issued as
// raw authenticated REST calls against the same API domain and Cognito authorizer the SDK uses. The
// request shape mirrors the SDK's `sdk-client.ts` middleware exactly: a Cognito JWT Bearer token and
// an `X-User-Id` header derived from its `sub`. Kept deliberately thin — no plaintext ever crosses
// this boundary; only public device/history keys and ciphertext envelopes do.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeviceRecord {
  deviceId: string;
  /** Base64 SPKI (P-256 ECDH) public key of the device. */
  publicKey: string;
  platform: string;
  displayName?: string;
  maxEnvelopeVersion: number;
  createdAt?: number;
  lastSeenAt?: number;
  revoked?: boolean;
}

export interface AccountHistoryKey {
  keyId: string;
  /** Base64 SPKI (P-256 ECDH) public key of the account-history key. */
  publicKey: string;
}

export interface DeviceRegistry {
  devices: DeviceRecord[];
  accountHistoryKey?: AccountHistoryKey;
}

export interface RegisterDeviceRequest {
  deviceId: string;
  publicKey: string;
  platform: string;
  displayName?: string;
  maxEnvelopeVersion: number;
  accountHistoryKey?: AccountHistoryKey;
}

export interface RegisterDeviceResponse {
  device: DeviceRecord;
  accountHistoryKey?: AccountHistoryKey;
  ownsAccountHistoryKey: boolean;
}

async function chatRestBaseUrl(): Promise<string> {
  if (apiBaseUrl && apiBaseUrl.startsWith('http')) return apiBaseUrl.replace(/\/+$/, '');
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    return apiBaseUrl ? `${origin}/${apiBaseUrl.replace(/^\/+|\/+$/g, '')}` : origin;
  }
  return apiBaseUrl || '';
}

async function chatAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (typeof window === 'undefined') return headers;
  try {
    const { fetchAuthSession } = await import('aws-amplify/auth');
    const session = await fetchAuthSession();
    const token =
      session.tokens?.idToken?.toString() || session.tokens?.accessToken?.toString() || null;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      const sub =
        (session.tokens?.idToken?.payload?.sub as string) ||
        (session.tokens?.accessToken?.payload?.sub as string) ||
        '';
      if (sub) headers['X-User-Id'] = sub;
    }
  } catch {
    // Unauthenticated callers get no Authorization header; the API rejects them, which surfaces as
    // a thrown error below rather than a silent success.
  }
  return headers;
}

async function chatRest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const base = await chatRestBaseUrl();
  const headers = await chatAuthHeaders();
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `chat device request failed (${response.status} ${response.statusText})${text ? `: ${text}` : ''}`
    );
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * E2EE device registry + match management, served over REST.
 *
 * Wire v1's pre-key endpoints (`POST /chat/prekeys`, `POST /chat/prekeys/{userId}`) were removed along
 * with v1 itself: the device registry below is now the sole key-distribution mechanism. Reading a
 * peer's registry is also what initializes a conversation server-side, a responsibility that used to
 * belong to claiming a pre-key bundle.
 */
export const ChatApi = {
  /** Hard-delete all messages for a match (PREMIUM, e.g. on unmatch). */
  deleteMatchMessages: (matchId: string) => sdkClient.deleteMatchMessages({ matchId }),

  // --- Multi-device registry (wire v2) ---

  /**
   * Register (or refresh) this device in the caller's device registry and, on first registration,
   * propose an account-history key. Returns the caller's full device list plus the canonical
   * account-history key and whether the proposed key was accepted.
   */
  registerDevice: (request: RegisterDeviceRequest): Promise<RegisterDeviceResponse> =>
    chatRest<RegisterDeviceResponse>('POST', '/chat/devices', request),

  /** Fetch the caller's own device registry. */
  getSelfDevices: (): Promise<DeviceRegistry> => chatRest<DeviceRegistry>('GET', '/chat/devices'),

  /**
   * Fetch a peer's device registry for a shared match. The server authorizes the read against a
   * State-verified mutual match, so `matchId` is required.
   */
  getPeerDevices: (userId: string, matchId: string): Promise<DeviceRegistry> =>
    chatRest<DeviceRegistry>(
      'GET',
      `/chat/registry/${encodeURIComponent(userId)}?matchId=${encodeURIComponent(matchId)}`
    ),

  /** Revoke (remove) a device from the caller's registry. */
  revokeDevice: (deviceId: string): Promise<void> =>
    chatRest<void>('DELETE', `/chat/devices/${encodeURIComponent(deviceId)}`),
};
