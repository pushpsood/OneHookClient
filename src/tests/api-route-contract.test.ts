/**
 * Route contract: the web app calls only HTTP routes that are Smithy operations.
 *
 * Smithy (OneHookBackend/packages/api-models/model/smithy) is the single source of every API, and the
 * synced manifest src/lib/analytics/generated/apiManifest.ts lists each operation's
 * `{operationId, method, path, service}`. ./api-route-scan.ts finds every request in src/ (the REST
 * helpers in src/api, raw fetches to the API or to Mr. OneHook, XHR uploads, and the
 * `onehook-api-client` SDK calls) and resolves it. This test then requires:
 *
 *  - every resolved `method + path` to be a manifest operation of that origin (path-parameter names
 *    ignored): the API base against the AWS services, `chatbotUrl` against MrOneHookService, and
 *    `portalModerationBaseUrl` against the admin portal's ModerationEvidenceService (the path joined to
 *    the configured base URL's path, e.g. /api/p/onehook/gamma/moderation + /evidence/presign);
 *  - every SDK call (`sdkClient.getState(...)` → GetState, `new XCommand`) to be a manifest operationId;
 *  - every call site to resolve. A site the scanner can't resolve fails here unless it is listed in
 *    {@link EXCEPTIONS} with a reason; an exception that no longer matches fails too.
 */
import { describe, it, expect } from 'vitest';
import { API_OPERATIONS, type ApiOperation } from '../lib/analytics/generated/apiManifest';
import { portalModerationBaseUrl } from '../utils/env.config';
import {
  normalizePath,
  readSources,
  scanSources,
  type Base,
  type ResolvedRoute,
  type ScanResult,
} from './api-route-scan';

const ROOT = new URL('../../', import.meta.url).pathname;

type RouteException = {
  /** A resolved route that is not a Smithy operation. */
  kind: 'route';
  base: Base;
  method: string;
  path: string;
  reason: string;
};

type SiteException = {
  /** A call site whose URL is only known at runtime. */
  kind: 'site';
  file: string;
  /** Function that owns the call. */
  owner: string;
  /** Source text of the URL expression. */
  target: string;
  /** How many call sites this entry covers (so a new one in the same function still fails). */
  count: number;
  reason: string;
};

type Exception = RouteException | SiteException;

/**
 * Requests that are not Smithy operations, each with the reason it is allowed. Every entry must still
 * match (see "every exception is still needed").
 */
const EXCEPTIONS: readonly Exception[] = [
  {
    kind: 'site',
    file: 'src/api/profile.ts',
    owner: 'uploadMedia',
    target: 'uploadUrl',
    count: 2,
    reason:
      'POST (form fields) or PUT of the media bytes to the presigned S3 URL that GenerateUploadUrl returned. It goes to S3, not to a OneHook API.',
  },
  {
    kind: 'site',
    file: 'src/lib/attachment-transport.ts',
    owner: 'putCiphertext',
    target: 'uploadUrl',
    count: 1,
    reason:
      'PUT of attachment ciphertext to the presigned S3 URL that CreateMediaUploadUrl returned. It goes to S3, not to a OneHook API.',
  },
  {
    kind: 'site',
    file: 'src/lib/attachment-transport.ts',
    owner: 'getCiphertext',
    target: 'downloadUrl',
    count: 1,
    reason:
      'GET of attachment ciphertext from the presigned S3 URL that CreateMediaDownloadUrl returned. It goes to S3, not to a OneHook API.',
  },
  {
    kind: 'site',
    file: 'src/features/moderation/report/evidence-api.ts',
    owner: 'putEvidenceBytes',
    target: 'upload.url',
    count: 1,
    reason:
      'PUT of the report evidence bundle to the presigned S3 URL (and method) that the portal evidence presign returned. It goes to S3, not to a OneHook API.',
  },
];

/**
 * Exported request helpers that no file in src/ calls, so they make no request today. Pinned so that
 * the first caller makes the scanner resolve (or report) it.
 *
 *  - createFetchTransport: the analytics SDK's generic transport factory. The app sends signals through
 *    api/analytics.ts (POST /signals, checked above) instead.
 */
const EXPECTED_UNCALLED_HELPERS = ['src/lib/analytics/analyticsClient.ts:createFetchTransport'];

const routeKey = (method: string, path: string) => `${method.toUpperCase()} ${normalizePath(path)}`;

/** Manifest services served by each origin (everything else is the AWS API). */
const SERVICES_OF: Record<Exclude<Base, 'api'>, readonly string[]> = {
  'mr-onehook': ['mr-onehook'],
  'admin-portal': ['moderation-evidence'],
};
/** Served by the admin portal, but not on an origin this app calls (the Admissions API is mobile-only). */
const ELSEWHERE = new Set(['admissions']);

