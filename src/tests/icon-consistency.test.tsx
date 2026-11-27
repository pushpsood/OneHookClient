// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';

vi.hoisted(() => {
  if (typeof globalThis.localStorage?.getItem !== 'function') {
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
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });
    }
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    window.matchMedia = () =>
      ({
        matches: false,
        media: '',
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
});
import { TopBar } from '../app/TopBar';
import { DesktopSidebar } from '../app/DesktopSidebar';
import { BottomTabBar } from '../app/BottomTabBar';
import { SiteHeader } from '../components/common/SiteHeader';
import { CallButtons } from '../components/call/CallButtons';
import { ToastProvider } from '../components/common/Toast';
import { PhotoLightbox } from '../components/common/PhotoLightbox';
import { ChatIntroStoriesDialog } from '../components/chat/ChatOverlays';
import { ChatContactInfoModal } from '../features/chat/ChatContactInfoModal';
import { ArchivedChatsDialog } from '../features/chat/ArchivedChatsDialog';
import { DiscoveryView } from '../features/discovery/DiscoveryView';
import { LikesYouView } from '../features/discovery/LikesYouView';
import { BoostDialog, WalletSheet } from '../features/discovery/WalletDialogs';
import { AttachmentComposer } from '../components/chat/AttachmentComposer';
import { ChatProfileCard } from '../features/profile/ChatProfileCard';
import { ProfileMrOneHookTabCard, WalletTilesCard } from '../features/profile/ProfileHubCards';
import { SafetyBlockedDialog } from '../features/profile/SafetyBlockedDialog';
import { SettingsView } from '../features/settings/SettingsView';
import { AttachmentObjectUrlCache } from '../lib/attachment-transport';
import { useAppStore } from '../store/app-store';
import { useArchiveStore, useWalletStore } from '../store/archive-store';
import { SubscriptionTier, UserState, MatchingMode, type UserProfile } from '../types';

vi.mock('../api/matching', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/matching')>();
  return {
    ...actual,
    MatchingApi: {
      ...actual.MatchingApi,
      getReceivedLikes: vi.fn().mockResolvedValue({ likes: [], count: 0 }),
    },
  };
});

vi.mock('../api/profile', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/profile')>();
  return {
    ...actual,
    ProfileApi: {
      ...actual.ProfileApi,
      getProfile: vi.fn().mockResolvedValue(null),
    },
  };
});

vi.mock('../api/state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/state')>();
  return {
    ...actual,
    StateApi: {
      ...actual.StateApi,
      listBlocks: vi.fn().mockResolvedValue([]),
      getArchiveAllowance: vi.fn().mockResolvedValue(null),
      listArchivedHooks: vi.fn().mockResolvedValue({ items: [] }),
    },
  };
});

