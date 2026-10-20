import { generateClient } from 'aws-amplify/api';
import { sdkClient } from './sdk-client';
import { apiBaseUrl } from '../utils/env.config';
import { hasGraphQLErrors, toGraphQLError } from './graphql-error';
import type {
  Message as ChatMessage,
  MessageReceipt,
  DeletedMessage,
} from 'onehook-api-client/graphql';

export type { ChatMessage, MessageReceipt, DeletedMessage };

// ─────────────────────────────────────────────────────────────────────────────
// Local types for the rich-messaging capabilities added to the chat GraphQL schema
// (reactions, replies, content types, typing/presence/screenshot). These are declared here rather
// than imported from `onehook-api-client/graphql` because that SDK is regenerated and republished
// from the backend schema asynchronously; declaring them locally lets the client use the new
// operations immediately and stay type-safe. Once the SDK republishes they can be swapped for the
// generated types.
// ─────────────────────────────────────────────────────────────────────────────

/** Mirrors the GraphQL `MessageContentType` enum. */
export type MessageContentType = 'TEXT' | 'IMAGE' | 'VOICE' | 'STICKER' | 'GIF' | 'FILE';

/** Mirrors the GraphQL `PresenceState` enum. */
export type PresenceState = 'ONLINE' | 'OFFLINE';

/**
 * The chat message with the fields added to the schema. `reactions` is the AWSJSON scalar, delivered
 * as a JSON string the client parses into a map of `reactorUserId -> reaction ciphertext`; each value
 * is E2E-encrypted exactly like a message body.
 */
export interface ChatMessageExtended extends ChatMessage {
  contentType?: MessageContentType | null;
  replyToMessageId?: string | null;
  replyToTimestamp?: number | null;
  reactions?: string | null;
}

/** Real-time fan-out shape of `reactToMessage` / `onMessageReaction`. `reaction` is null on a clear. */
export interface MessageReaction {
  matchId: string;
  messageId: string;
  timestamp: number;
  userId: string;
  reaction?: string | null;
}

/** Ephemeral typing signal (`sendTypingIndicator` / `onTypingIndicator`). */
export interface TypingIndicator {
  matchId: string;
  userId: string;
  isTyping: boolean;
  timestamp: number;
}

/** Ephemeral presence signal (`updatePresence` / `onPresenceUpdate`). `lastActiveAt` is "last seen". */
export interface PresenceUpdate {
  matchId: string;
  userId: string;
  state: PresenceState;
  lastActiveAt: number;
}

/** Ephemeral screenshot signal (`notifyScreenshot` / `onScreenshotTaken`). */
export interface ScreenshotEvent {
  matchId: string;
  userId: string;
  timestamp: number;
}

/** Optional fields for {@link ChatMessagingApi.sendMessage}. */
export interface SendMessageOptions {
  /** Message kind; defaults to TEXT server-side. Voice/sticker/GIF/image/file ride the media path. */
  contentType?: MessageContentType;
  /** messageId of the message being quoted, when this is a reply. */
  replyToMessageId?: string;
  /** Sort-key timestamp of the quoted message, so the client can locate it. */
  replyToTimestamp?: number;
  /** When > 0, a disappearing message: server TTL becomes now + expireSeconds. */
  expireSeconds?: number;
}

/**
 * Chat service client.
 *
 * Design philosophy (see OneHookBackend/packages/chat):
 *  - Real-time messaging is served by AWS AppSync GraphQL over WebSocket (NOT
 *    REST). History is read ONLY via the `getMessages` query. Delivery/read
 *    receipts and message deletion are available to ALL tiers (including the free
 *    MUST tier).
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
      contentType
      replyToMessageId
      replyToTimestamp
      reactions
    }
  }
`;

const SEND_MESSAGE = /* GraphQL */ `
  mutation SendMessage(
    $matchId: ID!
    $senderId: String!
    $ciphertext: String!
    $contentType: MessageContentType
    $replyToMessageId: ID
    $replyToTimestamp: AWSTimestamp
    $expireSeconds: Int
  ) {
    sendMessage(
      matchId: $matchId
      senderId: $senderId
      ciphertext: $ciphertext
      contentType: $contentType
      replyToMessageId: $replyToMessageId
      replyToTimestamp: $replyToTimestamp
      expireSeconds: $expireSeconds
    ) {
      messageId
      matchId
      senderId
      ciphertext
      timestamp
      status
      contentType
      replyToMessageId
      replyToTimestamp
      reactions
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
      contentType
      replyToMessageId
      replyToTimestamp
      reactions
    }
  }
`;

