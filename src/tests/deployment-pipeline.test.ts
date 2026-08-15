import { existsSync, readFileSync } from 'node:fs';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { FrontendPipelineStack } from '../../infra/pipeline/frontend-pipeline-stack';

const root = new URL('../../', import.meta.url);
const productionBuild = readFileSync(
  new URL('infra/pipeline/buildspecs/production-build.yml', root),
  'utf8'
);
const productionDeploy = readFileSync(
  new URL('infra/pipeline/buildspecs/production-deploy.yml', root),
  'utf8'
);
const sourceConfig = readFileSync(new URL('src/config/deployment.config.ts', root), 'utf8');

function synthPipeline(): Record<string, unknown> {
  const app = new App();
  const stack = new FrontendPipelineStack(app, 'TestPipeline', {
    env: { account: '851725215059', region: 'ap-south-1' },
  });
  return Template.fromStack(stack).toJSON() as Record<string, unknown>;
}

function resourcesOf(
  template: Record<string, unknown>,
  resourceType: string
): Array<[string, Record<string, unknown>]> {
  const resources = template.Resources as Record<string, Record<string, unknown>>;
  return Object.entries(resources).filter(([, resource]) => resource.Type === resourceType);
}

describe('AWS-native frontend deployment pipeline', () => {
  it('uses a queued V2 pipeline with Gamma-first deployment and AWS production approval', () => {
    const template = synthPipeline();
    const [, pipeline] = resourcesOf(template, 'AWS::CodePipeline::Pipeline')[0];
    const properties = pipeline.Properties as Record<string, unknown>;
    const stages = properties.Stages as Array<Record<string, unknown>>;

    expect(properties.PipelineType).toBe('V2');
    expect(properties.ExecutionMode).toBe('QUEUED');
    expect(stages.map((stage) => stage.Name)).toEqual([
      'Source',
      'Verify',
      'DeployGamma',
      'SmokeGamma',
      'BuildProduction',
      'ApproveProduction',
      'DeployProduction',
      'SmokeProduction',
    ]);

    const approvalAction = (stages[5].Actions as Array<Record<string, unknown>>)[0];
    const actionType = approvalAction.ActionTypeId as Record<string, unknown>;
    expect(actionType.Category).toBe('Approval');
    expect(actionType.Provider).toBe('Manual');
  });

  it('fetches only pushpsood/OneHookClient main through the CDK-managed connection', () => {
    const template = synthPipeline();
    const [, connection] = resourcesOf(template, 'AWS::CodeConnections::Connection')[0];
    expect(connection.Properties).toMatchObject({
      ConnectionName: 'OneHookClient-GitHub',
      ProviderType: 'GitHub',
    });

    const [, pipeline] = resourcesOf(template, 'AWS::CodePipeline::Pipeline')[0];
    const stages = (pipeline.Properties as { Stages: Array<Record<string, unknown>> }).Stages;
    const sourceAction = (stages[0].Actions as Array<Record<string, unknown>>)[0];
    expect(sourceAction.Configuration).toMatchObject({
      FullRepositoryId: 'pushpsood/OneHookClient',
      BranchName: 'main',
      DetectChanges: true,
    });

    const policies = resourcesOf(template, 'AWS::IAM::Policy');
    const sourcePolicy = policies.find(([id]) => id.includes('SourceActionRoleDefaultPolicy'))?.[1];
    expect(JSON.stringify(sourcePolicy)).toContain('codeconnections:FullRepositoryId');
    expect(JSON.stringify(sourcePolicy)).toContain('codeconnections:BranchName');
    expect(JSON.stringify(sourcePolicy)).toContain('codeconnections:ProviderAction');
    expect(JSON.stringify(sourcePolicy)).toContain('read_only');

    const sourceRole = resourcesOf(template, 'AWS::IAM::Role').find(([id]) =>
      id.includes('SourceActionRole')
    )?.[1];
    const sourceTrust = JSON.stringify(
      (sourceRole?.Properties as Record<string, unknown>)?.AssumeRolePolicyDocument
    );
    expect(sourceTrust).toContain('PipelineRole');
    expect(sourceTrust).not.toContain('codepipeline.amazonaws.com');
  });

  it('limits build and deployment projects to their exact CDK bootstrap roles', () => {
    const template = synthPipeline();
    const policies = resourcesOf(template, 'AWS::IAM::Policy');
    const policyJson = (name: string): string => {
      const policy = policies.find(([id]) => id.includes(`${name}RoleDefaultPolicy`))?.[1];
      expect(policy).toBeTruthy();
      return JSON.stringify(policy);
    };

    const gamma = policyJson('GammaDeploy');
    expect(gamma).toContain('deploy-role-851725215059-ap-south-1');
    expect(gamma).toContain('file-publishing-role-851725215059-ap-south-1');
    expect(gamma).not.toContain('lookup-role');
    expect(gamma).not.toContain('us-east-1');

    const productionBuildPolicy = policyJson('ProductionBuild');
    expect(productionBuildPolicy).not.toContain('sts:AssumeRole');
    expect(productionBuildPolicy).not.toContain('cdk-hnb659fds');
    expect(productionBuildPolicy).not.toContain('627367419734');

    const productionDeployPolicy = policyJson('ProductionDeploy');
    for (const region of ['ap-south-1', 'us-east-1']) {
      expect(productionDeployPolicy).toContain(`deploy-role-851725215059-${region}`);
      expect(productionDeployPolicy).toContain(`file-publishing-role-851725215059-${region}`);
    }
    expect(productionDeployPolicy).not.toContain('lookup-role');
    expect(productionDeployPolicy).not.toContain('image-publishing');
    expect(productionDeployPolicy).not.toContain('627367419734');
    expect(productionDeployPolicy).not.toContain('cdk-*');
  });

  it('builds and synthesizes before approval, then deploys the exact assembly without rebuilding', () => {
    expect(sourceConfig).toContain("apiBaseUrl: 'https://api.gamma.onehook.club'");
    expect(sourceConfig).toContain(
      "graphqlUrl: 'https://graphql.api.gamma.onehook.club/graphql'"
    );
    expect(productionBuild).toContain('npm run lint');
    expect(productionBuild).toContain('npm test');
    expect(productionBuild).toContain('npm run build:prod');
    expect(productionBuild).toContain('https://api.gamma.onehook.club');
    expect(productionBuild).toContain('https://graphql.api.gamma.onehook.club/graphql');
    expect(productionBuild).toContain('npx cdk synth');
    expect(productionBuild).toContain("'cdk.out.prod/**/*'");

    expect(productionDeploy).toContain('--app cdk.out.prod');
    expect(productionDeploy).toContain('OneHook-Certificate-prod');
    expect(productionDeploy).toContain('OneHook-Frontend-prod');
    expect(productionDeploy).not.toContain('npm run build');
    expect(productionDeploy).not.toContain('npm test');
    expect(productionDeploy).not.toContain('cdk synth');
  });

  it('has no GitHub Actions deployment workflow', () => {
    expect(existsSync(new URL('.github/workflows/deploy-frontend.yml', root))).toBe(false);
    expect(existsSync(new URL('.github/workflows/ci.yml', root))).toBe(true);
  });
});
