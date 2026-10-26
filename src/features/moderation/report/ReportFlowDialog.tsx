/**
 * Member report flow dialog (OneHook moderation Phase 2, web).
 *
 * Steps: category picker (11 categories + "This isn't a safety issue") -> optional self-harm support
 * -> details + also-block + optional decrypted-chat evidence -> submit -> confirmation. Evidence is
 * offered ONLY from a chat and only when the category is not MINOR_SAFETY, is never pre-ticked, and
 * declining is treated identically to sharing (no dark patterns). Evidence failure never fails the
 * report.
 *
 * Telemetry is the backend `report_flow` SIGNAL (see telemetry.ts / the catalog ReportEvent doc), not
 * ui_interaction — so the flow's controls carry `data-track-exempt` (the no-untracked-control guard's
 * sanctioned escape) with the meaningful presses emitting a report_flow signal in-handler.
 *
 * Accessibility: focus trap + Escape to close, aria-live status region, and prefers-reduced-motion
 * renders the nudge shield as a static icon.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, X, AlertTriangle, Phone, ChevronLeft, Check, ChevronRight } from 'lucide-react';
import { ApiError } from '../../../lib/api-client';
import {
  REPORT_CATEGORIES,
  getCategoryMeta,
  NOT_REPORTABLE_CASES,
  DETAILS_MAX_CHARS,
  ReportCategory,
  type CategoryMeta,
} from './categories';
import { REPORT_STRINGS as S, SELF_HARM_RESOURCES } from './strings';
import { trackReport, ReportEvent, type ReportSource } from './telemetry';
import {
  submitReport,
  uploadEvidence,
  type SubmitDeps,
  type SubmitResult,
} from './submit';
import {
  canSubmit as canSubmitDecision,
  confirmationView,
  detailsRequired as detailsRequiredFor,
  detailsTooLong as detailsTooLongFor,
  initialDialogState,
  isEvidenceEligible,
  nudgeMode,
  selfHarmTelHref,
  stepForCategory,
  type ConfirmationView,
} from './dialog-logic';
import { selectEvidenceWindow, type SourceMessage } from './window-selection';

type Step = 'category' | 'not_reportable' | 'self_harm' | 'form' | 'preview' | 'confirmation';

export interface ReportFlowDialogProps {
  open: boolean;
  onClose: () => void;
  source: ReportSource;
  /** Opaque id of the reported member (never shown in telemetry/logs). */
  reportedUserId: string;
  /** Display name, UI only. */
  reportedName: string;
  /** Match/conversation id — present only when started from a chat. */
  conversationId?: string;
  /** Decrypted source messages for evidence (chat only). */
  sourceMessages?: SourceMessage[];
  /** Existing block action (for the not-reportable redirect). */
  onRequestBlock?: () => void;
  /** Existing unmatch action (for the not-reportable redirect). */
  onRequestUnmatch?: () => void;
  /** Test seam: inject submit dependencies. */
  deps?: SubmitDeps;
  /** Test seam: force reduced motion. */
  forceReducedMotion?: boolean;
}