// Reactions (all tiers), fanned out via onMessageReaction.
const REACT_TO_MESSAGE = /* GraphQL */ `
  mutation ReactToMessage(
    $matchId: ID!
    $timestamp: AWSTimestamp!
    $messageId: ID!
    $userId: String!
    $reaction: String
  ) {
    reactToMessage(
      matchId: $matchId
      timestamp: $timestamp
      messageId: $messageId
      userId: $userId
      reaction: $reaction
    ) {
      matchId
      messageId
      timestamp
      userId
      reaction
    }
  }
`;

const ON_MESSAGE_REACTION = /* GraphQL */ `
  subscription OnMessageReaction($matchId: ID!) {
    onMessageReaction(matchId: $matchId) {
      matchId
      messageId
      timestamp
      userId
      reaction
    }
  }
`;

// Ephemeral conversation signals (nothing is persisted server-side).
const SEND_TYPING_INDICATOR = /* GraphQL */ `
  mutation SendTypingIndicator($matchId: ID!, $userId: String!, $isTyping: Boolean!) {
    sendTypingIndicator(matchId: $matchId, userId: $userId, isTyping: $isTyping) {
      matchId
      userId
      isTyping
      timestamp
    }
  }
`;

const ON_TYPING_INDICATOR = /* GraphQL */ `
  subscription OnTypingIndicator($matchId: ID!) {
    onTypingIndicator(matchId: $matchId) {
      matchId
      userId
      isTyping
      timestamp
    }
  }
`;

const UPDATE_PRESENCE = /* GraphQL */ `
  mutation UpdatePresence($matchId: ID!, $userId: String!, $state: PresenceState!) {
    updatePresence(matchId: $matchId, userId: $userId, state: $state) {
      matchId
      userId
      state
      lastActiveAt
    }
  }
`;

const ON_PRESENCE_UPDATE = /* GraphQL */ `
  subscription OnPresenceUpdate($matchId: ID!) {
    onPresenceUpdate(matchId: $matchId) {
      matchId
      userId
      state
      lastActiveAt
    }
  }
`;

const NOTIFY_SCREENSHOT = /* GraphQL */ `
  mutation NotifyScreenshot($matchId: ID!, $userId: String!) {
    notifyScreenshot(matchId: $matchId, userId: $userId) {
      matchId
      userId
      timestamp
    }
  }
`;

