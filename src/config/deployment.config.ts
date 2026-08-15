/**
 * Public deployment configuration bundled into the browser application.
 *
 * Nothing in this file is a secret: Vite emits these values into static JavaScript. Cognito pool,
 * app-client and identity-pool IDs are public routing identifiers; authorization remains enforced
 * by Cognito, JWT validation and IAM policies.
 *
 * Both gamma.onehook.club and onehook.club intentionally use `gamma` until the backend production
 * rollout is complete. Add a `prod` entry and change the production workflow selector only after
 * that backend has been deployed and validated.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface BackendDeploymentConfig {
  readonly apiBaseUrl: string;
  readonly graphqlUrl: string;
  readonly chatbotUrl: string;
  readonly cognitoRegion: string;
  readonly cognitoUserPoolId: string;
  readonly cognitoClientId: string;
  readonly cognitoIdentityPoolId: string;
  readonly cognitoDomain: string;
  readonly enableAnalytics: boolean;
  readonly enableDebug: boolean;
  readonly requestTimeoutMs: number;
  readonly logLevel: LogLevel;
}

export const BACKEND_DEPLOYMENTS = {
  gamma: {
    apiBaseUrl: 'https://api.gamma.onehook.club',
    graphqlUrl: 'https://graphql.api.gamma.onehook.club/graphql',
    chatbotUrl: 'https://onehook-chatbot-api.azurewebsites.net',
    cognitoRegion: 'ap-south-1',
    cognitoUserPoolId: 'ap-south-1_pN10ldNoo',
    cognitoClientId: '2rt0v69jq2acjaboom84cinign',
    cognitoIdentityPoolId: 'ap-south-1:8bfabd43-a446-4b8d-9201-b250cf3b62ef',
    // No Cognito Hosted UI domain is provisioned yet; direct password/OTP/WebAuthn auth still works.
    cognitoDomain: '',
    enableAnalytics: false,
    enableDebug: false,
    requestTimeoutMs: 30_000,
    logLevel: 'error',
  },
} as const satisfies Record<string, BackendDeploymentConfig>;

export type BackendStage = keyof typeof BACKEND_DEPLOYMENTS;
export const DEFAULT_BACKEND_STAGE: BackendStage = 'gamma';

export function getBackendDeploymentConfig(stage?: string): BackendDeploymentConfig {
  const requested = (stage?.trim() || DEFAULT_BACKEND_STAGE) as BackendStage;
  const config = BACKEND_DEPLOYMENTS[requested];
  if (!config) {
    throw new Error(
      `Unknown frontend backend stage "${stage}". Available stages: ${Object.keys(
        BACKEND_DEPLOYMENTS
      ).join(', ')}.`
    );
  }
  return config;
}
