import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { HostedZone, CnameRecord, TxtRecord } from 'aws-cdk-lib/aws-route53';
import { Construct } from 'constructs';
import { CHATBOT_DOMAINS } from './constants.ts';

export interface ChatbotDnsStackProps extends StackProps {
  /** Apex zone that owns every user-facing hostname (onehook.club). */
  hostedZoneName: string;
  /** Stable ID of the apex zone, imported without a lookup. */
  hostedZoneId: string;
}

/**
 * Route53 records for the Mr OneHook chatbot custom domains (gamma + prod), which are served by
 * Azure App Service.
 *
 * Kept in its own stack, separate from `OneHook-Frontend-prod`, so DNS for the chatbot can be
 * deployed without re-publishing the website bucket, and the blast radius of a change here is
 * limited to these four records.
 */
export class ChatbotDnsStack extends Stack {
  constructor(scope: Construct, id: string, props: ChatbotDnsStackProps) {
    super(scope, id, props);

    const zone = HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.hostedZoneName,
    });

    for (const [stage, cfg] of Object.entries(CHATBOT_DOMAINS.stages)) {
      const id = stage.charAt(0).toUpperCase() + stage.slice(1);

      new CnameRecord(this, `${id}ChatbotCname`, {
        zone,
        recordName: cfg.hostname,
        domainName: cfg.azureHost,
        ttl: Duration.minutes(5),
        comment: `Mr OneHook chatbot (${stage}) -> Azure App Service`,
      });

      // Azure domain-ownership proof; required before App Service binds the hostname.
      new TxtRecord(this, `${id}ChatbotAsuid`, {
        zone,
        recordName: `asuid.${cfg.hostname}`,
        values: [CHATBOT_DOMAINS.customDomainVerificationId],
        ttl: Duration.minutes(5),
        comment: `Azure App Service domain verification for ${cfg.hostname}`,
      });

      new CfnOutput(this, `${id}ChatbotUrl`, {
        value: `https://${cfg.hostname}`,
        description: `Mr OneHook chatbot base URL (${stage})`,
      });
    }
  }
}
