/**
 * Normalises AppSync/Amplify GraphQL failures into real `Error` instances.
 *
 * Amplify's `client.graphql()` does not reject with an `Error`: it rejects with a PLAIN OBJECT shaped
 * `{ data, errors: [{ message, errorType }] }`. Callers that write the usual
 * `err instanceof Error ? err.message : 'something generic'` therefore silently discard the server's
 * explanation and show their fallback string instead — which is how a precise
 * "That device is not registered on your account." became an unhelpful
 * "Could not reach your other device.".
 *
 * AppSync can also answer HTTP 200 with BOTH a partial `data` and an `errors` array (a resolver that
 * called `util.error` inside a pipeline). That is a failure too, so it must not be returned as success.
 */

/** A GraphQL failure carrying the server's own message, and its `errorType` when one was supplied. */
export class GraphQLOperationError extends Error {
  /** AppSync error type, e.g. `DeviceNotFound`, `BadRequest`, `RecoverySessionExpired`. */
  readonly errorType?: string;

  constructor(message: string, errorType?: string) {
    super(message);
    this.name = 'GraphQLOperationError';
    this.errorType = errorType;
  }
}

interface GraphQLErrorEntry {
  message?: string;
  errorType?: string;
}

/** Reads an `errors` array off anything Amplify hands back, whether resolved or rejected. */
function errorEntries(value: unknown): GraphQLErrorEntry[] {
  if (typeof value !== 'object' || value === null) return [];
  const errors = (value as { errors?: unknown }).errors;
  return Array.isArray(errors) ? (errors as GraphQLErrorEntry[]) : [];
}

/** True when the value carries at least one GraphQL error. */
export function hasGraphQLErrors(value: unknown): boolean {
  return errorEntries(value).length > 0;
}

/**
 * Converts anything thrown or returned by `client.graphql()` into an `Error` worth showing.
 *
 * Every distinct server message is preserved: a pipeline that failed authorization and then reported a
 * second problem should not have either half hidden. A real `Error` (network down, aborted request) is
 * passed through untouched.
 */
export function toGraphQLError(value: unknown, fallback: string): Error {
  const entries = errorEntries(value);
  const messages = [...new Set(entries.map((entry) => entry.message).filter(Boolean))] as string[];

  if (messages.length > 0) {
    return new GraphQLOperationError(messages.join(' '), entries.find((e) => e.errorType)?.errorType);
  }
  // A genuine Error (TypeError: Failed to fetch, AbortError, …) already says something useful.
  if (value instanceof Error) return value;

  return new GraphQLOperationError(fallback);
}
