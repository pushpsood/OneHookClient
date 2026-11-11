/**
 * What the web app does with each in-app notification (api/notifications.ts). Pure, so the mapping
 * is unit-tested; `use-app-notifications.ts` applies it.
 */
import type { AppNotification } from '../api/notifications';

export interface NotificationEffect {
  /** Re-read `GET /state/{me}` (hooks, suspension, capacity changed). */
  refreshState: boolean;
  /** Re-read the hook requests. */
  refreshRequests: boolean;
  /** Re-read `GET /profile` (the matching draft's expiry). */
  refreshProfile: boolean;
  toast?: { message: string; type: 'success' | 'error' | 'info' };
}

const NONE: NotificationEffect = { refreshState: false, refreshRequests: false, refreshProfile: false };

/** Fallback copy if a notification arrives without a body. Never names anyone. */
export const NOTIFICATION_FALLBACK_COPY = {
  CONVERSATION_SUSPENDED: 'A conversation is paused. You can still read it, but new messages are on hold.',
  CONVERSATION_RESUMED: 'A paused conversation is active again.',
  HOOK_REQUESTED: 'Someone sent you a hook request.',
  MATCHING_DRAFT_EXPIRING:
    'Your matching profile draft will be removed in 3 days unless you edit it.',
} as const;

function copy(n: AppNotification, kind: keyof typeof NOTIFICATION_FALLBACK_COPY): string {
  return n.body?.trim() || NOTIFICATION_FALLBACK_COPY[kind];
}

export function notificationEffect(n: AppNotification): NotificationEffect {
  switch (n.kind) {
    case 'MUTUAL_MATCH':
      // A new hook: the chat list comes from the state's hooks.
      return { ...NONE, refreshState: true };
    case 'CONVERSATION_SUSPENDED':
      return { ...NONE, refreshState: true, toast: { message: copy(n, 'CONVERSATION_SUSPENDED'), type: 'info' } };
    case 'CONVERSATION_RESUMED':
      return { ...NONE, refreshState: true, toast: { message: copy(n, 'CONVERSATION_RESUMED'), type: 'success' } };
    case 'HOOK_REQUESTED':
      return { ...NONE, refreshRequests: true, toast: { message: copy(n, 'HOOK_REQUESTED'), type: 'info' } };
    case 'MATCHING_DRAFT_EXPIRING':
      return { ...NONE, refreshProfile: true, toast: { message: copy(n, 'MATCHING_DRAFT_EXPIRING'), type: 'info' } };
    default:
      return NONE;
  }
}
