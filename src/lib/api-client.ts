/**
 * Shared client-side error type.
 *
 * All REST calls now go exclusively through the Smithy-generated SDK (`onehook-api-client`), which
 * is the single source of truth for the API contract — there is no hand-rolled request layer or
 * hardcoded endpoint path anymore. This class remains only as a lightweight, app-level error
 * abstraction that UI error handling can pattern-match on.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
