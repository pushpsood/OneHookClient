/**
 * Centralized runtime configuration.
 *
 * Deployed builds use the checked-in public values in `config/deployment.config.ts`. Optional
 * VITE_* overrides exist only for a developer's ignored local `.env`; CI does not need GitHub build
 * variables. Every value exposed here is bundled into browser JavaScript and must never be secret.
 */

import {
  DEFAULT_BACKEND_STAGE,
  getBackendDeploymentConfig,
  type BackendStage,
  type LogLevel,
} from '../config/deployment.config';

type Environment = 'development' | 'production';

interface RuntimeEnv extends ImportMetaEnv {
  readonly VITE_APP_ENV?: string;
  readonly VITE_BACKEND_STAGE?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GRAPHQL_URL?: string;
  readonly VITE_COGNITO_REGION?: string;
  readonly VITE_COGNITO_USER_POOL_ID?: string;
  readonly VITE_COGNITO_CLIENT_ID?: string;
  readonly VITE_COGNITO_IDENTITY_POOL_ID?: string;
  readonly VITE_COGNITO_ENDPOINT?: string;
  readonly VITE_COGNITO_DOMAIN?: string;
  readonly VITE_COGNITO_REDIRECT_SIGN_IN?: string;
  readonly VITE_COGNITO_REDIRECT_SIGN_OUT?: string;
  readonly VITE_ENABLE_ANALYTICS?: string;
  readonly VITE_ENABLE_DEBUG?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
  readonly VITE_LOG_LEVEL?: string;
  readonly VITE_CHATBOT_URL?: string;
}

interface EnvConfig {
  backendStage: BackendStage;
  env: Environment;
  apiBaseUrl: string;
  chatbotUrl: string;
  graphqlUrl: string;
  cognitoRegion: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoIdentityPoolId: string;
  cognitoEndpoint: string;
  cognitoDomain: string;
  cognitoRedirectSignIn: string;
  cognitoRedirectSignOut: string;
  enableAnalytics: boolean;
  enableDebug: boolean;
  requestTimeoutMs: number;
  logLevel: LogLevel;
  isDevelopment: boolean;
  isProduction: boolean;
}

function normalizeEnv(input?: string): Environment | null {
  if (!input) return null;
  const normalized = input.toLowerCase().trim();
  if (normalized === 'production' || normalized === 'prod') return 'production';
  if (normalized === 'development' || normalized === 'dev') return 'development';
  return null;
}

function readRuntimeEnv(): RuntimeEnv {
  return (import.meta.env ?? {}) as RuntimeEnv;
}

