import { describe, expect, it } from 'vitest';
import {
  GraphQLOperationError,
  hasGraphQLErrors,
  toGraphQLError,
} from '../api/graphql-error';

/**
 * Regression tests for swallowed AppSync failures.
 *
 * Amplify's `client.graphql()` rejects with a PLAIN OBJECT (`{ data, errors }`), not an `Error`. Every
 * caller in this codebase branches on `err instanceof Error ? err.message : <fallback>`, so before
 * normalisation the server's reason was dropped on the floor and the UI showed its fallback string.
 * The user-visible symptom was a recovery request failing with "Could not reach your other device."
 * while the backend had actually said "That device is not registered on your account.".
 */

/** The exact shape Amplify rejects with when an AppSync resolver calls `util.error`. */
const amplifyRejection = (message: string, errorType?: string) => ({
  data: null,
  errors: [{ message, errorType, path: ['requestKeyRecovery'] }],
});

describe('hasGraphQLErrors', () => {
  it('detects a 200 response carrying resolver errors beside partial data', () => {
    // AppSync answers 200 with both when a pipeline function fails mid-way; treating that as success
    // would hand the caller a null payload and no explanation.
    expect(hasGraphQLErrors({ data: { requestKeyRecovery: null }, errors: [{ message: 'nope' }] })).toBe(
      true
    );
  });

  it('does not flag a clean response', () => {
    expect(hasGraphQLErrors({ data: { requestKeyRecovery: {} } })).toBe(false);
    expect(hasGraphQLErrors({ data: {}, errors: [] })).toBe(false);
  });

  it('tolerates values that are not objects', () => {
    expect(hasGraphQLErrors(null)).toBe(false);
    expect(hasGraphQLErrors(undefined)).toBe(false);
    expect(hasGraphQLErrors('boom')).toBe(false);
  });
});

describe('toGraphQLError', () => {
  it('produces a real Error, so callers keying on instanceof stop hitting their fallback', () => {
    const error = toGraphQLError(
      amplifyRejection('That device is not registered on your account.', 'DeviceNotFound'),
      'unused fallback'
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('That device is not registered on your account.');
  });

  it('preserves the AppSync errorType for callers that branch on it', () => {
    const error = toGraphQLError(
      amplifyRejection('This recovery request is no longer active.', 'RecoverySessionExpired'),
      'unused fallback'
    );

    expect(error).toBeInstanceOf(GraphQLOperationError);
    expect((error as GraphQLOperationError).errorType).toBe('RecoverySessionExpired');
  });

  it('keeps every distinct message when a pipeline reports more than one', () => {
    const error = toGraphQLError(
      { errors: [{ message: 'Both device ids are required.' }, { message: 'Unauthorized.' }] },
      'unused fallback'
    );

    expect(error.message).toContain('Both device ids are required.');
    expect(error.message).toContain('Unauthorized.');
  });

  it('collapses duplicates rather than repeating the same sentence', () => {
    const error = toGraphQLError(
      { errors: [{ message: 'Unauthorized.' }, { message: 'Unauthorized.' }] },
      'unused fallback'
    );

    expect(error.message).toBe('Unauthorized.');
  });

  it('passes a genuine Error through untouched', () => {
    // A dropped connection already carries a useful message; replacing it would lose detail.
    const network = new TypeError('Failed to fetch');
    expect(toGraphQLError(network, 'fallback')).toBe(network);
  });

  it('falls back only when there is genuinely nothing to report', () => {
    expect(toGraphQLError({}, 'The recovery service could not be reached.').message).toBe(
      'The recovery service could not be reached.'
    );
    expect(toGraphQLError(undefined, 'fallback').message).toBe('fallback');
  });

  it('ignores error entries that carry no message', () => {
    expect(toGraphQLError({ errors: [{ errorType: 'Mystery' }] }, 'fallback').message).toBe(
      'fallback'
    );
  });
});
