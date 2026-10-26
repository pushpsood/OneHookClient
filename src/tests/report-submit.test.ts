/**
 * Report submit orchestration + evidence transport (OneHook moderation Phase 2).
 *
 * Covers: submit with and without evidence send IDENTICAL report fields except `evidenceOffered`;
 * evidence failure leaves the report filed; the 503 EVIDENCE_FINALIZE_RETRY backoff; MINOR_SAFETY
 * (evidenceAllowed:false) never uploads; and telemetry carries no text / user ids.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  submitReport,
  buildReportBody,
  type ReportSubmission,
  type SubmitDeps,
} from '../features/moderation/report/submit';
import {
  completeEvidence,
  EvidenceError,
  type EvidenceTransport,
} from '../features/moderation/report/evidence-api';
import { ReportCategory } from '../features/moderation/report/categories';
import type { CreateReportRequest, CreateReportResponse } from '../api/rest';
import type { SourceMessage } from '../features/moderation/report/window-selection';

const NOW = Date.parse('2026-10-26T12:00:00.000Z');

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const PRESIGN_BODY = {
  evidenceId: 'ev_test',
  upload: {
    url: 'https://evidence-bucket.s3.ap-south-1.amazonaws.com/pending/rep/ev_test.json?X-Amz-Signature=abc',
    method: 'PUT',
    headers: {
      'x-amz-checksum-sha256': 'PLACEHOLDER',
      'x-amz-server-side-encryption': 'aws:kms',
      'x-amz-server-side-encryption-aws-kms-key-id': 'arn:aws:kms:ap-south-1:1:key/evidence',
      'x-amz-tagging': 'state=pending',
    },
  },
  expiresAt: NOW + 900_000,
};

interface FetchLog {
  presign: number;
  put: number;
  complete: number;
  putHeaders: Record<string, string>[];
}

function makeTransport(
  completeResponder: () => Response,
  log: FetchLog,
  putResponder: () => Response = () => new Response(null, { status: 200 })
): EvidenceTransport {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url.endsWith('/evidence/presign')) {
      log.presign++;
      return jsonResponse(200, PRESIGN_BODY);
    }
    if (url.endsWith('/evidence/complete')) {
      log.complete++;
      return completeResponder();
    }
    if (method === 'PUT') {
      log.put++;
      log.putHeaders.push({ ...(init?.headers as Record<string, string>) });
      return putResponder();
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  }) as unknown as typeof fetch;

  return {
    baseUrl: 'https://admin.onehook.club/api/p/onehook/gamma/moderation',
    fetchImpl,
    getToken: async () => 'member-id-token',
    sleep: async () => {},
  };
}

function newLog(): FetchLog {
  return { presign: 0, put: 0, complete: 0, putHeaders: [] };
}

const okReport = (over: Partial<CreateReportResponse> = {}): CreateReportResponse => ({
  reportId: 'b3f1c2de-4a5b-4c6d-8e9f-0a1b2c3d4e5f',
  severity: 'high',
  evidenceAllowed: true,
  ...over,
});

const baseSubmission = (over: Partial<ReportSubmission> = {}): ReportSubmission => ({
  reportedUserId: 'user-reported-123',
  category: ReportCategory.HARASSMENT,
  details: 'they kept messaging after I asked them to stop',
  alsoBlock: true,
  conversationId: 'match-abc',
  source: 'chat',
  shareEvidence: false,
  ...over,
});

const sampleMessages = (): SourceMessage[] => [
  { messageId: 'm2', sentAtMs: NOW - 1000, senderSide: 'reported', text: 'stop messaging me' },
  { messageId: 'm1', sentAtMs: NOW - 2000, senderSide: 'reporter', text: 'hello' },
];

describe('buildReportBody', () => {
  it('sends identical fields except evidenceOffered', () => {
    const noShare = buildReportBody(baseSubmission({ shareEvidence: false }));
    const share = buildReportBody(baseSubmission({ shareEvidence: true, messages: sampleMessages() }));
    expect(noShare.evidenceOffered).toBe(false);
    expect(share.evidenceOffered).toBe(true);
    const stripEvidence = (b: CreateReportRequest) => ({ ...b, evidenceOffered: undefined });
    expect(stripEvidence(noShare)).toEqual(stripEvidence(share));
  });

  it('omits empty details and includes conversationId', () => {
    const b = buildReportBody(baseSubmission({ details: '   ', conversationId: 'match-xyz' }));
    expect(b.details).toBeUndefined();
    expect(b.conversationId).toBe('match-xyz');
  });
});

describe('submitReport — no evidence', () => {
  it('files the report and never touches the evidence transport', async () => {
    const bodies: CreateReportRequest[] = [];
    const log = newLog();
    const deps: SubmitDeps = {
      createReport: async (b) => {
        bodies.push(b);
        return okReport();
      },
      evidence: makeTransport(() => jsonResponse(200, { evidenceId: 'ev_test', status: 'recorded', idempotent: false }), log),
      nowMs: () => NOW,
    };
    const res = await submitReport(baseSubmission({ shareEvidence: false }), deps);
    expect(res.evidenceOutcome).toBe('skipped');
    expect(res.blocked).toBe(true);
    expect(res.reportId).toBe('b3f1c2de-4a5b-4c6d-8e9f-0a1b2c3d4e5f');
    expect(bodies[0].evidenceOffered).toBe(false);
    expect(log.presign + log.put + log.complete).toBe(0);
  });
});

describe('submitReport — with evidence', () => {
  it('files the report then presigns, PUTs the exact bytes and completes', async () => {
    const log = newLog();
    const deps: SubmitDeps = {
      createReport: async () => okReport(),
      evidence: makeTransport(() => jsonResponse(200, { evidenceId: 'ev_test', status: 'recorded', idempotent: false }), log),
      nowMs: () => NOW,
    };
    const res = await submitReport(baseSubmission({ shareEvidence: true, messages: sampleMessages() }), deps);
    expect(res.evidenceOutcome).toBe('attached');
    expect(log.presign).toBe(1);
    expect(log.put).toBe(1);
    expect(log.complete).toBe(1);
    // PUT carries the SSE-KMS + checksum headers the presign returned.
    expect(log.putHeaders[0]['x-amz-server-side-encryption']).toBe('aws:kms');
    expect(log.putHeaders[0]['x-amz-checksum-sha256']).toBeTruthy();
    expect(log.putHeaders[0]['Authorization']).toBeUndefined();
  });

  it('does not upload when the server disallows evidence (e.g. MINOR_SAFETY)', async () => {
    const log = newLog();
    const deps: SubmitDeps = {
      createReport: async () => okReport({ evidenceAllowed: false }),
      evidence: makeTransport(() => jsonResponse(200, { evidenceId: 'ev_test', status: 'recorded', idempotent: false }), log),
      nowMs: () => NOW,
    };
    const res = await submitReport(
      baseSubmission({ category: ReportCategory.MINOR_SAFETY, shareEvidence: true, messages: sampleMessages() }),
      deps
    );
    expect(res.evidenceOutcome).toBe('not_allowed');
    expect(log.presign).toBe(0);
  });

  it('leaves the report FILED when the evidence upload fails', async () => {
    const log = newLog();
    const deps: SubmitDeps = {
      createReport: async () => okReport(),
      evidence: makeTransport(
        () => jsonResponse(200, { evidenceId: 'ev_test', status: 'recorded', idempotent: false }),
        log,
        () => new Response('denied', { status: 403 }) // PUT fails
      ),
      nowMs: () => NOW,
    };
    const res = await submitReport(baseSubmission({ shareEvidence: true, messages: sampleMessages() }), deps);
    // Report succeeded; evidence failed, non-blocking.
    expect(res.reportId).toBeTruthy();
    expect(res.evidenceOutcome).toBe('failed');
  });
});

describe('completeEvidence — 503 EVIDENCE_FINALIZE_RETRY backoff', () => {
  it('retries the finalize on 503 then succeeds', async () => {
    const log = newLog();
    let n = 0;
    const transport = makeTransport(() => {
      n++;
      if (n <= 2) return jsonResponse(503, { code: 'EVIDENCE_FINALIZE_RETRY', message: 'finalizing' });
      return jsonResponse(200, { evidenceId: 'ev_test', status: 'recorded', idempotent: false });
    }, log);
    const sleeps: number[] = [];
    const res = await completeEvidence(
      { ...transport, sleep: async (ms) => void sleeps.push(ms) },
      { reportId: 'r', evidenceId: 'ev_test', messageIds: ['m1'], firstSentAt: NOW - 2000, lastSentAt: NOW },
      { baseDelayMs: 10, maxDelayMs: 100 }
    );
    expect(res.status).toBe('recorded');
    expect(log.complete).toBe(3);
    expect(sleeps).toEqual([10, 20]); // exponential backoff, two retries
  });

  it('gives up after maxRetries and throws', async () => {
    const log = newLog();
    const transport = makeTransport(
      () => jsonResponse(503, { code: 'EVIDENCE_FINALIZE_RETRY' }),
      log
    );
    await expect(
      completeEvidence(
        { ...transport, sleep: async () => {} },
        { reportId: 'r', evidenceId: 'ev_test', messageIds: ['m1'], firstSentAt: NOW, lastSentAt: NOW },
        { maxRetries: 2, baseDelayMs: 1 }
      )
    ).rejects.toBeInstanceOf(EvidenceError);
    expect(log.complete).toBe(3); // first + 2 retries
  });

  it('does NOT retry a non-retryable error', async () => {
    const log = newLog();
    const transport = makeTransport(() => jsonResponse(409, { code: 'EVIDENCE_ALREADY_COMPLETED' }), log);
    await expect(
      completeEvidence(
        { ...transport, sleep: async () => {} },
        { reportId: 'r', evidenceId: 'ev_test', messageIds: ['m1'], firstSentAt: NOW, lastSentAt: NOW }
      )
    ).rejects.toMatchObject({ status: 409, code: 'EVIDENCE_ALREADY_COMPLETED' });
    expect(log.complete).toBe(1);
  });
});

describe('submitReport — report failure propagates', () => {
  it('rethrows the report error and emits submit_failed (429 preserved)', async () => {
    const events: { event: string; attrs: Record<string, unknown> }[] = [];
    const err = Object.assign(new Error('rate limited'), { status: 429 });
    const deps: SubmitDeps = {
      createReport: async () => {
        throw err;
      },
      telemetry: ((event: string, attrs: Record<string, unknown>) => events.push({ event, attrs })) as SubmitDeps['telemetry'],
    };
    await expect(submitReport(baseSubmission({ shareEvidence: false }), deps)).rejects.toBe(err);
    expect(events.some((e) => e.event === 'report.submit_failed')).toBe(true);
  });
});

describe('report telemetry carries no text / user ids', () => {
  it('only ever emits the whitelisted scalar dimensions', async () => {
    const events: { event: string; attrs: Record<string, unknown> }[] = [];
    const log = newLog();
    const deps: SubmitDeps = {
      createReport: async () => okReport(),
      evidence: makeTransport(() => jsonResponse(200, { evidenceId: 'ev_test', status: 'recorded', idempotent: false }), log),
      telemetry: ((event: string, attrs: Record<string, unknown>) => events.push({ event, attrs })) as SubmitDeps['telemetry'],
      nowMs: () => NOW,
    };
    const sub = baseSubmission({
      shareEvidence: true,
      messages: sampleMessages(),
      details: 'SECRET free text that must never leave the device',
      reportedUserId: 'user-reported-123',
    });
    await submitReport(sub, deps);

    expect(events.length).toBeGreaterThan(0);
    const allowed = new Set(['event', 'category', 'source', 'evidence']);
    for (const { attrs } of events) {
      for (const [k, v] of Object.entries(attrs)) {
        expect(allowed.has(k)).toBe(true);
        // no value is free text, the reported user id, or message content
        expect(v).not.toBe(sub.details);
        expect(v).not.toBe(sub.reportedUserId);
        if (typeof v === 'string') expect(v).not.toContain('hello');
      }
    }
    // the submit + upload success were both reported
    expect(events.map((e) => e.event)).toContain('report.submit_with_evidence');
    expect(events.map((e) => e.event)).toContain('report.evidence_upload_succeeded');
  });
});
