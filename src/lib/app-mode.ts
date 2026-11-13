/**
 * The app shell by matching mode (docs/chat-only-profiles.md §12).
 *
 * A chat-only member (matching OFF, or ERASING while an opt-out is erased) gets a Messenger-only app:
 * a Matching tab (a locked preview of Discover with the way to turn matching on), Chat, Profile and
 * Settings. The member may hide the Matching tab (`matchingTabHidden`, synced on the state record);
 * then the shell is Chat, Profile and Settings. Nothing that calls /matching/* may mount for them:
 * Matching holds no data about them and answers 403 MATCHING_OFF. Discovery and Likes exist only
 * while matching is ON, and the Matching tab only while it is not.
 * Everything here is pure so the rules are unit-tested without rendering.
 */
import type { Hook, UserStateSnapshot } from '../types';

/** Web shell tabs. LIKES and DISCOVERY are matching-only; MATCHING_INTRO (the preview) is chat-only. */
export type AppTab = 'DISCOVERY' | 'MATCHES' | 'LIKES' | 'PROFILE' | 'SETTINGS' | 'MATCHING_INTRO';

type ModeInput = (Pick<UserStateSnapshot, 'matching'> & { matchingTabHidden?: boolean }) | null | undefined;

/** True only while matching is ON: the one state in which /matching/* may be called. */
export function isMatchingOn(state: ModeInput): boolean {
  return state?.matching?.status === 'ON';
}

/** Whether the shell shows the Matching tab: matching not ON and the member has not hidden it. */
export function showsMatchingTab(state: ModeInput): boolean {
  return !isMatchingOn(state) && !state?.matchingTabHidden;
}

const MATCHING_TABS: readonly AppTab[] = ['DISCOVERY', 'LIKES', 'MATCHES', 'PROFILE', 'SETTINGS'];
const CHAT_ONLY_TABS: readonly AppTab[] = ['MATCHING_INTRO', 'MATCHES', 'PROFILE', 'SETTINGS'];
const CHAT_ONLY_HIDDEN_TABS: readonly AppTab[] = ['MATCHES', 'PROFILE', 'SETTINGS'];

/** The tabs the shell shows. Unknown state fails closed to the chat-only shell. */
export function appTabsFor(state: ModeInput): readonly AppTab[] {
  if (isMatchingOn(state)) return MATCHING_TABS;
  return showsMatchingTab(state) ? CHAT_ONLY_TABS : CHAT_ONLY_HIDDEN_TABS;
}

/** Where the app opens: Discover with matching on, otherwise Chat (never the Matching tab). */
export function defaultTabFor(state: ModeInput): AppTab {
  return isMatchingOn(state) ? 'DISCOVERY' : 'MATCHES';
}

/**
 * Keeps `tab` when the shell still has it, else the default: after matching was turned off, or the
 * Matching tab was hidden (here or on another device) while it was selected.
 */
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
