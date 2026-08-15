// @ts-nocheck
/**
 * Custom-resource handler (invoked through the CDK `Provider` framework) that READS the delegation
 * nameservers of the backend-owned `api.gamma.onehook.club` hosted zone WITHOUT ever writing into
 * the backend account.
 *
 * It assumes a backend read-only role (scoped by ExternalId), finds the exact zone with
 * route53:ListHostedZonesByName, and calls route53:GetHostedZone for its delegation nameservers.
 * It returns those nameservers as a comma-joined string in `Data.NameServers`; the frontend stack
 * turns that into the local `api.gamma.onehook.club` NS record.
 *
 * The AWS SDK v3 clients used here are provided by the Lambda Node.js 22 runtime — no bundling.
 */
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import {
  Route53Client,
  GetHostedZoneCommand,
  ListHostedZonesByNameCommand,
} from '@aws-sdk/client-route-53';

export const handler = async (event) => {
  const requestType = event.RequestType;

  // Read-only resource: nothing to undo on delete/update-remove. The NS record itself is an
  // ordinary CloudFormation-owned resource that CFN deletes on its own.
  if (requestType === 'Delete') {
    return { PhysicalResourceId: event.PhysicalResourceId };
  }

  const props = event.ResourceProperties ?? {};
  const backendReaderRoleArn = props.BackendReaderRoleArn;
  const externalId = props.ExternalId;
  const backendApiZoneName = props.BackendApiZoneName;

  if (!backendReaderRoleArn || !externalId || !backendApiZoneName) {
    throw new Error(
      'Missing required properties: BackendReaderRoleArn, ExternalId, BackendApiZoneName.'
    );
  }

  // 1. Assume the backend read-only role (ExternalId enforced by the backend trust policy).
  const sts = new STSClient({});
  const assumed = await sts.send(
    new AssumeRoleCommand({
      RoleArn: backendReaderRoleArn,
      RoleSessionName: 'onehook-gamma-api-dns-read',
      ExternalId: externalId,
      DurationSeconds: 900,
    })
  );

  const creds = assumed.Credentials;
  if (!creds) {
    throw new Error(`AssumeRole returned no credentials for ${backendReaderRoleArn}.`);
  }

  // Construct a Route53 client with the short-lived, read-only backend credentials.
  const route53 = new Route53Client({
    credentials: {
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretAccessKey,
      sessionToken: creds.SessionToken,
    },
  });

  // 2. Discover the generated hosted-zone id from its deterministic DNS name. Route53 returns
  // sorted names; still require an exact match so a similarly-prefixed zone can never be selected.
  const normalizedName = `${backendApiZoneName.replace(/\.$/, '')}.`;
  const listed = await route53.send(
    new ListHostedZonesByNameCommand({ DNSName: normalizedName, MaxItems: 1 })
  );
  const matchedZone = listed.HostedZones?.find((hostedZone) => hostedZone.Name === normalizedName);
  if (!matchedZone?.Id) {
    throw new Error(`Backend API zone ${normalizedName} was not found.`);
  }
  const backendApiZoneId = matchedZone.Id.replace(/^\/hostedzone\//, '');

  // 3. Read the matched API zone's delegation nameservers (read-only).
  const zone = await route53.send(new GetHostedZoneCommand({ Id: backendApiZoneId }));
  const nameServers = zone.DelegationSet?.NameServers ?? [];

  if (nameServers.length === 0) {
    throw new Error(`Backend API zone ${normalizedName} returned no delegation nameservers.`);
  }

  // Comma-join so the CDK side can Fn.split() into the NS record's values.
  return {
    PhysicalResourceId: `api-gamma-ns-${backendApiZoneId}`,
    Data: { NameServers: nameServers.join(',') },
  };
};
