#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { FrontendStack } from './frontend-stack.ts';

const app = new App({ crossRegionReferences: true });

const environment = app.node.tryGetContext('env') || 'dev';
const rootDomain = 'onehook.club';
const domainName = app.node.tryGetContext('domain') ?? (environment === 'prod' ? rootDomain : `${environment}.${rootDomain}`);
// certificateArn is no longer needed from context since we'll generate it

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'ap-south-1',
};

// Tags for all resources
Tags.of(app).add('Environment', environment);
Tags.of(app).add('Project', 'OneHook');
Tags.of(app).add('Component', 'Frontend');
Tags.of(app).add('ManagedBy', 'CDK');

import { Stack, StackProps } from 'aws-cdk-lib';
import { HostedZone } from 'aws-cdk-lib/aws-route53';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';
import { Construct } from 'constructs';

class CertificateStack extends Stack {
  public readonly certificateArn: string;
  constructor(scope: Construct, id: string, props: StackProps & { domainName: string }) {
    super(scope, id, props);
    const zone = HostedZone.fromLookup(this, 'HostedZone', { domainName: props.domainName });
    const cert = new Certificate(this, 'Certificate', {
      domainName: props.domainName,
      subjectAlternativeNames: [`*.${props.domainName}`],
      validation: CertificateValidation.fromDns(zone),
    });
    this.certificateArn = cert.certificateArn;
  }
}

let certificateArn: string | undefined;

if (domainName) {
  const certStack = new CertificateStack(app, `OneHook-Certificate-${environment}`, {
    env: { ...env, region: 'us-east-1' }, // CloudFront certs MUST be in us-east-1
    domainName,
  });
  certificateArn = certStack.certificateArn;
}

// Frontend
new FrontendStack(app, `OneHook-Frontend-${environment}`, {
  env,
  stackName: `OneHook-Frontend-${environment}`,
  description: `OneHook frontend (${environment})`,
  domainName,
  certificateArn,
  rootDomain,
});

app.synth();
