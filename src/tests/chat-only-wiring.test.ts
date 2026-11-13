import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Source guards for the chat-only profiles migration (docs/chat-only-profiles.md §9, §12): the routes
 * that were removed are not called any more, and the matching-only surfaces are mounted only while
 * matching is ON. Text checks, because the rules are about wiring the type checker cannot see.
 */
const SRC = new URL('../', import.meta.url).pathname;

function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return ['tests', 'generated'].includes(entry) ? [] : sources(path);
    }
    return /\.tsx?$/.test(entry) ? [path] : [];
  });
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = sources().map((path) => ({ path: relative(SRC, path), text: stripComments(readFileSync(path, 'utf8')) }));
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

describe('removed routes are not called', () => {
  const removed: [string, RegExp][] = [
    ['Matching blocks (moved to /state/blocks)', /['"`]\/matching\/blocks/],
    ['Matching reports (moved to /state/reports)', /['"`]\/matching\/reports/],
    ['add-by-username swipe (replaced by hook requests)', /swipeByUsername|\/matching\/swipe\/by-username/],
    ['GET /profile/{userId} (replaced by view-pass reads)', /\.getProfile\(|ProfileApi\.get\(/],
    ['PUT /profile (split into /profile/chat and /profile/matching)', /\.updateProfile\(|ProfileApi\.upsert\(/],
    ['GET /state/match for the partner (hooks[] names it)', /StateApi\.getMatch\(/],
    ['matchIds as the chat list (hooks[] replaces it)', /\.matchIds\b/],
  ];
  for (const [what, pattern] of removed) {
    it(what, () => {
      expect(code.filter((f) => pattern.test(f.text)).map((f) => f.path)).toEqual([]);
    });
  }
});

describe('nothing calling /matching/* mounts for a chat-only member', () => {
  const app = read('app/AppContent.tsx');

  it('Discover, Likes and Search mount only with matching on', () => {
    expect(app).toMatch(/appState === 'DISCOVERY' && matchingOn/);
    expect(app).toMatch(/appState === 'LIKES' && matchingOn/);
    expect(app).toMatch(/\{matchingOn && \(\s*<SearchDrawer/);
  });

  it('the deck, location and preferences are gated on the mode', () => {
    expect(app).toContain('enabled: canDiscover(userState)');
    expect(app).toMatch(/useUserLocation\([\s\S]*?matchingOn\s*\)/);
    expect(read('features/profile/ProfileView.tsx')).toContain('usePreferences(user.id, matchingOn)');
    expect(read('features/profile/ProfileView.tsx')).toMatch(/\{matchingOn && \(\s*<>[\s\S]*<SuggestionsSection[\s\S]*<TraditionsSection/);
  });

  it('partner distance (a Matching route) is read only with matching on', () => {
    expect(read('features/chat/ChatView.tsx')).toMatch(/if \(!matchingOn \|\| !peerKey\) return;/);
  });

  it('matching view passes are re-issued only with matching on', () => {
    expect(read('hooks/use-view-pass-refreshers.ts')).toMatch(/if \(!matchingOn\) \{[\s\S]*clear\('profile\.matching'\)/);
  });
});

describe('downgrade, suspension and blocks', () => {
  it('a pending downgrade choice takes over the whole app', () => {
    expect(read('app/AppContent.tsx')).toMatch(/if \(userState\?\.selectionRequired\) \{\s*return \(\s*<KeepHooksChooser/);
  });

  it('a suspended chat is read-only and a CONVERSATION_SUSPENDED write re-reads the state', () => {
    const chat = read('features/chat/ChatView.tsx');
    expect(chat).toContain('readOnlyReason={suspended ? HOOK_COPY.suspendedComposer : undefined}');
    expect(chat).toContain('if (isConversationSuspended(err)) onSuspended?.();');
    expect(read('lib/call-errors.ts')).toContain("err.errorType === 'CONVERSATION_SUSPENDED'");
  });

  it('a suspended chat locks the call buttons, and a suspended startCall re-reads the state', () => {
    expect(read('features/chat/ChatView.tsx')).toContain('locked={Boolean(suspended) || eligibility.locked}');
    expect(read('app/CallProvider.tsx')).toMatch(/isConversationSuspended\(error\)\) void refreshUserStateInStore\(\)/);
  });

  it('blocking goes through State, which also releases the hook (no separate unhook)', () => {
    const chat = read('features/chat/ChatView.tsx');
    expect(chat).toContain('StateApi.blockUser(target.userId, reason)');
    expect(chat).not.toMatch(/blockUser[\s\S]{0,400}releaseHook/);
  });
});

describe('onboarding is chat-only (§7.1)', () => {
  // Comments may explain what the wizard leaves out; only code counts.
  const wizard = stripComments(read('components/onboarding/OnboardingWizard.tsx'));

  it('saves only the chat profile, then completes onboarding', () => {
    expect(wizard).toContain('ProfileApi.upsertChat(');
    expect(wizard).not.toContain('upsertMatching');
    expect(wizard).toMatch(/upsertChat\([\s\S]*StateApi\.completeOnboarding\(\)/);
  });

  it('asks for no matching fields and no photo minimum', () => {
    for (const field of ['interestedIn', 'gender', 'prompts', 'audioPrompt', 'at least 3 photos']) {
      expect(wizard).not.toContain(field);
    }
    expect(wizard).toContain("uploadMedia(file, 'CHAT')");
  });
});

describe('birth time and place live on the matching profile only', () => {
  it('only the matching profile editor renders the fields', () => {
    const users = code.filter((f) => /<BirthTimePlaceFields\b/.test(f.text)).map((f) => f.path);
    expect(users).toEqual(['features/profile/ProfileView.tsx']);
  });

  it('no chat-profile write carries them', () => {
    for (const rel of ['features/profile/ChatProfileCard.tsx', 'components/onboarding/OnboardingWizard.tsx']) {
      const src = stripComments(read(rel));
      expect(src, rel).not.toMatch(/BirthTimePlace|birthTimePlace|birthDetailsPayload/);
    }
    expect(code.filter((f) => /birthDetailsPayload/.test(f.text)).map((f) => f.path)).toEqual([]);
  });

  it('the matching editor saves them with PUT /profile/matching', () => {
    const view = stripComments(read('features/profile/ProfileView.tsx'));
    expect(view).toMatch(/const profilePayload[\s\S]*?\.\.\.birthTimePlaceEdit,[\s\S]*?saveMatching\(profilePayload\)/);
  });
});
