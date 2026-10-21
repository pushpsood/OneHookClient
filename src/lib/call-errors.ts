import { GraphQLOperationError } from '../api/graphql-error';
import type { CallEndReason } from '../api/calls';

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
};

/** The friendly message for a failed call operation. */
export function friendlyCallError(error: unknown): string {
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
