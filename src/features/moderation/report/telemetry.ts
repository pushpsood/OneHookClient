/**
 * Report flow telemetry (OneHook moderation Phase 2).
 *
 * The report flow mixes button presses, "shown" impressions and upload outcomes, so the backend
 * catalog models it as a dedicated `report_flow` SIGNAL (not `ui_interaction`) — see the ReportEvent
 * doc in the generated catalog. This helper is the ONLY place the flow emits telemetry.
 *
 * HARD PRIVACY RULE: a report_flow signal may carry ONLY these scalar dimensions:
 *   - event    : the ReportEvent id (which step)
 *   - category : the ReportCategory code (never free text)
 *   - source   : chat | profile (where the flow started)
 *   - evidence : boolean (whether the decrypted chat was offered), on submit
 * It MUST NEVER carry message text, user ids, the reported person, or the report's free-text
 * details. `buildReportSignalAttributes` is pure and whitelists exactly those keys so a mistake is
 * caught by a unit test, and the analytics client additionally strips any denylisted key.
 */
import { track, ReportEvent, type ReportCategory, type ReportSource } from '../../../lib/analytics/analytics';

export { ReportEvent };
export type { ReportCategory, ReportSource };

export interface ReportTelemetryAttrs {
  category?: ReportCategory;
  source?: ReportSource;
  evidence?: boolean;
}

/**
 * Build the scalar attribute bag for a report_flow signal. Only the whitelisted dimensions survive;
 * `undefined` values are omitted. Returned values are always enum strings or a boolean — never free
 * text, user ids or message content.
 */
export function buildReportSignalAttributes(
  event: ReportEvent,
  attrs: ReportTelemetryAttrs = {}
): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { event };
  if (attrs.category !== undefined) out.category = attrs.category;
  if (attrs.source !== undefined) out.source = attrs.source;
  if (attrs.evidence !== undefined) out.evidence = attrs.evidence;
  return out;
}

/** Emit one report_flow signal. No-op unless analytics is enabled + consented (handled downstream). */
export function trackReport(event: ReportEvent, attrs: ReportTelemetryAttrs = {}): void {
  track('report_flow', buildReportSignalAttributes(event, attrs));
}
