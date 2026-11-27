// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ToastProvider } from '../components/common/Toast';
import { CommentComposer } from '../features/discovery/CommentComposer';
import { DiscoveryView } from '../features/discovery/DiscoveryView';
import { LikesCompareDialog } from '../features/discovery/LikesCompareDialog';
import { BoostHeaderPill, PendingNoticeDialog, WalletSheet } from '../features/discovery/WalletDialogs';
import { MatchingApi } from '../api/matching';
import { StateApi } from '../api/state';
import { useAppStore } from '../store/app-store';
import { useArchiveStore, useWalletStore } from '../store/archive-store';
import {
  MatchingMode,
  SubscriptionTier,
  UserState,
  WalletProductKind,
  type DiscoveryCandidate,
  type MatchingProfile,
  type UserProfile,
  type UserStateSnapshot,
} from '../types';

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
  if (typeof HTMLDialogElement !== 'undefined') {
    if (!HTMLDialogElement.prototype.showModal) {
      HTMLDialogElement.prototype.showModal = function showModal() {
        this.setAttribute('open', '');
      };
    }
    if (!HTMLDialogElement.prototype.close) {
      HTMLDialogElement.prototype.close = function close() {
        this.removeAttribute('open');
      };
    }
  }
});

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>
  );
}

function makeState(over: Partial<UserStateSnapshot> = {}): UserStateSnapshot {
  return {
    userId: 'u1',
    state: UserState.AVAILABLE,
    activeConnections: 0,
    subscriptionTier: SubscriptionTier.SUPER,
    effectiveCapacity: 1,
    selectionRequired: false,
    discoveryPaused: false,
    matching: { status: MatchingMode.ON, generation: 1 },
    matchingTabHidden: false,
    hooks: [],
    ...over,
  };
}

function makeUser(): UserProfile {
  return {
    id: 'u1',
    userId: 'u1',
    name: 'Asha',
    displayName: 'Asha',
    photos: [],
    age: 29,
    birthDetails: { date: '1996-05-10' },
    birthDateOnFile: true,
  };
}

const sampleCandidate: DiscoveryCandidate = {
  id: 'cand1',
  userId: 'cand1',
  name: 'Vikram',
  age: 31,
  bio: 'Builds wooden kayaks.',
  photos: ['https://example.com/p1.jpg'],
  interests: [],
  distanceKm: 5,
  score: 0.9,
  matchFinder: 'ONEHOOK_INTELLIGENCE',
  matchFinderLabel: 'OneHook Intelligence',
  reasoning: 'Shared love of outdoors.',
};