const ON_SCREENSHOT_TAKEN = /* GraphQL */ `
  subscription OnScreenshotTaken($matchId: ID!) {
    onScreenshotTaken(matchId: $matchId) {
      matchId
      userId
      timestamp
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
  let res: unknown;
  try {
    res = await client().graphql({ query, variables });
  } catch (raw) {
    // Amplify rejects with a plain `{ data, errors }` object, not an Error. Converting here means every
    // caller can rely on `instanceof Error` and on the server's own message.
    throw toGraphQLError(raw, 'The chat service could not be reached.');
  }
  // A 200 response can still carry resolver errors alongside partial data; that is a failure.
  if (hasGraphQLErrors(res)) {
    throw toGraphQLError(res, 'The chat service rejected the request.');
  }
  return (res as { data: T }).data;
}

/**
 * AppSync GraphQL messaging API. Message bodies are encrypted on the device before they are sent
 * (see lib/chat-encryption.ts), so every value crossing this boundary is ciphertext.
 */
export const ChatMessagingApi = {
  getMessages: async (matchId: string, after?: number): Promise<ChatMessageExtended[]> => {
    const data = await graphql<{ getMessages: (ChatMessageExtended | null)[] | null }>(GET_MESSAGES, {
      matchId,
      after,
    });
    return (data.getMessages ?? []).filter((m): m is ChatMessageExtended => m != null);
  },

  sendMessage: async (
    matchId: string,
    senderId: string,
    ciphertext: string,
    options: SendMessageOptions = {}
  ): Promise<ChatMessageExtended> => {
    const data = await graphql<{ sendMessage: ChatMessageExtended }>(SEND_MESSAGE, {
      matchId,
      senderId,
      ciphertext,
      contentType: options.contentType ?? null,
      replyToMessageId: options.replyToMessageId ?? null,
      replyToTimestamp: options.replyToTimestamp ?? null,
      expireSeconds: options.expireSeconds ?? null,
    });
    return data.sendMessage;
  },

  /**
   * React to a message, or clear the caller's reaction by passing `reaction: null`. Available to all
   * tiers. `reaction` must be the reaction ciphertext (encrypt the emoji exactly like a message body).
   */
  reactToMessage: async (
    matchId: string,
    timestamp: number,
    messageId: string,
    userId: string,
    reaction: string | null
  ): Promise<MessageReaction | null> => {
    const data = await graphql<{ reactToMessage: MessageReaction }>(REACT_TO_MESSAGE, {
      matchId,
      timestamp,
      messageId,
      userId,
      reaction,
    });
    return data.reactToMessage;
  },

  /** Announce this user's typing state. Ephemeral — nothing is stored. */
  sendTypingIndicator: async (
    matchId: string,
    userId: string,
    isTyping: boolean
  ): Promise<void> => {
    await graphql<{ sendTypingIndicator: TypingIndicator }>(SEND_TYPING_INDICATOR, {
      matchId,
      userId,
      isTyping,
    });
  },

  /**
   * Announce this user's presence in the conversation. Ephemeral. The caller decides whether to
   * publish at all based on the user's `lastSeenVisibility` setting — a user hiding last-seen simply
   * does not call this.
   */
  updatePresence: async (
    matchId: string,
    userId: string,
    state: PresenceState
  ): Promise<void> => {
    await graphql<{ updatePresence: PresenceUpdate }>(UPDATE_PRESENCE, { matchId, userId, state });
  },

  /** Tell the peer that this user took a screenshot (detection is an OS-level client capability). */
  notifyScreenshot: async (matchId: string, userId: string): Promise<void> => {
    await graphql<{ notifyScreenshot: ScreenshotEvent }>(NOTIFY_SCREENSHOT, { matchId, userId });
  },

  /** Available to all tiers (including MUST). */
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

  /** Available to all tiers (including MUST). */
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

  /** All tiers — deletes a single message for everyone. */
  deleteMessage: async (matchId: string, timestamp: number): Promise<DeletedMessage | null> => {
    const data = await graphql<{ deleteMessage: DeletedMessage }>(DELETE_MESSAGE, {
      matchId,
      timestamp,
    });
    return data.deleteMessage;
  },

  /** Subscribe to new messages for a match. Returns an unsubscribe function. */
  subscribeToNewMessages: (matchId: string, onMessage: (m: ChatMessageExtended) => void): (() => void) => {
    const sub = (
      client().graphql({ query: ON_NEW_MESSAGE, variables: { matchId } }) as unknown as {
        subscribe: (o: { next: (v: { data?: { onNewMessage?: ChatMessageExtended } }) => void; error: (e: unknown) => void }) => { unsubscribe: () => void };
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

  /** Subscribe to message reactions for a match. Returns an unsubscribe function. */
  subscribeToReactions: (
    matchId: string,
    onReaction: (r: MessageReaction) => void
  ): (() => void) => {
    const sub = (
      client().graphql({ query: ON_MESSAGE_REACTION, variables: { matchId } }) as unknown as {
        subscribe: (o: { next: (v: { data?: { onMessageReaction?: MessageReaction } }) => void; error: (e: unknown) => void }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: ({ data }) => {
        if (data?.onMessageReaction) onReaction(data.onMessageReaction);
      },
      error: (err) => console.error('[chat] onMessageReaction subscription error', err),
    });
    return () => sub.unsubscribe();
  },

  /** Subscribe to the peer's typing indicator. Returns an unsubscribe function. */
  subscribeToTyping: (
    matchId: string,
    onTyping: (t: TypingIndicator) => void
  ): (() => void) => {
    const sub = (
      client().graphql({ query: ON_TYPING_INDICATOR, variables: { matchId } }) as unknown as {
        subscribe: (o: { next: (v: { data?: { onTypingIndicator?: TypingIndicator } }) => void; error: (e: unknown) => void }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: ({ data }) => {
        if (data?.onTypingIndicator) onTyping(data.onTypingIndicator);
      },
      error: (err) => console.error('[chat] onTypingIndicator subscription error', err),
    });
    return () => sub.unsubscribe();
  },

  /** Subscribe to the peer's presence (online/offline + last-seen). Returns an unsubscribe function. */
  subscribeToPresence: (
    matchId: string,
    onPresence: (p: PresenceUpdate) => void
  ): (() => void) => {
    const sub = (
      client().graphql({ query: ON_PRESENCE_UPDATE, variables: { matchId } }) as unknown as {
        subscribe: (o: { next: (v: { data?: { onPresenceUpdate?: PresenceUpdate } }) => void; error: (e: unknown) => void }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: ({ data }) => {
        if (data?.onPresenceUpdate) onPresence(data.onPresenceUpdate);
      },
      error: (err) => console.error('[chat] onPresenceUpdate subscription error', err),
    });
    return () => sub.unsubscribe();
  },

  /** Subscribe to screenshot notifications from the peer. Returns an unsubscribe function. */
  subscribeToScreenshots: (
    matchId: string,
    onScreenshot: (s: ScreenshotEvent) => void
  ): (() => void) => {
    const sub = (
      client().graphql({ query: ON_SCREENSHOT_TAKEN, variables: { matchId } }) as unknown as {
        subscribe: (o: { next: (v: { data?: { onScreenshotTaken?: ScreenshotEvent } }) => void; error: (e: unknown) => void }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: ({ data }) => {
        if (data?.onScreenshotTaken) onScreenshot(data.onScreenshotTaken);
      },
      error: (err) => console.error('[chat] onScreenshotTaken subscription error', err),
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
}

export interface RegisterDeviceResponse {
  device: DeviceRecord;
  /**
   * The account's history PUBLIC key, if an epoch exists. Present so a new device can wrap NEW messages
   * to history immediately; it grants no ability to READ history, which depends on the epoch's wraps.
   */
  accountHistoryKey?: AccountHistoryKey;
}

/**
 * How an encrypted copy of the history private key can be opened. Ordered by preference: escrow is
 * already present after an OS restore, PRF needs no other device, a device wrap needs one approval,
 * and QR (not a wrap) is the manual fallback.
 */
export type WrapMethod = 'ESCROW' | 'PRF' | 'DEVICE';

/** One epoch of the account history key. Only the PUBLIC half is ever published. */
export interface HistoryEpochRecord {
  epoch: number;
  keyId: string;
  publicKey: string;
  createdAt: number;
  /**
   * Present only on epochs created by a reset. Messages older than this cannot be read on this
   * account, and the client renders a single marker rather than a wall of locked bubbles. Never a
   * licence to delete shared ciphertext.
   */
  horizonAt?: number;
}

/**
 * One encrypted copy of an epoch's history PRIVATE key.
 *
 * `wrappedKey` is absent for `ESCROW`, which is a marker: the material lives in iCloud Keychain or
 * Android Block Store, not on the server.
 */
export interface AhkWrapRecord {
  epoch: number;
  method: WrapMethod;
  wrapId: string;
  wrappedKey?: string;
  createdAt: number;
}

export interface HistoryState {
  epochs: HistoryEpochRecord[];
  activeEpoch?: number;
  wraps?: AhkWrapRecord[];
}

export interface EstablishEpochRequest {
  epoch: number;
  /** The epoch the caller believes is active; 0 when the account has none yet. */
  expectedEpoch: number;
  keyId: string;
  publicKey: string;
  /** Required when replacing an existing epoch, rejected on the first one. */
  horizonAt?: number;
  wraps: Array<{ method: WrapMethod; wrapId: string; wrappedKey?: string }>;
}

export interface EstablishEpochResponse {
  established: boolean;
  epochs?: HistoryEpochRecord[];
}

export interface PutWrapRequest {
  epoch: number;
  method: WrapMethod;
  wrapId: string;
  wrappedKey?: string;
}

/**
 * The two attachment media endpoints (see OneHookBackend/docs/chat-attachments.md). Like the device
 * registry above, they are not yet modelled by the generated SDK, so they ride the same authenticated
 * `chatRest` helper. Only the presigned URL and object key cross this boundary — the content key lives
 * exclusively inside the E2EE message envelope and never touches these calls.
 */
export interface MediaUploadUrlResponse {
  /** S3 key the server assigned, always "<matchId>/<uuid>". Goes into the attachment envelope. */
  objectKey: string;
  /** Presigned PUT URL, signed for EXACTLY `contentLength` bytes. */
  uploadUrl: string;
  expiresInSeconds: number;
}

export interface MediaDownloadUrlResponse {
  downloadUrl: string;
  expiresInSeconds: number;
}

async function chatRestBaseUrl(): Promise<string> {  if (apiBaseUrl && apiBaseUrl.startsWith('http')) return apiBaseUrl.replace(/\/+$/, '');
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
  /** Hard-delete all messages for a match (paid tiers, e.g. on unmatch). */
  deleteMatchMessages: (matchId: string) => sdkClient.deleteMatchMessages({ matchId }),

  // --- Attachment media (E2EE) ---

  /**
   * Request a presigned PUT URL for an encrypted attachment. `contentLength` MUST be the ciphertext
   * length (plaintext + GCM tag): the URL is signed for exactly that many bytes, so the PUT that
   * follows has to upload precisely this ciphertext.
   */
  getMediaUploadUrl: (
    matchId: string,
    contentLength: number,
    kind: string
  ): Promise<MediaUploadUrlResponse> =>
    chatRest<MediaUploadUrlResponse>('POST', '/chat/media/upload-url', {
      matchId,
      contentLength,
      kind,
    }),

  /**
   * Request a presigned GET URL for an attachment. The server only issues one for a key under the
   * caller's own match, so a guessed key from another conversation is rejected here, not just hidden.
   */
  getMediaDownloadUrl: (matchId: string, objectKey: string): Promise<MediaDownloadUrlResponse> =>
    chatRest<MediaDownloadUrlResponse>('POST', '/chat/media/download-url', { matchId, objectKey }),

  // --- Multi-device registry (wire v2) ---

  /**
   * Register (or refresh) this device in the caller's device registry.
   *
   * Registration does NOT claim the account-history key. It used to, first-write-wins, which left one
   * device holding the only copy and every later device permanently unable to read history. Epoch 1 is
   * established separately via `establishHistoryEpoch`, which requires a wrap set in the same call.
   *
   * The response carries the history PUBLIC key when an epoch exists, so this device can wrap NEW
   * messages to history right away.
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

  // --- Account history-key lifecycle (epochs + wraps) ---

  /**
   * The caller's history-key state: every epoch, which is active, and the active epoch's wraps.
   *
   * This is the read a device performs at sign-in to decide how to unlock — platform escrow, then
   * PRF, then a device wrap, then QR, then reset. Wrap ciphertext is returned because only this
   * account can open it; the server holds no key that would let it do so.
   */
  getHistoryState: (): Promise<HistoryState> => chatRest<HistoryState>('GET', '/chat/history'),

  /**
   * Establish a history epoch and make it active.
   *
   * Serves both the account's FIRST key (`expectedEpoch: 0`) and a RESET after every unlock method
   * has failed (pass the active epoch plus `horizonAt`). The wrap set is mandatory: an epoch with no
   * wraps would be unrecoverable from the moment it existed.
   *
   * A `false` result means another of the caller's devices established an epoch first — re-read
   * `getHistoryState` and unlock against the epoch that won rather than retrying.
   */
  establishHistoryEpoch: (request: EstablishEpochRequest): Promise<EstablishEpochResponse> =>
    chatRest<EstablishEpochResponse>('POST', '/chat/history/epochs', request),

  /**
   * Add or replace one wrap. Idempotent on (epoch, method, wrapId), so re-approving a device or
   * re-deriving a PRF wrap refreshes rather than accumulating rows.
   */
  putHistoryWrap: (request: PutWrapRequest): Promise<{ wraps: AhkWrapRecord }> =>
    chatRest<{ wraps: AhkWrapRecord }>('POST', '/chat/history/wraps', request),

  /** Revoke one unlock method — a retired device, or a passkey the user deleted. */
  revokeHistoryWrap: (epoch: number, method: WrapMethod, wrapId: string): Promise<void> =>
    chatRest<void>(
      'DELETE',
      `/chat/history/wraps/${epoch}/${encodeURIComponent(method)}/${encodeURIComponent(wrapId)}`
    ),
};
