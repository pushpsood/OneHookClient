/**
 * Single source of truth for the OneHook frontend ownership model.
 *
 * FINAL OWNERSHIP MODEL
 * ---------------------
 *   - The FRONTEND account (851725215059) owns BOTH stages' S3/CloudFront stacks AND every
 *     frontend hosted zone: the parent `onehook.club` zone AND a CDK-managed `gamma.onehook.club`
 *     zone (created by this repo, not looked up).
 *   - The BACKEND account (627367419734) owns ONLY the API zones `api.gamma.onehook.club` and
 *     `api.onehook.club`. The frontend never writes into the backend account; it only READS the
 *     backend API zone's delegation nameservers via a cross-account read-only role.
 *
 * Gamma delegation flow (all frontend-owned, all CloudFormation-owned & deletable):
 *   1. Create the `gamma.onehook.club` zone locally in 851 and its A/AAAA aliases.
 *   2. Read `api.gamma.onehook.club` nameservers from the backend zone (assume a backend
 *      read-only role with an ExternalId; discover by name, then call route53:GetHostedZone).
 *   3. Create the `api.gamma.onehook.club` NS delegation record in the local gamma zone.
 *   4. Switch the parent `onehook.club` zone's `gamma.onehook.club` NS record from the (old)
 *      backend nameservers to the new local gamma zone nameservers — idempotent UPSERT, clean
 *      DELETE on teardown. Ordered strictly AFTER step 3.
 */

/** AWS accounts by role. */
export const ACCOUNTS = {
  /** Owns both frontend stacks and all frontend hosted zones. */
  frontend: '851725215059',
  /** Owns only the API zones (api.gamma.onehook.club, api.onehook.club). */
  backend: '627367419734',
} as const;

/** Public site domains. */
export const DOMAINS = {
  prod: 'onehook.club',
  gamma: 'gamma.onehook.club',
  apiGamma: 'api.gamma.onehook.club',
} as const;

/**
 * Stable public identifier for the existing frontend-owned `onehook.club` hosted zone. Route53
 * hosted-zone IDs are public routing identifiers, not credentials. Importing this exact zone by ID
 * makes every frontend synth deterministic and removes all CDK lookup-role access from CodeBuild.
 */
export const PRODUCTION_HOSTED_ZONE_ID = 'Z0711151B3O279W1TQZ0';

/**
 * Pre-existing wildcard ACM certificate in the FRONTEND account (us-east-1) covering
 * `*.onehook.club` — reused as-is for the gamma CloudFront distribution so gamma provisions no new
 * certificate. Production keeps its own dedicated `OneHook-Certificate-prod` stack (ownership
 * preserved), so this constant is used by gamma only.
 */
export const GAMMA_CERTIFICATE_ARN =
  'arn:aws:acm:us-east-1:851725215059:certificate/2e05f27b-fef3-4400-9352-0b62a70c024c';

/**
 * Cross-account contract for READING the backend-owned `api.gamma.onehook.club` delegation.
 *
 * The role ARN and ExternalId may be overridden via CDK context if the trust contract is
 * intentionally re-pointed. The API zone itself is identified by its deterministic DNS name, so
 * deployment never depends on a generated hosted-zone ID or a manually supplied context value.
 *
 * The frontend Lambda's execution role name is deterministic (see DNS_DELEGATION) so the backend
 * can scope the reader role's trust policy to that exact principal + ExternalId.
 */
export const BACKEND_DNS = {
  /** Matches apiDnsReaderRoleName('gamma') in the backend repository. */
  readerRoleArn: `arn:aws:iam::${ACCOUNTS.backend}:role/OneHook-ApiDnsReader-gamma-Role`,
  /** Deterministic API hosted-zone name discovered read-only by the custom-resource Lambda. */
  apiGammaZoneName: DOMAINS.apiGamma,
  /** Shared ExternalId for the cross-account assume-role. */
  externalId: 'onehook-gamma-api-dns-delegation',
} as const;

/** Frontend-side delegation identifiers that must stay deterministic. */
export const DNS_DELEGATION = {
  /**
   * Fixed execution-role name for the reader Lambda in the frontend account. The backend reader
   * role trusts exactly `arn:aws:iam::851725215059:role/<this>` + ExternalId.
   */
  readerRoleName: 'OneHook-Gamma-ApiDnsReader',
} as const;

/**
 * Resolve the backend DNS contract, letting CDK context override the deterministic defaults.
 * `node` is the construct/app node exposing `tryGetContext`.
 */
export function resolveBackendDns(node: {
  tryGetContext(key: string): unknown;
}): { readerRoleArn: string; apiGammaZoneName: string; externalId: string } {
  return {
    readerRoleArn:
      (node.tryGetContext('backendDnsReaderRoleArn') as string) ?? BACKEND_DNS.readerRoleArn,
    apiGammaZoneName: BACKEND_DNS.apiGammaZoneName,
    externalId:
      (node.tryGetContext('dnsDelegationExternalId') as string) ?? BACKEND_DNS.externalId,
  };
}