function usePrefersReducedMotion(force?: boolean): boolean {
  const [reduced, setReduced] = useState(force ?? false);
  useEffect(() => {
    if (force !== undefined) return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [force]);
  return reduced;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function ReportFlowDialog({
  open,
  onClose,
  source,
  reportedUserId,
  reportedName,
  conversationId,
  sourceMessages,
  onRequestBlock,
  onRequestUnmatch,
  deps,
  forceReducedMotion,
}: ReportFlowDialogProps) {
  const reducedMotion = usePrefersReducedMotion(forceReducedMotion);
  const panelRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);
  const [share, setShare] = useState(false); // NEVER pre-ticked
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [retrying, setRetrying] = useState(false);
  const nudgeShownRef = useRef(false);

  const meta: CategoryMeta | null = category ? getCategoryMeta(category) : null;

  // Evidence is only offered from a chat, with a non-MINOR_SAFETY category, when there is chat to share.
  const evidenceEligible = isEvidenceEligible({ source, conversationId, meta });

  const previewWindow = useMemo(
    () => (evidenceEligible ? selectEvidenceWindow(sourceMessages ?? []) : []),
    [evidenceEligible, sourceMessages]
  );

  // Reset to a clean state whenever the dialog opens, and emit report.open.
  useEffect(() => {
    if (!open) return;
    const init = initialDialogState();
    setStep(init.step);
    setCategory(init.category);
    setDetails(init.details);
    setAlsoBlock(init.alsoBlock);
    setShare(init.share); // NEVER pre-ticked
    setSubmitting(false);
    setError(null);
    setResult(null);
    nudgeShownRef.current = false;
    trackReport(ReportEvent.REPORT_OPEN, { source });
  }, [open, source]);

  // The nudge is shown once, when the evidence section first appears.
  useEffect(() => {
    if (open && step === 'form' && evidenceEligible && !nudgeShownRef.current) {
      nudgeShownRef.current = true;
      trackReport(ReportEvent.REPORT_NUDGE_SHOWN, { category: category ?? undefined, source });
    }
  }, [open, step, evidenceEligible, category, source]);

  // Focus trap + Escape.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const nodes = Array.from(
        panel.querySelectorAll(FOCUSABLE)
      ) as HTMLElement[];
      const visible = nodes.filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (visible.length === 0) return;
      const firstN = visible[0];
      const lastN = visible[visible.length - 1];
      if (e.shiftKey && document.activeElement === firstN) {
        e.preventDefault();
        lastN.focus();
      } else if (!e.shiftKey && document.activeElement === lastN) {
        e.preventDefault();
        firstN.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, step, onClose]);

  const chooseCategory = useCallback(
    (code: ReportCategory) => {
      setCategory(code);
      const m = getCategoryMeta(code);
      setAlsoBlock(m.alsoBlockDefault);
      trackReport(ReportEvent.REPORT_CATEGORY_SELECTED, { category: code, source });
      const next = stepForCategory(m);
      if (next === 'self_harm') {
        trackReport(ReportEvent.REPORT_SELF_HARM_RESOURCES_SHOWN, { category: code, source });
      }
      setStep(next);
    },
    [source]
  );

  const openNotReportable = useCallback(() => {
    trackReport(ReportEvent.REPORT_NOT_REPORTABLE_SHOWN, { source });
    setStep('not_reportable');
  }, [source]);

  const toggleShare = useCallback(
    (next: boolean) => {
      setShare(next);
      trackReport(ReportEvent.REPORT_EVIDENCE_TOGGLE, {
        category: category ?? undefined,
        source,
        evidence: next,
      });
    },
    [category, source]
  );

  const openPreview = useCallback(() => {
    trackReport(ReportEvent.REPORT_EVIDENCE_PREVIEW, { category: category ?? undefined, source });
    setStep('preview');
  }, [category, source]);

  const detailsRequired = detailsRequiredFor(meta);
  const detailsTooLong = detailsTooLongFor(details);
  const canSubmit = canSubmitDecision({ meta, submitting, details });

  const handleSubmit = useCallback(async () => {
    if (!meta || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await submitReport(
        {
          reportedUserId,
          category: meta.code,
          details,
          alsoBlock,
          conversationId: source === 'chat' ? conversationId : undefined,
          source,
          shareEvidence: evidenceEligible && share,
          messages: evidenceEligible && share ? sourceMessages : undefined,
        },
        deps
      );
      setResult(r);
      setStep('confirmation');
    } catch (err) {
      const status = err instanceof ApiError ? err.status : (err as { status?: number })?.status;
      setError(status === 429 ? S.rateLimited : S.submitError);
    } finally {
      setSubmitting(false);
    }
  }, [meta, canSubmit, reportedUserId, details, alsoBlock, conversationId, source, evidenceEligible, share, sourceMessages, deps]);

  const handleRetryEvidence = useCallback(async () => {
    if (!result) return;
    setRetrying(true);
    try {
      const outcome = await uploadEvidence(result.reportId, conversationId ?? '', sourceMessages ?? [], deps);
      if (outcome === 'attached') {
        trackReport(ReportEvent.REPORT_EVIDENCE_UPLOAD_SUCCEEDED, {
          category: category ?? undefined,
          source,
        });
      }
      setResult({ ...result, evidenceOutcome: outcome });
    } catch {
      trackReport(ReportEvent.REPORT_EVIDENCE_UPLOAD_FAILED, { category: category ?? undefined, source });
      setResult({ ...result, evidenceOutcome: 'failed' });
    } finally {
      setRetrying(false);
    }
  }, [result, conversationId, sourceMessages, deps, category, source]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 md:p-6"
        onClick={onClose}
        data-track-exempt="backdrop: click-away that closes the report dialog; the report flow is instrumented via the report_flow signal."
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={S.dialogTitle}
          className="w-full max-w-md bg-surface-card text-text border border-border shadow-2xl max-h-[88vh] flex flex-col rounded-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          data-track-exempt="backdrop: modal container; stops backdrop dismissal, not an interactive control."
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {step !== 'category' && step !== 'confirmation' && (
                <button
                  type="button"
                  onClick={() => setStep(step === 'form' && category && getCategoryMeta(category).selfHarm ? 'self_harm' : step === 'preview' ? 'form' : 'category')}
                  className="p-1 -ml-1 text-text-secondary hover:text-text cursor-pointer rounded-lg"
                  aria-label={S.back}
                  data-track-exempt="duplicate: in-flow back navigation; the report flow is instrumented via the report_flow signal, not ui_interaction."
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              <h2 className="text-lg font-bold text-text truncate">{S.dialogTitle}</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-text-secondary hover:text-text cursor-pointer rounded-lg"
              aria-label={S.close}
              data-track-exempt="duplicate: closes the report dialog; the report flow is instrumented via the report_flow signal, not ui_interaction."
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* aria-live status for non-blocking outcomes / errors */}
          <div aria-live="polite" className="sr-only">
            {error ?? (result ? S.confirmationHeading : '')}
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            {step === 'category' && (
              <CategoryStep onChoose={chooseCategory} onNotReportable={openNotReportable} />
            )}

            {step === 'not_reportable' && (
              <NotReportableStep
                onBlock={() => {
                  trackReport(ReportEvent.REPORT_NOT_REPORTABLE_BLOCK, { source });
                  onClose();
                  onRequestBlock?.();
                }}
                onUnmatch={
                  onRequestUnmatch
                    ? () => {
                        onClose();
                        onRequestUnmatch();
                      }
                    : undefined
                }
              />
            )}

            {step === 'self_harm' && meta && (
              <SelfHarmStep onContinue={() => setStep('form')} />
            )}

            {step === 'form' && meta && (
              <FormStep
                meta={meta}
                reportedName={reportedName}
                details={details}
                onDetails={setDetails}
                detailsRequired={detailsRequired}
                detailsTooLong={detailsTooLong}
                alsoBlock={alsoBlock}
                onAlsoBlock={setAlsoBlock}
                evidenceEligible={evidenceEligible}
                share={share}
                onShare={toggleShare}
                onPreview={openPreview}
                reducedMotion={reducedMotion}
                previewCount={previewWindow.length}
              />
            )}

            {step === 'preview' && (
              <PreviewStep window={previewWindow} />
            )}

            {step === 'confirmation' && result && (
              <ConfirmationStep
                result={result}
                retrying={retrying}
                onRetryEvidence={handleRetryEvidence}
              />
            )}
          </div>

          {/* Footer actions */}
          {step === 'form' && meta && (
            <div className="px-5 py-4 border-t border-border shrink-0 space-y-2">
              {error && (
                <p className="text-xs text-red-500" role="alert">
                  {error}
                </p>
              )}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3 bg-accent text-bg text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
                data-track-exempt="duplicate: submits the report; reported via the report_flow signal (report.submit_*) in the submit handler."
              >
                {submitting ? S.submitting : S.submit}
              </button>
            </div>
          )}

          {step === 'preview' && (
            <div className="px-5 py-4 border-t border-border shrink-0">
              <button
                type="button"
                onClick={() => setStep('form')}
                className="w-full py-3 border border-border text-sm font-semibold rounded-xl hover:bg-surface-hover transition-colors text-text cursor-pointer"
                data-track-exempt="duplicate: returns from the evidence preview; the report flow is instrumented via the report_flow signal, not ui_interaction."
              >
                {S.back}
              </button>
            </div>
          )}

          {step === 'confirmation' && (
            <div className="px-5 py-4 border-t border-border shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-accent text-bg text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity cursor-pointer"
                data-track-exempt="duplicate: closes the confirmation; the report flow is instrumented via the report_flow signal, not ui_interaction."
              >
                {S.confirmationDone}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Steps ────────────────────────────────────────────────────────────────────

function CategoryStep({
  onChoose,
  onNotReportable,
}: {
  onChoose: (c: ReportCategory) => void;
  onNotReportable: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-bold text-text">{S.pickerHeading}</h3>
        <p className="text-xs text-text-secondary mt-1 leading-relaxed">{S.pickerSubheading}</p>
      </div>
      <ul className="space-y-1.5">
        {REPORT_CATEGORIES.map((c) => (
          <li key={c.code}>
            <button
              type="button"
              onClick={() => onChoose(c.code)}
              className="w-full text-left p-3 rounded-xl border border-border hover:border-accent hover:bg-surface-hover transition-colors cursor-pointer flex items-start justify-between gap-2"
              data-track-exempt="duplicate: selects a report category; reported via the report_flow signal (report.category_selected) in the handler."
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text">{c.title}</span>
                <span className="block text-xs text-text-secondary mt-0.5 leading-snug">{c.description}</span>
              </span>
              <ChevronRight className="w-4 h-4 text-text-muted shrink-0 mt-0.5" aria-hidden="true" />
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onNotReportable}
            className="w-full text-left p-3 rounded-xl border border-dashed border-border hover:bg-surface-hover transition-colors cursor-pointer"
            data-track-exempt="duplicate: opens the not-reportable explainer; reported via the report_flow signal (report.not_reportable_shown)."
          >
            <span className="block text-sm font-semibold text-text">{S.notReportableRow}</span>
            <span className="block text-xs text-text-secondary mt-0.5 leading-snug">{S.notReportableRowHint}</span>
          </button>
        </li>
      </ul>
    </div>
  );
}

function NotReportableStep({ onBlock, onUnmatch }: { onBlock: () => void; onUnmatch?: () => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-base font-bold text-text">{S.notReportableHeading}</h3>
      <p className="text-xs text-text-secondary leading-relaxed">{S.notReportableBody}</p>
      <ul className="space-y-1.5 list-disc pl-5">
        {NOT_REPORTABLE_CASES.map((c) => (
          <li key={c} className="text-xs text-text-secondary leading-snug">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onBlock}
          className="flex-1 py-3 bg-surface border border-border text-sm font-semibold rounded-xl hover:bg-surface-hover transition-colors text-text cursor-pointer"
          data-track-exempt="duplicate: redirects to the existing block action; reported via the report_flow signal (report.not_reportable_block)."
        >
          {S.notReportableBlock}
        </button>
        {onUnmatch && (
          <button
            type="button"
            onClick={onUnmatch}
            className="flex-1 py-3 border border-border text-sm font-semibold rounded-xl hover:bg-surface-hover transition-colors text-text cursor-pointer"
            data-track-exempt="duplicate: redirects to the existing unmatch action; the report flow is instrumented via the report_flow signal, not ui_interaction."
          >
            {S.notReportableUnmatch}
          </button>
        )}
      </div>
    </div>
  );
}

function SelfHarmStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-accent">
        <Shield className="w-5 h-5" aria-hidden="true" />
        <h3 className="text-base font-bold text-text">{S.selfHarmHeading}</h3>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">{S.selfHarmBody}</p>
      <ul className="space-y-2">
        {SELF_HARM_RESOURCES.map((r) => (
          <li key={r.phone} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-text">{r.name}</p>
                <p className="text-xs text-text-secondary">
                  {r.region} · {r.availability}
                </p>
              </div>
              <a
                href={selfHarmTelHref(r)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-accent text-bg text-xs font-semibold rounded-xl hover:opacity-90 transition-opacity shrink-0"
                data-track-exempt="duplicate: tap-to-call a support line; the report flow is instrumented via the report_flow signal, not ui_interaction."
              >
                <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                {S.selfHarmCallPrefix} {r.phone}
              </a>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onContinue}
        className="w-full py-3 border border-border text-sm font-semibold rounded-xl hover:bg-surface-hover transition-colors text-text cursor-pointer"
        data-track-exempt="duplicate: continues from the self-harm support step; the report flow is instrumented via the report_flow signal, not ui_interaction."
      >
        {S.selfHarmContinue}
      </button>
    </div>
  );
}

function FormStep({
  meta,
  reportedName,
  details,
  onDetails,
  detailsRequired,
  detailsTooLong,
  alsoBlock,
  onAlsoBlock,
  evidenceEligible,
  share,
  onShare,
  onPreview,
  reducedMotion,
  previewCount,
}: {
  meta: CategoryMeta;
  reportedName: string;
  details: string;
  onDetails: (v: string) => void;
  detailsRequired: boolean;
  detailsTooLong: boolean;
  alsoBlock: boolean;
  onAlsoBlock: (v: boolean) => void;
  evidenceEligible: boolean;
  share: boolean;
  onShare: (v: boolean) => void;
  onPreview: () => void;
  reducedMotion: boolean;
  previewCount: number;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-surface border border-border p-3">
        <p className="text-sm font-semibold text-text">{meta.title}</p>
        <p className="text-xs text-text-secondary mt-0.5 leading-snug">{meta.description}</p>
      </div>

      {/* Details */}
      <div className="space-y-1.5">
        <label htmlFor="report-details" className="text-xs font-semibold text-text block">
          {detailsRequired ? S.detailsLabelRequired : S.detailsLabel}
        </label>
        <textarea
          id="report-details"
          value={details}
          onChange={(e) => onDetails(e.target.value)}
          maxLength={DETAILS_MAX_CHARS}
          rows={4}
          placeholder={S.detailsPlaceholder}
          className="w-full p-3 border border-border text-sm bg-surface text-text rounded-xl outline-none focus:border-accent resize-none"
        />
        <div className="flex items-center justify-between text-[11px]">
          <span className={detailsRequired && details.trim().length === 0 ? 'text-red-500' : 'text-text-muted'}>
            {detailsRequired ? S.detailsRequiredHint : ''}
          </span>
          <span className={detailsTooLong ? 'text-red-500' : 'text-text-muted'}>
            {details.length}/{DETAILS_MAX_CHARS}
          </span>
        </div>
      </div>

      {/* Also block — plain checkbox (no press handler; value travels in the report) */}
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={alsoBlock}
          onChange={(e) => onAlsoBlock(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--color-accent,#e11d48)]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-text">{S.alsoBlockLabel}</span>
          <span className="block text-xs text-text-secondary mt-0.5 leading-snug">{S.alsoBlockHint}</span>
        </span>
      </label>

      {/* Minor safety: evidence hidden, escalation note shown instead */}
      {meta.minorSafety && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs text-text leading-relaxed">{S.minorSafetyEscalated}</p>
        </div>
      )}

      {/* Evidence section (chat + non-MINOR_SAFETY) */}
      {evidenceEligible && (
        <div className="rounded-xl border border-border p-3 space-y-3">
          {/* Nudge: ~1s non-looping shield; static when reduced motion */}
          <div className="flex items-start gap-2.5">
            {nudgeMode(reducedMotion) === 'static' ? (
              <Shield className="w-6 h-6 text-accent shrink-0" aria-hidden="true" />
            ) : (
              <motion.span
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1, ease: 'easeOut' }}
                className="shrink-0"
              >
                <Shield className="w-6 h-6 text-accent" aria-hidden="true" />
              </motion.span>
            )}
            <p className="text-xs text-text-secondary leading-relaxed">{S.evidenceNudgeLine}</p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={share}
              onChange={(e) => onShare(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent,#e11d48)]"
            />
            <span className="text-sm font-medium text-text">{S.evidenceCheckboxLabel}</span>
          </label>

          <div className="rounded-lg bg-surface border border-border/60 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {S.evidencePanelHeading}
            </p>
            <p className="text-xs text-text-secondary leading-relaxed">{S.evidencePanelWhat}</p>
            <p className="text-xs text-text-secondary leading-relaxed">{S.evidencePanelNoMedia}</p>
            <p className="text-xs text-text-secondary leading-relaxed">{S.evidencePanelNotNotified}</p>
          </div>

          <button
            type="button"
            onClick={onPreview}
            className="text-xs font-semibold text-accent hover:underline cursor-pointer"
            data-track-exempt="duplicate: opens the evidence preview; reported via the report_flow signal (report.evidence_preview)."
          >
            {S.evidencePreviewButton}
            {previewCount > 0 ? ` (${previewCount})` : ''}
          </button>
        </div>
      )}

      {/* A reportedName reference keeps the UI personable; never logged / never in telemetry. */}
      <p className="sr-only">Reporting {reportedName}</p>
    </div>
  );
}

function PreviewStep({ window }: { window: { messageId: string; sentAt: string; senderSide: string; text: string }[] }) {
  return (
    <div className="space-y-3">
      <h3 className="text-base font-bold text-text">{S.evidencePreviewHeading}</h3>
      {window.length === 0 ? (
        <p className="text-xs text-text-secondary">{S.evidencePreviewEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {window.map((m) => (
            <li key={m.messageId} className="rounded-xl bg-surface border border-border/60 p-3 text-xs">
              <div className="flex items-center justify-between mb-1 text-[10px] uppercase tracking-widest opacity-50">
                <span>{m.senderSide === 'reporter' ? S.evidencePreviewYou : S.evidencePreviewThem}</span>
                <span>{new Date(m.sentAt).toLocaleString()}</span>
              </div>
              <p className="text-text leading-relaxed break-words">{m.text}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ConfirmationStep({
  result,
  retrying,
  onRetryEvidence,
}: {
  result: SubmitResult;
  retrying: boolean;
  onRetryEvidence: () => void;
}) {
  const view: ConfirmationView = confirmationView({
    blocked: result.blocked,
    evidenceOutcome: result.evidenceOutcome,
  });
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-accent">
        <Check className="w-5 h-5" aria-hidden="true" />
        <h3 className="text-base font-bold text-text">{S.confirmationHeading}</h3>
      </div>
      <p className="text-xs text-text-secondary leading-relaxed">{S.confirmationBody}</p>
      {view.blocked && (
        <p className="text-xs text-text-secondary leading-relaxed">{S.confirmationBlocked}</p>
      )}
      {view.attached && (
        <p className="text-xs text-text-secondary leading-relaxed">{S.evidenceAttached}</p>
      )}
      {view.terminalNote && (
        <p className="text-xs text-text-secondary leading-relaxed">{S.evidenceTerminalNote}</p>
      )}
      {view.retry && (
        <div className="rounded-xl border border-border bg-surface p-3 space-y-2" role="alert">
          <p className="text-xs text-text leading-relaxed">{S.evidenceFailed}</p>
          <button
            type="button"
            onClick={onRetryEvidence}
            disabled={retrying}
            className="text-xs font-semibold text-accent hover:underline disabled:opacity-40 cursor-pointer"
            data-track-exempt="duplicate: retries the evidence attach; reported via the report_flow signal (report.evidence_upload_*)."
          >
            {retrying ? S.evidenceRetrying : S.evidenceRetry}
          </button>
        </div>
      )}
    </div>
  );
}
