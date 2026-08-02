/**
 * Centralized environment configuration for the client.
 *
 * The app prefers explicit Vite env vars but still provides safe defaults for
 * local development and preview environments.
 */

type Environment = 'development' | 'staging' | 'production';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface RuntimeEnv extends ImportMetaEnv {
  readonly VITE_APP_ENV?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_WS_URL?: string;
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
  readonly VITE_USE_MOCK_API?: string;
  readonly VITE_API_TIMEOUT_MS?: string;
  readonly VITE_LOG_LEVEL?: string;
}

interface EnvConfig {
  env: Environment;
  apiBaseUrl: string;
  wsUrl: string;
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
  useMockApi: boolean;
  requestTimeoutMs: number;
  logLevel: LogLevel;
  isDevelopment: boolean;
  isStaging: boolean;
  isProduction: boolean;
}

const defaults: Record<
  Environment,
  Omit<
    EnvConfig,
    'isDevelopment' | 'isStaging' | 'isProduction' | 'useMockApi' | 'requestTimeoutMs'
  >
> = {
  development: {
    env: 'development',
    apiBaseUrl: '',
    wsUrl: 'ws://localhost:4566',
    graphqlUrl: '',
    cognitoRegion: 'us-east-1',
    cognitoUserPoolId: 'us-east-1_local_dev',
    cognitoClientId: 'local_client_id',
    cognitoIdentityPoolId: '',
    cognitoEndpoint: '/api/localstack',
    cognitoDomain: 'localhost:3000', // Placeholder for local development
    cognitoRedirectSignIn: 'http://localhost:3000/app', // Placeholder
    cognitoRedirectSignOut: 'http://localhost:3000', // Placeholder
    enableAnalytics: false,
    enableDebug: true,
    logLevel: 'debug',
  },
  staging: {
    env: 'staging',
    apiBaseUrl: 'https://api-staging.onehook.club/v1',
    wsUrl: 'wss://ws-staging.onehook.club',
    graphqlUrl: 'https://chat.graphql-staging.onehook.club/graphql',
    cognitoRegion: 'us-east-1',
    cognitoUserPoolId: '',
    cognitoClientId: '',
    cognitoIdentityPoolId: '',
    cognitoEndpoint: 'https://cognito-idp.us-east-1.amazonaws.com',
    cognitoDomain: '', // To be filled
    cognitoRedirectSignIn: '', // To be filled
    cognitoRedirectSignOut: '', // To be filled
    enableAnalytics: true,
    enableDebug: true,
    logLevel: 'info',
  },
  production: {
    env: 'production',
    apiBaseUrl: 'https://api.onehook.club/v1',
    wsUrl: 'wss://ws.onehook.club',
    graphqlUrl: 'https://chat.graphql.onehook.club/graphql',
    cognitoRegion: 'us-east-1',
    cognitoUserPoolId: '',
    cognitoClientId: '',
    cognitoIdentityPoolId: '',
    cognitoEndpoint: 'https://cognito-idp.us-east-1.amazonaws.com',
    cognitoDomain: '', // To be filled
    cognitoRedirectSignIn: '', // To be filled
    cognitoRedirectSignOut: '', // To be filled
    enableAnalytics: true,
    enableDebug: false,
    logLevel: 'error',
  },
};

function normalizeEnv(input?: string): Environment | null {
  if (!input) return null;
  const normalized = input.toLowerCase().trim();
  if (normalized === 'production' || normalized === 'prod') return 'production';
  if (normalized === 'staging' || normalized === 'stage') return 'staging';
  if (normalized === 'development' || normalized === 'dev') return 'development';
  return null;
}

