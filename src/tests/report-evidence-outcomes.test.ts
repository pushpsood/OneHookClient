/**
 * Report evidence outcomes + submit telemetry ordering (OneHook moderation Phase 2).
 *
 * Fix (1): a 409 EVIDENCE_ALREADY_COMPLETED on presign (or an idempotent complete) means the
 * evidence is ATTACHED, not failed; the terminal codes (EVIDENCE_DISABLED / EVIDENCE_NOT_OFFERED /
 * REPORT_TOO_OLD / NOT_REPORTER) yield a 'terminal' outcome (the UI hides Retry and shows a calm,
 * final note). Any other error stays a retryable 'failed'.
 *
 * Fix (3): submit_with_evidence / submit_without_evidence are emitted ONLY after the report is
 * created (201); on a create failure only submit_failed is emitted (never a submit_* success).
 */
import { describe, it, expect } from 'vitest';
import {
  submitReport,
  type ReportSubmission,
  type SubmitDeps,
} from '../features/moderation/report/submit';
import {
  classifyEvidenceError,
  EvidenceError,
  type EvidenceTransport,
} from '../features/moderation/report/evidence-api';
import { ReportCategory } from '../features/moderation/report/categories';
import type { CreateReportResponse } from '../api/rest';
import type { SourceMessage } from '../features/moderation/report/window-selection';

const NOW = Date.parse('2026-10-26T12:00:00.000Z');

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const okReport = (over: Partial<CreateReportResponse> = {}): CreateReportResponse => ({
  reportId: 'b3f1c2de-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
  severity: 'high',
  evidenceAllowed: true,
  ...over,
});

const messages = (): SourceMessage[] => [
  { messageId: 'm1', sentAtMs: NOW - 2000, senderSide: 'reporter', text: 'hello' },
  { messageId: 'm2', sentAtMs: NOW - 1000, senderSide: 'reported', text: 'stop messaging me' },
];

const withEvidence = (over: Partial<ReportSubmission> = {}): ReportSubmission => ({
  reportedUserId: 'user-reported-123',
  category: ReportCategory.HARASSMENT,
  details: 'they kept messaging',
  alsoBlock: true,
  conversationId: 'match-abc',
  source: 'chat',
  shareEvidence: true,
  messages: messages(),
  ...over,
});

/** A transport whose presign returns a given status+code; PUT/complete succeed if reached. */
function presignFailingTransport(status: number, code: string): EvidenceTransport {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith('/evidence/presign')) return jsonResponse(status, { code });
    if (url.endsWith('/evidence/complete')) return jsonResponse(200, { evidenceId: 'ev', status: 'recorded', idempotent: false });
    if ((init?.method ?? 'GET') === 'PUT') return new Response(null, { status: 200 });
    throw new Error(`unexpected ${url}`);
  }) as unknown as typeof fetch;
  return { baseUrl: 'https://x/moderation', fetchImpl, getToken: async () => 't', sleep: async () => {} };
}

/** A transport that presigns + PUTs fine but whose complete returns a given status+code. */
function completeResultTransport(status: number, body: unknown): EvidenceTransport {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith('/evidence/presign'))
      return jsonResponse(200, {
        evidenceId: 'ev',
        upload: { url: 'https://s3/pending/ev.json?sig', method: 'PUT', headers: { 'x-amz-checksum-sha256': 'h' } },
        expiresAt: NOW + 900_000,
      });
    if (url.endsWith('/evidence/complete')) return jsonResponse(status, body);
    if ((init?.method ?? 'GET') === 'PUT') return new Response(null, { status: 200 });
    throw new Error(`unexpected ${url}`);
  }) as unknown as typeof fetch;
  return { baseUrl: 'https://x/moderation', fetchImpl, getToken: async () => 't', sleep: async () => {} };
}

describe('classifyEvidenceError', () => {
  it('maps 409 EVIDENCE_ALREADY_COMPLETED to attached', () => {
    expect(classifyEvidenceError(new EvidenceError('x', 409, 'EVIDENCE_ALREADY_COMPLETED'))).toBe('attached');
  });

  it('maps the terminal codes to terminal', () => {
    for (const code of ['EVIDENCE_DISABLED', 'EVIDENCE_NOT_OFFERED', 'REPORT_TOO_OLD', 'NOT_REPORTER']) {
      expect(classifyEvidenceError(new EvidenceError('x', 409, code))).toBe('terminal');
    }
  });

  it('returns null for transient / unknown errors (stay retryable)', () => {
    expect(classifyEvidenceError(new EvidenceError('net', 0, 'NETWORK_ERROR'))).toBeNull();
    expect(classifyEvidenceError(new EvidenceError('finalize', 503, 'EVIDENCE_FINALIZE_RETRY'))).toBeNull();
    expect(classifyEvidenceError(new Error('plain'))).toBeNull();
  });
});

