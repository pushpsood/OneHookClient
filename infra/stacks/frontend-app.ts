#!/usr/bin/env node
import { App, Stack, StackProps, Tags } from 'aws-cdk-lib';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';
import { FrontendStack } from './frontend-stack.ts';
import { ACCOUNTS, DOMAINS, PRODUCTION_HOSTED_ZONE_ID } from './constants.ts';

/**
 * OWNERSHIP MODEL — the production frontend stack and the `onehook.club` hosted zone both live in
 * the FRONTEND account (851725215059); the backend account owns only the API zones. See
 * constants.ts.
 *
 *   prod -> account 851725215059, existing zone onehook.club, site onehook.club (+ www)
 *
 * The frontend (S3 + CloudFront) lives in ap-south-1. The CloudFront certificate lives in us-east-1
 * in a dedicated stack `OneHook-Certificate-prod`, preserving the existing CloudFormation
 * logical/resource ownership (no resource churn on redeploy).
 *
 * The browser talks to the Gamma backend (`api.gamma.onehook.club`) for now; that selection is made
 * at build time via `VITE_BACKEND_STAGE` and lives in `src/config/deployment.config.ts`. There is
 * no separate `gamma.onehook.club` frontend website.
 */
type Stage = 'prod';

interface StageConfig {
  account: string;
  region: string;
  domainName: string;
  hostedZoneName: string;
  /** Stable ID for the existing hosted zone. */
  hostedZoneId: string;
  includeWww: boolean;
}

const app = new App();

const STAGES: Record<Stage, StageConfig> = {
  prod: {
    account: ACCOUNTS.frontend,
    region: 'ap-south-1',
    domainName: DOMAINS.prod,
    hostedZoneName: DOMAINS.prod,
    hostedZoneId: PRODUCTION_HOSTED_ZONE_ID,
    includeWww: true,
  },
};

/**
 * Dedicated us-east-1 certificate stack for prod. Preserves the pre-existing
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

const stageName = (app.node.tryGetContext('env') ?? 'prod') as string;
if (stageName !== 'prod') {
  throw new Error(`Unknown stage "${stageName}". Use --context env=prod.`);
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

const certStack = new CertificateStack(app, `OneHook-Certificate-${stageName}`, {
  env: { account: stage.account, region: 'us-east-1' }, // CloudFront certs MUST be in us-east-1
  crossRegionReferences: true,
  domainName: stage.domainName,
  hostedZoneId: stage.hostedZoneId,
});

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
  certificateArn: certStack.certificateArn,
});

app.synth();
