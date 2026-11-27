// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  buildHookFormingPrompt,
  markFirstLikeConfirmedToday,
  totalPendingCount,
} from '../lib/hook-forming-guard';
import { HookOrigin, MatchingMode, SubscriptionTier, UserState, type UserStateSnapshot } from '../types';

beforeAll(() => {
  if (typeof window !== 'undefined' && typeof window.localStorage?.setItem !== 'function') {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, String(v)),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => void mem.clear(),
      key: (i: number) => Array.from(mem.keys())[i] ?? null,
      get length() {
        return mem.size;
      },
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  }
});

function makeState(over: Partial<UserStateSnapshot> = {}): UserStateSnapshot {
  return {
    userId: 'u1',
    state: UserState.AVAILABLE,
    activeConnections: 0,
    subscriptionTier: SubscriptionTier.MUST,
    effectiveCapacity: 1,
    selectionRequired: false,
    discoveryPaused: false,
    matching: { status: MatchingMode.ON, generation: 1 },
    matchingTabHidden: false,
    hooks: [],
    ...over,
  };
}

describe('hook-forming-guard unit tests', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('prompts once per UTC day on firstLike only when pending requests exist', () => {
    const withPending = makeState({
      pending: { hookRequestsIn: 1, hookRequestsOut: 0, archiveRequestsIn: 0, archiveRequestsOut: 0 },
    });
    expect(totalPendingCount(withPending.pending)).toBe(1);
    expect(buildHookFormingPrompt('firstLike', makeState(), null)).toBeNull();
    expect(buildHookFormingPrompt('firstLike', withPending, null)?.title).toBe('Send this like?');

    markFirstLikeConfirmedToday('u1');
    expect(buildHookFormingPrompt('firstLike', withPending, null)).toBeNull();
  });

  it('builds replacement choice depending on capacity and archive allowance', () => {
    const full = makeState({
      state: UserState.HOOKED,
      activeConnections: 1,
      hooks: [
        {
          matchId: 'm1',
          peerId: 'p1',
          origin: HookOrigin.DISCOVERY,
          hookedAt: 1,
          suspended: false,
        },
      ],
    });
    const noRoom = buildHookFormingPrompt('acceptHookRequest', full, {
      planIncluded: 1,
      planUsed: 1,
      purchased: 0,
    });
    expect(noRoom?.requiresArchiveOrDeleteChoice).toBe(true);
    expect(noRoom?.canArchiveCurrent).toBe(false);

    const hasRoom = buildHookFormingPrompt('acceptHookRequest', full, {
      planIncluded: 1,
      planUsed: 0,
      purchased: 1,
    });
    expect(hasRoom?.requiresArchiveOrDeleteChoice).toBe(true);
    expect(hasRoom?.canArchiveCurrent).toBe(true);
  });
});
