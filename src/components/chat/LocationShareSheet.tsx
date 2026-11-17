import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, MapPin, Radio, Send, X } from 'lucide-react';
import { UiElement, trackProps, trackUi } from '../../lib/analytics/analytics';
import type { LocationFix } from '../../lib/chat-structured';
import { LOCATION_ERROR_COPY, LocationReadError, getCurrentFix, type LocationErrorKind } from '../../lib/browser-location';
import { formatClockTime } from '../../lib/live-location';
import { LIVE_DURATIONS, TAB_BOUND_COPY, type LiveDurationValue, type LiveShareView } from '../../lib/live-location-sharing';
import { formatAccuracy, formatCoordinatesForDisplay } from '../../lib/map-links';

/**
 * The location sheet (attachment menu → Location): the member's current position as a tile-free card,
 * "Send your current location", and "Share live location" for 15 minutes, 1 hour or 8 hours.
 *
 * PRIVACY: the position is read on device and only leaves it sealed, inside the message (or the live
 * update) for this conversation. No map tiles, no geocoding: the preview is the coordinates and their
 * accuracy. The web cannot share in the background, so every place a live share is started says
 * "Location won't update if you close this tab."
 */

export type LocationSheetPhase =
  | { kind: 'locating' }
  | { kind: 'ready'; fix: LocationFix }
  | { kind: 'error'; error: LocationErrorKind };

export type LocationSheetStep = 'main' | 'duration';

interface LocationShareSheetProps {
  open: boolean;
  peerName: string;
  /** This tab's running share in the conversation, if any: starting a new one replaces it. */
  runningShare?: LiveShareView;
  onClose: () => void;
  /** Sends the current position. Throws (with a message to show) when it could not be sent. */
  onSendCurrent: (fix: LocationFix) => Promise<void>;
  /** Starts a live share. Throws (with a message to show) when it could not be started. */
  onStartLive: (fix: LocationFix, durationMs: number) => Promise<void>;
}

