#!/usr/bin/env node
import { App, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { FrontendStack, ApiDelegationConfig } from './frontend-stack.ts';
import {
  ACCOUNTS,
  DOMAINS,
  GAMMA_CERTIFICATE_ARN,
  PRODUCTION_HOSTED_ZONE_ID,
  resolveBackendDns,
} from './constants.ts';

/**
 * FINAL OWNERSHIP MODEL — every frontend stack and every frontend hosted zone lives in the
 * FRONTEND account (851725215059); the backend account owns only the API zones. See constants.ts.
 *
 *   gamma -> account 851725215059, NEW CDK-managed zone gamma.onehook.club, site gamma.onehook.club
 *   prod  -> account 851725215059, existing zone onehook.club,             site onehook.club (+ www)
 *
 * The frontend (S3 + CloudFront) lives in ap-south-1 for both. CloudFront certificates live in
 * us-east-1:
 *   - prod keeps its dedicated us-east-1 stack `OneHook-Certificate-prod` so the existing
 *     CloudFormation logical/resource ownership is preserved (no resource churn on redeploy).
 *   - gamma reuses the pre-existing frontend-account wildcard `*.onehook.club` certificate (no new
 *     cert, no separate stack).
 *
 * gamma additionally delegates api.gamma.onehook.club to the backend-owned API zone WITHOUT writing
 * into the backend account (read-only cross-account nameserver read + local NS records).
 */
type Stage = 'gamma' | 'prod';

interface StageConfig {
  account: string;
  region: string;
  domainName: string;
  hostedZoneName: string;
  /** Stable ID for an existing hosted zone; omitted only when this app creates the zone. */
  hostedZoneId?: string;
  includeWww: boolean;
  /** prod owns a dedicated us-east-1 CertificateStack; gamma reuses the wildcard cert ARN. */
  separateCertStack: boolean;
  /** Pre-provisioned us-east-1 cert ARN. Set for gamma; prod derives it from its cert stack. */
  certificateArn?: string;
  /** gamma creates a brand-new zone; prod looks up its existing zone. */
  createHostedZone: boolean;
  /** gamma-only cross-account API delegation. */
  apiDelegation?: ApiDelegationConfig;
}

const app = new App();

const backendDns = resolveBackendDns(app.node);

const STAGES: Record<Stage, StageConfig> = {
  gamma: {
    account: ACCOUNTS.frontend,
    region: 'ap-south-1',
    domainName: DOMAINS.gamma,
    hostedZoneName: DOMAINS.gamma,
    includeWww: false,
    separateCertStack: false,
    certificateArn: GAMMA_CERTIFICATE_ARN,
    createHostedZone: true,
    apiDelegation: {
      parentZoneName: DOMAINS.prod,
      parentZoneId: PRODUCTION_HOSTED_ZONE_ID,
      apiSubdomain: DOMAINS.apiGamma,
      backendReaderRoleArn: backendDns.readerRoleArn,
      backendApiZoneName: backendDns.apiGammaZoneName,
      externalId: backendDns.externalId,
    },
  },
  prod: {
    account: ACCOUNTS.frontend,
    region: 'ap-south-1',
    domainName: DOMAINS.prod,
    hostedZoneName: DOMAINS.prod,
    hostedZoneId: PRODUCTION_HOSTED_ZONE_ID,
    includeWww: true,
    separateCertStack: true,
    createHostedZone: false,
  },
};

/**
 * Dedicated us-east-1 certificate stack. Used only by prod to preserve the pre-existing
 * `OneHook-Certificate-prod` logical/resource ownership — do not change the `HostedZone`/
 * `Certificate` construct ids or the stack name, or prod would replace live resources.
 */
class CertificateStack extends Stack {
  public readonly certificateArn: string;
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { domainName: string; hostedZoneId: string }
  ) {
    super(scope, id, props);
    const zone = HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.domainName,
    });
    const cert = new Certificate(this, 'Certificate', {
      domainName: props.domainName,
      subjectAlternativeNames: [`*.${props.domainName}`],
      validation: CertificateValidation.fromDns(zone),
    });
    this.certificateArn = cert.certificateArn;
  }
}

const stageName = (app.node.tryGetContext('env') ?? 'gamma') as string;
if (stageName !== 'gamma' && stageName !== 'prod') {
  throw new Error(
    `Unknown stage "${stageName}". Use --context env=gamma or --context env=prod.`
  );
}
const stage = STAGES[stageName as Stage];

// Enforce the expected account per stage. Hardcoding env.account makes CDK refuse a cross-account
// deploy outright; this check surfaces a clear error before synth when credentials are mismatched.
const actualAccount = process.env.CDK_DEFAULT_ACCOUNT;
if (actualAccount && actualAccount !== stage.account) {
  throw new Error(
    `Stage "${stageName}" must deploy into account ${stage.account}, but the active credentials ` +
      `are for account ${actualAccount}. Refusing to deploy across accounts.`
  );
}

const env = { account: stage.account, region: stage.region };

Tags.of(app).add('Environment', stageName);
Tags.of(app).add('Project', 'OneHook');
Tags.of(app).add('Component', 'Frontend');
Tags.of(app).add('ManagedBy', 'CDK');

let certificateArn: string | undefined = stage.certificateArn;
if (stage.separateCertStack) {
  if (!stage.hostedZoneId) {
    throw new Error(`No hosted-zone ID configured for stage "${stageName}".`);
  }
  const certStack = new CertificateStack(app, `OneHook-Certificate-${stageName}`, {
    env: { account: stage.account, region: 'us-east-1' }, // CloudFront certs MUST be in us-east-1
    crossRegionReferences: true,
    domainName: stage.domainName,
    hostedZoneId: stage.hostedZoneId,
  });
  certificateArn = certStack.certificateArn;
}

if (!certificateArn) {
  throw new Error(`No certificate ARN resolved for stage "${stageName}".`);
}

new FrontendStack(app, `OneHook-Frontend-${stageName}`, {
  env,
  stackName: `OneHook-Frontend-${stageName}`,
  description: `OneHook frontend (${stageName})`,
  crossRegionReferences: true,
  stage: stageName as Stage,
  domainName: stage.domainName,
  hostedZoneName: stage.hostedZoneName,
  hostedZoneId: stage.hostedZoneId,
  includeWww: stage.includeWww,
  createHostedZone: stage.createHostedZone,
  certificateArn,
  apiDelegation: stage.apiDelegation,
});

app.synth();
