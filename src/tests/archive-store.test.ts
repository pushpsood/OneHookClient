import { describe, expect, it } from 'vitest';
import {
  clearChatActivity,
  isWalletBoosting,
  noteChatActivity,
  sortArchiveItems,
  totalRemainingArchives,
  useChatActivityStore,
} from '../store/archive-store';
import { UnarchiveRequestState, type ArchiveItem, type WalletResponse } from '../types';

describe('archive-store unit tests', () => {
  it('computes total remaining archive allowance', () => {
    expect(totalRemainingArchives(null)).toBe(0);
    expect(totalRemainingArchives({ planIncluded: 2, planUsed: 1, purchased: 3 })).toBe(4);
    expect(totalRemainingArchives({ planIncluded: 1, planUsed: 4, purchased: 0 })).toBe(0);
  });

  it('sorts archives by recency, oldest, name, and nearest distance', () => {
    const items: ArchiveItem[] = [
      {
        matchId: 'a',
        peerId: 'u2',
        archivedAt: 100,
        isArchiver: true,
        requestState: UnarchiveRequestState.NONE,
        canRequest: true,
      },
      {
        matchId: 'b',
        peerId: 'u1',
        archivedAt: 300,
        isArchiver: true,
        requestState: UnarchiveRequestState.NONE,
        canRequest: true,
      },
    ];
    const profiles = {
      u1: { name: 'Zara', age: 27 },
      u2: { name: 'Asha', age: 32 },
    };
    const distances = { u2: 2, u1: 15 };

    expect(sortArchiveItems(items, 'recent', profiles, distances).map((i) => i.matchId)).toEqual(['b', 'a']);
    expect(sortArchiveItems(items, 'oldest', profiles, distances).map((i) => i.matchId)).toEqual(['a', 'b']);
    expect(sortArchiveItems(items, 'name_asc', profiles, distances).map((i) => i.matchId)).toEqual(['a', 'b']);
    expect(sortArchiveItems(items, 'age_asc', profiles, distances).map((i) => i.matchId)).toEqual(['b', 'a']);
    expect(sortArchiveItems(items, 'nearest', profiles, distances).map((i) => i.matchId)).toEqual(['a', 'b']);
  });

  it('detects active wallet boost windows accurately', () => {
    const nowMs = 1_700_000_000_000;
    const wallet: WalletResponse = {
      boosts: 1,
      roses: 0,
      archives: 0,
      roseDailyLimit: 0,
      boost: {
        active: true,
        multiplier: 2,
        count: 1,
        startedAt: Math.floor(nowMs / 1000) - 30,
        endsAt: Math.floor(nowMs / 1000) + 120,
      },
      products: [],
    };
    expect(isWalletBoosting(wallet, nowMs)).toBe(true);
    expect(isWalletBoosting(wallet, nowMs + 200_000)).toBe(false);
    expect(isWalletBoosting({ ...wallet, boost: undefined }, nowMs)).toBe(false);
  });

  it('tracks and clears per-match chat activity badges', () => {
    clearChatActivity();
    expect(useChatActivityStore.getState().hasNewActivity).toBe(false);

    noteChatActivity('m1');
    noteChatActivity('m2');
    expect(useChatActivityStore.getState().hasNewActivity).toBe(true);
    expect(useChatActivityStore.getState().unreadMatchIds.has('m1')).toBe(true);

    clearChatActivity('m1');
    expect(useChatActivityStore.getState().hasNewActivity).toBe(true);
    clearChatActivity();
    expect(useChatActivityStore.getState().hasNewActivity).toBe(false);
  });
});
