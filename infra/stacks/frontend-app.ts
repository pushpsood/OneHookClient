#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { FrontendStack } from './frontend-stack.ts';

const app = new App();

const environment = app.node.tryGetContext('env') || 'dev';
const rootDomain = 'onehook.club';
const domainName = app.node.tryGetContext('domain') ?? (environment === 'prod' ? rootDomain : `${environment}.${rootDomain}`);
const certificateArn = app.node.tryGetContext('certificateArn');

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
};

// Tags for all resources
Tags.of(app).add('Environment', environment);
Tags.of(app).add('Project', 'OneHook');
Tags.of(app).add('Component', 'Frontend');
Tags.of(app).add('ManagedBy', 'CDK');

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
