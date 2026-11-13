import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

/**
 * The chat-only member's Matching tab: a locked preview of Discover's empty state, the "Hide matching
 * screen" action and the Settings > General switch that brings it back (SetMatchingTabHidden).
 * Server rendering runs no effects, so nothing here reaches the network unless a test calls an API.
 */
vi.mock('../api/sdk-client', () => ({ sdkClient: {} }));

import { ToastProvider } from '../components/common/Toast';
import { LockedDiscoverChips, MatchingIntroView, MATCHING_INTRO_COPY } from '../features/matching/MatchingIntroView';
import { DISCOVER_EMPTY_COPY } from '../features/discovery/DiscoveryView';
import { CategoryChips, DiscoveryEmptyState } from '../features/discovery/DiscoveryEmptyState';
import { MatchingTabToggleCard, MATCHING_TAB_TOGGLE_COPY } from '../features/settings/MatchingTabToggleCard';
import { BottomTabBar } from '../app/BottomTabBar';
import { DesktopSidebar } from '../app/DesktopSidebar';
import { StateApi, toUserStateSnapshot } from '../api/state';
import { ApiError } from '../lib/api-client';
import { setMatchingTabHiddenInStore } from '../hooks/use-api';
import { useAppStore } from '../store/app-store';
import { appTabsFor } from '../lib/app-mode';
import { SubscriptionTier, UserState, type UserStateSnapshot } from '../types';

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ToastProvider>{el}</ToastProvider>
    </MemoryRouter>
  );
const noop = () => undefined;

const tracked = (html: string) =>
  [...html.matchAll(/data-track-id="([^"]+)"(?:[^>]*?data-track-value="([^"]+)")?/g)].map(([, id, value]) =>
    value ? `${id}=${value}` : id
  );

/** Markup with the tracking attributes removed, to compare layout and styling only. */
const untracked = (html: string) => html.replace(/\s?data-track-[a-z-]+="[^"]*"/g, '');

const snapshot = (over: Partial<UserStateSnapshot> = {}): UserStateSnapshot => ({
  userId: 'me',
  state: UserState.AVAILABLE,
  activeConnections: 0,
  subscriptionTier: SubscriptionTier.MUST,
  hooks: [],
  effectiveCapacity: 1,
  discoveryPaused: false,
  matching: { status: 'OFF', generation: 0 },
  selectionRequired: false,
  matchingTabHidden: false,
  ...over,
});

/** Every element of a hook-free component tree (function components are expanded by calling them). */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  if (typeof el.type === 'function') return elements((el.type as (p: unknown) => ReactNode)(el.props));
  return [el, ...elements(el.props.children as ReactNode)];
}

