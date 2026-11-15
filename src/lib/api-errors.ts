/**
 * Reading HTTP errors uniformly, whatever produced them.
 *
 * Every OneHook HTTP API answers errors with one body (common.smithy `ErrorBody`):
 * `{error: <human message>, code: <MACHINE_CODE>}`, optionally with `traceId` and `retryable`, and
 * extra members on some errors (`gaps` on 409 MATCHING_PROFILE_INCOMPLETE). Clients branch on `code`
 * only; `error` is display/log text.
 *
 * Errors reach the UI in two shapes: the shared {@link ApiError} (hand-written REST helper in
 * api/rest.ts) and the Smithy SDK's service exceptions. The SDK copies every body field (`error`,
 * `code`, `gaps`, ...) onto the exception and sets `$metadata.httpStatusCode`, but leaves `message` as
 * "UnknownError" because the body has no `message`. So the text is read from `error`
 * ({@link errorMessage}), never from `message` alone.
 *
 * Mr. OneHook (a separate backend) still answers `{error: <CODE>}`; its errors are read in
 * lib/mr-onehook-contract.ts, not here.
 */
import { ApiError } from './api-client';

type ErrorLike = {
  status?: unknown;
  code?: unknown;
  error?: unknown;
  message?: unknown;
  details?: unknown;
  gaps?: unknown;
  $metadata?: { httpStatusCode?: number };
};

/** The SDK's placeholder `message` when the body carries no `message` (all OneHook errors). */
const SDK_PLACEHOLDER_MESSAGE = 'UnknownError';

/** The HTTP status of a failed call, or undefined (network error, non-HTTP error). */
export function errorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const e = err as ErrorLike;
  if (typeof e.status === 'number' && e.status > 0) return e.status;
  const meta = e.$metadata?.httpStatusCode;
  return typeof meta === 'number' ? meta : undefined;
}

/** An error body's machine-readable `code`, or undefined. */
export function bodyCode(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const code = (body as { code?: unknown }).code;
  return typeof code === 'string' && code ? code : undefined;
}

/** The service's machine-readable `code` (e.g. CONNECTION_LIMIT), or undefined. */
export function errorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const fromError = bodyCode(err);
  if (fromError) return fromError;
  if (err instanceof ApiError) return bodyCode(err.details);
  return undefined;
}

/**
 * The human-readable text of a failed call: the body's `error` (SDK exceptions carry it there), else
 * the error's own `message` (ApiError, network failures) unless it is the SDK's "UnknownError"
 * placeholder, else `fallback`.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback;
  const e = err as ErrorLike;
  if (typeof e.error === 'string' && e.error.trim()) return e.error;
  if (typeof e.message === 'string' && e.message.trim() && e.message !== SDK_PLACEHOLDER_MESSAGE) {
    return e.message;
  }
  return fallback;
}

/** `gaps` from a 409 MATCHING_PROFILE_INCOMPLETE (State) — what the matching profile still lacks. */
export function errorGaps(err: unknown): string[] {
  if (!err || typeof err !== 'object') return [];
  const e = err as ErrorLike;
  const direct = e.gaps;
  if (Array.isArray(direct)) return direct.filter((g): g is string => typeof g === 'string');
  const details = e.details as { gaps?: unknown } | undefined;
  if (details && Array.isArray(details.gaps)) {
    return details.gaps.filter((g): g is string => typeof g === 'string');
  }
  return [];
}

export function isNotFound(err: unknown): boolean {
  return errorStatus(err) === 404;
}
