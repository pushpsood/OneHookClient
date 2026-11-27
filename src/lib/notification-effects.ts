/**
 * What the web app does with each in-app notification (api/notifications.ts). Pure, so the mapping
 * is unit-tested; `use-app-notifications.ts` applies it.
 */
import type { AppNotification } from '../api/notifications';

export type AppNotificationDestination =
  | { kind: 'conversation'; matchId: string }
  | { kind: 'hookRequests' }
  | { kind: 'archivedChats'; matchId?: string }
  | { kind: 'likesYou' }
  | { kind: 'matchingSettings' }
  | { kind: 'none' };

export interface NotificationEffect {
  /** Re-read `GET /state/{me}` (hooks, suspension, capacity, decision window changed). */
  refreshState: boolean;
  /** Re-read the hook requests. */
  refreshRequests: boolean;
  /** Re-read `GET /profile` (the matching draft's expiry). */
  refreshProfile: boolean;
  /** Re-read `GET /state/archives` (unarchive request, accept, decline, archive removal). */
  refreshArchives?: boolean;
  /** Notify Likes screen / badge that received likes changed. */
  refreshLikes?: boolean;
  /** Mark Chat activity badge (unread/requests/unarchive). */
  noteChatActivity?: boolean;
  /** Where clicking/tapping the banner navigates (omitted when `'none'`). */
  destination?: AppNotificationDestination;
  toast?: { message: string; type: 'success' | 'error' | 'info' };
}

const NONE: NotificationEffect = {
  refreshState: false,
  refreshRequests: false,
  refreshProfile: false,
};

/** Fallback copy if a notification arrives without a body. Never names anyone. */
export const NOTIFICATION_FALLBACK_COPY = {
  MUTUAL_MATCH: "You're connected! Say hello.",
  PROFILE_LIKED: 'Someone liked your profile.',
  CONVERSATION_COOLING: 'A conversation is waiting for your reply.',
  MISSED_CALL: 'You missed a call.',
  CONVERSATION_SUSPENDED: 'A conversation is paused. You can still read it, but new messages are on hold.',
  CONVERSATION_RESUMED: 'A paused conversation is active again.',
  HOOK_REQUESTED: 'Someone sent you a hook request.',
  MATCHING_DRAFT_EXPIRING:
    'Your matching profile draft will be removed in 3 days unless you edit it.',
  UNARCHIVE_REQUESTED: 'Someone asked to continue an archived chat.',
  UNARCHIVE_ACCEPTED: 'Your request to continue an archived chat was accepted.',
  UNARCHIVE_DECLINED: 'Your request to continue an archived chat was declined.',
  ARCHIVE_REMOVED: 'An archived conversation was removed.',
  DECISION_WINDOW_OPENED: 'You have an unarchive request waiting in your archived chats.',
} as const;

function copy(n: AppNotification, kind: keyof typeof NOTIFICATION_FALLBACK_COPY): string {
  return n.body?.trim() || NOTIFICATION_FALLBACK_COPY[kind];
}

export function destinationForNotification(n: AppNotification): AppNotificationDestination {
  switch (n.kind) {
    case 'MUTUAL_MATCH':
    case 'CONVERSATION_COOLING':
    case 'MISSED_CALL':
    case 'UNARCHIVE_ACCEPTED':
    case 'DECISION_WINDOW_OPENED':
      return n.matchId ? { kind: 'conversation', matchId: n.matchId } : { kind: 'none' };
    case 'HOOK_REQUESTED':
      return { kind: 'hookRequests' };
    case 'MATCHING_DRAFT_EXPIRING':
      return { kind: 'matchingSettings' };
    case 'PROFILE_LIKED':
      return { kind: 'likesYou' };
    case 'UNARCHIVE_REQUESTED':
      return { kind: 'archivedChats', ...(n.matchId ? { matchId: n.matchId } : {}) };
    default:
      return { kind: 'none' };
  }
}

