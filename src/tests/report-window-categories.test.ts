/**
 * Evidence window selection + category rules (OneHook moderation Phase 2).
 */
import { describe, it, expect } from 'vitest';
import {
  selectEvidenceWindow,
  toIsoUtcMillis,
  type SourceMessage,
} from '../features/moderation/report/window-selection';
import {
  REPORT_CATEGORIES,
  getCategoryMeta,
  ReportCategory,
  NOT_REPORTABLE_CASES,
  DETAILS_MAX_CHARS,
} from '../features/moderation/report/categories';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-26T12:00:00.000Z');

function msg(id: string, offsetMs: number, side: 'reporter' | 'reported', text: string | null): SourceMessage {
  return { messageId: id, sentAtMs: NOW + offsetMs, senderSide: side, text };
}

describe('selectEvidenceWindow', () => {
  it('sorts oldest-first by sentAt then messageId and maps to ISO-8601 UTC ms', () => {
    const out = selectEvidenceWindow(
      [
        msg('b', -1000, 'reported', 'second'),
        msg('a', -2000, 'reporter', 'first'),
      ],
      { nowMs: NOW }
    );
    expect(out.map((m) => m.messageId)).toEqual(['a', 'b']);
    expect(out[0]).toEqual({
      messageId: 'a',
      sentAt: toIsoUtcMillis(NOW - 2000),
      senderSide: 'reporter',
      text: 'first',
    });
    // ISO format has millisecond precision and a Z suffix
    expect(out[0].sentAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('breaks sentAt ties by messageId (lexicographic)', () => {
    const out = selectEvidenceWindow(
      [msg('b', 0, 'reported', 'two'), msg('a', 0, 'reporter', 'one')],
      { nowMs: NOW }
    );
    expect(out.map((m) => m.messageId)).toEqual(['a', 'b']);
  });

  it('skips undecryptable and system/media (null text) messages', () => {
    const out = selectEvidenceWindow(
      [
        msg('ok', -1000, 'reporter', 'keep me'),
        { ...msg('undec', -900, 'reported', 'x'), undecryptable: true },
        msg('system', -800, 'reported', null),
      ],
      { nowMs: NOW }
    );
    expect(out.map((m) => m.messageId)).toEqual(['ok']);
  });

  it('skips framed structured payloads (attachment / call signal) but keeps ordinary text', () => {
    const out = selectEvidenceWindow(
      [
        msg('ok', -1000, 'reporter', 'line one\nline two \u{1F600}'),
        msg('att', -900, 'reported', '\u0001{"contentKey":"SECRET"}'),
        msg('call', -800, 'reported', '\u0002{"sdp":"v=0"}'),
        msg('ctl', -700, 'reported', '\u0003other'),
      ],
      { nowMs: NOW }
    );
    expect(out.map((m) => m.messageId)).toEqual(['ok']);
  });

  it('applies the 30-day cap', () => {
    const out = selectEvidenceWindow(
      [
        msg('old', -31 * DAY, 'reported', 'too old'),
        msg('edge', -29 * DAY, 'reporter', 'inside'),
        msg('fresh', -1000, 'reported', 'inside'),
      ],
      { nowMs: NOW, maxDays: 30 }
    );
    expect(out.map((m) => m.messageId)).toEqual(['edge', 'fresh']);
  });

  it('keeps only the most recent 200 messages', () => {
    const many: SourceMessage[] = [];
    for (let i = 0; i < 250; i++) many.push(msg(`m${String(i).padStart(3, '0')}`, -(250 - i) * 1000, 'reporter', `t${i}`));
    const out = selectEvidenceWindow(many, { nowMs: NOW });
    expect(out).toHaveLength(200);
    // The oldest 50 (m000..m049) are dropped; m050 is the first kept.
    expect(out[0].messageId).toBe('m050');
    expect(out[out.length - 1].messageId).toBe('m249');
  });

  it('returns an empty window when nothing is eligible', () => {
    expect(selectEvidenceWindow([], { nowMs: NOW })).toEqual([]);
    expect(
      selectEvidenceWindow([{ ...msg('u', -1, 'reporter', 'x'), undecryptable: true }], { nowMs: NOW })
    ).toEqual([]);
  });
});

describe('report categories', () => {
  it('has exactly the 11 backend categories', () => {
    expect(REPORT_CATEGORIES.map((c) => c.code).sort()).toEqual(
      [
        'FAKE_IMPERSONATION',
        'HARASSMENT',
        'HATE',
        'MINOR_SAFETY',
        'OFF_PLATFORM_HARM',
        'OTHER',
        'SCAM_FRAUD',
        'SELF_HARM_CONCERN',
        'SEXUAL_CONTENT_NONCONSENT',
        'SPAM_PROMOTION',
        'THREATS_VIOLENCE',
      ].sort()
    );
  });

  it('every category has a short title and a one-line description', () => {
    for (const c of REPORT_CATEGORIES) {
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.description.length).toBeGreaterThan(0);
    }
  });

  it('OTHER requires details; no other category does', () => {
    for (const c of REPORT_CATEGORIES) {
      expect(c.requiresDetails).toBe(c.code === ReportCategory.OTHER);
    }
    expect(DETAILS_MAX_CHARS).toBe(2000);
  });

  it('alsoBlock defaults ON except SELF_HARM_CONCERN (OFF)', () => {
    expect(getCategoryMeta(ReportCategory.SELF_HARM_CONCERN).alsoBlockDefault).toBe(false);
    for (const c of REPORT_CATEGORIES) {
      if (c.code !== ReportCategory.SELF_HARM_CONCERN) expect(c.alsoBlockDefault).toBe(true);
    }
  });

  it('MINOR_SAFETY is the only category that hides evidence; SELF_HARM allows it', () => {
    expect(getCategoryMeta(ReportCategory.MINOR_SAFETY).evidenceEligible).toBe(false);
    expect(getCategoryMeta(ReportCategory.MINOR_SAFETY).minorSafety).toBe(true);
    expect(getCategoryMeta(ReportCategory.SELF_HARM_CONCERN).evidenceEligible).toBe(true);
    for (const c of REPORT_CATEGORIES) {
      if (c.code !== ReportCategory.MINOR_SAFETY) expect(c.evidenceEligible).toBe(true);
    }
  });

  it('only SELF_HARM_CONCERN is flagged as the self-harm support route', () => {
    for (const c of REPORT_CATEGORIES) {
      expect(c.selfHarm).toBe(c.code === ReportCategory.SELF_HARM_CONCERN);
    }
  });

  it('lists the not-reportable cases', () => {
    expect(NOT_REPORTABLE_CASES.length).toBeGreaterThanOrEqual(5);
  });
});
