/**
 * Evidence upload transport (OneHook moderation Phase 2 client contract).
 *
 * Implements the three HTTP steps against the admin portal's PUBLIC member gateway
 * (features/moderation README "Evidence (decrypted-chat share) - client contract"):
 *
 *   1. POST {base}/evidence/presign   (Bearer member ID token)  -> { evidenceId, upload, expiresAt }
 *   2. PUT  upload.url                 (EXACTLY upload.headers, no auth) with the canonical bytes
 *   3. POST {base}/evidence/complete   (Bearer member ID token)  -> { status }
 *
 * `complete` is retried on `503 EVIDENCE_FINALIZE_RETRY` with bounded backoff. Everything is
 * dependency-injected (fetch, token provider, sleep) so the orchestration is unit-testable without a
 * browser or the network. No message text or user ids are ever logged here.
 */
import { portalModerationBaseUrl } from '../../../utils/env.config';

export class EvidenceError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'EvidenceError';
  }
}

export interface EvidenceTransport {
  /** Portal moderation base URL (…/moderation). Defaults to the app's env config. */
  baseUrl?: string;
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

async function parseBody(res: Response): Promise<{ code?: string; message?: string }> {
  const text = await res.text().catch(() => '');
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  const obj = typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  return {
    code: typeof obj?.code === 'string' ? (obj.code as string) : undefined,
    message: typeof obj?.message === 'string' ? (obj.message as string) : undefined,
  };
}

async function postJson<T>(t: EvidenceTransport, path: string, body: unknown): Promise<T> {
  const doFetch = t.fetchImpl ?? fetch;
  const token = await t.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res: Response;
  try {
    res = await doFetch(`${resolveBaseUrl(t)}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new EvidenceError(
      err instanceof Error ? err.message : 'Network request failed',
      0,
      'NETWORK_ERROR'
    );
  }
  if (!res.ok) {
    const { code, message } = await parseBody(res);
    throw new EvidenceError(message || `Evidence request failed (${res.status})`, res.status, code);
  }
  return (await res.json()) as T;
}

/** Step 1: get a presigned PUT for the evidence object. */
export function presignEvidence(t: EvidenceTransport, req: PresignRequest): Promise<PresignResponse> {
  return postJson<PresignResponse>(t, '/evidence/presign', req);
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
      return await postJson<CompleteResponse>(t, '/evidence/complete', req);
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
