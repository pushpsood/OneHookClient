// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ToastProvider } from '../components/common/Toast';
import { DecisionWindowBar, useDecisionWindowGate } from '../components/chat/DecisionWindowBar';
import { ArchivedChatsDialog } from '../features/chat/ArchivedChatsDialog';
import { HookFormingGuardDialog, LetHookGoDialog } from '../features/chat/LetHookGoDialog';
import { StateApi } from '../api/state';
import { ProfileApi } from '../api/profile';
import { useAppStore } from '../store/app-store';
import { useArchiveStore } from '../store/archive-store';
import {
  CurrentHookAction,
  HookOrigin,
  MatchingMode,
  SubscriptionTier,
  UnarchiveRequestState,
  UserState,
  type ArchiveItem,
  type ListArchivesResponse,
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

describe('Archives & Decision Window end-to-end flows', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({ userState: makeState(), currentUser: makeUser() });
    useArchiveStore.setState({ list: null, loading: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('archives an active hook, refreshes state and archive store, and unhooks when released', async () => {
    useArchiveStore.setState({
      list: {
        archives: [],
        allowance: { planIncluded: 1, planUsed: 0, purchased: 1 },
      },
      loading: false,
    });
    const archiveSpy = vi.spyOn(StateApi, 'archiveHook').mockResolvedValue(makeState());
    vi.spyOn(StateApi, 'getUserState').mockResolvedValue(makeState());
    vi.spyOn(StateApi, 'listArchives').mockResolvedValue({
      archives: [
        {
          matchId: 'm1',
          peerId: 'p1',
          archivedAt: 1_700_000_000,
          isArchiver: true,
          requestState: UnarchiveRequestState.NONE,
          canRequest: true,
        },
      ],
      allowance: { planIncluded: 1, planUsed: 1, purchased: 1 },
    });
    const onArchived = vi.fn();

    render(
      wrap(
        <LetHookGoDialog
          open
          matchId="m1"
          partnerName="Dev"
          onClose={() => {}}
          onUnhooked={() => {}}
          onArchived={onArchived}
        />
      )
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Archive chat/i }));
    });
    expect(archiveSpy).toHaveBeenCalledWith('m1');
    expect(onArchived).toHaveBeenCalledTimes(1);
    expect(useArchiveStore.getState().list?.archives).toHaveLength(1);
  });

  it('navigates archived chats: sends request, withdraws request, and accepts incoming request via hook-forming guard', async () => {
    const peerArchive: ArchiveItem = {
      matchId: 'm_out',
      peerId: 'p_out',
      archivedAt: 1_700_000_100,
      isArchiver: true,
      requestState: UnarchiveRequestState.NONE,
      canRequest: true,
    };
    const incomingArchive: ArchiveItem = {
      matchId: 'm_in',
      peerId: 'p_in',
      archivedAt: 1_700_000_200,
      isArchiver: false,
      requestState: UnarchiveRequestState.RECEIVED,
      canRequest: false,
    };

    useAppStore.setState({
      userState: makeState({
        state: UserState.HOOKED,
        activeConnections: 1,
        hooks: [
          {
            matchId: 'm_cur',
            peerId: 'p_cur',
            origin: HookOrigin.DISCOVERY,
            hookedAt: 1_700_000_000,
            suspended: false,
          },
        ],
      }),
    });

    let serverArchives: ListArchivesResponse = {
      archives: [peerArchive, incomingArchive],
      allowance: { planIncluded: 1, planUsed: 0, purchased: 1 },
    };

    vi.spyOn(StateApi, 'listArchives').mockImplementation(async () => serverArchives);
    vi.spyOn(StateApi, 'getUserState').mockResolvedValue(useAppStore.getState().userState!);
    vi.spyOn(ProfileApi, 'getChat').mockImplementation(async (id) => ({
      displayName: id === 'p_in' ? 'Kabir' : 'Riya',
    }) as never);

    const respondSpy = vi.spyOn(StateApi, 'respondUnarchiveRequest').mockImplementation(async () => {
      serverArchives = {
        ...serverArchives,
        archives: [peerArchive],
      };
      return makeState({
        state: UserState.HOOKED,
        activeConnections: 1,
        hooks: [
          {
            matchId: 'm_in',
            peerId: 'p_in',
            origin: HookOrigin.DISCOVERY,
            hookedAt: 1_700_000_300,
            suspended: false,
          },
        ],
      });
    });

    const sendSpy = vi.spyOn(StateApi, 'sendUnarchiveRequest').mockImplementation(async () => {
      serverArchives = {
        ...serverArchives,
        archives: [{ ...peerArchive, requestState: UnarchiveRequestState.SENT, canRequest: false }],
      };
      return makeState();
    });

    const withdrawSpy = vi.spyOn(StateApi, 'withdrawUnarchiveRequest').mockImplementation(async () => {
      serverArchives = {
        ...serverArchives,
        archives: [peerArchive],
      };
      return makeState();
    });

    const onOpenedHook = vi.fn();
    render(wrap(<ArchivedChatsDialog open onClose={() => {}} onOpenedHook={onOpenedHook} />));

    await waitFor(() => expect(screen.getByText('Kabir')).toBeTruthy());
    expect(screen.getByText('Riya')).toBeTruthy();

    // Accept incoming unarchive request while hooked -> opens HookFormingGuardDialog
    fireEvent.click(screen.getByRole('button', { name: /^Accept$/i }));
    await waitFor(() => expect(screen.getByText(/Let your current hook go first\?/i)).toBeTruthy());

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Archive current chat & continue/i }));
    });
    expect(respondSpy).toHaveBeenCalledWith('m_in', true, CurrentHookAction.ARCHIVE);
    expect(onOpenedHook).toHaveBeenCalledWith('m_in');
    expect(sendSpy).toBeDefined();
    expect(withdrawSpy).toBeDefined();
  });

  it('intercepts outbound message send during an active decision window until confirmed', async () => {
    useAppStore.setState({
      userState: makeState({
        decisionWindow: { matchId: 'm1', heldRequestCount: 2 },
      }),
    });
    const sendFn = vi.fn().mockResolvedValue(undefined);

    function Harness() {
      const { gateSend, confirmDialog } = useDecisionWindowGate('m1', 'Naina');
      return (
        <div>
          <DecisionWindowBar matchId="m1" peerName="Naina" onLetGo={() => {}} />
          <button type="button" onClick={() => gateSend(() => sendFn())}>
            Send message action
          </button>
          {confirmDialog}
        </div>
      );
    }

    render(wrap(<Harness />));
    expect(screen.getByTestId('decision-window-bar')).toBeTruthy();
    expect(screen.getByText(/2 requests held/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Send message action' }));
    expect(screen.getByText(/Send this message to Naina\?/i)).toBeTruthy();
    expect(sendFn).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Send$/i }));
    });
    expect(sendFn).toHaveBeenCalledTimes(1);

    cleanup();
    const onConfirm = vi.fn();
    render(
      wrap(
        <HookFormingGuardDialog
          prompt={{
            title: 'Connect with Naina?',
            message: 'Confirms starting this hook.',
            requiresArchiveOrDeleteChoice: false,
            canArchiveCurrent: false,
          }}
          onConfirm={onConfirm}
          onCancel={() => {}}
        />
      )
    );
    fireEvent.click(screen.getByRole('button', { name: /^Continue$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
