import { describe, expect, it } from 'vitest';
import {
  ACCOUNTS,
  DOMAINS,
  GAMMA_CERTIFICATE_ARN,
  PRODUCTION_HOSTED_ZONE_ID,
  BACKEND_DNS,
  DNS_DELEGATION,
  resolveBackendDns,
} from '../../infra/stacks/constants';

/**
 * Guards the FINAL ownership model so a future edit can't silently drift it back:
 *   - both frontend stages + all frontend zones live in the frontend account (851725215059);
 *   - the backend account (627367419734) owns only the API zones;
 *   - gamma reuses the frontend-account wildcard cert (us-east-1) and never mints a new one;
 *   - the cross-account DNS-read contract is configurable via CDK context.
 *
 * These are pure constants/helpers with no CDK/AWS imports, so the test stays hermetic and fast.
 */
describe('infra ownership model', () => {
  it('places every frontend resource in the frontend account and API zones in the backend', () => {
    expect(ACCOUNTS.frontend).toBe('851725215059');
    expect(ACCOUNTS.backend).toBe('627367419734');
  });

  it('reuses the pre-existing frontend-account wildcard certificate for gamma', () => {
    expect(GAMMA_CERTIFICATE_ARN).toBe(
      'arn:aws:acm:us-east-1:851725215059:certificate/2e05f27b-fef3-4400-9352-0b62a70c024c'
    );
    // Certificate must be in the frontend account, us-east-1 (CloudFront requirement).
    expect(GAMMA_CERTIFICATE_ARN).toContain(`:acm:us-east-1:${ACCOUNTS.frontend}:`);
  });

  it('models the domains and exact frontend-owned production zone', () => {
    expect(DOMAINS.prod).toBe('onehook.club');
    expect(DOMAINS.gamma).toBe('gamma.onehook.club');
    expect(DOMAINS.apiGamma).toBe('api.gamma.onehook.club');
    expect(PRODUCTION_HOSTED_ZONE_ID).toBe('Z0711151B3O279W1TQZ0');
  });

  it('scopes the backend DNS reader role to the backend account with the deployed role name', () => {
    expect(BACKEND_DNS.readerRoleArn).toBe(
      `arn:aws:iam::${ACCOUNTS.backend}:role/OneHook-ApiDnsReader-gamma-Role`
    );
    // Deterministic frontend execution-role name the backend trust policy can pin to.
    expect(DNS_DELEGATION.readerRoleName).toBe('OneHook-Gamma-ApiDnsReader');
  });

  it('uses the exact API DNS name instead of a generated hosted-zone ID', () => {
    expect(BACKEND_DNS.apiGammaZoneName).toBe(DOMAINS.apiGamma);
    expect(BACKEND_DNS).not.toHaveProperty('apiGammaZoneId');
  });

  it('resolves deterministic defaults when no context override is supplied', () => {
    const node = { tryGetContext: () => undefined };
    const resolved = resolveBackendDns(node);

    expect(resolved.readerRoleArn).toBe(BACKEND_DNS.readerRoleArn);
    expect(resolved.apiGammaZoneName).toBe(DOMAINS.apiGamma);
    expect(resolved.externalId).toBe(BACKEND_DNS.externalId);
  });

  it('lets CDK context intentionally override the backend trust contract', () => {
    const overrides: Record<string, string> = {
      backendDnsReaderRoleArn: 'arn:aws:iam::627367419734:role/Custom-Reader',
      dnsDelegationExternalId: 'custom-external-id',
    };
    const node = { tryGetContext: (k: string) => overrides[k] };
    const resolved = resolveBackendDns(node);

    expect(resolved.readerRoleArn).toBe('arn:aws:iam::627367419734:role/Custom-Reader');
    expect(resolved.apiGammaZoneName).toBe(DOMAINS.apiGamma);
    expect(resolved.externalId).toBe('custom-external-id');
  });
});
