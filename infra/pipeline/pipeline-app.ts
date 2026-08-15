#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { ACCOUNTS } from '../stacks/constants.ts';
import { FrontendPipelineStack } from './frontend-pipeline-stack.ts';

const app = new App();

const actualAccount = process.env.CDK_DEFAULT_ACCOUNT;
if (actualAccount && actualAccount !== ACCOUNTS.frontend) {
  throw new Error(
    `Frontend pipeline must deploy into account ${ACCOUNTS.frontend}, but the active credentials ` +
      `are for account ${actualAccount}.`
  );
}

const stack = new FrontendPipelineStack(app, 'OneHook-Frontend-Pipeline', {
  env: { account: ACCOUNTS.frontend, region: 'ap-south-1' },
  stackName: 'OneHook-Frontend-Pipeline',
  description: 'AWS-native delivery pipeline for the OneHook frontend',
  terminationProtection: true,
});

Tags.of(stack).add('Environment', 'shared');
app.synth();