function readRuntimeEnv(): RuntimeEnv {
  return (import.meta.env ?? {}) as RuntimeEnv;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const normalized = value.toLowerCase().trim();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function normalizeLogLevel(input?: string): LogLevel | null {
  if (!input) return null;

  const normalized = input.toLowerCase().trim();
  if (
    normalized === 'debug' ||
    normalized === 'info' ||
    normalized === 'warn' ||
    normalized === 'error'
  ) {
    return normalized;
  }

  return null;
}

function defaultLogLevel(envName: Environment): LogLevel {
  if (envName === 'development') return 'debug';
  if (envName === 'staging') return 'info';
  return 'error';
}

function normalizeUrl(url: string | undefined): string {
  return url?.trim().replace(/\/+$/, '') ?? '';
}

export function detectEnvironment(): Environment {
  const env = readRuntimeEnv();
  const explicitEnv = normalizeEnv(env.VITE_APP_ENV) ?? normalizeEnv(env.MODE);
  if (explicitEnv) return explicitEnv;

  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase();
    if (hostname.includes('localhost') || hostname === '127.0.0.1' || hostname === '::1')
      return 'development';
    if (hostname.includes('staging') || hostname.includes('stage') || hostname.includes('stg'))
      return 'staging';
    if (hostname.includes('dev') || hostname.startsWith('dev.')) return 'development';
    return 'production';
  }

  return 'development';
}

export function createEnvConfig(envName: Environment = detectEnvironment()): EnvConfig {
  const env = readRuntimeEnv();
  const baseConfig = defaults[envName];
  const apiBaseUrl = normalizeUrl(env.VITE_API_BASE_URL) || baseConfig.apiBaseUrl;
  const wsUrl = normalizeUrl(env.VITE_WS_URL) || baseConfig.wsUrl;
  const graphqlUrl = normalizeUrl(env.VITE_GRAPHQL_URL) || baseConfig.graphqlUrl;
  const cognitoRegion = env.VITE_COGNITO_REGION?.trim() || baseConfig.cognitoRegion;
  const cognitoUserPoolId = env.VITE_COGNITO_USER_POOL_ID?.trim() || baseConfig.cognitoUserPoolId;
  const cognitoClientId = env.VITE_COGNITO_CLIENT_ID?.trim() || baseConfig.cognitoClientId;
  const cognitoIdentityPoolId =
    env.VITE_COGNITO_IDENTITY_POOL_ID?.trim() || baseConfig.cognitoIdentityPoolId;
  const cognitoEndpoint = env.VITE_COGNITO_ENDPOINT?.trim() || baseConfig.cognitoEndpoint;
  const cognitoDomain = env.VITE_COGNITO_DOMAIN?.trim() || baseConfig.cognitoDomain;
  const cognitoRedirectSignIn = env.VITE_COGNITO_REDIRECT_SIGN_IN?.trim() || baseConfig.cognitoRedirectSignIn;
  const cognitoRedirectSignOut = env.VITE_COGNITO_REDIRECT_SIGN_OUT?.trim() || baseConfig.cognitoRedirectSignOut;
  const enableAnalytics = parseBoolean(env.VITE_ENABLE_ANALYTICS, baseConfig.enableAnalytics);
  const enableDebug = parseBoolean(env.VITE_ENABLE_DEBUG, baseConfig.enableDebug);
  const useMockApi = parseBoolean(
    env.VITE_USE_MOCK_API,
    envName === 'development' && apiBaseUrl.length === 0
  );
  const requestTimeoutMs =
    Number.parseInt(env.VITE_API_TIMEOUT_MS ?? '', 10) ||
    (envName === 'production' ? 15000 : 30000);
  const logLevel =
    normalizeLogLevel(env.VITE_LOG_LEVEL) || baseConfig.logLevel || defaultLogLevel(envName);

  return {
    ...baseConfig,
    apiBaseUrl,
    wsUrl,
    graphqlUrl,
    cognitoRegion,
    cognitoUserPoolId,
    cognitoClientId,
    cognitoIdentityPoolId,
    cognitoEndpoint,
    cognitoDomain,
    cognitoRedirectSignIn,
    cognitoRedirectSignOut,
    enableAnalytics,
    enableDebug,
    useMockApi,
    requestTimeoutMs,
    logLevel,
    isDevelopment: envName === 'development',
    isStaging: envName === 'staging',
    isProduction: envName === 'production',
  };
}

export const config: EnvConfig = createEnvConfig();

export const env = config.env;
export const apiBaseUrl = config.apiBaseUrl;
export const wsUrl = config.wsUrl;
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
export const useMockApi = config.useMockApi;
export const requestTimeoutMs = config.requestTimeoutMs;
export const logLevel = config.logLevel;
export const isDevelopment = config.isDevelopment;
export const isStaging = config.isStaging;
export const isProduction = config.isProduction;

export default config;