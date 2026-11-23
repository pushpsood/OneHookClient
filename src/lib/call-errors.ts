import { GraphQLOperationError } from '../api/graphql-error';
import type { CallEndReason } from '../api/calls';
import { errorCode } from './api-errors';

/**
 * True for a chat or call write refused because the hook is suspended (Chat's verify-not-suspended
 * step answers AppSync errorType CONVERSATION_SUSPENDED for sends, reactions, typing and call signalling).
 */
export function isConversationSuspended(err: unknown): boolean {
  return (
    (err instanceof GraphQLOperationError && err.errorType === 'CONVERSATION_SUSPENDED') ||
    errorCode(err) === 'CONVERSATION_SUSPENDED'
  );
}

/** Why a conversation is read-only: archived (docs/archives.md) or paused (downgrade selection). */
export type SuspensionReason = 'ARCHIVED' | 'PAUSED';

/**
 * The reason of a CONVERSATION_SUSPENDED refusal (Chat's `errorInfo.reason`), or undefined when the
 * error is not one. A refusal without a reason (older backend, call path) reads as PAUSED.
 */
export function conversationSuspensionReason(err: unknown): SuspensionReason | undefined {
  if (!isConversationSuspended(err)) return undefined;
  const info =
    err instanceof GraphQLOperationError
      ? err.errorInfo
      : ((err as { errorInfo?: unknown }).errorInfo as Record<string, unknown> | undefined);
  const reason = (info && typeof info === 'object' ? (info as { reason?: unknown }).reason : undefined) ??
    (err as { reason?: unknown }).reason;
  return reason === 'ARCHIVED' ? 'ARCHIVED' : 'PAUSED';
}

/**
 * Maps a call failure to friendly, user-facing copy, keyed off the AppSync `errorType` the backend
 * sets (see OneHookBackend/.../CallService.java + schema.graphql §8). The raw server message is a
 * reasonable fallback, but these strings are the product voice for the cases the UI must handle.
 */
const ERROR_COPY: Record<string, string> = {
  CallNotAllowed: 'Calling unlocks once you have both sent a message.',
  Throttled: 'Too many call attempts just now. Send a message, or try again in a little while.',
  Conflict: 'You are already in a call.',
  CallingUnavailable: 'Calling is unavailable right now. Please try again later.',
  Unauthorized: 'You can only call your active match.',
  NotFound: 'That call is no longer available.',
  BadRequest: 'That call could not be started.',
  // The hook is suspended while a member chooses which hooks to keep (chat-only profiles §8.5).
  CONVERSATION_SUSPENDED: 'This chat is paused, so calls are paused too.',
};

/** Shown on the call buttons of a suspended chat, and when a call is refused as suspended. */
export const SUSPENDED_CALL_COPY = ERROR_COPY.CONVERSATION_SUSPENDED;

/** Shown on the call buttons of an archived chat, and when a call is refused because it is archived. */
export const ARCHIVED_CALL_COPY = 'This conversation is archived, so calls are off.';

/** The friendly message for a failed call operation. */
export function friendlyCallError(error: unknown): string {
  const suspension = conversationSuspensionReason(error);
  if (suspension) return suspension === 'ARCHIVED' ? ARCHIVED_CALL_COPY : SUSPENDED_CALL_COPY;
  if (error instanceof GraphQLOperationError && error.errorType && ERROR_COPY[error.errorType]) {
    return ERROR_COPY[error.errorType];
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong with the call. Please try again.';
}

/** Friendly copy for how a call ended, for a toast or a timeline note. Returns null for a normal hangup. */
export function friendlyEndReason(reason: CallEndReason | null | undefined): string | null {
  switch (reason) {
    case 'BUSY':
      return 'They are on another call right now.';
    case 'MISSED':
      return 'No answer.';
    case 'DECLINED':
      return 'Call declined.';
    case 'CANCELLED':
      return 'Call cancelled.';
    case 'UNMATCHED':
      return 'The call ended because the connection is no longer active.';
    case 'FAILED':
      return 'The call could not connect.';
    case 'DROPPED':
      return 'The call dropped.';
    case 'MAX_DURATION':
      return 'The call reached its time limit.';
    case 'ANSWERED_ELSEWHERE':
      return 'Answered on another device.';
    case 'HANGUP':
    default:
      return null;
  }
}
