import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
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
import { Certificate } from 'aws-cdk-lib/aws-certificatemanager';
import { HostedZone, ARecord, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface FrontendStackProps extends StackProps {
  domainName?: string;
  certificateArn?: string;
  rootDomain?: string;
}

export class FrontendStack extends Stack {
  public readonly distribution: Distribution;
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props?: FrontendStackProps) {
    super(scope, id, props);

    const env = this.node.tryGetContext('env') || 'dev';

    // S3 bucket for static website
    this.bucket = new Bucket(this, 'WebsiteBucket', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: false,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: env === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: env !== 'prod',
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: env === 'prod',
      lifecycleRules:
        env === 'prod'
          ? [
              {
                noncurrentVersionExpiration: Duration.days(30),
              },
            ]
          : [],
    });

    // CloudFront Origin Access Identity
    const oai = new OriginAccessIdentity(this, 'OAI', {
      comment: `OAI for OneHook ${env}`,
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
        env === 'prod'
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
      ...(props?.domainName && props?.certificateArn
        ? {
            domainNames: [props.domainName],
            certificate: Certificate.fromCertificateArn(
              this,
              'Certificate',
              props.certificateArn
            ),
          }
        : {}),
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

    // Route53 alias (if domain provided)
    if (props?.domainName) {
      const hostedZone = HostedZone.fromLookup(this, 'HostedZone', {
        domainName: props.rootDomain ?? props.domainName.split('.').slice(-2).join('.'),
      });

      new ARecord(this, 'AliasRecord', {
        zone: hostedZone,
        recordName: props.domainName,
        target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
      });
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
