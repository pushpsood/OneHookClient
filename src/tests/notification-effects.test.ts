import { describe, expect, it } from 'vitest';
import {
  NotificationDedupStore,
  destinationForNotification,
  notificationEffect,
} from '../lib/notification-effects';

describe('notification-effects unit tests', () => {
  it('deduplicates notification ids with bounded LRU eviction', () => {
    const store = new NotificationDedupStore(2);
    expect(store.hasSeen('n1')).toBe(false);
    store.markSeen('n1');
    store.markSeen('n2');
    expect(store.hasSeen('n1')).toBe(true);
    store.markSeen('n3');
    expect(store.hasSeen('n1')).toBe(false);
    expect(store.hasSeen('n2')).toBe(true);
    expect(store.hasSeen('n3')).toBe(true);
    store.clear();
    expect(store.hasSeen('n3')).toBe(false);
  });

  it('computes navigation destinations for notification kinds', () => {
    const base = { id: '1', userId: 'u1', title: '', body: '', createdAt: 1 };
    expect(destinationForNotification({ ...base, kind: 'UNARCHIVE_REQUESTED', matchId: 'm9' })).toEqual({
      kind: 'archivedChats',
      matchId: 'm9',
    });
    expect(destinationForNotification({ ...base, kind: 'HOOK_REQUESTED' })).toEqual({
      kind: 'hookRequests',
    });
    expect(destinationForNotification({ ...base, kind: 'PROFILE_LIKED' })).toEqual({
      kind: 'likesYou',
    });
    expect(destinationForNotification({ ...base, kind: 'MUTUAL_MATCH', matchId: 'm1' })).toEqual({
      kind: 'conversation',
      matchId: 'm1',
    });
  });

  it('maps archive, likes, cooling, missed call, and mutual match notification effects', () => {
    const base = { id: '1', userId: 'u1', title: '', body: '', createdAt: 1 };
    const liked = notificationEffect({ ...base, kind: 'PROFILE_LIKED' });
    expect(liked.refreshLikes).toBe(true);
    expect(liked.destination).toEqual({ kind: 'likesYou' });

    const unarchive = notificationEffect({ ...base, kind: 'UNARCHIVE_ACCEPTED', matchId: 'm4' });
    expect(unarchive.refreshArchives).toBe(true);
    expect(unarchive.noteChatActivity).toBe(true);
    expect(unarchive.toast?.type).toBe('success');

    const withBody = notificationEffect({
      ...base,
      kind: 'MUTUAL_MATCH',
      body: 'Connected!',
      matchId: 'm1',
    });
    expect(withBody.toast).toEqual({ message: 'Connected!', type: 'success' });
  });
});
