/**
 * Report submit orchestration (OneHook moderation Phase 2).
 *
 * Files the report, then — only if the reporter opted in AND the server allows it — decrypts the
 * chat window locally, builds the canonical bundle, and uploads it. The two hard rules:
 *
 *  1. The report fields are IDENTICAL whether or not evidence is shared, except `evidenceOffered`
 *     (no dark patterns: declining is treated exactly like sharing).
 *  2. Evidence failure must NEVER fail the report: the report is already filed, so an upload error
 *     is swallowed into a non-blocking outcome the UI surfaces with a Retry action.
 *
 * Fully dependency-injected (report API, evidence transport, telemetry, clock) so it is unit-testable
 * without a browser or the network.
 */
import {
  ReportsApi,
  type CreateReportRequest,
  type CreateReportResponse,
  type ReportCategoryCode,
} from '../../../api/rest';
import {
  buildBundle,
  canonicalByteLength,
  canonicalBytes,
  bundleSha256Hex,
  hexToBase64,
  EVIDENCE_WINDOW,
  type BundleMessage,
} from './evidence-bundle';
import { selectEvidenceWindow, type SourceMessage } from './window-selection';
import {
  presignEvidence,
  putEvidenceBytes,
  completeEvidence,
  type EvidenceTransport,
  type RetryOptions,
} from './evidence-api';
import { getMemberIdToken } from './member-auth';
import { trackReport, ReportEvent, type ReportCategory, type ReportSource } from './telemetry';

export type EvidenceOutcome = 'skipped' | 'not_allowed' | 'empty' | 'attached' | 'failed';

export interface ReportSubmission {
  reportedUserId: string;
  category: ReportCategory;
  details?: string;
  alsoBlock: boolean;
  /** Present only when the flow started from a chat (used as the bundle conversationId too). */
  conversationId?: string;
  source: ReportSource;
  /** The evidence checkbox value. Never pre-ticked; only possible from a chat on an eligible category. */
  shareEvidence: boolean;
  /** Decrypted source messages for the evidence window (only used when shareEvidence). */
  messages?: SourceMessage[];
  includesMedia?: boolean;
}

export interface SubmitDeps {
  createReport?: (body: CreateReportRequest) => Promise<CreateReportResponse>;
  evidence?: EvidenceTransport;
  evidenceRetry?: RetryOptions;
  telemetry?: typeof trackReport;
  nowMs?: () => number;
}

export interface SubmitResult {
  reportId: string;
  severity: string;
  evidenceAllowed: boolean;
  blocked: boolean;
  evidenceOutcome: EvidenceOutcome;
}

function defaultEvidenceTransport(): EvidenceTransport {
  return { getToken: getMemberIdToken };
}

/** Build the exact report body. Only `evidenceOffered` ever varies with the checkbox. */
export function buildReportBody(sub: ReportSubmission): CreateReportRequest {
  const details = sub.details?.trim();
  const body: CreateReportRequest = {
    reportedUserId: sub.reportedUserId,
    category: sub.category as ReportCategoryCode,
    alsoBlock: sub.alsoBlock,
    evidenceOffered: sub.shareEvidence,
  };
  if (details) body.details = details;
  if (sub.conversationId) body.conversationId = sub.conversationId;
  return body;
}

/**
 * Upload the decrypted-chat evidence for an already-filed report. Builds the window + canonical
 * bundle, hashes it, presigns, PUTs the exact bytes, and completes (with 503 retry). Throws on
 * failure (the caller decides whether that fails the report — it must NOT). Returns the outcome
 * `'attached'`, or `'empty'` when there is nothing to share.
 */
export async function uploadEvidence(
  reportId: string,
  conversationId: string,
  messages: SourceMessage[],
  deps: SubmitDeps = {}
): Promise<Extract<EvidenceOutcome, 'attached' | 'empty'>> {
  const nowMs = deps.nowMs ?? (() => Date.now());
  const transport = deps.evidence ?? defaultEvidenceTransport();
  const includesMedia = false; // no media in this release (docs/MODERATION.md §9.3)

  const window: BundleMessage[] = selectEvidenceWindow(messages, {
    maxMessages: EVIDENCE_WINDOW.maxMessages,
    maxDays: EVIDENCE_WINDOW.maxDays,
    nowMs: nowMs(),
  });
  if (window.length === 0) return 'empty';

  const bundle = buildBundle({
    reportId,
    conversationId,
    messages: window,
    attachments: [],
  });
  const sha256 = await bundleSha256Hex(bundle);
  const sizeBytes = canonicalByteLength(bundle);
  const bytes = canonicalBytes(bundle);

  const presign = await presignEvidence(transport, {
    reportId,
    sizeBytes,
    sha256,
    messageCount: window.length,
    includesMedia,
  });

  // The presigned PUT requires the exact checksum header; if the server didn't echo it, compute it
  // from our hash so S3's enforcement still matches our bytes.
  const headers = { ...presign.upload.headers };
  if (!headers['x-amz-checksum-sha256']) headers['x-amz-checksum-sha256'] = hexToBase64(sha256);

  await putEvidenceBytes(transport.fetchImpl, { ...presign.upload, headers }, bytes);

  const messageIds = window.map((m) => m.messageId);
  const firstSentAt = Date.parse(window[0].sentAt);
  const lastSentAt = Date.parse(window[window.length - 1].sentAt);

  await completeEvidence(
    transport,
    { reportId, evidenceId: presign.evidenceId, messageIds, firstSentAt, lastSentAt },
    deps.evidenceRetry
  );
  return 'attached';
}

/**
 * File the report and, when applicable, attach the decrypted chat. Report failures throw (the UI
 * shows a friendly message, handling 429 specially). Evidence failures never throw — they are
 * reported through `evidenceOutcome: 'failed'`.
 */
export async function submitReport(sub: ReportSubmission, deps: SubmitDeps = {}): Promise<SubmitResult> {
  const createReport = deps.createReport ?? ((body) => ReportsApi.create(body));
  const emit = deps.telemetry ?? trackReport;

  const evidenceOffered = sub.shareEvidence;
  emit(evidenceOffered ? ReportEvent.REPORT_SUBMIT_WITH_EVIDENCE : ReportEvent.REPORT_SUBMIT_WITHOUT_EVIDENCE, {
    category: sub.category,
    source: sub.source,
    evidence: evidenceOffered,
  });

  let response: CreateReportResponse;
  try {
    response = await createReport(buildReportBody(sub));
  } catch (err) {
    emit(ReportEvent.REPORT_SUBMIT_FAILED, { category: sub.category, source: sub.source });
    throw err;
  }

  const result: SubmitResult = {
    reportId: response.reportId,
    severity: response.severity,
    evidenceAllowed: response.evidenceAllowed,
    blocked: sub.alsoBlock,
    evidenceOutcome: 'skipped',
  };

  if (!evidenceOffered) return result;
  if (!response.evidenceAllowed) {
    result.evidenceOutcome = 'not_allowed';
    return result;
  }

  try {
    result.evidenceOutcome = await uploadEvidence(
      response.reportId,
      sub.conversationId ?? '',
      sub.messages ?? [],
      deps
    );
    if (result.evidenceOutcome === 'attached') {
      emit(ReportEvent.REPORT_EVIDENCE_UPLOAD_SUCCEEDED, { category: sub.category, source: sub.source });
    }
  } catch {
    // Evidence failure must NOT fail the report — it is already filed.
    result.evidenceOutcome = 'failed';
    emit(ReportEvent.REPORT_EVIDENCE_UPLOAD_FAILED, { category: sub.category, source: sub.source });
  }
  return result;
}
