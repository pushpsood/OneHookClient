import { appSyncClient } from './chat';

/**
 * In-app notifications for the signed-in member (AppSync `onNotification(userId)`; schema.graphql).
 *
 * The backend publishes these (IAM-only mutation); clients only listen, and the subscription resolver
 * requires `userId` to be the caller's own subject. Bodies are server-authored copy and never message
 * content. Kinds added for chat-only profiles (docs/chat-only-profiles.md §8.5, §9.5):
 *
 *  - CONVERSATION_SUSPENDED / CONVERSATION_RESUMED: a hook went read-only / is active again.
 *  - HOOK_REQUESTED: someone sent a hook request. Never names the sender.
 *  - MATCHING_DRAFT_EXPIRING: the unfinished matching profile is erased in three days unless edited.
 */
export type NotificationKind =
  | 'MUTUAL_MATCH'
  | 'PROFILE_LIKED'
  | 'CONVERSATION_COOLING'
  | 'MISSED_CALL'
  | 'CONVERSATION_SUSPENDED'
  | 'CONVERSATION_RESUMED'
  | 'HOOK_REQUESTED'
  | 'MATCHING_DRAFT_EXPIRING';

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind | string;
  title: string;
  body: string;
  matchId?: string | null;
  createdAt: number;
}

const ON_NOTIFICATION = /* GraphQL */ `
  subscription OnNotification($userId: ID!) {
    onNotification(userId: $userId) {
      id
      userId
      kind
      title
      body
      matchId
      createdAt
    }
  }
`;

export const NotificationsApi = {
  /** Subscribes to the member's notifications. Returns an unsubscribe function. */
  subscribe: (userId: string, onNotification: (n: AppNotification) => void): (() => void) => {
    const sub = (
      appSyncClient().graphql({ query: ON_NOTIFICATION, variables: { userId } }) as unknown as {
        subscribe: (o: {
          next: (v: { data?: { onNotification?: AppNotification } }) => void;
          error: (e: unknown) => void;
        }) => { unsubscribe: () => void };
      }
    ).subscribe({
      next: ({ data }) => {
        if (data?.onNotification) onNotification(data.onNotification);
      },
      error: (err) => console.error('[notifications] onNotification subscription error', err),
    });
    return () => sub.unsubscribe();
  },
};
