import { useEffect, useRef } from 'react';
import { NotificationsApi } from '../api/notifications';
import {
  NotificationDedupStore,
  notificationEffect,
  type AppNotificationDestination,
} from '../lib/notification-effects';
import { useAppStore } from '../store/app-store';
import { noteChatActivity, refreshArchives } from '../store/archive-store';
import { useOptionalToast } from '../components/common/Toast';
import { refreshUserStateInStore } from './use-api';

/**
 * Listens to the member's in-app notifications while the app shell is mounted and applies each one
 * (lib/notification-effects.ts): deduplicates repeat deliveries, refreshes state / requests /
 * archives / likes / chat activity badges, refreshes profile when requested, and surfaces a toast.
 */
export function useAppNotifications(
  userId: string | undefined,
  refetchProfile: () => unknown,
  onActionableDestination?: (event: {
    message: string;
    destination: AppNotificationDestination;
  }) => void
) {
  const { showToast } = useOptionalToast();
  const bumpRequests = useAppStore((s) => s.bumpRequests);
  const refetchProfileRef = useRef(refetchProfile);
  refetchProfileRef.current = refetchProfile;
  const onActionableRef = useRef(onActionableDestination);
  onActionableRef.current = onActionableDestination;
  const dedupRef = useRef(new NotificationDedupStore());

  useEffect(() => {
    if (!userId) return;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = NotificationsApi.subscribe(userId, (n) => {
        if (n.id) {
          if (dedupRef.current.hasSeen(n.id)) return;
          dedupRef.current.markSeen(n.id);
        }
        const effect = notificationEffect(n);
        if (effect.refreshState) void refreshUserStateInStore();
        if (effect.refreshRequests) bumpRequests();
        if (effect.refreshArchives) void refreshArchives();
        if (effect.refreshLikes && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('onehook:likes-updated'));
        }
        if (effect.noteChatActivity) noteChatActivity(n.matchId ?? undefined);
        if (effect.refreshProfile) void refetchProfileRef.current();
        if (effect.toast) showToast(effect.toast.message, effect.toast.type);
        if (effect.destination && effect.destination.kind !== 'none' && effect.toast?.message) {
          onActionableRef.current?.({
            message: effect.toast.message,
            destination: effect.destination,
          });
        }
      });
    } catch (err) {
      // Live notifications are a convenience; the app re-reads state on its own when it matters.
      console.warn('Notifications unavailable:', err);
    }
    return () => unsubscribe?.();
  }, [userId, bumpRequests, showToast]);
}
