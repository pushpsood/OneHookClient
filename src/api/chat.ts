import { generateClient } from 'aws-amplify/api';
import { sdkClient } from './sdk-client';
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
 *  - REST (via the generated SDK) is used only for E2EE pre-key management and
 *    bulk match-message deletion:
 *      POST   /chat/prekeys                     -> upload/replenish own pre-keys
 *      POST   /chat/prekeys/{userId}?matchId=   -> claim a bundle (consumes an OTK)
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

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = (await client().graphql({ query, variables })) as unknown as { data: T };
  return res.data;
}

/**
 * AppSync GraphQL messaging API. In mock mode these degrade gracefully so the
 * local dev experience does not require a live AppSync endpoint.
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

/**
 * E2EE key-server + match management, served over REST via the generated SDK.
 */
export const ChatApi = {
  /** Upload (or replenish) the caller's own X3DH pre-keys. */
  uploadPreKeys: (
    userId: string,
    identityKey: string,
    signedPreKey: string,
    oneTimePreKeys: string[]
  ) => (sdkClient as any).uploadPreKeys({ userId, identityKey, signedPreKey, oneTimePreKeys }),

  /**
   * Claim a pre-key bundle for a target user to start an E2EE session. Requires
   * the shared `matchId` — the server authorizes the claim against a
   * State-verified mutual match and consumes one of the target's one-time
   * pre-keys.
   */
  claimPreKeyBundle: (userId: string, matchId: string) =>
    sdkClient.claimPreKeyBundle({ userId, matchId }),

  /** Hard-delete all messages for a match (PREMIUM, e.g. on unmatch). */
  deleteMatchMessages: (matchId: string) => sdkClient.deleteMatchMessages({ matchId }),
};
