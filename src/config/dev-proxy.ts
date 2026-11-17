/**
 * Local dev proxy (vite.config.ts `server.proxy`).
 *
 * On localhost the SDK targets the dev-server origin (see `src/api/sdk-client.ts`), so every REST
 * prefix the app calls must be forwarded to the Gamma REST ingress, or the browser gets the SPA's
 * index.html (or a 404) instead of the API. The list mirrors the ingress's path behaviours
 * (OneHookBackend infra/stacks/api-stack.ts). `src/tests/dev-proxy.test.ts` fails when a Cognito or
 * public operation of the generated route manifest is not covered.
 */
export const DEV_API_TARGET = 'https://api.gamma.onehook.club';

/** First path segment of every route served by the REST ingress that the app calls. */
export const DEV_API_PREFIXES = [
  '/identity',
  '/profile',
  '/state',
  '/matching',
  '/chat',
  // Analytics ingest (IngestSignals) and photo stats (GetMediaStats).
  '/signals',
] as const;

export interface DevProxyEntry {
  target: string;
  changeOrigin: boolean;
  secure: boolean;
}

/** The `server.proxy` entries for the Gamma ingress. */
export function devApiProxy(): Record<string, DevProxyEntry> {
  return Object.fromEntries(
    DEV_API_PREFIXES.map((prefix) => [
      prefix,
      { target: DEV_API_TARGET, changeOrigin: true, secure: true },
    ])
  );
}

/** True when `path` is forwarded by one of {@link DEV_API_PREFIXES}. */
export function isProxied(path: string): boolean {
  return DEV_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}
