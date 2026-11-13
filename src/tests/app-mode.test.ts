import { describe, it, expect } from 'vitest';
import {
  appTabsFor,
  canDiscover,
  defaultTabFor,
  dropHookPartners,
  freeSlots,
  isMatchingOn,
  resolveTab,
} from '../lib/app-mode';

const mode = (status: 'OFF' | 'ON' | 'ERASING') => ({ matching: { status, generation: 1 } });

describe('shell by matching mode (docs/chat-only-profiles.md §12)', () => {
  it('a chat-only member (OFF) gets Matching intro, Chat, Profile and Settings, and opens on Chat', () => {
    expect(appTabsFor(mode('OFF'))).toEqual(['MATCHING_INTRO', 'MATCHES', 'PROFILE', 'SETTINGS']);
    expect(defaultTabFor(mode('OFF'))).toBe('MATCHES');
  });

  it('ERASING keeps the Matching intro tab (Turn on is disabled there until erasing ends)', () => {
    expect(appTabsFor(mode('ERASING'))).toEqual(['MATCHING_INTRO', 'MATCHES', 'PROFILE', 'SETTINGS']);
    expect(defaultTabFor(mode('ERASING'))).toBe('MATCHES');
  });

  it('the Matching intro tab disappears once matching is ON', () => {
    expect(appTabsFor(mode('ON'))).not.toContain('MATCHING_INTRO');
    expect(resolveTab('MATCHING_INTRO', mode('ON'))).toBe('DISCOVERY');
    expect(resolveTab('MATCHING_INTRO', mode('OFF'))).toBe('MATCHING_INTRO');
  });

  it('ERASING is chat-only too: nothing that calls /matching/* may mount', () => {
    expect(appTabsFor(mode('ERASING'))).not.toContain('DISCOVERY');
    expect(appTabsFor(mode('ERASING'))).not.toContain('LIKES');
    expect(isMatchingOn(mode('ERASING'))).toBe(false);
  });

  it('matching ON adds Discover and Likes, and opens on Discover', () => {
    expect(appTabsFor(mode('ON'))).toEqual(['DISCOVERY', 'LIKES', 'MATCHES', 'PROFILE', 'SETTINGS']);
    expect(defaultTabFor(mode('ON'))).toBe('DISCOVERY');
  });

  it('an unknown state fails closed to the chat-only shell', () => {
    expect(appTabsFor(null)).toEqual(['MATCHING_INTRO', 'MATCHES', 'PROFILE', 'SETTINGS']);
    expect(isMatchingOn(undefined)).toBe(false);
  });

  it('leaves a tab the shell no longer has when matching turns off', () => {
    expect(resolveTab('DISCOVERY', mode('OFF'))).toBe('MATCHES');
    expect(resolveTab('LIKES', mode('ERASING'))).toBe('MATCHES');
    expect(resolveTab('SETTINGS', mode('OFF'))).toBe('SETTINGS');
    expect(resolveTab('LIKES', mode('ON'))).toBe('LIKES');
  });
});

describe('canDiscover', () => {
  const s = (status: 'OFF' | 'ON' | 'ERASING', discoveryPaused = false, selectionRequired = false) => ({
    ...mode(status),
    discoveryPaused,
    selectionRequired,
  });

  it('needs matching ON, a free slot and no pending downgrade choice', () => {
    expect(canDiscover(s('ON'))).toBe(true);
    expect(canDiscover(s('ON', true))).toBe(false);
    expect(canDiscover(s('ON', false, true))).toBe(false);
    expect(canDiscover(s('OFF'))).toBe(false);
    expect(canDiscover(s('ERASING'))).toBe(false);
    expect(canDiscover(null)).toBe(false);
  });
});

describe('dropHookPartners (R20, E33)', () => {
  const cards = [{ userId: 'a' }, { userId: 'partner' }, { id: 'c' }];

  it('removes the member’s own hook partners from a deck', () => {
    expect(dropHookPartners(cards, [{ peerId: 'partner' }])).toEqual([{ userId: 'a' }, { id: 'c' }]);
  });

  it('matches by id when a card has no userId', () => {
    expect(dropHookPartners(cards, [{ peerId: 'c' }])).toEqual([{ userId: 'a' }, { userId: 'partner' }]);
  });

  it('leaves the deck alone without hooks, and never mutates its input', () => {
    const out = dropHookPartners(cards, []);
    expect(out).toEqual(cards);
    expect(out).not.toBe(cards);
    expect(dropHookPartners(cards, undefined)).toEqual(cards);
  });
});

describe('freeSlots', () => {
  it('is capacity minus active hooks, never negative', () => {
    expect(freeSlots({ activeConnections: 1, effectiveCapacity: 3 })).toBe(2);
    expect(freeSlots({ activeConnections: 3, effectiveCapacity: 1 })).toBe(0);
    expect(freeSlots(null)).toBe(0);
  });
});
