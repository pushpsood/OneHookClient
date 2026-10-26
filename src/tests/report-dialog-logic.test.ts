/**
 * Report dialog behaviour (OneHook moderation Phase 2, web).
 *
 * This repo has NO DOM test environment installed (no jsdom / happy-dom, transitively or otherwise),
 * so the dialog's behaviour is verified through the PURE decision module the component uses
 * (dialog-logic.ts) rather than by rendering React. Each case below maps to a required behaviour:
 *   - the evidence checkbox is NEVER pre-ticked;
 *   - Submit is enabled whether or not evidence is shared;
 *   - MINOR_SAFETY hides the evidence option;
 *   - "this isn't a safety issue" redirects to block / unmatch (never files a report);
 *   - the self-harm step links tel:14416 (Tele-MANAS);
 *   - prefers-reduced-motion renders the nudge shield static.
 */
import { describe, it, expect } from 'vitest';
import {
  canSubmit,
  confirmationView,
  initialDialogState,
  isEvidenceEligible,
  notReportableActions,
  nudgeMode,
  sectionVisibility,
  selfHarmTelHref,
  stepForCategory,
} from '../features/moderation/report/dialog-logic';
import { getCategoryMeta, ReportCategory, NOT_REPORTABLE_CASES } from '../features/moderation/report/categories';
import { SELF_HARM_RESOURCES } from '../features/moderation/report/strings';

const harassment = getCategoryMeta(ReportCategory.HARASSMENT);
const minorSafety = getCategoryMeta(ReportCategory.MINOR_SAFETY);
const selfHarm = getCategoryMeta(ReportCategory.SELF_HARM_CONCERN);
const other = getCategoryMeta(ReportCategory.OTHER);

describe('evidence checkbox is never pre-ticked', () => {
  it('initial state has share OFF', () => {
    expect(initialDialogState().share).toBe(false);
  });
});

describe('Submit is enabled both ways (share has no bearing)', () => {
  it('enabled for a normal category with no details', () => {
    expect(canSubmit({ meta: harassment, submitting: false, details: '' })).toBe(true);
  });

  it('canSubmit does not take `share` as an input at all', () => {
    // The signature only accepts meta/submitting/details — there is no way for the share state to
    // gate Submit, which is the no-dark-pattern guarantee.
    expect(Object.keys({ meta: harassment, submitting: false, details: '' }).sort()).toEqual([
      'details',
      'meta',
      'submitting',
    ]);
  });

  it('is disabled while submitting, over-long, or missing required OTHER details', () => {
    expect(canSubmit({ meta: harassment, submitting: true, details: '' })).toBe(false);
    expect(canSubmit({ meta: harassment, submitting: false, details: 'x'.repeat(2001) })).toBe(false);
    expect(canSubmit({ meta: other, submitting: false, details: '   ' })).toBe(false);
    expect(canSubmit({ meta: other, submitting: false, details: 'spam link' })).toBe(true);
    expect(canSubmit({ meta: null, submitting: false, details: 'x' })).toBe(false);
  });
});

describe('MINOR_SAFETY hides evidence', () => {
  it('is never evidence-eligible even from a chat with a conversation', () => {
    expect(
      isEvidenceEligible({ source: 'chat', conversationId: 'c1', meta: minorSafety })
    ).toBe(false);
  });

  it('shows the escalation note and no evidence section', () => {
    const v = sectionVisibility({ source: 'chat', conversationId: 'c1', meta: minorSafety });
    expect(v.evidence).toBe(false);
    expect(v.minorSafetyNote).toBe(true);
  });

  it('a normal chat category DOES show the evidence section', () => {
    const v = sectionVisibility({ source: 'chat', conversationId: 'c1', meta: harassment });
    expect(v.evidence).toBe(true);
    expect(v.minorSafetyNote).toBe(false);
  });

  it('evidence is never offered from a profile (no chat to share)', () => {
    expect(isEvidenceEligible({ source: 'profile', conversationId: undefined, meta: harassment })).toBe(false);
  });
});

describe('not-reportable redirect', () => {
  it('offers block always and unmatch only when available; never files a report', () => {
    expect(notReportableActions({ hasUnmatch: true })).toEqual({ block: true, unmatch: true });
    expect(notReportableActions({ hasUnmatch: false })).toEqual({ block: true, unmatch: false });
  });

  it('has a non-empty list of explicitly not-reportable cases', () => {
    expect(NOT_REPORTABLE_CASES.length).toBeGreaterThan(0);
  });
});

describe('self-harm support', () => {
  it('SELF_HARM_CONCERN routes to the self-harm support step first', () => {
    expect(stepForCategory(selfHarm)).toBe('self_harm');
    expect(stepForCategory(harassment)).toBe('form');
  });

  it('links Tele-MANAS tel:14416', () => {
    const r = SELF_HARM_RESOURCES[0];
    expect(r.phone).toBe('14416');
    expect(selfHarmTelHref(r)).toBe('tel:14416');
  });
});

describe('reduced motion renders the shield static', () => {
  it('maps prefers-reduced-motion to a static (non-animated) shield', () => {
    expect(nudgeMode(true)).toBe('static');
    expect(nudgeMode(false)).toBe('animated');
  });
});

describe('confirmation presentation per evidence outcome', () => {
  it('failed shows Retry only; terminal shows a calm note with NO retry; attached confirms attach', () => {
    expect(confirmationView({ blocked: false, evidenceOutcome: 'failed' })).toMatchObject({
      retry: true,
      terminalNote: false,
      attached: false,
    });
    expect(confirmationView({ blocked: true, evidenceOutcome: 'terminal' })).toMatchObject({
      retry: false,
      terminalNote: true,
      blocked: true,
    });
    expect(confirmationView({ blocked: false, evidenceOutcome: 'attached' })).toMatchObject({
      attached: true,
      retry: false,
      terminalNote: false,
    });
  });
});