/**
 * The path of each origin's configured base URL. A call's path is joined to it, so the portal base
 * https://admin.onehook.club/api/p/onehook/gamma/moderation + /evidence/presign is checked against
 * /api/p/{service}/{stage}/moderation/evidence/presign.
 */
const BASE_PATH: Record<Base, string> = {
  api: '',
  'mr-onehook': '',
  'admin-portal': new URL(portalModerationBaseUrl).pathname.replace(/\/+$/, ''),
};

/** A manifest path relative to a base path (its labels match any segment), or null when it is not under it. */
export function relativeToBase(template: string, basePath: string): string | null {
  const t = template.split('/');
  const b = basePath.split('/');
  if (t.length < b.length) return null;
  for (let i = 0; i < b.length; i++) if (!(/^\{[^}]+\}$/.test(t[i]) || t[i] === b[i])) return null;
  return '/' + t.slice(b.length).join('/');
}

const ofBase = (base: Base) => (o: ApiOperation) =>
  base === 'api'
    ? !Object.values(SERVICES_OF).some((s) => s.includes(o.service)) && !ELSEWHERE.has(o.service)
    : SERVICES_OF[base].includes(o.service);

/** Manifest routes per origin, relative to the origin's base path. */
const MANIFEST: Record<Base, Set<string>> = Object.fromEntries(
  (['api', 'mr-onehook', 'admin-portal'] as const).map((base) => [
    base,
    new Set(
      API_OPERATIONS.filter(ofBase(base)).flatMap((o) => {
        const rel = relativeToBase(o.path, BASE_PATH[base]);
        return rel === null ? [] : [routeKey(o.method, rel)];
      })
    ),
  ])
) as Record<Base, Set<string>>;
const OPERATION_IDS = new Set(API_OPERATIONS.map((o) => o.operationId));

const isRouteException = (r: ResolvedRoute, e: Exception): e is RouteException =>
  e.kind === 'route' && e.base === r.base && routeKey(e.method, e.path) === routeKey(r.method, r.path);

const where = (x: { file: string; line: number }) => `${x.file}:${x.line}`;

/** Everything the contract rejects, as readable lines (empty when the scan is clean). */
function violations(scan: ScanResult, exceptions: readonly Exception[]) {
  const unknownRoutes = scan.routes
    .filter((r) => !MANIFEST[r.base].has(routeKey(r.method, r.path)))
    .filter((r) => !exceptions.some((e) => isRouteException(r, e)))
    .map((r) => `${where(r)} ${r.base} ${routeKey(r.method, r.path)}${r.via ? ` (via ${r.via})` : ''}`);

  const unknownSdkCalls = scan.sdkCalls
    .filter((c) => !OPERATION_IDS.has(c.operationId))
    .map((c) => `${where(c)} ${c.call} -> ${c.operationId}`);

  const unresolved = scan.unresolved
    .filter((u) => !exceptions.some((e) => e.kind === 'site' && e.file === u.file && e.owner === u.owner && e.target === u.target))
    .map((u) => `${where(u)} in ${u.owner}: ${u.target} -- ${u.reason}`);

  const stale = exceptions.flatMap((e) => {
    if (e.kind === 'route') {
      return scan.routes.some((r) => isRouteException(r, e)) ? [] : [`route ${e.base} ${e.method} ${e.path} is no longer called`];
    }
    const n = scan.unresolved.filter((u) => u.file === e.file && u.owner === e.owner && u.target === e.target).length;
    return n === e.count ? [] : [`${e.file} ${e.owner}(${e.target}) matches ${n} call sites, expected ${e.count}`];
  });

  return { unknownRoutes, unknownSdkCalls, unresolved, stale };
}

