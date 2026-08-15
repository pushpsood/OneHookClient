import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
  Tags,
} from 'aws-cdk-lib';
import {
  BuildEnvironmentVariableType,
  BuildSpec,
  Cache,
  ComputeType,
  LinuxBuildImage,
  LocalCacheMode,
  PipelineProject,
} from 'aws-cdk-lib/aws-codebuild';
import { CfnConnection } from 'aws-cdk-lib/aws-codeconnections';
import {
  Artifact,
  ExecutionMode,
  Pipeline,
  PipelineType,
} from 'aws-cdk-lib/aws-codepipeline';
import {
  CodeBuildAction,
  CodeStarConnectionsSourceAction,
  ManualApprovalAction,
} from 'aws-cdk-lib/aws-codepipeline-actions';
import {
  Effect,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { ACCOUNTS } from '../stacks/constants.ts';

const PIPELINE_REGION = 'ap-south-1';
const CDK_QUALIFIER = 'hnb659fds';
const GITHUB_OWNER = 'pushpsood';
const GITHUB_REPOSITORY = 'OneHookClient';
const GITHUB_BRANCH = 'main';
const FULL_REPOSITORY_ID = `${GITHUB_OWNER}/${GITHUB_REPOSITORY}`;

const BUILDSPEC = {
  verify: 'infra/pipeline/buildspecs/verify.yml',
  gammaDeploy: 'infra/pipeline/buildspecs/gamma-deploy.yml',
  smoke: 'infra/pipeline/buildspecs/smoke.yml',
  productionBuild: 'infra/pipeline/buildspecs/production-build.yml',
  productionDeploy: 'infra/pipeline/buildspecs/production-deploy.yml',
} as const;

type BootstrapRoleKind = 'deploy' | 'file-publishing';

function bootstrapRoleArn(region: string, kind: BootstrapRoleKind): string {
  return `arn:aws:iam::${ACCOUNTS.frontend}:role/cdk-${CDK_QUALIFIER}-${kind}-role-${ACCOUNTS.frontend}-${region}`;
}

function bootstrapRoleArns(
  regions: readonly string[],
  kinds: readonly BootstrapRoleKind[]
): string[] {
  return regions.flatMap((region) => kinds.map((kind) => bootstrapRoleArn(region, kind)));
}

export class FrontendPipelineStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    if (Stack.of(this).account !== ACCOUNTS.frontend) {
      throw new Error(
        `Frontend pipeline must be synthesized for account ${ACCOUNTS.frontend}, received ${Stack.of(this).account}.`
      );
    }
    if (Stack.of(this).region !== PIPELINE_REGION) {
      throw new Error(
        `Frontend pipeline must be synthesized in ${PIPELINE_REGION}, received ${Stack.of(this).region}.`
      );
    }

    const connection = new CfnConnection(this, 'GitHubConnection', {
      connectionName: 'OneHookClient-GitHub',
      providerType: 'GitHub',
      tags: [
        { key: 'Project', value: 'OneHook' },
        { key: 'Component', value: 'Frontend' },
        { key: 'ManagedBy', value: 'CDK' },
      ],
    });

    const artifactBucket = new Bucket(this, 'ArtifactBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      versioned: true,
      lifecycleRules: [
        {
          expiration: Duration.days(30),
          noncurrentVersionExpiration: Duration.days(7),
        },
      ],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const pipeline = new Pipeline(this, 'Pipeline', {
      pipelineName: 'OneHook-Frontend',
      pipelineType: PipelineType.V2,
      executionMode: ExecutionMode.QUEUED,
      artifactBucket,
      restartExecutionOnUpdate: false,
    });

    const sourceArtifact = new Artifact('Source');
    const sourceRole = new Role(this, 'SourceActionRole', {
      assumedBy: new ServicePrincipal('codepipeline.amazonaws.com'),
      description: 'Fetches only pushpsood/OneHookClient main through the CDK-managed connection',
    });

    // The CDK source action currently adds a resource-scoped legacy-prefix Allow. Explicit Deny
    // guardrails below make that grant unusable for another repository, branch, missing provider
    // action, or write-capable provider request. The additional new-prefix Allow supports
    // CodeConnections resources created after the service rename.
    const connectionActions = [
      'codeconnections:UseConnection',
      'codestar-connections:UseConnection',
    ];
    sourceRole.addToPolicy(
      new PolicyStatement({
        actions: connectionActions,
        resources: [connection.attrConnectionArn],
        conditions: {
          StringEquals: {
            'codeconnections:FullRepositoryId': FULL_REPOSITORY_ID,
            'codeconnections:BranchName': GITHUB_BRANCH,
            'codeconnections:ProviderPermissionsRequired': 'read_only',
          },
          Null: {
            'codeconnections:ProviderAction': 'false',
          },
        },
      })
    );
    for (const [conditionKey, expectedValue] of Object.entries({
      'codeconnections:FullRepositoryId': FULL_REPOSITORY_ID,
      'codeconnections:BranchName': GITHUB_BRANCH,
      'codeconnections:ProviderPermissionsRequired': 'read_only',
    })) {
      sourceRole.addToPolicy(
        new PolicyStatement({
          effect: Effect.DENY,
          actions: connectionActions,
          resources: [connection.attrConnectionArn],
          conditions: { StringNotEquals: { [conditionKey]: expectedValue } },
        })
      );
    }
    sourceRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.DENY,
        actions: connectionActions,
        resources: [connection.attrConnectionArn],
        conditions: { Null: { 'codeconnections:ProviderAction': 'true' } },
      })
    );

    const sourceAction = new CodeStarConnectionsSourceAction({
      actionName: 'GitHubMain',
      owner: GITHUB_OWNER,
      repo: GITHUB_REPOSITORY,
      branch: GITHUB_BRANCH,
      connectionArn: connection.attrConnectionArn,
      output: sourceArtifact,
      triggerOnPush: true,
      codeBuildCloneOutput: false,
      role: sourceRole,
      variablesNamespace: 'SourceVariables',
    });
    pipeline.addStage({ stageName: 'Source', actions: [sourceAction] });

    const createProject = (
      id: string,
      buildSpecPath: string,
      role: Role,
      timeout = Duration.minutes(30)
    ): PipelineProject => {
      const logGroup = new LogGroup(this, `${id}Logs`, {
        logGroupName: `/aws/codebuild/OneHook-Frontend-${id}`,
        retention: RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      return new PipelineProject(this, id, {
        projectName: `OneHook-Frontend-${id}`,
        role,
        buildSpec: BuildSpec.fromSourceFilename(buildSpecPath),
        environment: {
          buildImage: LinuxBuildImage.STANDARD_7_0,
          computeType: ComputeType.SMALL,
          privileged: false,
        },
        cache: Cache.local(LocalCacheMode.CUSTOM),
        timeout,
        queuedTimeout: Duration.hours(1),
        grantReportGroupPermissions: false,
        logging: { cloudWatch: { logGroup } },
      });
    };

    const codeBuildRole = (id: string, description: string): Role =>
      new Role(this, `${id}Role`, {
        assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
        description,
      });

    const grantBootstrapAssume = (role: Role, roleArns: string[]): void => {
      role.addToPolicy(
        new PolicyStatement({
          actions: ['sts:AssumeRole'],
          resources: roleArns,
        })
      );
    };

    const verifyRole = codeBuildRole('Verify', 'Runs frontend type checks and tests; cannot deploy');
    const verifyProject = createProject('Verify', BUILDSPEC.verify, verifyRole);
    pipeline.addStage({
      stageName: 'Verify',
      actions: [
        new CodeBuildAction({
          actionName: 'LintAndTest',
          project: verifyProject,
          input: sourceArtifact,
          environmentVariables: {
            SOURCE_COMMIT: {
              type: BuildEnvironmentVariableType.PLAINTEXT,
              value: sourceAction.variables.commitId,
            },
          },
        }),
      ],
    });

    const gammaDeployRole = codeBuildRole(
      'GammaDeploy',
      'Builds Gamma and assumes only ap-south-1 frontend CDK bootstrap roles'
    );
    grantBootstrapAssume(
      gammaDeployRole,
      bootstrapRoleArns([PIPELINE_REGION], ['deploy', 'file-publishing'])
    );
    const gammaDeployProject = createProject(
      'GammaDeploy',
      BUILDSPEC.gammaDeploy,
      gammaDeployRole,
      Duration.minutes(45)
    );
    pipeline.addStage({
      stageName: 'DeployGamma',
      actions: [
        new CodeBuildAction({
          actionName: 'BuildAndDeployGamma',
          project: gammaDeployProject,
          input: sourceArtifact,
          environmentVariables: {
            CDK_DEFAULT_ACCOUNT: { value: ACCOUNTS.frontend },
            CDK_DEFAULT_REGION: { value: PIPELINE_REGION },
            VITE_APP_ENV: { value: 'production' },
            VITE_BACKEND_STAGE: { value: 'gamma' },
            SOURCE_COMMIT: { value: sourceAction.variables.commitId },
          },
        }),
      ],
    });

    const gammaSmokeRole = codeBuildRole(
      'GammaSmoke',
      'Performs the public Gamma HTTP smoke test; has no deployment permissions'
    );
    const gammaSmokeProject = createProject('GammaSmoke', BUILDSPEC.smoke, gammaSmokeRole);
    pipeline.addStage({
      stageName: 'SmokeGamma',
      actions: [
        new CodeBuildAction({
          actionName: 'SmokeTestGamma',
          project: gammaSmokeProject,
          input: sourceArtifact,
          environmentVariables: {
            SITE_URL: { value: 'https://gamma.onehook.club' },
          },
        }),
      ],
    });

    const productionBuildRole = codeBuildRole(
      'ProductionBuild',
      'Builds and synthesizes the immutable production assembly without AWS deployment access'
    );
    const productionBuildProject = createProject(
      'ProductionBuild',
      BUILDSPEC.productionBuild,
      productionBuildRole,
      Duration.minutes(45)
    );
    const productionAssembly = new Artifact('ProductionAssembly');
    pipeline.addStage({
      stageName: 'BuildProduction',
      actions: [
        new CodeBuildAction({
          actionName: 'BuildTestAndSynth',
          project: productionBuildProject,
          input: sourceArtifact,
          outputs: [productionAssembly],
          environmentVariables: {
            CDK_DEFAULT_ACCOUNT: { value: ACCOUNTS.frontend },
            CDK_DEFAULT_REGION: { value: PIPELINE_REGION },
            VITE_APP_ENV: { value: 'production' },
            VITE_BACKEND_STAGE: { value: 'gamma' },
            SOURCE_COMMIT: { value: sourceAction.variables.commitId },
          },
        }),
      ],
    });

    const approvalTopic = new Topic(this, 'ApprovalTopic', {
      displayName: 'OneHook frontend production approvals',
    });
    pipeline.addStage({
      stageName: 'ApproveProduction',
      actions: [
        new ManualApprovalAction({
          actionName: 'ApproveTestedArtifact',
          additionalInformation:
            'Approve deployment of the tested, Gamma-backed immutable frontend assembly. ' +
            `Source commit: ${sourceAction.variables.commitId}`,
          notificationTopic: approvalTopic,
        }),
      ],
    });

    const productionDeployRole = codeBuildRole(
      'ProductionDeploy',
      'Deploys only the approved cloud assembly through exact frontend CDK bootstrap roles'
    );
    grantBootstrapAssume(
      productionDeployRole,
      bootstrapRoleArns(
        [PIPELINE_REGION, 'us-east-1'],
        ['deploy', 'file-publishing']
      )
    );
    const productionDeployProject = createProject(
      'ProductionDeploy',
      BUILDSPEC.productionDeploy,
      productionDeployRole,
      Duration.minutes(45)
    );
    pipeline.addStage({
      stageName: 'DeployProduction',
      actions: [
        new CodeBuildAction({
          actionName: 'DeployApprovedAssembly',
          project: productionDeployProject,
          input: productionAssembly,
          environmentVariables: {
            CDK_DEFAULT_ACCOUNT: { value: ACCOUNTS.frontend },
            CDK_DEFAULT_REGION: { value: PIPELINE_REGION },
          },
        }),
      ],
    });

    const productionSmokeRole = codeBuildRole(
      'ProductionSmoke',
      'Performs the public production HTTP smoke test; has no deployment permissions'
    );
    const productionSmokeProject = createProject(
      'ProductionSmoke',
      BUILDSPEC.smoke,
      productionSmokeRole
    );
    pipeline.addStage({
      stageName: 'SmokeProduction',
      actions: [
        new CodeBuildAction({
          actionName: 'SmokeTestProduction',
          project: productionSmokeProject,
          input: sourceArtifact,
          environmentVariables: {
            SITE_URL: { value: 'https://onehook.club' },
          },
        }),
      ],
    });

    const approvalPolicy = new ManagedPolicy(this, 'ProductionApprovalPolicy', {
      managedPolicyName: 'OneHook-Frontend-Pipeline-ProductionApproval',
      description:
        'Attach to the designated release approver; permits only the frontend production approval action',
      statements: [
        new PolicyStatement({
          actions: ['codepipeline:PutApprovalResult'],
          resources: [
            `${pipeline.pipelineArn}/ApproveProduction/ApproveTestedArtifact`,
          ],
        }),
      ],
    });

    new CfnOutput(this, 'PipelineName', { value: pipeline.pipelineName });
    new CfnOutput(this, 'GitHubConnectionArn', {
      value: connection.attrConnectionArn,
      description: 'Authorize this PENDING connection once in the AWS Developer Tools console',
    });
    new CfnOutput(this, 'ApprovalTopicArn', { value: approvalTopic.topicArn });
    new CfnOutput(this, 'ProductionApprovalPolicyArn', {
      value: approvalPolicy.managedPolicyArn,
      description: 'Attach only to the designated AWS production approver identity',
    });

    Tags.of(this).add('Project', 'OneHook');
    Tags.of(this).add('Component', 'FrontendPipeline');
    Tags.of(this).add('ManagedBy', 'CDK');
  }
}
