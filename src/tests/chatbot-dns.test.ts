import { describe, expect, it } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ChatbotDnsStack } from '../../infra/stacks/chatbot-dns-stack';
import { CHATBOT_DOMAINS, PRODUCTION_HOSTED_ZONE_ID } from '../../infra/stacks/constants';
import { BACKEND_DEPLOYMENTS } from '../config/deployment.config';

/**
 * Guards the Mr OneHook chatbot custom domains:
 *   - hostnames follow the platform stage convention (stage segment before the apex, none in prod),
 *     exactly like api.gamma.onehook.club / api.onehook.club;
 *   - each stage gets a CNAME to its Azure App Service plus the asuid TXT ownership proof, in the
 *     frontend-owned apex zone;
 *   - the web client points at the custom domain, never a raw *.azurewebsites.net host.
 */
describe('chatbot custom-domain DNS', () => {
  const synth = () => {
    const app = new App();
    const stack = new ChatbotDnsStack(app, 'TestChatbotDns', {
      env: { account: '851725215059', region: 'ap-south-1' },
      hostedZoneName: 'onehook.club',
      hostedZoneId: PRODUCTION_HOSTED_ZONE_ID,
    });
    return Template.fromStack(stack);
  };

  it('follows the api.<stage>.onehook.club naming convention', () => {
    expect(CHATBOT_DOMAINS.stages.gamma.hostname).toBe('chatbot.gamma.onehook.club');
    expect(CHATBOT_DOMAINS.stages.prod.hostname).toBe('chatbot.onehook.club');
  });

  it('creates exactly a CNAME + asuid TXT per stage in the apex zone', () => {
    const template = synth();
    template.resourceCountIs('AWS::Route53::RecordSet', 4);
    for (const { hostname, azureHost } of Object.values(CHATBOT_DOMAINS.stages)) {
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Name: `${hostname}.`,
        Type: 'CNAME',
        HostedZoneId: PRODUCTION_HOSTED_ZONE_ID,
        ResourceRecords: [azureHost],
      });
      template.hasResourceProperties('AWS::Route53::RecordSet', {
        Name: `asuid.${hostname}.`,
        Type: 'TXT',
        HostedZoneId: PRODUCTION_HOSTED_ZONE_ID,
        ResourceRecords: [`"${CHATBOT_DOMAINS.customDomainVerificationId}"`],
      });
    }
  });

  it('points the web client at the custom domain, not the Azure default host', () => {
    expect(BACKEND_DEPLOYMENTS.gamma.chatbotUrl).toBe(`https://${CHATBOT_DOMAINS.stages.gamma.hostname}`);
    expect(BACKEND_DEPLOYMENTS.gamma.chatbotUrl).not.toContain('azurewebsites.net');
  });
});