vi.mock('../api/rest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/rest')>();
  return {
    ...actual,
    SuggestionApi: {
      ...actual.SuggestionApi,
      list: vi.fn().mockResolvedValue({}),
    },
  };
});

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
  if (typeof window.ResizeObserver === 'undefined') {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (typeof window.matchMedia === 'undefined') {
    window.matchMedia = () =>
      ({
        matches: false,
        media: '',
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
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

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  useAppStore.setState({
    currentUser: null,
    userState: {
      userId: 'me',
      state: UserState.AVAILABLE,
      activeConnections: 0,
      effectiveCapacity: 1,
      selectionRequired: false,
      matchingTabHidden: false,
      subscriptionTier: SubscriptionTier.SUPER,
      hooks: [],
      pending: {
        hookRequestsIn: 2,
        hookRequestsOut: 0,
        archiveRequestsIn: 0,
        archiveRequestsOut: 0,
      },
      matching: { status: MatchingMode.ON, generation: 1 },
      discoveryPaused: false,
    },
  });
  useWalletStore.setState({
    wallet: { boosts: 1, roses: 2, archives: 1 } as never,
    loading: false,
  });
  useArchiveStore.setState({
    list: { items: [], allowance: { usedThisCycle: 0, monthlyLimit: 3 } } as never,
  });
});

function wrap(node: ReactNode) {
  return (
    <MemoryRouter>
      <ToastProvider>{node}</ToastProvider>
    </MemoryRouter>
  );
}

interface ParsedSvgSpec {
  size: string;
  stroke: string;
  shrink0: boolean;
  fill: string | null;
}

function parseSvgSpec(svg: Element): ParsedSvgSpec {
  const cls = svg.getAttribute('class') ?? '';
  const tokens = cls.split(/\s+/).filter(Boolean);
  const wToken = tokens.find((t) => /^w-/.test(t));
  const hToken = tokens.find((t) => /^h-/.test(t));
  const strokeToken = tokens.find((t) => /^stroke-\[/.test(t));
  const strokeAttr = svg.getAttribute('stroke-width');
  const stroke = strokeToken
    ? strokeToken.replace(/^stroke-\[(.*)\]$/, '$1')
    : strokeAttr ?? 'default-2';
  return {
    size: `${wToken ?? '?'}/${hToken ?? '?'}`,
    stroke,
    shrink0: tokens.includes('shrink-0'),
    fill: svg.getAttribute('fill'),
  };
}

function expectUniformSectionIcons(svgs: Element[], expected?: Partial<ParsedSvgSpec>) {
  expect(svgs.length).toBeGreaterThan(0);
  const specs = svgs.map(parseSvgSpec);
  const sizes = new Set(specs.map((s) => s.size));
  const strokes = new Set(specs.map((s) => s.stroke));
  expect(sizes.size).toBe(1);
  expect(strokes.size).toBe(1);
  for (const s of specs) {
    expect(s.shrink0).toBe(true);
    if (expected?.size) expect(s.size).toBe(expected.size);
    if (expected?.stroke) expect(s.stroke).toBe(expected.stroke);
    if (expected?.fill !== undefined) expect(s.fill).toBe(expected.fill);
  }
}

const noop = () => undefined;

const sampleUser: UserProfile = {
  id: 'me',
  name: 'Ari',
  displayName: 'Ari',
  age: 28,
  pictures: [],
  bio: 'Hi there',
} as UserProfile;

describe('Icon size and thickness consistency per UI section', () => {
  it('keeps TopBar header action icons identical in size and stroke thickness (including injected Likes portal)', async () => {
    const { container } = render(
      wrap(
        <>
          <TopBar activeTab="LIKES" onBack={noop} onNavigateToDiscovery={noop} />
          <LikesYouView />
        </>
      )
    );
    await act(async () => {});

    const header = container.querySelector('header')!;
    await waitFor(() => {
      expect(header.querySelectorAll('button svg').length).toBe(3);
    });
    const headerActionSvgs = Array.from(header.querySelectorAll('button svg'));
    // Back arrow, RefreshCw (injected portal), Theme trigger icon
    expectUniformSectionIcons(headerActionSvgs, { size: 'w-5/h-5', stroke: '1.75' });

    // Open theme dropdown menu and ensure menu item icons match each other
    const themeBtn = screen.getByRole('button', { name: 'Change appearance' });
    fireEvent.click(themeBtn);
    const menuSvgs = Array.from(container.querySelectorAll('[role="menu"] svg'));
    expectUniformSectionIcons(menuSvgs, { size: 'w-4/h-4', stroke: '1.75' });
  });

  it('keeps SiteHeader standalone close icon aligned with TopBar header icon spec', () => {
    const { container } = render(wrap(<SiteHeader pageTitle="Privacy" />));
    const closeBtn = screen.getByRole('button', { name: 'Close and return home' });
    const svgs = Array.from(closeBtn.querySelectorAll('svg'));
    expectUniformSectionIcons(svgs, { size: 'w-5/h-5', stroke: '1.75' });
    expect(container.querySelector('header')).toBeTruthy();
  });

  it('keeps all DesktopSidebar nav + logout icons matching in dimensions and outline stroke hierarchy', () => {
    const tabs = ['DISCOVERY', 'MATCHES', 'LIKES', 'PROFILE', 'SETTINGS'] as const;
    const { container } = render(
      wrap(
        <DesktopSidebar
          activeTab="DISCOVERY"
          tabs={tabs}
          onTabChange={noop}
          currentUser={sampleUser}
          likesCount={3}
          unreadCount={2}
          onLogout={noop}
        />
      )
    );

    const aside = container.querySelector('aside')!;
    const buttons = Array.from(aside.querySelectorAll('button'));
    // 5 nav buttons (Discover, Messages, Likes, Profile fallback avatar, Settings) + Log out = 6 buttons
    expect(buttons.length).toBe(6);

    const primaryIcons = buttons
      .filter((btn) => btn.getAttribute('title') !== 'Profile')
      .map((btn) => btn.querySelector('svg')!);
    expect(primaryIcons.length).toBe(5);

    const sizes = new Set(primaryIcons.map((svg) => parseSvgSpec(svg).size));
    expect([...sizes]).toEqual(['w-6/h-6']);
    for (const svg of primaryIcons) {
      const spec = parseSvgSpec(svg);
      expect(spec.shrink0).toBe(true);
      expect(spec.fill).toBe('none');
    }

    // Active nav icon uses 2.25 stroke; inactive nav & logout use 1.75
    expect(parseSvgSpec(primaryIcons[0]).stroke).toBe('2.25');
    for (const inactiveSvg of primaryIcons.slice(1)) {
      expect(parseSvgSpec(inactiveSvg).stroke).toBe('1.75');
    }

    // Missing profile photo uses clean Lucide User fallback icon (no emoji), matching thickness family
    const profileSvg = buttons.find((b) => b.getAttribute('title') === 'Profile')?.querySelector('svg');
    expect(profileSvg).toBeTruthy();
    expect(parseSvgSpec(profileSvg!).stroke).toBe('1.75');
  });

  it('keeps all BottomTabBar icons uniform in dimensions and stroke weights', () => {
    const tabs = ['DISCOVERY', 'MATCHES', 'PROFILE', 'SETTINGS'] as const;
    const { container } = render(
      wrap(
        <BottomTabBar
          activeTab="MATCHES"
          tabs={tabs}
          onTabChange={noop}
          unreadCount={1}
        />
      )
    );

    const nav = container.querySelector('nav[aria-label="Mobile Navigation"]')!;
    const navButtons = Array.from(nav.querySelectorAll('button'));
    // Home, Search, Reels, Messages, Profile (avatar svg), Settings = 6 buttons
    expect(navButtons.length).toBe(6);

    const mainTabSvgs = navButtons
      .filter((b) => b.getAttribute('aria-label') !== 'Profile')
      .map((b) => b.querySelector('svg')!);
    expect(mainTabSvgs.length).toBe(5);

    for (const svg of mainTabSvgs) {
      const spec = parseSvgSpec(svg);
      expect(spec.size).toBe('w-6/h-6');
      expect(spec.shrink0).toBe(true);
    }

    const activeMessagesBtn = screen.getByRole('button', { name: 'Messages' });
    expect(parseSvgSpec(activeMessagesBtn.querySelector('svg')!).stroke).toBe('2.25');
    for (const label of ['Home', 'Search', 'Reels', 'Settings']) {
      const btn = screen.getByRole('button', { name: label });
      expect(parseSvgSpec(btn.querySelector('svg')!).stroke).toBe('1.75');
    }
  });

  it('matches CallButtons sizing & stroke thickness to sibling Chat sub-header toolbar icons', () => {
    const { container } = render(
      wrap(
        <CallButtons
          peerName="Maya"
          locked
          lockMessage="Calling unlocks once you have both sent a message"
          onAudio={noop}
          onVideo={noop}
        />
      )
    );
    const audioBtn = screen.getByRole('button', { name: /Voice call/i });
    const videoBtn = screen.getByRole('button', { name: /Video call/i });
    const mainSvgs = [audioBtn.querySelector('svg')!, videoBtn.querySelector('svg')!];
    expectUniformSectionIcons(mainSvgs, { size: 'w-4/h-4', stroke: '1.75' });

    // Lock badges match each other too
    const lockSvgs = Array.from(container.querySelectorAll('svg')).filter(
      (svg) => !mainSvgs.includes(svg)
    );
    expect(lockSvgs.length).toBe(2);
    expectUniformSectionIcons(lockSvgs, { size: 'w-3/h-3', stroke: '2.25' });
  });

  it('keeps Discovery headerBar segment tabs and action icons uniform', () => {
    const { container } = render(
      wrap(
        <DiscoveryView
          candidates={[
            {
              id: 'c1',
              displayName: 'Anya',
              name: 'Anya',
              age: 27,
              pictures: ['https://example.com/p.jpg'],
              prompts: [],
            } as never,
          ]}
          loading={false}
          error={null}
          onRetry={noop}
          onPass={async () => undefined}
          onLike={async () => undefined}
          onOpenPreferences={noop}
        />
      )
    );

    const tablist = container.querySelector('[role="tablist"][aria-label="Discover mode"]')!;
    const headerBar = tablist.parentElement!;
    const svgs = Array.from(headerBar.querySelectorAll('svg'));
    // Matches + Likes + Pending + Boost + Preferences = 5 icons
    expect(svgs.length).toBe(5);
    expectUniformSectionIcons(svgs, { size: 'w-3.5/h-3.5', stroke: '1.75' });
  });

  it('keeps modal header, quick actions, and footer buttons uniform inside ChatContactInfoModal', () => {
    const { container } = render(
      wrap(
        <ChatContactInfoModal
          open
          onClose={noop}
          matchId="m1"
          peerName="Anya"
          peerPhoto=""
          messages={[]}
          starredIds={new Set()}
          attachmentCache={new AttachmentObjectUrlCache()}
          onToggleStar={noop}
          onJumpToMessage={noop}
          onOpenSearch={noop}
          onViewProfile={noop}
          onOpenChatSettings={noop}
          onUnhook={noop}
          onBlock={noop}
          onReport={noop}
        />
      )
    );

    const dialog = container.querySelector('dialog')!;
    const closeBtn = dialog.querySelector('button[aria-label="Close contact info"]')!;
    expectUniformSectionIcons(Array.from(closeBtn.querySelectorAll('svg')), {
      size: 'w-4/h-4',
      stroke: '1.75',
    });

    // Quick-action strip (Audio, Video, Search, Profile)
    const quickButtons = Array.from(dialog.querySelectorAll('.grid-cols-4 button svg'));
    expect(quickButtons.length).toBe(4);
    expectUniformSectionIcons(quickButtons, { size: 'w-4/h-4', stroke: '1.75' });

    // Footer destructive strip (Unhook, Report, Block)
    const footerButtons = Array.from(dialog.querySelectorAll('.grid-cols-3 button svg'));
    expect(footerButtons.length).toBe(3);
    expectUniformSectionIcons(footerButtons, { size: 'w-3.5/h-3.5', stroke: '1.75' });
  });

  it('keeps dialog header sibling controls consistent across overlays, lightbox & settings sections', async () => {
    // ChatIntroStoriesDialog (Pause/Play beside Close)
    const intro = render(
      wrap(
        <ChatIntroStoriesDialog
          open
          onClose={noop}
          onAddByUsername={noop}
          onExploreDiscover={noop}
        />
      )
    );
    const pauseBtn = screen.getByRole('button', { name: /Pause walkthrough/i });
    const closeIntroBtn = screen.getByRole('button', { name: 'Close walkthrough' });
    expectUniformSectionIcons(
      [pauseBtn.querySelector('svg')!, closeIntroBtn.querySelector('svg')!],
      { size: 'w-4/h-4', stroke: '1.75' }
    );
    intro.unmount();

    // ArchivedChatsDialog header (Archive icon, ArrowUpDown, Close)
    const archived = render(wrap(<ArchivedChatsDialog open onClose={noop} onOpenedHook={noop} />));
    await act(async () => {});
    const archivedDialog = archived.container.querySelector('dialog')!;
    const archivedHeaderSvgs = Array.from(
      archivedDialog.querySelectorAll('.border-b svg')
    );
    expect(archivedHeaderSvgs.length).toBe(3);
    expectUniformSectionIcons(archivedHeaderSvgs, { size: 'w-4/h-4', stroke: '1.75' });
    archived.unmount();

    // BoostDialog, WalletSheet, SafetyBlockedDialog headers
    const boost = render(wrap(<BoostDialog open onClose={noop} />));
    const boostHeaderSvgs = Array.from(boost.container.querySelectorAll('dialog .border-b svg'));
    expectUniformSectionIcons(boostHeaderSvgs, { size: 'w-4/h-4', stroke: '1.75' });
    boost.unmount();

    const wallet = render(wrap(<WalletSheet open initialSection="boosts" onClose={noop} />));
    const walletTabsSvgs = Array.from(wallet.container.querySelectorAll('[role="tablist"] svg'));
    expectUniformSectionIcons(walletTabsSvgs, { size: 'w-3.5/h-3.5', stroke: '1.75' });
    wallet.unmount();

    const blocked = render(wrap(<SafetyBlockedDialog open onClose={noop} />));
    const blockedHeaderSvgs = Array.from(blocked.container.querySelectorAll('dialog .border-b svg'));
    expectUniformSectionIcons(blockedHeaderSvgs, { size: 'w-4/h-4', stroke: '1.75' });
    blocked.unmount();

    // PhotoLightbox controls (Close, Previous, Next)
    render(
      wrap(
        <PhotoLightbox
          photos={['https://example.com/1.jpg', 'https://example.com/2.jpg']}
          startIndex={0}
          onClose={noop}
          ownerName="Anya"
        />
      )
    );
    const lightboxSvgs = [
      screen.getByRole('button', { name: 'Close full-screen photo' }).querySelector('svg')!,
      screen.getByRole('button', { name: 'Previous photo' }).querySelector('svg')!,
      screen.getByRole('button', { name: 'Next photo' }).querySelector('svg')!,
    ];
    expectUniformSectionIcons(lightboxSvgs, { size: 'w-6/h-6', stroke: '1.75' });

    // SettingsView section heading icons
    const settings = render(wrap(<SettingsView user={sampleUser} onLogout={noop} />));
    const sectionIconWrappers = Array.from(
      settings.container.querySelectorAll('section > div:first-child svg')
    );
    expect(sectionIconWrappers.length).toBeGreaterThanOrEqual(4);
    expectUniformSectionIcons(sectionIconWrappers, { size: 'w-4/h-4', stroke: '1.75' });
  });

  it('keeps AttachmentComposer controls and Profile section/wallet tiles uniform', () => {
    const composer = render(
      wrap(
        <AttachmentComposer
          onPickFile={noop}
          onVoiceNote={noop}
          onPickLocation={noop}
          onPickContact={noop}
        />
      )
    );
    const triggerSvgs = Array.from(composer.container.querySelectorAll('button svg'));
    expect(triggerSvgs.length).toBeGreaterThanOrEqual(1);
    expectUniformSectionIcons(triggerSvgs, { size: 'w-4/h-4', stroke: '1.75' });
    composer.unmount();

    const wallet = render(wrap(<WalletTilesCard />));
    const tileSvgs = Array.from(wallet.container.querySelectorAll('button svg'));
    expect(tileSvgs.length).toBe(3);
    expectUniformSectionIcons(tileSvgs, { size: 'w-4/h-4', stroke: '1.75' });
    wallet.unmount();

    const chatCard = render(wrap(<ChatProfileCard user={sampleUser} />));
    const headingSvg = chatCard.container.querySelector('#chat-profile-title svg')!;
    expectUniformSectionIcons([headingSvg], { size: 'w-4/h-4', stroke: '1.75' });
    chatCard.unmount();

    const mrCard = render(
      wrap(<ProfileMrOneHookTabCard userId="me" onOpenChat={noop} />)
    );
    const mrHeadingSvg = mrCard.container.querySelector('span svg')!;
    expectUniformSectionIcons([mrHeadingSvg], { size: 'w-4/h-4', stroke: '1.75' });
  });
});
