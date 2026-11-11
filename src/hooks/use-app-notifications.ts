import { useEffect, useRef } from 'react';
import { NotificationsApi } from '../api/notifications';
import { notificationEffect } from '../lib/notification-effects';
import { useAppStore } from '../store/app-store';
import { useToast } from '../components/common/Toast';
import { refreshUserStateInStore } from './use-api';

/**
 * Listens to the member's in-app notifications while the app shell is mounted and applies each one
 * (lib/notification-effects.ts): refresh the state on a suspension or resume, the requests on a new
 * hook request, the profile on a draft-expiry reminder, plus a toast.
 */
export function useAppNotifications(userId: string | undefined, refetchProfile: () => unknown) {
  const { showToast } = useToast();
  const bumpRequests = useAppStore((s) => s.bumpRequests);
  const refetchProfileRef = useRef(refetchProfile);
  refetchProfileRef.current = refetchProfile;

  useEffect(() => {
    if (!userId) return;
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = NotificationsApi.subscribe(userId, (n) => {
        const effect = notificationEffect(n);
        if (effect.refreshState) void refreshUserStateInStore();
        if (effect.refreshRequests) bumpRequests();
        if (effect.refreshProfile) void refetchProfileRef.current();
        if (effect.toast) showToast(effect.toast.message, effect.toast.type);
      });
    } catch (err) {
      // Live notifications are a convenience; the app re-reads state on its own when it matters.
      console.warn('Notifications unavailable:', err);
    }
    return () => unsubscribe?.();
  }, [userId, bumpRequests, showToast]);
}