describe('Discovery, Likes & Wallet end-to-end flows', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({ userState: makeState(), currentUser: makeUser() });
    useArchiveStore.setState({ list: null, loading: false });
    useWalletStore.setState({ wallet: null, loading: false, boosting: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('passes a candidate in Discovery, restores via Undo, and switches to Likes hub', async () => {
    vi.spyOn(MatchingApi, 'rosesRemaining').mockResolvedValue({
      remaining: 2,
      limit: 3,
      resetsAt: new Date(0).toISOString(),
    });
    vi.spyOn(MatchingApi, 'pendingLikeCount').mockResolvedValue({ received: 2, sent: 0 });
    vi.spyOn(MatchingApi, 'getReceivedLikes').mockResolvedValue({ likes: [], count: 0 });
    const onPass = vi.fn().mockResolvedValue(true);

    render(
      wrap(
        <DiscoveryView
          candidates={[sampleCandidate]}
          loading={false}
          error={null}
          onRetry={() => {}}
          onPass={onPass}
          onLike={vi.fn().mockResolvedValue(true)}
          onNavigateToProfile={() => {}}
          onOpenPreferences={() => {}}
        />
      )
    );

    expect(screen.getByText('Vikram')).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Pass$/i }));
    });
    expect(onPass).toHaveBeenCalledWith('cand1');
    expect(screen.queryByText('Vikram')).toBeNull();

    // Paid subscriber restores the passed card via Undo
    fireEvent.click(screen.getByRole('button', { name: /Undo last pass/i }));
    expect(screen.getByText('Vikram')).toBeTruthy();

    // Switch header to Likes tab
    const likesTab = screen.getByRole('tab', { name: /Likes/i });
    await act(async () => {
      fireEvent.click(likesTab);
    });
    expect(likesTab.getAttribute('aria-selected')).toBe('true');
  });

  it('enforces comment word rules by tier and compares likers by tier', async () => {
    const mustSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      wrap(
        <CommentComposer
          targetName="Riya"
          target={{ type: 'BIO', label: 'Bio' }}
          tier={SubscriptionTier.MUST}
          onSubmit={mustSubmit}
          onCancel={() => {}}
        />
      )
    );

    const textarea = screen.getByRole('textbox');
    const sendBtn = screen.getByRole('button', { name: /send/i });
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(textarea, {
      target: { value: 'one two three four five six seven eight nine ten' },
    });
    expect((sendBtn as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      fireEvent.click(sendBtn);
    });
    expect(mustSubmit).toHaveBeenCalledWith('one two three four five six seven eight nine ten');

    cleanup();
    const superSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      wrap(
        <CommentComposer
          targetName="Riya"
          target={{ type: 'BIO', label: 'Bio' }}
          tier={SubscriptionTier.SUPER}
          onSubmit={superSubmit}
          onCancel={() => {}}
        />
      )
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send without a comment/i }));
    });
    expect(superSubmit).toHaveBeenCalledWith('');

    cleanup();
    const onUpgrade = vi.fn();
    render(
      wrap(
        <LikesCompareDialog
          open
          onClose={() => {}}
          entries={[]}
          tier={SubscriptionTier.MUST}
          onRemove={() => {}}
          onInspect={() => {}}
          onUpgrade={onUpgrade}
        />
      )
    );
    fireEvent.click(screen.getByRole('button', { name: /Compare Super & Infinity/i }));
    expect(onUpgrade).toHaveBeenCalledTimes(1);

    cleanup();
    render(
      wrap(
        <LikesCompareDialog
          open
          onClose={() => {}}
          tier={SubscriptionTier.SUPER}
          entries={[
            {
              like: {
                fromUserId: 'p1',
                likeTargetType: 'BIO',
                likeTargetRef: null,
                comment: 'Loved your bio!',
                createdAt: new Date(1000).toISOString(),
                distanceKm: 4,
              },
              profile: { userId: 'p1', displayName: 'Kabir', age: 30, bio: 'Coffee roaster' } as MatchingProfile,
            },
          ]}
          onInspect={() => {}}
          onRemove={() => {}}
          onUpgrade={() => {}}
        />
      )
    );
    expect(screen.getByText(/Kabir/i)).toBeTruthy();
    expect(screen.getByText(/Coffee roaster/i)).toBeTruthy();
  });

  it('displays wallet credits, boost countdown pill, and pending notice navigation', async () => {
    vi.spyOn(StateApi, 'getWallet').mockResolvedValue({
      boosts: 3,
      roses: 2,
      archives: 1,
      roseDailyLimit: 3,
      products: [
        {
          productId: 'boost_1',
          kind: WalletProductKind.BOOST,
          quantity: 1,
          priceInr: 199,
          displayPrice: '₹199',
        },
      ],
    });
    vi.spyOn(MatchingApi, 'rosesRemaining').mockResolvedValue({
      remaining: 2,
      limit: 3,
      resetsAt: new Date(0).toISOString(),
    });
    useWalletStore.setState({
      wallet: { boosts: 3, roses: 2, archives: 1, roseDailyLimit: 3, products: [] },
      loading: false,
      boosting: false,
    });

    render(wrap(<BoostHeaderPill onOpen={() => {}} />));
    expect(screen.getByText(/Boost \(3\)/i)).toBeTruthy();

    cleanup();
    render(wrap(<WalletSheet open onClose={() => {}} initialSection="boosts" />));
    await waitFor(() => expect(StateApi.getWallet).toHaveBeenCalled());
    const rosesTab = screen.getByRole('tab', { name: /roses/i });
    fireEvent.click(rosesTab);
    expect(rosesTab.getAttribute('aria-selected')).toBe('true');

    cleanup();
    useAppStore.setState({
      userState: makeState({
        pending: { hookRequestsIn: 2, hookRequestsOut: 0, archiveRequestsIn: 1, archiveRequestsOut: 0 },
      }),
    });
    const onOpenRequests = vi.fn();
    render(
      wrap(
        <PendingNoticeDialog
          open
          onClose={() => {}}
          onOpenRequests={onOpenRequests}
          onOpenArchives={() => {}}
        />
      )
    );
    expect(screen.getByText(/Incoming hook requests/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /View requests/i }));
    expect(onOpenRequests).toHaveBeenCalledTimes(1);
  });
});