describe('the Matching tab is a locked preview of Discover’s empty state', () => {
  const html = render(<MatchingIntroView erasing={false} onTurnOn={noop} onHide={noop} />);

  it('has the Discover empty-state structure: the same chips and container, with the Matching copy', () => {
    const discover = render(
      <DiscoveryEmptyState
        chips={<CategoryChips value="ALL" available={['ALL']} onPick={noop} trackAttrsFor={() => ({})} />}
        title={DISCOVER_EMPTY_COPY.title}
        message={DISCOVER_EMPTY_COPY.message}
      />
    );
    // Same container and chip markup as the real screen ("For you" selected, the rest locked).
    const chipsOf = (h: string) => untracked(h.slice(h.indexOf('<div role="tablist"'), h.indexOf('<div class="max-w-sm')));
    expect(chipsOf(html)).toBe(chipsOf(discover));
    expect(html).toContain('<div class="h-full flex flex-col items-center justify-center bg-bg text-text p-6 gap-6">');
    expect(discover).toContain('<div class="h-full flex flex-col items-center justify-center bg-bg text-text p-6 gap-6">');
    expect(html).toMatch(/<h2 id="matching-intro-title" class="text-lg font-semibold text-text">Matching is off<\/h2>/);
    expect(html).toContain(`<p class="text-sm text-text-secondary">${MATCHING_INTRO_COPY.body}</p>`);
    expect(html).toMatch(/aria-selected="true"[^>]*>For you</);
    expect((html.match(/data-locked="true"/g) ?? []).length).toBe(3);
  });

  it('stacks the three actions as black, square-cornered buttons of the same width', () => {
    const actions = html.slice(html.indexOf('data-testid="matching-intro-actions"'));
    const buttons = [...actions.matchAll(/<button[^>]*class="([^"]+)"[^>]*>([^<]+)<\/button>/g)].slice(0, 3);
    expect(buttons.map(([, , label]) => label)).toEqual([
      MATCHING_INTRO_COPY.turnOn,
      MATCHING_INTRO_COPY.shouldIJoin,
      MATCHING_INTRO_COPY.hide,
    ]);
    for (const [, cls] of buttons) {
      expect(cls).toContain('w-full');
      expect(cls).toContain('bg-accent');
      expect(cls).toContain('text-bg');
      expect(cls).toContain('uppercase');
      expect(cls).toContain('rounded-none');
      expect(cls).not.toMatch(/rounded-(sm|md|lg|xl|2xl|full)\b/);
    }
    expect(new Set(buttons.map(([, cls]) => cls)).size).toBe(1);
    expect(tracked(actions).slice(0, 3)).toEqual(['matching_intro.turn_on', 'matching_intro.should_i_join', 'matching_intro.hide']);
  });

  it('every other control reports matching_intro.locked_tap, never its discover.* id', () => {
    const ids = tracked(html);
    expect(ids.filter((id) => id === 'matching_intro.locked_tap')).toHaveLength(4);
    expect(ids.filter((id) => id.startsWith('discover.'))).toEqual([]);
  });

  it('a locked control only says "Opt in to get access"', () => {
    const onLocked = vi.fn();
    const buttons = elements(LockedDiscoverChips({ onLocked })).filter((el) => el.type === 'button');
    expect(buttons).toHaveLength(4);
    for (const b of buttons) {
      expect(b.props['data-track-id']).toBe('matching_intro.locked_tap');
      (b.props.onClick as () => void)();
    }
    expect(onLocked).toHaveBeenCalledTimes(4);
    expect(MATCHING_INTRO_COPY.locked).toBe('Opt in to get access');
    expect(read('features/matching/MatchingIntroView.tsx')).toMatch(
      /const locked = \(\) => showToast\(MATCHING_INTRO_COPY\.locked, 'info'\);[\s\S]*<LockedDiscoverChips onLocked=\{locked\} \/>/
    );
  });

  it('while ERASING says why and disables Turn on matching only', () => {
    const erasing = render(<MatchingIntroView erasing onTurnOn={noop} onHide={noop} />);
    expect(erasing).toContain(MATCHING_INTRO_COPY.erasing);
    expect(erasing).toMatch(/<button[^>]*disabled=""[^>]*data-track-id="matching_intro.turn_on"/);
    expect(erasing).not.toMatch(/<button[^>]*disabled=""[^>]*data-track-id="matching_intro.hide"/);
  });
});

// ── Source rules ───────────────────────────────────────────────────────────────────────────────────

const SRC = new URL('../', import.meta.url).pathname;
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
/** Runtime (non-type) imports of a file. */
const runtimeImports = (text: string) =>
  [...text.matchAll(/^import\s+(?!type\s)[^;]*?from\s+'([^']+)'/gms)].map(([, from]) => from);

