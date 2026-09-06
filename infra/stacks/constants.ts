/**
 * Single source of truth for the OneHook frontend ownership model.
 *
 * OWNERSHIP MODEL
 * ---------------
 *   - The FRONTEND account (851725215059) owns the production S3/CloudFront stack AND the
 *     `onehook.club` hosted zone.
 *   - The BACKEND account (627367419734) owns the API zones (`api.gamma.onehook.club`,
 *     `api.onehook.club`). The frontend never writes into the backend account.
 *
 * There is only one deployed site: production `onehook.club`. Local development and the production
 * build both point their browser traffic at the Gamma backend (`api.gamma.onehook.club`) until the
 * production backend is promoted; that selection lives in `src/config/deployment.config.ts`, not
 * here. The former `gamma.onehook.club` frontend website and its cross-account DNS delegation have
 * been removed.
 */

/** AWS accounts by role. */
export const ACCOUNTS = {
  /** Owns the production frontend stack and the onehook.club hosted zone. */
  frontend: '851725215059',
  /** Owns only the API zones (api.gamma.onehook.club, api.onehook.club). */
  backend: '627367419734',
} as const;

/** Public site domain. */
export const DOMAINS = {
  prod: 'onehook.club',
} as const;

/**
 * Stable public identifier for the frontend-owned `onehook.club` hosted zone. Route53 hosted-zone
 * IDs are public routing identifiers, not credentials. Importing this exact zone by ID makes every
 * frontend synth deterministic and removes all CDK lookup-role access from CodeBuild.
 */
export const PRODUCTION_HOSTED_ZONE_ID = 'Z0711151B3O279W1TQZ0';
