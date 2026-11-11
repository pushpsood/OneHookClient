import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

// No network in render tests: the components only read through these wrappers in effects, which
// server rendering never runs, but importing the real SDK client is unnecessary.
vi.mock('../api/sdk-client', () => ({ sdkClient: {} }));

import { ToastProvider } from '../components/common/Toast';
import { HookRequestsSheet } from '../features/chat/HookRequestsSheet';
import { KeepHooksChooser } from '../features/chat/KeepHooksChooser';
import { MatchingSettingsCard } from '../features/settings/MatchingSettingsCard';
import { SubscriptionTier, UserState, type UserProfile, type UserStateSnapshot } from '../types';

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ToastProvider>{el}</ToastProvider>
    </MemoryRouter>
  );

const state = (over: Partial<UserStateSnapshot> = {}): UserStateSnapshot => ({
  userId: 'me',
  state: UserState.HOOKED,
  activeConnections: 1,
  subscriptionTier: SubscriptionTier.MUST,
  hooks: [],
  effectiveCapacity: 1,
  discoveryPaused: true,
  matching: { status: 'OFF', generation: 0 },
  selectionRequired: false,
  ...over,
});

const me = (over: Partial<UserProfile> = {}): UserProfile => ({
  userId: 'me',
  id: 'me',
  name: 'Asha',
  displayName: 'Asha',
  photos: [],
  ...over,
});

describe('HookRequestsSheet', () => {
  const noop = () => undefined;

  it('a locked request names nobody and offers nothing but "Unhook to see this request"', () => {
    const html = render(
      <HookRequestsSheet
        open
        onClose={noop}
        incoming={[{ requestId: 'r1', createdAt: 1767000000, expiresAt: 1769600000, locked: true }]}
        outgoing={[]}
        loading={false}
        onChanged={noop}
        onAccepted={noop}
        onBlock={noop}
      />
    );
    expect(html).toContain('Unhook to see this request');
    expect(html).not.toContain('>Accept<');
    expect(html).not.toContain('hook_requests.accept');
  });

  it('an unlocked request offers Accept, Decline and Block, each tracked', () => {
    const html = render(
      <HookRequestsSheet
        open
        onClose={noop}
        incoming={[{ requestId: 'r2', createdAt: 1767000000, expiresAt: 1769600000, locked: false, fromUserId: 'carol' }]}
        outgoing={[]}
        loading={false}
        onChanged={noop}
        onAccepted={noop}
        onBlock={noop}
      />
    );
    for (const id of ['hook_requests.accept', 'hook_requests.decline', 'hook_requests.block']) {
      expect(html).toContain(`data-track-id="${id}"`);
    }
    expect(html).toContain('Wants to connect');
  });

  it('every sent request reads "Pending", whatever the recipient did (E17)', () => {
    const html = render(
      <HookRequestsSheet
        open
        onClose={noop}
        incoming={[]}
        outgoing={[{ requestId: 'r3', createdAt: 1767000000, expiresAt: 1769600000, toUsername: 'bob' }]}
        loading={false}
        onChanged={noop}
        onAccepted={noop}
        onBlock={noop}
      />
    );
    expect(html).toContain('@bob');
    expect(html).toContain('Pending');
    expect(html).toContain('data-track-id="hook_requests.cancel"');
  });
});

describe('KeepHooksChooser', () => {
  it('explains the limit and the deadline, and keeps the submit disabled until the right count is chosen', () => {
    const html = render(
      <KeepHooksChooser
        userState={state({
          state: UserState.SELECTION_REQUIRED,
          selectionRequired: true,
          keepLimit: 1,
          selectionDeadline: 1767600000,
          activeConnections: 3,
          hooks: [
            { matchId: 'm1', peerId: 'p1', origin: 'DISCOVERY', hookedAt: 1, suspended: true },
            { matchId: 'm2', peerId: 'p2', origin: 'REQUEST', hookedAt: 2, suspended: true },
            { matchId: 'm3', peerId: 'p3', origin: 'REQUEST', hookedAt: 3, suspended: true },
          ],
        })}
        onKept={() => undefined}
        onUpgrade={() => undefined}
      />
    );
    expect(html).toContain('Choose who to keep');
    expect(html).toMatch(/allows one hook, and you have 3/);
    expect(html).toMatch(/If you don&#x27;t choose by/);
    expect(html).toContain('All your chats are paused until you choose.');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-track-id="chat.keep_hooks_submit"/);
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(3);
  });
});

describe('MatchingSettingsCard', () => {
  it('matching off, no draft: "Turn on matching" builds the matching profile first', () => {
    const html = render(
      <MatchingSettingsCard user={me()} userState={state()} onChanged={() => undefined} onOpenMatchingProfile={() => undefined} />
    );
    expect(html).toContain('Matching is off');
    expect(html).toMatch(/data-track-id="settings.matching_profile_open"[^>]*>Turn on matching/);
    expect(html).not.toContain('settings.matching_disable');
  });

  it('matching off with a draft: shows the expiry notice and enables directly', () => {
    const html = render(
      <MatchingSettingsCard
        user={me({ matchingStatus: 'DRAFT', draftExpiresAt: 1769600000 })}
        userState={state()}
        onChanged={() => undefined}
        onOpenMatchingProfile={() => undefined}
      />
    );
    expect(html).toContain('30 days without changes');
    expect(html).toContain('data-track-id="settings.matching_enable"');
    expect(html).toContain('Delete draft');
  });

  it('matching on: offers turning it off (behind a confirmation)', () => {
    const html = render(
      <MatchingSettingsCard
        user={me({ matchingStatus: 'ACTIVE' })}
        userState={state({ matching: { status: 'ON', generation: 2 }, discoveryPaused: false })}
        onChanged={() => undefined}
      />
    );
    expect(html).toContain('Matching is on');
    expect(html).toContain('data-track-id="settings.matching_disable"');
    expect(html).toContain('Turn off matching');
  });

  it('while erasing nothing can be turned on (R9)', () => {
    const html = render(
      <MatchingSettingsCard
        user={me()}
        userState={state({ matching: { status: 'ERASING', generation: 2 } })}
        onChanged={() => undefined}
        onOpenMatchingProfile={() => undefined}
      />
    );
    expect(html).toContain('Turning matching off');
    expect(html).not.toContain('settings.matching_enable');
    expect(html).not.toContain('settings.matching_profile_open');
  });
});
