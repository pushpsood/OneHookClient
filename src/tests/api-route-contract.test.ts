/**
 * API contract: every request the web app makes to a OneHook API goes through the generated
 * `onehook-api-client` package. Nothing in src/ builds a OneHook URL or request by hand.
 *
 * Each API's Smithy model is owned by the repo that serves it, and each owner's route manifest lists its
 * operations as `{operationId, method, path, service}`: the backend's is synced to
 * src/lib/analytics/generated/apiManifest.ts, Mr OneHook's and the portal's come from their packages
 * (`<package>/manifest`). ./api-route-scan.ts finds every request in src/ (raw
 * fetches, XHR, and calls on the generated clients) and resolves it. This test then requires:
 *
 *  - NO hand-built request to an API: a raw `fetch`/XHR whose URL starts with the API base,
 *    `chatbotUrl` or `portalModerationBaseUrl` fails, whatever its path. Use the client from the package
 *    the API's owner publishes instead: `sdkClient` (`onehook-api-client`, OneHookBackend) for the backend,
 *    `mrOneHookClient` (`onehook-mr-onehook-client`, OneHookUXEnhancement) for Mr OneHook,
 *    `createModerationEvidenceClient` (`saha-equation-admin-portal-client`, OneHookAdminPortal) for the portal's
 *    evidence API. A missing operation is added to that owner's Smithy model and published, never written
 *    here;
 *  - every SDK call (`sdkClient.getState(...)` → GetState, `new XCommand`) to be a manifest operation
 *    of the service its client serves;
 *  - every raw request left to go to a URL the API returned (presigned S3), listed in
 *    {@link EXCEPTIONS} with a reason, and every call site to resolve. An exception that no longer
 *    matches fails too.
 */
import { describe, it, expect } from 'vitest';
import { API_OPERATIONS as BACKEND_OPERATIONS } from '../lib/analytics/generated/apiManifest';
import { API_OPERATIONS as MR_ONEHOOK_OPERATIONS } from 'onehook-mr-onehook-client/manifest';
import { API_OPERATIONS as PORTAL_OPERATIONS } from 'saha-equation-admin-portal-client/manifest';

/** One manifest entry; the owners' manifests share this shape (their `auth` values differ). */
interface ApiOperation {
  readonly operationId: string;
  readonly method: string;
  readonly path: string;
  readonly service: string;
  readonly auth: string;
}

/** Every operation the web app may call, from each owner's manifest. */
const API_OPERATIONS: readonly ApiOperation[] = [...BACKEND_OPERATIONS, ...MR_ONEHOOK_OPERATIONS, ...PORTAL_OPERATIONS];
import { portalModerationBaseUrl } from '../utils/env.config';
import {
  normalizePath,
  readSources,
  scanSources,
  type Base,
  type ResolvedRoute,
  type ScanResult,
  type SdkService,
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
  {
    kind: 'site',
    file: 'src/api/live-location.ts',
    owner: 'stopOnUnload',
    target: 'auth.endpoint',
    count: 1,
    reason:
      'The stopLiveLocation GraphQL mutation sent to the AppSync endpoint as a keepalive fetch from pagehide, because the Amplify client cannot send during unload. It is AppSync GraphQL, not a Smithy REST route.',
  },
];

/**
 * Exported request helpers that no file in src/ calls, so they make no request today. Pinned so that
 * the first caller makes the scanner resolve (or report) it.
 * (None today.)
 */
const EXPECTED_UNCALLED_HELPERS: string[] = [];

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

/** Manifest services each generated client serves. */
const SDK_SERVICES: Record<SdkService, (o: ApiOperation) => boolean> = {
  aws: ofBase('api'),
  'mr-onehook': (o) => o.service === 'mr-onehook',
  'moderation-evidence': (o) => o.service === 'moderation-evidence',
};
const OPERATIONS_OF: Record<SdkService, Set<string>> = Object.fromEntries(
  (Object.keys(SDK_SERVICES) as SdkService[]).map((svc) => [
    svc,
    new Set(API_OPERATIONS.filter(SDK_SERVICES[svc]).map((o) => o.operationId)),
  ])
) as Record<SdkService, Set<string>>;

/** The Smithy operation a hand-built route corresponds to, for the error message. */
function operationFor(r: ResolvedRoute): string {
  const op = API_OPERATIONS.filter(ofBase(r.base)).find((o) => {
    const rel = relativeToBase(o.path, BASE_PATH[r.base]);
    return rel !== null && routeKey(o.method, rel) === routeKey(r.method, r.path);
  });
  return op ? `use the SDK operation ${op.operationId}` : 'not a Smithy operation either: add it to Smithy, then call it through the SDK';
}

const isRouteException = (r: ResolvedRoute, e: Exception): e is RouteException =>
  e.kind === 'route' && e.base === r.base && routeKey(e.method, e.path) === routeKey(r.method, r.path);

const where = (x: { file: string; line: number }) => `${x.file}:${x.line}`;

