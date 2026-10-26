/**
 * Report dialog decision logic (OneHook moderation Phase 2, web) — PURE, no DOM.
 *
 * The behavioural rules of {@link ReportFlowDialog} (docs/MODERATION.md §2 + §9) live here as pure
 * functions so they can be unit-tested WITHOUT a browser DOM test environment (this repo has none
 * installed; see the moderation task notes). The component imports and uses these — it owns only the
 * React state plumbing and markup, never the rules — so a test of this module is a test of the real
 * behaviour the component ships.
 *
 * Hard rules encoded here:
 *  - the evidence share checkbox is NEVER pre-ticked (`initialDialogState().share === false`);
 *  - Submit is enabled whether or not evidence is shared (`canSubmit` never reads `share`);
 *  - MINOR_SAFETY hides the evidence option entirely and shows the "escalated immediately" note;
 *  - the "this isn't a safety issue" path redirects to block / unmatch, it never files a report;
 *  - SELF_HARM_CONCERN shows support resources (Tele-MANAS 14416) first;
 *  - prefers-reduced-motion renders the nudge shield as a STATIC icon (no animation).
 */
import { DETAILS_MAX_CHARS, type CategoryMeta } from './categories';
import type { SupportResource } from './strings';
import type { EvidenceOutcome } from './submit';
import type { ReportSource } from './telemetry';

export type Step = 'category' | 'not_reportable' | 'self_harm' | 'form' | 'preview' | 'confirmation';

export interface DialogState {
  step: Step;
  category: null;
  details: string;
  alsoBlock: boolean;
  /** The decrypted-chat share checkbox. NEVER pre-ticked. */
  share: boolean;
}

/** The clean state the dialog resets to every time it opens. `share` is always OFF. */
export function initialDialogState(): DialogState {
  return { step: 'category', category: null, details: '', alsoBlock: true, share: false };
}

/**
 * Whether the decrypted-chat evidence option may be offered. Only from a chat (we need a
 * conversation to share), only for a category the server will accept evidence for, and NEVER for
 * MINOR_SAFETY (escalated immediately; evidence hidden entirely — §9.1).
 */
export function isEvidenceEligible(args: {
  source: ReportSource;
  conversationId?: string;
  meta: CategoryMeta | null;
}): boolean {
  const { source, conversationId, meta } = args;
  return source === 'chat' && !!conversationId && !!meta && meta.evidenceEligible && !meta.minorSafety;
}

/** Whether the free-text details field is mandatory for the chosen category (OTHER only). */
export function detailsRequired(meta: CategoryMeta | null): boolean {
  return !!meta?.requiresDetails;
}

/** Whether the details field exceeds the backend cap. */
export function detailsTooLong(details: string): boolean {
  return details.length > DETAILS_MAX_CHARS;
}

/**
 * Whether Submit is enabled. Deliberately INDEPENDENT of `share`: the report is accepted identically
 * whether or not evidence is attached (no dark patterns). Blocked only by a missing category, an
 * in-flight submit, an over-long details field, or missing required details.
 */
export function canSubmit(args: {
  meta: CategoryMeta | null;
  submitting: boolean;
  details: string;
}): boolean {
  const { meta, submitting, details } = args;
  if (!meta || submitting) return false;
  if (detailsTooLong(details)) return false;
  if (detailsRequired(meta) && details.trim().length === 0) return false;
  return true;
}

export interface SectionVisibility {
  /** The evidence share section (nudge + checkbox + preview). */
  evidence: boolean;
  /** The "escalated immediately, nothing to attach" note (MINOR_SAFETY). */
  minorSafetyNote: boolean;
}

/** Which conditional sections of the form step are visible for the chosen category / source. */
export function sectionVisibility(args: {
  source: ReportSource;
  conversationId?: string;
  meta: CategoryMeta | null;
}): SectionVisibility {
  const { meta } = args;
  return {
    evidence: isEvidenceEligible(args),
    minorSafetyNote: !!meta?.minorSafety,
  };
}

/** The step a chosen category routes to: self-harm support first, otherwise straight to the form. */
export function stepForCategory(meta: CategoryMeta): Extract<Step, 'self_harm' | 'form'> {
  return meta.selfHarm ? 'self_harm' : 'form';
}

/** The default for the "Also block this person" toggle for a category. */
export function alsoBlockDefaultFor(meta: CategoryMeta): boolean {
  return meta.alsoBlockDefault;
}

export type NudgeMode = 'static' | 'animated';

/** prefers-reduced-motion renders the shield as a static icon; otherwise it animates once (~1s). */
export function nudgeMode(reducedMotion: boolean): NudgeMode {
  return reducedMotion ? 'static' : 'animated';
}

/** `tel:` href for a self-harm support resource (e.g. Tele-MANAS 14416 -> `tel:14416`). */
export function selfHarmTelHref(resource: SupportResource): string {
  return `tel:${resource.phone}`;
}

/** The actions offered on the "this isn't a safety issue" redirect (never files a report). */
export function notReportableActions(args: { hasUnmatch: boolean }): {
  block: boolean;
  unmatch: boolean;
} {
  return { block: true, unmatch: args.hasUnmatch };
}

export interface ConfirmationView {
  /** "The chat was attached" line. */
  attached: boolean;
  /** "You've also blocked this person" line. */
  blocked: boolean;
  /** Non-blocking failure box WITH a Retry affordance. */
  retry: boolean;
  /** Calm, FINAL note with NO Retry (terminal evidence outcome). */
  terminalNote: boolean;
}

/**
 * How the confirmation screen presents an evidence outcome. `failed` is the only state that offers
 * Retry; `terminal` shows a calm final note with no Retry; `attached` confirms the attach.
 */
export function confirmationView(args: {
  blocked: boolean;
  evidenceOutcome: EvidenceOutcome;
}): ConfirmationView {
  const { blocked, evidenceOutcome } = args;
  return {
    attached: evidenceOutcome === 'attached',
    blocked,
    retry: evidenceOutcome === 'failed',
    terminalNote: evidenceOutcome === 'terminal',
  };
}
