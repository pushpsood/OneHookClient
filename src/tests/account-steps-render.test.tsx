import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

// Server rendering runs no effects, so nothing here reaches the network.
vi.mock('../api/sdk-client', () => ({ sdkClient: {} }));

import { ToastProvider } from '../components/common/Toast';
import { MatchingIntroView, MATCHING_INTRO_COPY } from '../features/matching/MatchingIntroView';
import { ProfileAccountRows } from '../features/profile/ProfileAccountRows';
import { BottomTabBar } from '../app/BottomTabBar';
import { DesktopSidebar } from '../app/DesktopSidebar';
import { Login } from '../components/auth/Login';
import { appTabsFor } from '../lib/app-mode';

const render = (el: ReactElement) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <ToastProvider>{el}</ToastProvider>
    </MemoryRouter>
  );

const mode = (status: 'OFF' | 'ON' | 'ERASING') => ({ matching: { status, generation: 1 } });
const noop = () => undefined;

/** The `data-track-id` (and value) of every tracked element, in document order. */
const tracked = (html: string) =>
  [...html.matchAll(/data-track-id="([^"]+)"(?:[^>]*?data-track-value="([^"]+)")?/g)].map(([, id, value]) =>
    value ? `${id}=${value}` : id
  );

describe('Matching tab (chat-only members)', () => {
  it('shows the "Matching is off" message with Turn on, the guide and Hide', () => {
    const html = render(<MatchingIntroView erasing={false} onTurnOn={noop} onHide={noop} />);
    expect(html).toContain(MATCHING_INTRO_COPY.title);
    expect(html).toContain('Turn it on to build a matching profile and meet new people.');
    expect(tracked(html).filter((t) => t !== 'matching_intro.locked_tap')).toEqual([
      'matching_intro.turn_on',
      'matching_intro.should_i_join',
      'matching_intro.hide',
    ]);
    expect(html).not.toContain(MATCHING_INTRO_COPY.erasing);
  });

  it('while ERASING, Turn on is disabled and says why', () => {
    const html = render(<MatchingIntroView erasing onTurnOn={noop} onHide={noop} />);
    expect(html).toContain(MATCHING_INTRO_COPY.erasing);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-track-id="matching_intro.turn_on"/);
  });

  it('is the first tab of the chat-only shell, on mobile and desktop', () => {
    const tabs = appTabsFor(mode('OFF'));
    const mobile = tracked(render(<BottomTabBar activeTab="MATCHES" tabs={tabs} onTabChange={noop} />));
    expect(mobile).toEqual([
      'nav.tab_select=MATCHING_INTRO',
      'nav.tab_select=CHAT',
      'nav.tab_select=PROFILE',
      'profile.settings_open',
    ]);
    const desktop = tracked(
      render(<DesktopSidebar activeTab="MATCHES" tabs={tabs} onTabChange={noop} currentUser={null} onLogout={noop} />)
    );
    expect(desktop.slice(0, 4)).toEqual([
      'nav.tab_select=MATCHING_INTRO',
      'nav.tab_select=CHAT',
      'nav.tab_select=PROFILE',
      'profile.settings_open',
    ]);
  });

  it('is gone once matching is ON, and when the member hid it', () => {
    const html = render(<BottomTabBar activeTab="DISCOVERY" tabs={appTabsFor(mode('ON'))} onTabChange={noop} />);
    expect(html).not.toContain('MATCHING_INTRO');
    const hidden = render(
      <BottomTabBar activeTab="MATCHES" tabs={appTabsFor({ ...mode('OFF'), matchingTabHidden: true })} onTabChange={noop} />
    );
    expect(tracked(hidden)).toEqual(['nav.tab_select=CHAT', 'nav.tab_select=PROFILE', 'profile.settings_open']);
  });
});

describe('Profile rows under the profile editor', () => {
  it('Turn on matching (matching not ON) and Account recovery', () => {
    const html = render(<ProfileAccountRows userId="me" showMatching erasing={false} onOpenMatching={noop} />);
    expect(tracked(html)).toEqual(['profile.matching_open', 'profile.recovery_open']);
    expect(html).toContain('Turn on matching');
    expect(html).toContain('Account recovery');
  });

  it('only Account recovery once matching is ON', () => {
    const html = render(<ProfileAccountRows userId="me" showMatching={false} erasing={false} onOpenMatching={noop} />);
    expect(tracked(html)).toEqual(['profile.recovery_open']);
  });

  it('Turn on matching is disabled while ERASING', () => {
    const html = render(<ProfileAccountRows userId="me" showMatching erasing onOpenMatching={noop} />);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-track-id="profile.matching_open"/);
    expect(html).toContain(MATCHING_INTRO_COPY.erasing);
  });
});

describe('Login: phone, email or username', () => {
  it('offers all three identifier modes', () => {
    const modes = tracked(render(<Login />)).filter((t) => t.startsWith('login.identifier_mode'));
    expect(modes).toEqual([
      'login.identifier_mode=phone',
      'login.identifier_mode=email',
      'login.identifier_mode=username',
    ]);
  });
});

// ── Source wiring (rules the type checker cannot see) ──────────────────────────────────────────────

const SRC = new URL('../', import.meta.url).pathname;
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return ['tests', 'generated'].includes(entry) ? [] : sources(path);
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('onboarding wiring', () => {
  const wizard = stripComments(read('components/onboarding/OnboardingWizard.tsx'));

  it('completes onboarding once, at the very end', () => {
    expect(wizard.match(/StateApi\.completeOnboarding\(\)/g)).toHaveLength(1);
    expect(wizard).toMatch(/const finishOnboarding = async[\s\S]*StateApi\.completeOnboarding\(\)/);
  });

  it('uses the Identity account operations and the shared Google link and recovery flows', () => {
    for (const call of [
      'IdentityApi.getUser(',
      'IdentityApi.checkUsernameAvailability(',
      'IdentityApi.updateUsername(',
      'IdentityApi.setPassword(',
      'linkGoogleAccount()',
      'setUpAccountRecovery(',
    ]) {
      expect(wizard).toContain(call);
    }
  });

  it('offers no Apple linking on web', () => {
    expect(wizard).not.toMatch(/ONBOARDING_SOCIAL_LINK[^)]*'apple'/);
    expect(wizard).not.toMatch(/linkSocial\('APPLE'/);
  });

  it('the Matching intro mounts only while matching is off', () => {
    expect(read('app/AppContent.tsx')).toMatch(/appState === 'MATCHING_INTRO' && !matchingOn/);
  });
});

describe('web has no "start over" reset', () => {
  const code = sources().map((p) => ({ path: relative(SRC, p), text: stripComments(readFileSync(p, 'utf8')) }));

  it('the reset dialog and its entry point are gone', () => {
    expect(existsSync(join(SRC, 'components/chat/HistoryResetDialog.tsx'))).toBe(false);
    for (const pattern of [/HistoryResetDialog/, /resetHistoryKey/, /CHAT_HISTORY_RESET_CONFIRM/, /'reset_open'/]) {
      expect(code.filter((f) => pattern.test(f.text)).map((f) => f.path)).toEqual([]);
    }
  });

  it('keeps rendering the horizon another device may set', () => {
    expect(read('lib/chat-encryption.ts')).toContain('async historyHorizon()');
    expect(read('components/chat/LockedMessage.tsx')).toMatch(/horizon/i);
  });
});
