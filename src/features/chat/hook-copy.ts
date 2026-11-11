/**
 * Copy for hooks, hook requests and the downgrade chooser (docs/chat-only-profiles.md §6.2, §7.2-7.6).
 * The web app has no i18n framework; strings live with the feature, as in moderation/report/strings.ts.
 * Pure functions, so the wording rules are unit-tested.
 */
import type { HookOrigin } from '../../types';
import { errorCode, errorStatus } from '../../lib/api-errors';

export const HOOK_COPY = {
  lockedRequest: 'Unhook to see this request',
  lockedRequestDetail:
    'You have as many hooks as your plan allows. Someone sent you a request; it opens when a slot frees up.',
  pendingOutgoing: 'Pending',
  suspendedTitle: 'This chat is paused',
  suspendedBody:
    'You can still read this chat. Messages and calls are paused while one of you chooses which hooks to keep after a plan change.',
  suspendedComposer: 'This chat is paused',
  noRequests: 'No requests right now.',
  noSentRequests: 'You have not sent any requests.',
} as const;

/** How the hook formed, for the chat list and the chooser. */
export function originLabel(origin: HookOrigin | string | undefined): string {
  return origin === 'REQUEST' ? 'Connected by username' : 'Matched in discovery';
}

/** "12 Mar 2026" style, in the reader's locale. Epoch seconds in. */
export function formatDay(epochSeconds: number | undefined, locale?: string): string {
  if (!epochSeconds) return '';
  return new Date(epochSeconds * 1000).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** The downgrade chooser's explanation, with the auto-keep deadline when State gives one. */
export function selectionExplainer(keepLimit: number, total: number, deadline?: number, locale?: string): string {
  const keep = keepLimit === 1 ? 'one hook' : `${keepLimit} hooks`;
  const lead = `Your plan now allows ${keep}, and you have ${total}. Choose which to keep; the others end and their chats are erased.`;
  const auto = keepLimit === 1 ? 'your most recently active chat' : `your ${keepLimit} most recently active chats`;
  return deadline
    ? `${lead} If you don't choose by ${formatDay(deadline, locale)}, we'll keep ${auto}.`
    : `${lead} If you don't choose, we'll keep ${auto} after 7 days.`;
}

/**
 * Copy for a failed `POST /state/hook-requests`. Only the caller's OWN state may produce an error;
 * anything about the recipient is indistinguishable from success (R4), so nothing here mentions them.
 */
export function sendRequestErrorCopy(err: unknown): string {
  switch (errorCode(err)) {
    case 'CONNECTION_LIMIT':
      return 'You have as many hooks as your plan allows. Unhook someone to send a request.';
    case 'SELECTION_REQUIRED':
      return 'Choose which hooks to keep first.';
    case 'NOT_READY':
      return 'Finish setting up your profile first.';
    default:
      return errorStatus(err) === 400
        ? 'Check the username and try again.'
        : "We couldn't send that request. Please try again.";
  }
}

/** Copy for a failed accept: 409 CONNECTION_LIMIT, 404 REQUEST_UNAVAILABLE. */
export function acceptRequestErrorCopy(err: unknown): string {
  if (errorCode(err) === 'CONNECTION_LIMIT') {
    return 'You have as many hooks as your plan allows. Unhook someone to accept this request.';
  }
  if (errorStatus(err) === 404) return 'This request is no longer available.';
  return "We couldn't accept that request. Please try again.";
}