export function notificationEffect(n: AppNotification): NotificationEffect {
  const destination = destinationForNotification(n);
  const destField = destination.kind !== 'none' ? { destination } : {};
  switch (n.kind) {
    case 'MUTUAL_MATCH':
      return {
        ...NONE,
        refreshState: true,
        refreshArchives: true,
        noteChatActivity: true,
        ...destField,
        ...(n.body?.trim() ? { toast: { message: n.body.trim(), type: 'success' as const } } : {}),
      };
    case 'PROFILE_LIKED':
      return {
        ...NONE,
        refreshLikes: true,
        ...destField,
        toast: { message: copy(n, 'PROFILE_LIKED'), type: 'info' },
      };
    case 'CONVERSATION_COOLING':
      return {
        ...NONE,
        noteChatActivity: true,
        ...destField,
        toast: { message: copy(n, 'CONVERSATION_COOLING'), type: 'info' },
      };
    case 'MISSED_CALL':
      return {
        ...NONE,
        noteChatActivity: true,
        ...destField,
        toast: { message: copy(n, 'MISSED_CALL'), type: 'info' },
      };
    case 'CONVERSATION_SUSPENDED':
      return {
        ...NONE,
        refreshState: true,
        ...destField,
        toast: { message: copy(n, 'CONVERSATION_SUSPENDED'), type: 'info' },
      };
    case 'CONVERSATION_RESUMED':
      return {
        ...NONE,
        refreshState: true,
        ...destField,
        toast: { message: copy(n, 'CONVERSATION_RESUMED'), type: 'success' },
      };
    case 'HOOK_REQUESTED':
      return {
        ...NONE,
        refreshRequests: true,
        noteChatActivity: true,
        ...destField,
        toast: { message: copy(n, 'HOOK_REQUESTED'), type: 'info' },
      };
    case 'MATCHING_DRAFT_EXPIRING':
      return {
        ...NONE,
        refreshProfile: true,
        ...destField,
        toast: { message: copy(n, 'MATCHING_DRAFT_EXPIRING'), type: 'info' },
      };
    case 'UNARCHIVE_REQUESTED':
      return {
        ...NONE,
        refreshState: true,
        refreshArchives: true,
        noteChatActivity: true,
        ...destField,
        toast: { message: copy(n, 'UNARCHIVE_REQUESTED'), type: 'info' },
      };
    case 'UNARCHIVE_ACCEPTED':
      return {
        ...NONE,
        refreshState: true,
        refreshArchives: true,
        noteChatActivity: true,
        ...destField,
        toast: { message: copy(n, 'UNARCHIVE_ACCEPTED'), type: 'success' },
      };
    case 'UNARCHIVE_DECLINED':
      return {
        ...NONE,
        refreshState: true,
        refreshArchives: true,
        ...destField,
        toast: { message: copy(n, 'UNARCHIVE_DECLINED'), type: 'info' },
      };
    case 'ARCHIVE_REMOVED':
      return {
        ...NONE,
        refreshState: true,
        refreshArchives: true,
        ...destField,
      };
    case 'DECISION_WINDOW_OPENED':
      return {
        ...NONE,
        refreshState: true,
        refreshArchives: true,
        noteChatActivity: true,
        ...destField,
        toast: { message: copy(n, 'DECISION_WINDOW_OPENED'), type: 'info' },
      };
    default:
      return NONE;
  }
}

/** Bounded in-memory deduplication store so AppSync redeliveries never trigger duplicate banners. */
export class NotificationDedupStore {
  private readonly seen = new Set<string>();
  private readonly order: string[] = [];
  constructor(private readonly cap = 200) {}

  hasSeen(id: string): boolean {
    return Boolean(id) && this.seen.has(id);
  }

  markSeen(id: string): void {
    if (!id || this.seen.has(id)) return;
    this.seen.add(id);
    this.order.push(id);
    if (this.order.length > this.cap) {
      const oldest = this.order.shift();
      if (oldest) this.seen.delete(oldest);
    }
  }

  clear(): void {
    this.seen.clear();
    this.order.length = 0;
  }
}