function parseBoolean(key: string, value: string | undefined, fallback: boolean): boolean {
  if (!value?.trim()) return fallback;
  const normalized = value.toLowerCase().trim();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Invalid boolean value for ${key}: ${value}`);
}

function parseLogLevel(key: string, input: string | undefined, fallback: LogLevel): LogLevel {
  if (!input?.trim()) return fallback;
  const normalized = input.toLowerCase().trim();
  if (
    normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error'
  ) {
    return normalized;
  }
  throw new Error(`Invalid log level for ${key}: ${input}`);
}

function normalizeUrl(url: string | undefined, fallback = ''): string {
  return (url?.trim() || fallback).replace(/\/+$/, '');
}

function browserOrigin(): string {
  if (typeof window === 'undefined') return '';
  return window.location.origin ?? '';
}

export function detectEnvironment(): Environment {
  const env = readRuntimeEnv();
  const explicitEnv = normalizeEnv(env.VITE_APP_ENV) ?? normalizeEnv(env.MODE);
  if (explicitEnv) return explicitEnv;

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.includes('localhost') || hostname === '127.0.0.1' || hostname === '::1')
      return 'development';
    if (hostname.includes('dev') || hostname.startsWith('dev.')) return 'development';
    return 'production';
  }

  return 'development';
}

export function createEnvConfig(envName: Environment = detectEnvironment()): EnvConfig {
  const env = readRuntimeEnv();
  const requestedStage = env.VITE_BACKEND_STAGE?.trim() || DEFAULT_BACKEND_STAGE;
  const deployment = getBackendDeploymentConfig(requestedStage);
  const backendStage = requestedStage as BackendStage;
  const cognitoRegion = env.VITE_COGNITO_REGION?.trim() || deployment.cognitoRegion;
  const redirectOrigin = browserOrigin();

  const timeoutOverride = env.VITE_API_TIMEOUT_MS?.trim();
  const requestTimeoutMs = timeoutOverride
    ? Number.parseInt(timeoutOverride, 10)
    : deployment.requestTimeoutMs;
  if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    throw new Error(`Invalid number value for VITE_API_TIMEOUT_MS: ${timeoutOverride}`);
  }

  return {
    backendStage,
    env: envName,
    apiBaseUrl: normalizeUrl(env.VITE_API_BASE_URL, deployment.apiBaseUrl),
    chatbotUrl: normalizeUrl(env.VITE_CHATBOT_URL, deployment.chatbotUrl),
    graphqlUrl: normalizeUrl(env.VITE_GRAPHQL_URL, deployment.graphqlUrl),
    cognitoRegion,
    cognitoUserPoolId:
      env.VITE_COGNITO_USER_POOL_ID?.trim() || deployment.cognitoUserPoolId,
    cognitoClientId: env.VITE_COGNITO_CLIENT_ID?.trim() || deployment.cognitoClientId,
    cognitoIdentityPoolId:
      env.VITE_COGNITO_IDENTITY_POOL_ID?.trim() || deployment.cognitoIdentityPoolId,
    cognitoEndpoint: normalizeUrl(
      env.VITE_COGNITO_ENDPOINT,
      `https://cognito-idp.${cognitoRegion}.amazonaws.com`
    ),
    cognitoDomain: normalizeUrl(env.VITE_COGNITO_DOMAIN, deployment.cognitoDomain),
    cognitoRedirectSignIn: normalizeUrl(env.VITE_COGNITO_REDIRECT_SIGN_IN, redirectOrigin),
    cognitoRedirectSignOut: normalizeUrl(env.VITE_COGNITO_REDIRECT_SIGN_OUT, redirectOrigin),
    enableAnalytics: parseBoolean(
      'VITE_ENABLE_ANALYTICS',
      env.VITE_ENABLE_ANALYTICS,
      deployment.enableAnalytics
    ),
    enableDebug: parseBoolean(
      'VITE_ENABLE_DEBUG',
      env.VITE_ENABLE_DEBUG,
      deployment.enableDebug
    ),
    requestTimeoutMs,
    logLevel: parseLogLevel('VITE_LOG_LEVEL', env.VITE_LOG_LEVEL, deployment.logLevel),
    isDevelopment: envName === 'development',
    isProduction: envName === 'production',
  };
}

export const config: EnvConfig = createEnvConfig();

export const backendStage = config.backendStage;
export const env = config.env;
export const apiBaseUrl = config.apiBaseUrl;
export const chatbotUrl = config.chatbotUrl;
export const graphqlUrl = config.graphqlUrl;
export const cognitoRegion = config.cognitoRegion;
export const cognitoUserPoolId = config.cognitoUserPoolId;
export const cognitoClientId = config.cognitoClientId;
export const cognitoIdentityPoolId = config.cognitoIdentityPoolId;
export const cognitoEndpoint = config.cognitoEndpoint;
export const cognitoDomain = config.cognitoDomain;
export const cognitoRedirectSignIn = config.cognitoRedirectSignIn;
export const cognitoRedirectSignOut = config.cognitoRedirectSignOut;
export const enableAnalytics = config.enableAnalytics;
export const enableDebug = config.enableDebug;
export const requestTimeoutMs = config.requestTimeoutMs;
export const logLevel = config.logLevel;
export const isDevelopment = config.isDevelopment;
export const isProduction = config.isProduction;

export default config;