describe('the preview makes no /matching/* call', () => {
  for (const file of ['features/matching/MatchingIntroView.tsx', 'features/discovery/DiscoveryEmptyState.tsx']) {
    it(`${file} imports no API module and never mounts DiscoveryView`, () => {
      const text = read(file);
      const imports = runtimeImports(text);
      expect(imports.filter((m) => /\/api\/|use-api|DiscoveryView/.test(m))).toEqual([]);
      // Code only: comments and type-only imports (DiscoveryCategory) carry no request.
      const code = stripComments(text).replace(/^import type .*$/gm, '');
      expect(code).not.toMatch(/MatchingApi|RosesApi|SwipeApi|ReceivedLikesApi|sdkClient|fetch\(|\/matching\/|<DiscoveryView/);
    });
  }

  it('AppContent mounts the preview, not DiscoveryView, while matching is off, in Discover’s slot', () => {
    const app = read('app/AppContent.tsx');
    expect(app).toMatch(/appState === 'DISCOVERY' && matchingOn/);
    const intro = app.slice(app.indexOf("appState === 'MATCHING_INTRO' && !matchingOn"));
    const block = intro.slice(0, intro.indexOf('</motion.div>'));
    expect(block).toContain('className="h-full"');
    expect(block).toContain('<MatchingIntroView');
    expect(block).not.toContain('max-w-[700px]');
    expect(block).not.toContain('<DiscoveryView');
  });
});

describe('the Matching tab item looks like the Discover item', () => {
  it('desktop: label "Discover" with the Discover icon', () => {
    const off = render(
      <DesktopSidebar activeTab="MATCHES" tabs={appTabsFor({ matching: { status: 'OFF', generation: 0 } })} onTabChange={noop} currentUser={null} onLogout={noop} />
    );
    const on = render(
      <DesktopSidebar activeTab="MATCHES" tabs={appTabsFor({ matching: { status: 'ON', generation: 1 } })} onTabChange={noop} currentUser={null} onLogout={noop} />
    );
    const item = (h: string, value: string) => untracked(h.match(new RegExp(`<button[^>]*data-track-value="${value}"[\\s\\S]*?</button>`))![0]);
    expect(item(off, 'MATCHING_INTRO')).toBe(item(on, 'DISCOVER'));
    expect(off).toContain('title="Discover"');
  });

  it('mobile: the Home label and icon', () => {
    const off = render(<BottomTabBar activeTab="MATCHES" tabs={appTabsFor({ matching: { status: 'OFF', generation: 0 } })} onTabChange={noop} />);
    const on = render(<BottomTabBar activeTab="MATCHES" tabs={appTabsFor({ matching: { status: 'ON', generation: 1 } })} onTabChange={noop} />);
    const first = (h: string) => untracked(h.match(/<button[\s\S]*?<\/button>/)![0]);
    expect(first(off)).toBe(first(on));
    expect(first(off)).toContain('aria-label="Home"');
  });
});

describe('Settings > General: Show Matching tab', () => {
  it('checked while shown; switching it off reports hide', () => {
    const html = render(<MatchingTabToggleCard hidden={false} />);
    expect(html).toContain(MATCHING_TAB_TOGGLE_COPY.title);
    expect(html).toContain('See a preview of matching in your tab bar.');
    expect(html).toMatch(/role="switch" aria-checked="true"/);
    expect(tracked(html)).toEqual(['settings.matching_tab_toggle=hide']);
  });

  it('unchecked while hidden; switching it on reports show', () => {
    const html = render(<MatchingTabToggleCard hidden />);
    expect(html).toMatch(/role="switch" aria-checked="false"/);
    expect(tracked(html)).toEqual(['settings.matching_tab_toggle=show']);
  });

  it('is offered in the General section only while matching is not ON', () => {
    const settings = read('features/settings/SettingsView.tsx');
    const general = settings.slice(settings.indexOf('title="General"'), settings.indexOf('title="Matching"'));
    expect(general).toMatch(/!isMatchingOn\(userState\) && \(\s*<MatchingTabToggleCard hidden=\{userState\.matchingTabHidden\} \/>/);
  });
});

// ── SetMatchingTabHidden ───────────────────────────────────────────────────────────────────────────

describe('StateApi.setMatchingTabHidden (PUT /state/matching/tab-hidden)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends {hidden} and returns the server’s answer', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ hidden: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(StateApi.setMatchingTabHidden(true)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/\/state\/matching\/tab-hidden$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ hidden: true });
  });

  it('showing it again sends hidden:false', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ hidden: false }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(StateApi.setMatchingTabHidden(false)).resolves.toBe(false);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({ hidden: false });
  });

  it('a 400 or 500 rejects with the shared ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'hidden is required', code: 'BAD_REQUEST' }), { status: 400 }))
    );
    const err = await StateApi.setMatchingTabHidden(true).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).code).toBe('BAD_REQUEST');
  });

  it('the state snapshot reads matchingTabHidden; absent means shown', () => {
    expect(toUserStateSnapshot({ userId: 'me' } as never).matchingTabHidden).toBe(false);
    expect(toUserStateSnapshot({ userId: 'me', matchingTabHidden: true } as never).matchingTabHidden).toBe(true);
  });
});

describe('setMatchingTabHiddenInStore (optimistic, reverted on failure)', () => {
  beforeEach(() => useAppStore.getState().setUserState(snapshot()));
  afterEach(() => {
    vi.restoreAllMocks();
    useAppStore.getState().setUserState(null);
  });

  it('hides the tab before the server answers, then applies the answer', async () => {
    let resolve!: (v: boolean) => void;
    vi.spyOn(StateApi, 'setMatchingTabHidden').mockImplementation(() => new Promise<boolean>((r) => (resolve = r)));
    const pending = setMatchingTabHiddenInStore(true);
    expect(useAppStore.getState().userState?.matchingTabHidden).toBe(true);
    expect(appTabsFor(useAppStore.getState().userState)).toEqual(['MATCHES', 'PROFILE', 'SETTINGS']);
    resolve(true);
    await pending;
    expect(useAppStore.getState().userState?.matchingTabHidden).toBe(true);
  });

  it('puts the tab back and rethrows when the call fails', async () => {
    vi.spyOn(StateApi, 'setMatchingTabHidden').mockRejectedValue(new ApiError('boom', 500, 'INTERNAL_ERROR'));
    await expect(setMatchingTabHiddenInStore(true)).rejects.toThrow('boom');
    expect(useAppStore.getState().userState?.matchingTabHidden).toBe(false);
    expect(appTabsFor(useAppStore.getState().userState)).toContain('MATCHING_INTRO');
  });
});
