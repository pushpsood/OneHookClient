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
  SecurityPolicyProtocol,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { Certificate, ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import {
  HostedZone,
  IHostedZone,
  ARecord,
  AaaaRecord,
  RecordTarget,
} from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { APP_LINK_SUBDOMAIN, APP_STORE_LINKS } from './constants.ts';
import { Construct } from 'constructs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory of the current file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface FrontendStackProps extends StackProps {
  /** Deployment stage. Drives retention/versioning/price-class. */
  stage: 'prod';
  /** Public site domain, e.g. onehook.club. */
  domainName: string;
  /** In-account Route53 zone that owns {@link domainName}. */
  hostedZoneName: string;
  /** Stable ID of the existing zone to import. */
  hostedZoneId: string;
  /** Also serve/alias www.<domainName> (prod apex only). */
  includeWww: boolean;
  /** ARN of the pre-provisioned us-east-1 certificate from the dedicated CertificateStack. */
  certificateArn: string;
}

export class FrontendStack extends Stack {
  public readonly distribution: Distribution;
  public readonly bucket: Bucket;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const stage = props.stage;
    const isProd = stage === 'prod';

    // The pre-existing `onehook.club` hosted zone, imported by exact source-controlled ID, in the
    // FRONTEND account.
    const hostedZone: IHostedZone = HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
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

    // TLS certificate for CloudFront (must be us-east-1), imported by ARN from the dedicated
    // us-east-1 CertificateStack (ownership preserved).
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

    // Route53 A + AAAA aliases in the frontend-account zone.
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

    // ── app.<domain> — platform-aware install smart link ──────────────────────────────────────────
    //
    // Serves NO content. A viewer-request CloudFront Function reads the User-Agent and returns a 302
    // to the right store, so the redirect happens at the edge before any origin is consulted (fast,
    // and nothing to keep in S3). Per-device answers are never cached by CloudFront because
    // function-generated responses at viewer-request are not cacheable, so an iPhone can never be
    // served an Android visitor's redirect.
    const appLinkFunction = new CloudFrontFunction(this, 'AppStoreRedirectFunction', {
      comment: 'Redirects app.<domain> to the App Store / Play Store based on User-Agent',
      code: FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var headers = request.headers || {};
  var ua = (headers['user-agent'] && headers['user-agent'].value) || '';

  // iPadOS 13+ reports a desktop Safari UA, so also treat "Macintosh" + touch hints as iOS. The
  // explicit device tokens are checked first because they are unambiguous.
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile\\/|Touch/i.test(ua));
  var isAndroid = /Android/i.test(ua);

  var location = ${JSON.stringify(APP_STORE_LINKS.fallback)};
  if (isIOS) {
    location = ${JSON.stringify(APP_STORE_LINKS.ios)};
  } else if (isAndroid) {
    location = ${JSON.stringify(APP_STORE_LINKS.android)};
  }

  return {
    statusCode: 302,
    statusDescription: 'Found',
    headers: {
      'location': { value: location },
      // Never let a browser or proxy reuse one platform's redirect for another device.
      'cache-control': { value: 'no-cache, no-store, must-revalidate' }
    }
  };
}
`),
    });

    const appLinkDomain = `${APP_LINK_SUBDOMAIN}.${props.domainName}`;

    // The origin is required by CloudFront but never fetched: the function short-circuits every
    // request at the viewer stage. Reusing the site bucket avoids provisioning a dead origin.
    const appLinkDistribution = new Distribution(this, 'AppLinkDistribution', {
      comment: `${appLinkDomain} — platform-aware app install redirect`,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessIdentity(this.bucket, {
          originAccessIdentity: oai,
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          { function: appLinkFunction, eventType: FunctionEventType.VIEWER_REQUEST },
        ],
      },
      domainNames: [appLinkDomain],
      certificate,
      priceClass: isProd ? PriceClass.PRICE_CLASS_ALL : PriceClass.PRICE_CLASS_100,
    });

    const appLinkAliasTarget = RecordTarget.fromAlias(new CloudFrontTarget(appLinkDistribution));

    new ARecord(this, 'AppLinkAliasRecord', {
      zone: hostedZone,
      recordName: appLinkDomain,
      target: appLinkAliasTarget,
    });

    new AaaaRecord(this, 'AppLinkAliasRecordAAAA', {
      zone: hostedZone,
      recordName: appLinkDomain,
      target: appLinkAliasTarget,
    });

    // Outputs
    new CfnOutput(this, 'AppLinkURL', {
      value: `https://${appLinkDomain}`,
      description: 'Platform-aware app install link (redirects to App Store / Play Store)',
    });

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
