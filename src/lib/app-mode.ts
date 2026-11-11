/**
 * The app shell by matching mode (docs/chat-only-profiles.md §12).
 *
 * A chat-only member (matching OFF, or ERASING while an opt-out is erased) gets a Messenger-only app:
 * Chat, Profile and Settings. Nothing that calls /matching/* may mount for them — Matching holds no
 * data about them and answers 403 MATCHING_OFF. Discovery and Likes exist only while matching is ON.
 * Everything here is pure so the rules are unit-tested without rendering.
 */
import type { Hook, UserStateSnapshot } from '../types';

/** Web shell tabs. LIKES and DISCOVERY are matching-only. */
export type AppTab = 'DISCOVERY' | 'MATCHES' | 'LIKES' | 'PROFILE' | 'SETTINGS';

type ModeInput = Pick<UserStateSnapshot, 'matching'> | null | undefined;

/** True only while matching is ON: the one state in which /matching/* may be called. */
export function isMatchingOn(state: ModeInput): boolean {
  return state?.matching?.status === 'ON';
}

const MATCHING_TABS: readonly AppTab[] = ['DISCOVERY', 'LIKES', 'MATCHES', 'PROFILE', 'SETTINGS'];
const CHAT_ONLY_TABS: readonly AppTab[] = ['MATCHES', 'PROFILE', 'SETTINGS'];

/** The tabs the shell shows. Unknown state fails closed to the chat-only shell. */
export function appTabsFor(state: ModeInput): readonly AppTab[] {
  return isMatchingOn(state) ? MATCHING_TABS : CHAT_ONLY_TABS;
}

/** Where the app opens: Discover with matching on, otherwise Chat. */
export function defaultTabFor(state: ModeInput): AppTab {
  return isMatchingOn(state) ? 'DISCOVERY' : 'MATCHES';
}

/** Keeps `tab` when the shell still has it (e.g. after matching was turned off), else the default. */
export function resolveTab(tab: AppTab, state: ModeInput): AppTab {
  return appTabsFor(state).includes(tab) ? tab : defaultTabFor(state);
}

/**
 * Whether the deck may be fetched: matching ON, a free hook slot (R6: paused only at capacity) and no
 * pending downgrade choice. While paused, Matching answers 403 DISCOVERY_PAUSED anyway.
 */
export function canDiscover(
  state: Pick<UserStateSnapshot, 'matching' | 'discoveryPaused' | 'selectionRequired'> | null | undefined
): boolean {
  return isMatchingOn(state) && !state?.discoveryPaused && !state?.selectionRequired;
}

/**
 * R20: the client removes its own hook partners from any deck before showing it. Matching learns of a
 * new hook a second or two after State commits it, so a page fetched in that window can still carry
 * the partner (E33).
 */
export function dropHookPartners<T extends { userId?: string; id?: string }>(
  candidates: readonly T[],
  hooks: readonly Pick<Hook, 'peerId'>[] | null | undefined
): T[] {
  if (!hooks?.length) return [...candidates];
  const partners = new Set(hooks.map((h) => h.peerId));
  return candidates.filter((c) => !partners.has(String(c.userId ?? c.id ?? '')));
}

/** Free hook slots right now (never negative). */
export function freeSlots(state: Pick<UserStateSnapshot, 'activeConnections' | 'effectiveCapacity'> | null | undefined): number {
  if (!state) return 0;
  return Math.max(0, state.effectiveCapacity - state.activeConnections);
}