describe('web → API route contract (Smithy manifest)', () => {
  const scan = scanSources(readSources(ROOT));
  const v = violations(scan, EXCEPTIONS);

  it('every call site resolves (or is an exception with a reason)', () => {
    expect(v.unresolved).toEqual([]);
  });

  it('every literal route is a Smithy operation of its origin', () => {
    expect(v.unknownRoutes).toEqual([]);
  });

  it('every SDK command is a Smithy operation', () => {
    expect(v.unknownSdkCalls).toEqual([]);
  });

  it('every exception is still needed and gives a reason', () => {
    expect(v.stale).toEqual([]);
    for (const e of EXCEPTIONS) expect(e.reason.length, JSON.stringify(e)).toBeGreaterThan(40);
  });

  it('pins the exported request helpers nothing calls', () => {
    expect(scan.uncalledHelpers).toEqual(EXPECTED_UNCALLED_HELPERS);
  });

  it('sees every request layer it is meant to check', () => {
    const routesFrom = new Set(scan.routes.map((r) => `${r.file}${r.via ? `#${r.via}` : ''}`));
    for (const layer of [
      'src/api/rest.ts#request',
      'src/api/chat.ts#chatRest',
      'src/api/analytics.ts',
      'src/lib/mr-onehook.ts',
      'src/lib/mr-onehook.ts#authorizedFetch',
      'src/components/Chatbot/ChatbotWidget.tsx',
    ]) {
      expect(routesFrom, layer).toContain(layer);
    }
    const sdkFiles = new Set(scan.sdkCalls.map((c) => c.file));
    for (const f of ['src/api/state.ts', 'src/api/identity.ts', 'src/api/profile.ts', 'src/api/matching.ts', 'src/api/liveness.ts']) {
      expect(sdkFiles, f).toContain(f);
    }
  });

  it('checks the portal moderation evidence calls against ModerationEvidenceService', () => {
    expect(BASE_PATH['admin-portal']).toMatch(/^\/api\/p\/[^/]+\/[^/]+\/moderation$/);
    const portal = scan.routes.filter((r) => r.base === 'admin-portal').map((r) => routeKey(r.method, r.path));
    expect([...new Set(portal)].sort()).toEqual(['POST /evidence/complete', 'POST /evidence/presign']);
    expect([...MANIFEST['admin-portal']].sort()).toEqual(['POST /evidence/complete', 'POST /evidence/presign']);
  });
});

describe('the route scanner itself', () => {
  const fake = (text: string) => scanSources([{ path: 'src/api/fake.ts', text }]);
  const header = `
    import { apiBaseUrl, chatbotUrl } from '../utils/env.config';
    import { sdkClient } from './sdk-client';
    function resolveUrl(path: string): string { return apiBaseUrl + path; }
    async function request(method: string, path: string) { return fetch(resolveUrl(path), { method }); }
  `;

  it('fails a literal route that is not a Smithy operation, and passes one that is', () => {
    const v = violations(
      fake(`${header}
        export const Fake = {
          bad: () => request('GET', '/matching/not-a-route'),
          good: (id: string) => request('DELETE', \`/state/blocks/\${encodeURIComponent(id)}\`),
          wrongOrigin: () => fetch(\`\${chatbotUrl}/state/blocks\`, { method: 'GET' }),
        };`),
      []
    );
    expect(v.unknownRoutes).toEqual([
      'src/api/fake.ts:8 api GET /matching/not-a-route (via request)',
      'src/api/fake.ts:10 mr-onehook GET /state/blocks',
    ]);
    expect(v.unresolved).toEqual([]);
  });

  it('fails a portal moderation route that is not a ModerationEvidenceService operation', () => {
    const v = violations(
      fake(`
        import { portalModerationBaseUrl } from '../utils/env.config';
        export const Fake = {
          good: () => fetch(\`\${portalModerationBaseUrl}/evidence/presign\`, { method: 'POST' }),
          ghost: () => fetch(\`\${portalModerationBaseUrl}/evidence/ghost\`, { method: 'POST' }),
          admissions: () => fetch(\`\${portalModerationBaseUrl}/otp/start\`, { method: 'POST' }),
        };`),
      []
    );
    expect(v.unknownRoutes).toEqual(['src/api/fake.ts:5 admin-portal POST /evidence/ghost', 'src/api/fake.ts:6 admin-portal POST /otp/start']);
    expect(relativeToBase('/api/p/{service}/{stage}/moderation/evidence/presign', '/api/p/onehook/gamma/moderation')).toBe('/evidence/presign');
    expect(relativeToBase('/api/p/{service}/{stage}/admissions/config', '/api/p/onehook/gamma/moderation')).toBeNull();
  });

  it('fails an SDK call that is not an operation', () => {
    const v = violations(fake(`${header} export const x = () => (sdkClient as any).notAnOperation({});`), []);
    expect(v.unknownSdkCalls).toEqual(['src/api/fake.ts:6 (sdkClient as any).notAnOperation -> NotAnOperation']);
  });

  it('reports what it cannot resolve instead of skipping it', () => {
    const v = violations(
      fake(`${header}
        export const Fake = {
          dynamic: (url: string) => fetch(url),
          alias: () => [fetch].length,
          stored: () => { const c = sdkClient; return c; },
          external: () => fetch('https://example.com/x'),
        };`),
      []
    );
    expect(v.unresolved.map((u) => u.split(' -- ')[0])).toEqual([
      // The fixture's own `request` helper is never called here: reported, not ignored.
      'src/api/fake.ts:5 in request: resolveUrl(path)',
      'src/api/fake.ts:8 in dynamic: url',
      'src/api/fake.ts:9 in alias: fetch',
      'src/api/fake.ts:10 in stored: sdkClient',
      "src/api/fake.ts:11 in external: 'https://example.com/x'",
    ]);
  });
});