export function LocationShareSheet({ open, peerName, runningShare, onClose, onSendCurrent, onStartLive }: LocationShareSheetProps) {
  const [phase, setPhase] = useState<LocationSheetPhase>({ kind: 'locating' });
  const [step, setStep] = useState<LocationSheetStep>('main');
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const attempt = useRef(0);

  const locate = useCallback(() => {
    const id = ++attempt.current;
    setPhase({ kind: 'locating' });
    getCurrentFix()
      .then((fix) => {
        if (attempt.current === id) setPhase({ kind: 'ready', fix });
      })
      .catch((err: unknown) => {
        if (attempt.current !== id) return;
        setPhase({ kind: 'error', error: err instanceof LocationReadError ? err.kind : 'unavailable' });
      });
  }, []);

  useEffect(() => {
    if (!open) {
      attempt.current += 1; // a late answer for a closed sheet is ignored
      return;
    }
    setStep('main');
    setBusy(false);
    setSendError(null);
    locate();
  }, [open, locate]);

  const close = useCallback(() => {
    // Leaving the duration chooser without picking one is its `dismiss`.
    if (step === 'duration') trackUi(UiElement.CHAT_LIVE_LOCATION_DURATION, { action: 'dismiss' });
    onClose();
  }, [step, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, close]);

  if (!open) return null;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setSendError(null);
    try {
      await action();
      onClose();
    } catch (err) {
      setSendError(err instanceof Error && err.message ? err.message : "That couldn't be sent. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <LocationShareSheetView
      peerName={peerName}
      phase={phase}
      step={step}
      busy={busy}
      sendError={sendError}
      runningShare={runningShare}
      now={Date.now()}
      onClose={close}
      onRetry={locate}
      onSendCurrent={() => phase.kind === 'ready' && void run(() => onSendCurrent(phase.fix))}
      onChooseLive={() => setStep('duration')}
      onBack={() => {
        trackUi(UiElement.CHAT_LIVE_LOCATION_DURATION, { action: 'dismiss' });
        setStep('main');
      }}
      onChooseDuration={(ms) => phase.kind === 'ready' && void run(() => onStartLive(phase.fix, ms))}
    />
  );
}

const PRIMARY =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ig-blue text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed';
const SECONDARY =
  'w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-surface-hover disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed';

export interface LocationShareSheetViewProps {
  peerName: string;
  phase: LocationSheetPhase;
  step: LocationSheetStep;
  busy: boolean;
  sendError: string | null;
  runningShare?: LiveShareView;
  now: number;
  onClose: () => void;
  onRetry: () => void;
  onSendCurrent: () => void;
  onChooseLive: () => void;
  onBack: () => void;
  onChooseDuration: (ms: number, value: LiveDurationValue) => void;
}

/** The sheet's markup, without effects (rendered statically in tests). */
export function LocationShareSheetView({
  peerName,
  phase,
  step,
  busy,
  sendError,
  runningShare,
  now,
  onClose,
  onRetry,
  onSendCurrent,
  onChooseLive,
  onBack,
  onChooseDuration,
}: LocationShareSheetViewProps) {
  const ready = phase.kind === 'ready' && !busy;
  return (
    <div
      className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={() => !busy && onClose()}
      data-track-exempt="backdrop: click-away that closes the location sheet; the close button (chat.attach_button dismiss) is tracked."
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="location-share-title"
        className="w-full max-w-sm bg-surface-card text-text border border-border shadow-2xl rounded-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-track-exempt="backdrop: dialog container; only stops clicks inside the sheet from closing it."
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step === 'duration' && (
              <button
                type="button"
                onClick={onBack}
                disabled={busy}
                aria-label="Back"
                data-track-exempt="duplicate: leaving the duration chooser emits chat.live_location_duration (dismiss) via trackUi."
                className="p-1.5 rounded-lg hover:bg-surface-hover cursor-pointer disabled:opacity-40"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 id="location-share-title" className="text-base font-bold">
              {step === 'duration' ? 'Share live location' : 'Share location'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            {...trackProps(UiElement.CHAT_ATTACH_BUTTON, { action: 'dismiss' })}
            className="p-2 border border-border hover:bg-surface-hover rounded-lg cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <LocationPreview phase={phase} onRetry={onRetry} />

          {step === 'main' ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={onSendCurrent}
                disabled={!ready}
                {...trackProps(UiElement.CHAT_LOCATION_SHARE, { value: 'current' })}
                className={PRIMARY}
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                Send your current location
              </button>
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={onChooseLive}
                  disabled={!ready}
                  {...trackProps(UiElement.CHAT_LOCATION_SHARE, { value: 'live' })}
                  className={SECONDARY}
                >
                  <Radio className="w-4 h-4" aria-hidden="true" />
                  Share live location
                </button>
                <p className="text-[11px] text-text-secondary text-center">{TAB_BOUND_COPY}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-text-secondary leading-relaxed">
                {peerName} sees your location move until the time runs out or you stop.{' '}
                <span className="font-semibold text-text">{TAB_BOUND_COPY}</span>
              </p>
              {runningShare && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  This replaces the live share running until {formatClockTime(runningShare.expiresAt, now)}.
                </p>
              )}
              <div className="grid grid-cols-3 gap-2" role="group" aria-label="How long to share">
                {LIVE_DURATIONS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => onChooseDuration(d.ms, d.value)}
                    disabled={!ready}
                    {...trackProps(UiElement.CHAT_LIVE_LOCATION_DURATION, { value: d.value })}
                    className="px-2 py-2.5 rounded-xl border border-border text-xs font-semibold hover:bg-surface-hover hover:border-accent disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {busy && (
            <p className="flex items-center gap-2 text-xs text-text-secondary" role="status">
              <Loader2 className="w-3.5 h-3.5 motion-safe:animate-spin" aria-hidden="true" />
              Sending…
            </p>
          )}
          {sendError && (
            <p className="text-xs text-red-500" role="alert">
              {sendError}
            </p>
          )}
          <p className="text-[10px] text-text-secondary leading-snug">
            Only {peerName} can see it. It is end-to-end encrypted, and OneHook never sees where you are.
          </p>
        </div>
      </div>
    </div>
  );
}

function LocationPreview({ phase, onRetry }: { phase: LocationSheetPhase; onRetry: () => void }) {
  if (phase.kind === 'locating') {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-border" role="status">
        <div className="w-12 h-12 shrink-0 rounded-xl bg-surface-hover flex items-center justify-center">
          <Loader2 className="w-5 h-5 motion-safe:animate-spin" aria-hidden="true" />
        </div>
        <p className="text-sm">Finding your location…</p>
      </div>
    );
  }
  if (phase.kind === 'error') {
    return (
      <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/5 space-y-2" role="alert">
        <p className="text-sm">{LOCATION_ERROR_COPY[phase.error]}</p>
        {phase.error !== 'unsupported' && (
          <button
            type="button"
            onClick={onRetry}
            {...trackProps(UiElement.CHAT_RETRY)}
            className="text-xs font-semibold underline hover:opacity-70 cursor-pointer"
          >
            Try again
          </button>
        )}
      </div>
    );
  }
  const { fix } = phase;
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border">
      <div className="w-12 h-12 shrink-0 rounded-xl border border-current/30 bg-current/10 flex items-center justify-center" aria-hidden="true">
        <MapPin className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold">Your current location</p>
        <p className="text-xs tabular-nums opacity-80">{formatCoordinatesForDisplay(fix.lat, fix.lon)}</p>
        {fix.accuracyM !== undefined && (
          <p className="text-[10px] opacity-60">Accuracy {formatAccuracy(fix.accuracyM)}</p>
        )}
      </div>
    </div>
  );
}