/** Everything the contract rejects, as readable lines (empty when the scan is clean). */
function violations(scan: ScanResult, exceptions: readonly Exception[]) {
  const unknownRoutes = scan.routes
    .filter((r) => !MANIFEST[r.base].has(routeKey(r.method, r.path)))
    .filter((r) => !exceptions.some((e) => isRouteException(r, e)))
    .map((r) => `${where(r)} ${r.base} ${routeKey(r.method, r.path)}${r.via ? ` (via ${r.via})` : ''}`);

  const handBuilt = scan.routes
    .filter((r) => !exceptions.some((e) => isRouteException(r, e)))
    .map((r) => `${where(r)} ${r.base} ${routeKey(r.method, r.path)}${r.via ? ` (via ${r.via})` : ''}: ${operationFor(r)}`);

  const unknownSdkCalls = scan.sdkCalls
    .filter((c) => !OPERATIONS_OF[c.service].has(c.operationId))
    .map((c) => `${where(c)} ${c.call} -> ${c.operationId}${OPERATION_IDS.has(c.operationId) ? ` (an operation of another service than ${c.service})` : ''}`);

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

  return { unknownRoutes, handBuilt, unknownSdkCalls, unresolved, stale };
}

describe('web → API route contract (Smithy manifest)', () => {
  const scan = scanSources(readSources(ROOT));
  const v = violations(scan, EXCEPTIONS);

  it('every call site resolves (or is an exception with a reason)', () => {
    expect(v.unresolved).toEqual([]);
  });

  it('no request to a OneHook API is built by hand: every one goes through the onehook-api-client SDK', () => {
    expect(v.handBuilt).toEqual([]);
  });

  it('every literal route is a Smithy operation of its origin', () => {
    expect(v.unknownRoutes).toEqual([]);
  });

  it('every SDK command is a Smithy operation of the service its client serves', () => {
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
    const layers = new Set(scan.sdkCalls.map((c) => `${c.service} ${c.file}`));
    for (const layer of [
      'aws src/api/rest.ts',
      'aws src/api/chat.ts',
      'aws src/api/analytics.ts',
      'aws src/api/state.ts',
      'aws src/api/identity.ts',
      'aws src/api/profile.ts',
      'aws src/api/matching.ts',
      'aws src/api/liveness.ts',
      'mr-onehook src/lib/mr-onehook.ts',
      'mr-onehook src/components/Chatbot/ChatbotWidget.tsx',
      'moderation-evidence src/features/moderation/report/evidence-api.ts',
    ]) {
      expect(layers, layer).toContain(layer);
    }
  });

  it('calls the portal moderation evidence API only through ModerationEvidenceService', () => {
    expect(BASE_PATH['admin-portal']).toMatch(/^\/api\/p\/[^/]+\/[^/]+\/moderation$/);
    const ops = scan.sdkCalls.filter((c) => c.service === 'moderation-evidence').map((c) => c.operationId);
    expect([...new Set(ops)].sort()).toEqual(['CompleteEvidence', 'PresignEvidence']);
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

  it('fails a hand-built request even when its route IS a Smithy operation, naming the SDK operation', () => {
    const v = violations(
      fake(`${header}
        export const Fake = {
          unblock: (id: string) => request('DELETE', \`/state/blocks/\${encodeURIComponent(id)}\`),
          sessions: () => fetch(\`\${chatbotUrl}/api/member/product-connection-chat/sessions\`, { method: 'GET' }),
        };`),
      []
    );
    expect(v.unknownRoutes).toEqual([]);
    expect(v.handBuilt).toEqual([
      'src/api/fake.ts:8 api DELETE /state/blocks/{} (via request): use the SDK operation UnblockUser',
      'src/api/fake.ts:9 mr-onehook GET /api/member/product-connection-chat/sessions: use the SDK operation ListChatSessions',
    ]);
  });

  it('fails an SDK call on the wrong client for its service', () => {
    const v = violations(
      scanSources([
        {
          path: 'src/lib/fake.ts',
          text: `
            import { mrOneHookClient } from '../api/external-sdk-clients';
            import { sdkClient } from '../api/sdk-client';
            export const a = () => mrOneHookClient.getState({});
            export const b = () => sdkClient.listChatSessions({});
            export const c = () => mrOneHookClient.listChatSessions({});
          `,
        },
      ]),
      []
    );
    expect(v.unknownSdkCalls).toEqual([
      'src/lib/fake.ts:4 mrOneHookClient.getState -> GetState (an operation of another service than mr-onehook)',
      'src/lib/fake.ts:5 sdkClient.listChatSessions -> ListChatSessions (an operation of another service than aws)',
    ]);
  });

  it('reports a generated client constructed outside its module', () => {
    const scan = scanSources([
      {
        path: 'src/lib/fake.ts',
        text: `
          import { MrOneHookService } from 'onehook-mr-onehook-client';
          export const mine = new MrOneHookService({ endpoint: 'https://x' });
        `,
      },
    ]);
    expect(scan.unresolved.map((u) => u.reason)).toContain(
      'a second MrOneHookService SDK client outside src/api/external-sdk-clients.ts'
    );
  });

  it('reports a portal client built outside its module', () => {
    const scan = scanSources([
      {
        path: 'src/lib/fake.ts',
        text: `
          import { createPortalClient } from 'saha-equation-admin-portal-client';
          export const mine = createPortalClient({ endpoint: 'https://x', tenant: { service: 'onehook', stage: 'gamma' } });
        `,
      },
    ]);
    expect(scan.unresolved.map((u) => u.reason)).toContain(
      'a second createPortalClient() SDK client outside src/api/external-sdk-clients.ts'
    );
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
