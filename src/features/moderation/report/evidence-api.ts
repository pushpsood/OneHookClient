/**
 * Evidence upload transport (OneHook moderation Phase 2 client contract).
 *
 * Implements the three steps against the admin portal's PUBLIC member gateway
 * (features/moderation README "Evidence (decrypted-chat share) - client contract"):
 *
 *   1. PresignEvidence  (SDK, Bearer member ID token) -> { evidenceId, upload, expiresAt }
 *   2. PUT upload.url   (EXACTLY upload.headers, no auth) with the canonical bytes: a presigned S3
 *                       URL, the one raw request here
 *   3. CompleteEvidence (SDK, Bearer member ID token) -> { status }
 *
 * Steps 1 and 3 use the admin portal's published client (`saha-equation-admin-portal-client`), bound to the OneHook
 * tenant. `complete` is
 * retried on `503 EVIDENCE_FINALIZE_RETRY` with bounded backoff. Everything is dependency-injected
 * (SDK client, S3 fetch, token provider, sleep) so the orchestration is unit-testable without a
 * browser or the network. No message text or user ids are ever logged here.
 */
import { portalModerationBaseUrl } from '../../../utils/env.config';
import {
  createModerationEvidenceClient,
  sdkFailure,
  withoutMetadata,
  type EvidenceClient,
} from '../../../api/external-sdk-clients';

export class EvidenceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    /** The envelope's `retryable` flag, when the portal sent one. */
    public readonly retryable?: boolean
  ) {
    super(message);
    this.name = 'EvidenceError';
  }
}

export interface EvidenceTransport {
  /** Portal moderation base URL (…/moderation). Defaults to the app's env config. */
  baseUrl?: string;
  /** The tenant-bound portal evidence client. Defaults to one built from `baseUrl` + `getToken`. */
  client?: Pick<EvidenceClient, 'presignEvidence' | 'completeEvidence'>;
  /** Used only for the PUT to the presigned S3 URL. */
  fetchImpl?: typeof fetch;
  /** Returns the member's Cognito ID token, or null when unauthenticated. */
  getToken: () => Promise<string | null>;
  /** Injected for tests; defaults to a real timed delay. */
  sleep?: (ms: number) => Promise<void>;
}

export interface PresignRequest {
  reportId: string;
  sizeBytes: number;
  /** 64 lowercase hex. */
  sha256: string;
  messageCount: number;
  includesMedia: boolean;
}

export interface PresignUpload {
  url: string;
  method: string;
  headers: Record<string, string>;
}

export interface PresignResponse {
  evidenceId: string;
  upload: PresignUpload;
  expiresAt: number;
}

export interface CompleteRequest {
  reportId: string;
  evidenceId: string;
  messageIds: string[];
  /** Epoch ms. */
  firstSentAt: number;
  /** Epoch ms. */
  lastSentAt: number;
}

export interface CompleteResponse {
  evidenceId: string;
  status: string;
  idempotent: boolean;
}

export interface RetryOptions {
  /** Max additional attempts after the first on a retryable 503. Default 4. */
  maxRetries?: number;
  /** Base backoff ms (doubled each attempt, capped). Default 400. */
  baseDelayMs?: number;
  /** Cap on a single backoff delay. Default 4000. */
  maxDelayMs?: number;
}

const FINALIZE_RETRY_CODE = 'EVIDENCE_FINALIZE_RETRY';

/**
 * Evidence for this report is already recorded server-side (presign returns `409` with this code
 * once evidence exists, and `complete` is idempotent on `evidenceId`). Either way the evidence IS
 * attached, so this is a success, not a failure.
 */
export const EVIDENCE_ALREADY_COMPLETED_CODE = 'EVIDENCE_ALREADY_COMPLETED';

/**
 * Codes that mean the server will NEVER accept evidence for this report, so retrying cannot help.
 * The UI closes the evidence affordance with a calm, final note (no Retry):
 *   - EVIDENCE_DISABLED    : evidence not allowed for this category (e.g. MINOR_SAFETY).
 *   - EVIDENCE_NOT_OFFERED : the report was not filed with `evidenceOffered`.
 *   - REPORT_TOO_OLD       : past the server's evidence window (`reportMaxAgeHours`).
 *   - NOT_REPORTER         : the caller is not the report's reporter.
 */
export const EVIDENCE_TERMINAL_CODES: readonly string[] = [
  'EVIDENCE_DISABLED',
  'EVIDENCE_NOT_OFFERED',
  'REPORT_TOO_OLD',
  'NOT_REPORTER',
];

