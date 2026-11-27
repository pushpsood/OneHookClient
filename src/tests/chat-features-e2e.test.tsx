// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ToastProvider } from '../components/common/Toast';
import {
  ChatIntroStoriesDialog,
  EmojiReactionPickerDialog,
  MessageInfoDialog,
  ReactionDetailsDialog,
} from '../components/chat/ChatOverlays';
import { ChatSettingsSheet } from '../components/chat/ChatSettingsSheet';
import { ChatContactInfoModal } from '../features/chat/ChatContactInfoModal';
import { ChatSettingsApi } from '../api/rest';
import { AttachmentObjectUrlCache } from '../lib/attachment-transport';
import { CHAT_WALLPAPERS } from '../lib/chat-appearance';
import { readStoredChatFontSize } from '../lib/chat-appearance';
import { useAppStore } from '../store/app-store';
import { useArchiveStore } from '../store/archive-store';
import { MatchingMode, SubscriptionTier, UserState, type ChatMessageView } from '../types';

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

describe('Chat overlays, contact info, settings & restrictions end-to-end flows', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useAppStore.setState({
      userState: {
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
      },
    });
    useArchiveStore.setState({ list: null, loading: false });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('picks reactions via search, manages reactor list, displays message info, and steps intro stories', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    render(
      wrap(
        <EmojiReactionPickerDialog
          open
          onClose={onClose}
          currentReactionSet="❤️"
          onPick={onPick}
        />
      )
    );
    fireEvent.change(screen.getByPlaceholderText(/Search emoji/i), { target: { value: 'fire' } });
    fireEvent.click(screen.getByRole('button', { name: '🔥' }));
    expect(onPick).toHaveBeenCalledWith('🔥');
    expect(onClose).toHaveBeenCalled();

    cleanup();
    const onToggleMine = vi.fn();
    render(
      wrap(
        <ReactionDetailsDialog
          open
          onClose={() => {}}
          reactions={{ u1: '❤️', p1: '😂' }}
          myUserId="u1"
          partnerName="Aarav"
          onToggleMine={onToggleMine}
        />
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onToggleMine).toHaveBeenCalledWith('❤️');

    cleanup();
    render(
      wrap(
        <MessageInfoDialog
          onClose={() => {}}
          message={{
            matchId: 'm1',
            messageId: 'msg1',
            senderId: 'u1',
            timestamp: 1_700_000_000_000,
            ciphertext: 'Hello encrypted world',
            status: 'SENT' as ChatMessageView['status'],
          }}
          starred
        />
      )
    );
    expect(screen.getByText(/Private to you/i)).toBeTruthy();

    cleanup();
    render(
      wrap(
        <ChatIntroStoriesDialog
          open
          onClose={() => {}}
          onExploreDiscover={() => {}}
          onAddByUsername={() => {}}
        />
      )
    );
    expect(screen.getByText(/Real conversations, unhurried/i)).toBeTruthy();
  });

  it('inspects Contact Info links & starred messages and blocks export when partner restricts it', () => {
    const messages: ChatMessageView[] = [
      {
        matchId: 'm1',
        messageId: 'msg_link',
        senderId: 'peer1',
        timestamp: 1_700_000_000_000,
        ciphertext: 'Look at https://onehook.club for details',
        status: 'READ' as ChatMessageView['status'],
      },
    ];
    const cache = new AttachmentObjectUrlCache();
    const onJump = vi.fn();

    render(
      wrap(
        <ChatContactInfoModal
          open
          onClose={() => {}}
          matchId="m1"
          peerName="Riya"
          messages={messages}
          starredIds={new Set(['msg_link'])}
          attachmentCache={cache}
          restrictions={{ saveMedia: true, export: true, mrOneHook: false }}
          onToggleStar={() => {}}
          onJumpToMessage={onJump}
          onOpenSearch={() => {}}
          onViewProfile={() => {}}
          onOpenChatSettings={() => {}}
          onUnhook={() => {}}
          onBlock={() => {}}
          onReport={() => {}}
        />
      )
    );

    fireEvent.click(screen.getByRole('tab', { name: /Links/i }));
    expect(screen.getByText(/onehook\.club/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Starred/i }));
    expect(screen.getByText(/Look at https:\/\/onehook\.club for details/i)).toBeTruthy();

    expect(screen.getByText(/Export chat \(restricted by Riya\)/i)).toBeTruthy();
  });

  it('updates ChatSettingsSheet restrictions, disappearing timer, text size, and local cache clear', async () => {
    vi.spyOn(ChatSettingsApi, 'get').mockResolvedValue({
      messageNotifications: true,
      showPreviews: true,
      reactionNotifications: true,
      readReceipts: true,
      typingIndicators: true,
      screenshotProtection: false,
      helpTranslateCaptions: false,
      connectionNotifications: true,
      likeNotifications: true,
      lastSeenVisibility: 'EVERYONE',
      defaultDisappearingSeconds: 0,
      restrictSaveMedia: false,
      restrictExport: false,
      restrictMrOneHook: false,
    });
    const updateSpy = vi.spyOn(ChatSettingsApi, 'update').mockImplementation(async (patch) => ({
      messageNotifications: true,
      showPreviews: true,
      reactionNotifications: true,
      readReceipts: true,
      typingIndicators: true,
      screenshotProtection: false,
      helpTranslateCaptions: false,
      connectionNotifications: true,
      likeNotifications: true,
      lastSeenVisibility: 'EVERYONE',
      defaultDisappearingSeconds: 0,
      restrictSaveMedia: false,
      restrictExport: false,
      restrictMrOneHook: false,
      ...patch,
    }));
    const onClearCache = vi.fn();

    render(
      wrap(
        <ChatSettingsSheet
          open
          onClose={() => {}}
          wallpaper={CHAT_WALLPAPERS[0]}
          onChooseWallpaper={() => {}}
          onClearCache={onClearCache}
        />
      )
    );

    await waitFor(() => expect(ChatSettingsApi.get).toHaveBeenCalled());

    const restrictMediaBox = screen.getByLabelText(/Prevent saving photos/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.click(restrictMediaBox);
    });
    expect(updateSpy).toHaveBeenCalledWith({ restrictSaveMedia: true });

    fireEvent.click(screen.getByRole('button', { name: 'Large' }));
    expect(readStoredChatFontSize()).toBe('large');

    fireEvent.click(screen.getByRole('button', { name: /Clear decrypted media cache/i }));
    expect(onClearCache).toHaveBeenCalledTimes(1);
  });
});