describe('submitReport — evidence outcomes (fix 1)', () => {
  it('treats 409 EVIDENCE_ALREADY_COMPLETED on presign as attached', async () => {
    const events: string[] = [];
    const deps: SubmitDeps = {
      createReport: async () => okReport(),
      evidence: presignFailingTransport(409, 'EVIDENCE_ALREADY_COMPLETED'),
      telemetry: ((e: string) => events.push(e)) as SubmitDeps['telemetry'],
      nowMs: () => NOW,
    };
    const res = await submitReport(withEvidence(), deps);
    expect(res.evidenceOutcome).toBe('attached');
    expect(events).toContain('report.evidence_upload_succeeded');
    expect(events).not.toContain('report.evidence_upload_failed');
  });

  it('treats an idempotent complete as attached', async () => {
    const deps: SubmitDeps = {
      createReport: async () => okReport(),
      evidence: completeResultTransport(200, { evidenceId: 'ev', status: 'recorded', idempotent: true }),
      nowMs: () => NOW,
    };
    const res = await submitReport(withEvidence(), deps);
    expect(res.evidenceOutcome).toBe('attached');
  });

  it.each([
    ['EVIDENCE_DISABLED', 409],
    ['EVIDENCE_NOT_OFFERED', 409],
    ['REPORT_TOO_OLD', 409],
    ['NOT_REPORTER', 403],
  ])('maps terminal code %s to a terminal outcome with no upload telemetry', async (code, status) => {
    const events: string[] = [];
    const deps: SubmitDeps = {
      createReport: async () => okReport(),
      evidence: presignFailingTransport(status as number, code as string),
      telemetry: ((e: string) => events.push(e)) as SubmitDeps['telemetry'],
      nowMs: () => NOW,
    };
    const res = await submitReport(withEvidence(), deps);
    expect(res.evidenceOutcome).toBe('terminal');
    expect(events).not.toContain('report.evidence_upload_succeeded');
    expect(events).not.toContain('report.evidence_upload_failed');
  });

  it('keeps a transient failure retryable (failed) and never fails the report', async () => {
    const deps: SubmitDeps = {
      createReport: async () => okReport(),
      evidence: presignFailingTransport(500, 'INTERNAL'),
      nowMs: () => NOW,
    };
    const res = await submitReport(withEvidence(), deps);
    expect(res.reportId).toBeTruthy();
    expect(res.evidenceOutcome).toBe('failed');
  });
});

describe('submit telemetry ordering (fix 3)', () => {
  it('emits submit_with_evidence only AFTER the report is created', async () => {
    const seq: string[] = [];
    const deps: SubmitDeps = {
      createReport: async () => {
        seq.push('created');
        return okReport();
      },
      evidence: completeResultTransport(200, { evidenceId: 'ev', status: 'recorded', idempotent: false }),
      telemetry: ((e: string) => seq.push(e)) as SubmitDeps['telemetry'],
      nowMs: () => NOW,
    };
    await submitReport(withEvidence(), deps);
    expect(seq.indexOf('created')).toBeLessThan(seq.indexOf('report.submit_with_evidence'));
    // submit_with_evidence must not be emitted before creation.
    expect(seq[0]).toBe('created');
  });

  it('emits submit_without_evidence after creation when not sharing', async () => {
    const seq: string[] = [];
    const deps: SubmitDeps = {
      createReport: async () => {
        seq.push('created');
        return okReport();
      },
      telemetry: ((e: string) => seq.push(e)) as SubmitDeps['telemetry'],
      nowMs: () => NOW,
    };
    await submitReport(withEvidence({ shareEvidence: false, messages: undefined }), deps);
    expect(seq).toEqual(['created', 'report.submit_without_evidence']);
  });

  it('on a create failure emits ONLY submit_failed (no submit_with/without)', async () => {
    const seq: string[] = [];
    const err = Object.assign(new Error('boom'), { status: 500 });
    const deps: SubmitDeps = {
      createReport: async () => {
        throw err;
      },
      telemetry: ((e: string) => seq.push(e)) as SubmitDeps['telemetry'],
      nowMs: () => NOW,
    };
    await expect(submitReport(withEvidence(), deps)).rejects.toBe(err);
    expect(seq).toEqual(['report.submit_failed']);
  });
});
