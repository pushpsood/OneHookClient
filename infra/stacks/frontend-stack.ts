import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput, Fn } from 'aws-cdk-lib';
import { Bucket, BucketEncryption, BlockPublicAccess, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { 
  Distribution, 
  DistributionProps, 
  OriginAccessIdentity, 
  CachePolicy, 
  CacheHeaderBehavior, 
  CacheQueryStringBehavior, 
  CacheCookieBehavior, 
  ResponseHeadersPolicy, 
  HeadersFrameOption, 
  HeadersReferrerPolicy, 
  ViewerProtocolPolicy, 
  PriceClass, 
  SecurityPolicyProtocol 
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Certificate, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  HostedZone,
  IHostedZone,
  ARecord,
  AaaaRecord,
  NsRecord,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Role, ServicePrincipal, ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime, Code, Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import {
  Provider,
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import { CustomResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { DNS_DELEGATION } from './constants.ts';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Cross-account delegation of `api.<gamma domain>` to the backend-owned API zone. The frontend only
 * READS the backend nameservers (never writes into the backend account) and then owns the NS
 * record locally. Set for gamma only.
 */
export interface ApiDelegationConfig {
  /** Parent zone that holds the coarse `gamma.onehook.club` delegation (e.g. onehook.club). */
  parentZoneName: string;
  /** Stable ID of the existing frontend-owned parent zone; avoids deployment-time AWS lookups. */
  parentZoneId: string;
  /** Fully-qualified API subdomain to delegate, e.g. api.gamma.onehook.club. */
  apiSubdomain: string;
  /** Read-only backend role for zone-name discovery plus scoped route53:GetHostedZone. */
  backendReaderRoleArn: string;
  /** Deterministic DNS name used to discover the API hosted zone read-only in the backend account. */
  backendApiZoneName: string;
  /** ExternalId enforced by the backend reader role's trust policy. */
  externalId: string;
}

export interface FrontendStackProps extends StackProps {
  /** Deployment stage. Drives retention/versioning/price-class and cert strategy. */
  stage: 'gamma' | 'prod';
  /** Public site domain, e.g. gamma.onehook.club or onehook.club. */
  domainName: string;
  /** In-account Route53 zone that owns {@link domainName}. */
  hostedZoneName: string;
  /** Stable ID required when importing an existing zone; omitted when createHostedZone is true. */
  hostedZoneId?: string;
  /** Also serve/alias www.<domainName> (prod apex only). */
  includeWww: boolean;
  /**
   * Create the hosted zone in this stack (gamma: a brand-new CDK-managed `gamma.onehook.club`
   * zone in the frontend account) instead of importing an existing one by ID (prod: the pre-existing
   * `onehook.club` zone).
   */
  createHostedZone: boolean;
  /**
   * ARN of a pre-provisioned us-east-1 certificate. prod imports its dedicated CertificateStack
   * ARN; gamma reuses the frontend-account wildcard cert. Always set in the final model.
   */
  certificateArn: string;
  /** Gamma-only cross-account API delegation. Omitted for prod. */
  apiDelegation?: ApiDelegationConfig;
}

export class FrontendStack extends Stack {
  public readonly distribution: Distribution;
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const stage = props.stage;
    const isProd = stage === 'prod';

    // Hosted zone that owns the site domain, in the FRONTEND account either way.
    //   - gamma: a brand-new CDK-managed `gamma.onehook.club` zone (createHostedZone=true). It is
    //     CloudFormation-owned and deletable, replacing the previously backend-owned zone.
    //   - prod: the pre-existing `onehook.club` zone, imported by exact source-controlled ID.
    if (!props.createHostedZone && !props.hostedZoneId) {
      throw new Error(`Existing hosted zone ${props.hostedZoneName} requires hostedZoneId.`);
    }
    const hostedZone: IHostedZone = props.createHostedZone
      ? new HostedZone(this, 'HostedZone', { zoneName: props.hostedZoneName })
      : HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
          hostedZoneId: props.hostedZoneId as string,
          zoneName: props.hostedZoneName,
        });

    // S3 bucket for static website
    this.bucket = new Bucket(this, 'WebsiteBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: isProd,
      lifecycleRules:
        isProd
          ? [
              {
                noncurrentVersionExpiration: Duration.days(30),
              },
            ]
          : [],
    });

    // CloudFront Origin Access Identity
    const oai = new OriginAccessIdentity(this, 'OAI', {
      comment: `OAI for OneHook ${stage}`,
    });

    this.bucket.grantRead(oai);

    // Cache policy for static assets
    const cachePolicy = new CachePolicy(this, 'CachePolicy', {
      defaultTtl: Duration.days(1),
      maxTtl: Duration.days(365),
      minTtl: Duration.seconds(0),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
      headerBehavior: CacheHeaderBehavior.none(),
      queryStringBehavior: CacheQueryStringBehavior.none(),
      cookieBehavior: CacheCookieBehavior.none(),
    });

    // Response headers policy for security
    const responseHeadersPolicy = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.seconds(31536000),
          includeSubdomains: true,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
      },
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Cache-Control', value: 'no-cache', override: false },
          {
            header: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=()',
            override: true,
          },
        ],
      },
    });

    // TLS certificate for CloudFront (must be us-east-1), always imported by ARN:
    //   - prod imports its dedicated us-east-1 CertificateStack ARN (ownership preserved).
    //   - gamma reuses the pre-existing frontend-account wildcard `*.onehook.club` cert.
    const certificate: ICertificate = Certificate.fromCertificateArn(
      this,
      'Certificate',
      props.certificateArn
    );

    const domainNames = props.includeWww
      ? [props.domainName, `www.${props.domainName}`]
      : [props.domainName];

    // CloudFront distribution
    const distributionProps: DistributionProps = {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessIdentity(this.bucket, {
          originAccessIdentity: oai,
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy,
        responseHeadersPolicy,
        compress: true,
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: Duration.minutes(5),
        },
      ],
      priceClass:
        isProd
          ? PriceClass.PRICE_CLASS_ALL
          : PriceClass.PRICE_CLASS_100,
      enableLogging: true,
      logBucket: new Bucket(this, 'LogBucket', {
        removalPolicy: RemovalPolicy.DESTROY,
        autoDeleteObjects: true,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        objectOwnership: ObjectOwnership.OBJECT_WRITER,
      }),
      logFilePrefix: 'cloudfront/',
      minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
      domainNames,
      certificate,
    };

    this.distribution = new Distribution(this, 'Distribution', distributionProps);

    // Deploy website content
    new BucketDeployment(this, 'DeployWebsite', {
      sources: [Source.asset(join(__dirname, '../../dist'))],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      prune: true,
      memoryLimit: 512,
    });

    // Route53 A + AAAA aliases in the frontend-account zone for this stage.
    const aliasTarget = RecordTarget.fromAlias(new CloudFrontTarget(this.distribution));

    new ARecord(this, 'AliasRecord', {
      zone: hostedZone,
      recordName: props.domainName,
      target: aliasTarget,
    });

    new AaaaRecord(this, 'AliasRecordAAAA', {
      zone: hostedZone,
      recordName: props.domainName,
      target: aliasTarget,
    });

    if (props.includeWww) {
      new ARecord(this, 'WwwAliasRecord', {
        zone: hostedZone,
        recordName: `www.${props.domainName}`,
        target: aliasTarget,
      });

      new AaaaRecord(this, 'WwwAliasRecordAAAA', {
        zone: hostedZone,
        recordName: `www.${props.domainName}`,
        target: aliasTarget,
      });
    }

    // ------------------------------------------------------------------------------------------
    // Gamma-only: cross-account API delegation + parent NS switch.
    //
    // `api.gamma.onehook.club` stays owned by the BACKEND account. We delegate to it from our new
    // local gamma zone WITHOUT writing into the backend account:
    //   1. A deterministic-role Lambda assumes a backend read-only role (ExternalId) and reads the
    //      backend API zone's delegation nameservers (route53:GetHostedZone).
    //   2. We create the `api.gamma.onehook.club` NS record locally from those nameservers.
    //   3. Only AFTER that, we UPSERT the parent `onehook.club` zone's `gamma.onehook.club` NS
    //      record to point at THIS new gamma zone's nameservers (idempotent; clean DELETE on
    //      teardown). All resources are CloudFormation-owned and deletable.
    // ------------------------------------------------------------------------------------------
    if (props.apiDelegation) {
      const del = props.apiDelegation;

      // (1) Deterministic execution role in the frontend account. Its fixed name lets the backend
      // scope its read-only role's trust policy to exactly this principal + ExternalId.
      const readerRole = new Role(this, 'ApiDnsReaderRole', {
        roleName: DNS_DELEGATION.readerRoleName,
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
        ],
      });
      readerRole.addToPolicy(
        new PolicyStatement({
          actions: ['sts:AssumeRole'],
          resources: [del.backendReaderRoleArn],
        })
      );

      const readerFn = new LambdaFunction(this, 'ApiDnsReaderFn', {
        runtime: Runtime.NODEJS_22_X,
        handler: 'index.handler',
        code: Code.fromAsset(join(__dirname, '../lambda/api-dns-reader')),
        role: readerRole,
        timeout: Duration.minutes(2),
        description: 'Reads api.gamma.onehook.club delegation nameservers from the backend account',
      });

      const readerProvider = new Provider(this, 'ApiDnsReaderProvider', {
        onEventHandler: readerFn,
      });

      const apiNameServers = new CustomResource(this, 'ApiGammaNameServers', {
        serviceToken: readerProvider.serviceToken,
        properties: {
          BackendReaderRoleArn: del.backendReaderRoleArn,
          ExternalId: del.externalId,
          BackendApiZoneName: del.backendApiZoneName,
        },
      });

      // (2) Local NS record delegating api.gamma.onehook.club to the backend API zone.
      const apiDelegationRecord = new NsRecord(this, 'ApiGammaDelegation', {
        zone: hostedZone,
        recordName: del.apiSubdomain,
        values: Fn.split(',', apiNameServers.getAttString('NameServers')),
        ttl: Duration.minutes(5),
      });

      // (3) Switch the parent zone's coarse `gamma.onehook.club` delegation from the old backend
      // nameservers to THIS local gamma zone. Public hosted zones always expose exactly four
      // delegation nameservers, so we reference indices 0..3 (a token list cannot be `.map`ped at
      // synth time).
      const parentZone = HostedZone.fromHostedZoneAttributes(this, 'ParentZone', {
        hostedZoneId: del.parentZoneId,
        zoneName: del.parentZoneName,
      });
      const gammaNameServers = hostedZone.hostedZoneNameServers as string[];
      const resourceRecords = [0, 1, 2, 3].map((i) => ({
        Value: Fn.select(i, gammaNameServers),
      }));
      const parentGammaRecordSet = {
        Name: `${props.domainName}.`,
        Type: 'NS',
        TTL: 300,
        ResourceRecords: resourceRecords,
      };
      const changeBatch = (action: 'UPSERT' | 'DELETE') => ({
        service: 'Route53',
        action: 'changeResourceRecordSets',
        parameters: {
          HostedZoneId: parentZone.hostedZoneId,
          ChangeBatch: {
            Comment: `${action} ${props.domainName} delegation -> frontend gamma zone`,
            Changes: [{ Action: action, ResourceRecordSet: parentGammaRecordSet }],
          },
        },
        physicalResourceId: PhysicalResourceId.of(`parent-gamma-ns-${parentZone.hostedZoneId}`),
      });

      const parentNsSwitch = new AwsCustomResource(this, 'ParentGammaNsSwitch', {
        resourceType: 'Custom::ParentGammaNsSwitch',
        onCreate: changeBatch('UPSERT'),
        onUpdate: changeBatch('UPSERT'),
        onDelete: changeBatch('DELETE'),
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            actions: ['route53:ChangeResourceRecordSets'],
            resources: [parentZone.hostedZoneArn],
          }),
        ]),
        installLatestAwsSdk: false,
      });

      // Ordering: the nested api.gamma.onehook.club delegation must exist BEFORE we point the world
      // at this gamma zone via the parent switch, so api resolution never breaks mid-migration.
      parentNsSwitch.node.addDependency(apiDelegationRecord);
    }

    // Outputs
    new CfnOutput(this, 'WebsiteURL', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
    });

    new CfnOutput(this, 'BucketName', {
      value: this.bucket.bucketName,
      description: 'S3 Bucket Name',
    });

    new CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
      description: 'CloudFront Distribution ID',
    });

    if (props?.domainName) {
      new CfnOutput(this, 'CustomDomainURL', {
        value: `https://${props.domainName}`,
        description: 'Custom Domain URL',
      });
    }
  }
}
