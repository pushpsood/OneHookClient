/**
 * Report flow telemetry — whitelist + no-PII (OneHook moderation Phase 2).
 *
 * The report_flow signal must carry ONLY the scalar dimensions event / category / source / evidence,
 * and never free text, user ids or message content.
 */
import { describe, it, expect } from 'vitest';
import {
  buildReportSignalAttributes,
  ReportEvent,
} from '../features/moderation/report/telemetry';
import { ReportCategory } from '../features/moderation/report/categories';

describe('buildReportSignalAttributes', () => {
  it('always includes the event id', () => {
    expect(buildReportSignalAttributes(ReportEvent.REPORT_OPEN)).toEqual({ event: 'report.open' });
  });

  it('includes only the whitelisted scalar dimensions', () => {
    const attrs = buildReportSignalAttributes(ReportEvent.REPORT_SUBMIT_WITH_EVIDENCE, {
      category: ReportCategory.HARASSMENT,
      source: 'chat',
      evidence: true,
    });
    expect(attrs).toEqual({
      event: 'report.submit_with_evidence',
      category: 'HARASSMENT',
      source: 'chat',
      evidence: true,
    });
    for (const [k, v] of Object.entries(attrs)) {
      expect(['event', 'category', 'source', 'evidence']).toContain(k);
      expect(['string', 'boolean']).toContain(typeof v);
    }
  });

  it('omits undefined dimensions and never carries arbitrary keys', () => {
    const attrs = buildReportSignalAttributes(ReportEvent.REPORT_NOT_REPORTABLE_SHOWN, { source: 'profile' });
    expect(attrs).toEqual({ event: 'report.not_reportable_shown', source: 'profile' });
    // no way to smuggle a free-text / id key through the builder
    expect(Object.keys(attrs).sort()).toEqual(['event', 'source']);
  });

  it('maps every report_flow event id to the catalog values', () => {
    expect(Object.values(ReportEvent)).toContain('report.open');
    expect(Object.values(ReportEvent)).toContain('report.evidence_upload_failed');
    expect(Object.values(ReportEvent)).toContain('report.nudge_shown');
  });
});