/**
 * Map an evidence transport error to an evidence outcome, or `null` when it is a transient/retryable
 * failure the caller should surface with a Retry. Pure (no I/O) so it is unit-testable.
 *   - `'attached'` : evidence already recorded (409 EVIDENCE_ALREADY_COMPLETED).
 *   - `'terminal'` : a code where retry can never succeed (hide Retry, show a calm final note).
 *   - `null`       : anything else (network, 5xx, S3 PUT rejection, exhausted finalize retry).
 */
export function classifyEvidenceError(err: unknown): 'attached' | 'terminal' | null {
  if (!(err instanceof EvidenceError) || !err.code) return null;
  if (err.code === EVIDENCE_ALREADY_COMPLETED_CODE) return 'attached';
  if (EVIDENCE_TERMINAL_CODES.includes(err.code)) return 'terminal';
  return null;
}

function resolveBaseUrl(t: EvidenceTransport): string {
  return (t.baseUrl ?? portalModerationBaseUrl).replace(/\/+$/, '');
}

function clientOf(t: EvidenceTransport): NonNullable<EvidenceTransport['client']> {
  return t.client ?? createModerationEvidenceClient(resolveBaseUrl(t), t.getToken);
}

/**
 * Run one SDK call; a failure becomes an {@link EvidenceError} read from the portal envelope
 * `{"error": {"code", "message", "retryable"}}` (Smithy `ModerationEvidenceErrorBody`, which the SDK
 * copies onto the exception). A body without that envelope (a proxy HTML page) yields no code.
 */
async function evidenceCall<T extends object>(call: () => Promise<T>): Promise<Omit<T, '$metadata'>> {
  try {
    return withoutMetadata(await call());
  } catch (err) {
    if (err instanceof EvidenceError) throw err;
    const failure = sdkFailure(err);
    if (!failure) {
      throw new EvidenceError(err instanceof Error ? err.message : 'Network request failed', 0, 'NETWORK_ERROR');
    }
    const envelope = failure.body.error;
    const detail = typeof envelope === 'object' && envelope !== null ? (envelope as Record<string, unknown>) : undefined;
    const code = typeof detail?.code === 'string' ? detail.code : undefined;
    const message = typeof detail?.message === 'string' ? detail.message : undefined;
    const retryable = typeof detail?.retryable === 'boolean' ? detail.retryable : undefined;
    throw new EvidenceError(message || `Evidence request failed (${failure.status})`, failure.status, code, retryable);
  }
}

/** Step 1: get a presigned PUT for the evidence object. */
export function presignEvidence(t: EvidenceTransport, req: PresignRequest): Promise<PresignResponse> {
  const evidenceClient = clientOf(t);
  return evidenceCall(() => evidenceClient.presignEvidence(req)) as Promise<PresignResponse>;
}

/**
 * Step 2: PUT the exact canonical bytes to S3 using EXACTLY the returned headers (and no auth
 * header — the presigned URL carries the signature). S3 enforces the SHA-256 checksum header.
 */
export async function putEvidenceBytes(
  fetchImpl: typeof fetch | undefined,
  upload: PresignUpload,
  bytes: Uint8Array
): Promise<void> {
  const doFetch = fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(upload.url, {
      method: upload.method || 'PUT',
      headers: { ...upload.headers },
      body: bytes as unknown as BodyInit,
    });
  } catch (err) {
    throw new EvidenceError(
      err instanceof Error ? err.message : 'Evidence upload failed',
      0,
      'UPLOAD_NETWORK_ERROR'
    );
  }
  if (!res.ok) {
    throw new EvidenceError(`Evidence upload rejected (${res.status})`, res.status, 'UPLOAD_FAILED');
  }
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Step 3: record the upload. Retries on `503 EVIDENCE_FINALIZE_RETRY` with bounded exponential
 * backoff; any other error propagates immediately.
 */
export async function completeEvidence(
  t: EvidenceTransport,
  req: CompleteRequest,
  opts: RetryOptions = {}
): Promise<CompleteResponse> {
  const maxRetries = opts.maxRetries ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 400;
  const maxDelayMs = opts.maxDelayMs ?? 4000;
  const sleep = t.sleep ?? defaultSleep;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const evidenceClient = clientOf(t);
      return (await evidenceCall(() => evidenceClient.completeEvidence(req))) as CompleteResponse;
    } catch (err) {
      const retryable =
        err instanceof EvidenceError && err.status === 503 && err.code === FINALIZE_RETRY_CODE;
      if (!retryable || attempt >= maxRetries) throw err;
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      attempt += 1;
      await sleep(delay);
    }
  }
}
