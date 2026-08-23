import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, Loader, Camera, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { LivenessApi, type LivenessStatus } from '../../api/liveness';
import { cognitoRegion } from '../../utils/env.config';
import { useToast } from '../common/Toast';

// The Rekognition detector (and the Amplify UI / liveness SDK + CSS it pulls in)
// live in a separate chunk that is ONLY downloaded when this dynamic import runs
// — i.e. when a signed-in member actually starts a verification on this screen.
const FaceLivenessInner = lazy(() => import('./FaceLivenessInner'));

type Phase = 'idle' | 'preparing' | 'streaming' | 'error';

/**
 * Face Liveness identity verification.
 *
 * The authoritative status comes from the backend (GET /profile/liveness/status →
 * NONE | PENDING | APPROVED | REJECTED). Analysis is asynchronous; we fetch the status on mount,
 * poll while PENDING, and render an accurate, reload-safe state — so an already-submitted user
 * sees "Under review" (not the verify prompt) and a failed check sees "Rejected", instead of the
 * old behaviour that reverted to the selfie prompt and hit the backend cooldown.
 */
export function LivenessVerification({
  verified,
  onVerified,
}: {
  userId?: string;
  verified?: boolean;
  onVerified?: () => void;
}) {
  const { showToast } = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [status, setStatus] = useState<LivenessStatus | null>(null); // null = still loading
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const { status: s } = await LivenessApi.getStatus();
      if (mounted.current) setStatus(s);
      return s;
    } catch {
      // Treat a transient status read failure as unknown; keep whatever we had.
      return null;
    }
  }, []);

  // Load the authoritative status on mount.
  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const effectiveVerified = Boolean(verified) || status === 'APPROVED';

  // While PENDING (and not yet approved), poll with exponential backoff so the state resolves to
  // APPROVED/REJECTED automatically — and refresh the profile so the Verified badge appears.
  useEffect(() => {
    if (effectiveVerified || status !== 'PENDING') return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const delay = Math.min(5000 * 2 ** attempt, 30000); // 5s → 10s → 20s → 30s (capped)
      timer = setTimeout(async () => {
        if (cancelled) return;
        attempt += 1;
        const s = await refreshStatus();
        if (s === 'APPROVED') {
          try {
            await onVerified?.();
          } catch {
            /* ignore */
          }
        }
        if (!cancelled && (s === null || s === 'PENDING')) tick();
      }, delay);
    };
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, effectiveVerified, refreshStatus, onVerified]);

  const fail = (msg: string) => {
    setErrorMsg(msg);
    setPhase('error');
    showToast(msg, 'error');
  };

  const start = async () => {
    setErrorMsg(null);
    setPhase('preparing');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera is not available in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());

      const { sessionId: sid } = await LivenessApi.createSession();
      setSessionId(sid);
      setPhase('streaming');
    } catch (err) {
      handleStartError(err);
    }
  };

  const handleStartError = (err: unknown) => {
    // The generated SDK surfaces the backend's JSON error under `error` (and a generic `message`),
    // e.g. { error: "Verification is on cooldown; retry in Ns", $metadata: { httpStatusCode: 400 } }.
    const info = err as { error?: string; message?: string };
    const rawMsg = info?.error || info?.message || '';

    // A cooldown means a prior submission is still being evaluated → it's under review, not an error.
    if (/cooldown/i.test(rawMsg)) {
      setPhase('idle');
      setStatus('PENDING');
      showToast('Your verification is still under review — hang tight.', 'info');
      return;
    }

    if (err instanceof DOMException) {
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
        return fail('Camera permission denied. Enable camera access and try again.');
      }
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        return fail('No camera found on this device.');
      }
      if (err.name === 'NotReadableError') {
        return fail('Your camera is in use by another app. Close it and retry.');
      }
    }
    fail(rawMsg || 'Could not start verification.');
  };

  // Video submitted — optimistically reflect PENDING; the backend status confirms via polling.
  const onSubmitted = () => {
    setPhase('idle');
    setSessionId(null);
    setStatus('PENDING');
    showToast('Verification submitted — we\u2019ll review it shortly.', 'success');
  };

  const handleDetectorError = (livenessError: { error?: { message?: string }; state?: string }) => {
    const msg =
      livenessError?.error?.message ||
      'Liveness check failed. Try again in good, even lighting with your face centered.';
    fail(msg);
  };

  const reset = () => {
    setPhase('idle');
    setSessionId(null);
    setErrorMsg(null);
  };

  const busySpinner = (label: string) => (
    <div className="flex items-center justify-center gap-3 py-8 text-xs opacity-60 uppercase tracking-[0.24em]">
      <Loader className="w-4 h-4 animate-spin" />
      {label}
    </div>
  );

  const underReview = !effectiveVerified && status === 'PENDING';
  const failed =
    !effectiveVerified &&
    (status === 'REJECTED' || status === 'LIVENESS_FAILED' || status === 'FACE_MATCH_FAILED');
  // Stage-specific guidance so the user knows exactly what to fix.
  const failureMessage =
    status === 'FACE_MATCH_FAILED'
      ? 'Your liveness check passed, but your face didn’t match your profile photos. Make sure your photos clearly show your face — and that they’re really you — then try again.'
      : status === 'LIVENESS_FAILED'
        ? 'We couldn’t confirm a live person. Try again in good, even lighting with your face centered and looking straight at the camera.'
        : 'Your last verification didn’t pass. Please try again in good lighting with your face centered.';
  // The verify prompt is shown only when there's nothing in flight and no approval.
  const canVerify =
    !effectiveVerified && (status === 'NONE' || status === null || failed) && phase === 'idle';

  return (
    <div className="border border-border p-8 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-4 h-4 text-accent" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] font-black text-accent">
              Identity Verification
            </div>
            <p className="mt-1 text-xs opacity-50 leading-relaxed max-w-sm">
              A quick face scan confirms you&rsquo;re a real person. It earns you a Verified badge
              that other members can trust.
            </p>
          </div>
        </div>
        {effectiveVerified ? (
          <span className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 border border-accent text-[9px] font-black uppercase tracking-[0.2em]">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
        ) : underReview ? (
          <span className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 border border-amber-500 text-amber-600 text-[9px] font-black uppercase tracking-[0.2em]">
            <Clock className="w-3 h-3" /> Under Review
          </span>
        ) : failed ? (
          <span className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 border border-red-500 text-red-600 text-[9px] font-black uppercase tracking-[0.2em]">
            <AlertTriangle className="w-3 h-3" /> {status === 'FACE_MATCH_FAILED' ? 'No Match' : 'Rejected'}
          </span>
        ) : null}
      </div>

      {/* Verified — approved */}
      {effectiveVerified && (
        <div className="flex items-center gap-3 py-2 text-sm">
          <CheckCircle2 className="w-5 h-5 text-accent shrink-0" />
          <span className="opacity-70">
            Your identity is verified. Members can see your Verified badge.
          </span>
        </div>
      )}

      {/* Under review — authoritative from the backend; polls until APPROVED/REJECTED */}
      {underReview && phase !== 'streaming' && phase !== 'preparing' && (
        <div className="text-center py-6 space-y-4">
          <Clock className="w-10 h-10 text-accent mx-auto" />
          <p className="text-2xl font-serif italic">Verification under review</p>
          <p className="text-sm opacity-60 leading-relaxed max-w-sm mx-auto">
            Thanks! We&rsquo;re reviewing your scan — this can take a little while. Your result will
            appear here automatically; you don&rsquo;t need to do anything.
          </p>
          <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.24em] opacity-50">
            <Loader className="w-3.5 h-3.5 animate-spin" /> Checking status…
          </div>
        </div>
      )}

      {/* Failed — stage-specific reason (liveness vs face-match); allow a retry */}
      {failed && phase === 'idle' && (
        <div className="text-center py-4 space-y-3">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm text-red-600 italic">{failureMessage}</p>
        </div>
      )}

      {/* Idle / retry — verify prompt (hidden while verified or under review) */}
      {canVerify && (
        <button
          onClick={start}
          className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" /> {failed ? 'Try again' : 'Verify with a selfie'}
        </button>
      )}

      {/* Preparing (camera / session) */}
      {phase === 'preparing' && busySpinner('Preparing camera…')}

      {/* Live detector (real streaming) — lazily loaded */}
      {phase === 'streaming' && sessionId && (
        <Suspense fallback={busySpinner('Loading camera…')}>
          <FaceLivenessInner
            sessionId={sessionId}
            region={cognitoRegion}
            onAnalysisComplete={async () => {
              onSubmitted();
            }}
            onError={handleDetectorError}
            onUserCancel={reset}
          />
        </Suspense>
      )}

      {/* Error (camera / permission / detector) */}
      {phase === 'error' && (
        <div className="text-center py-6 space-y-4">
          <AlertTriangle className="w-10 h-10 text-red-500 mx-auto" />
          <p className="text-sm text-red-600 italic">{errorMsg}</p>
          <button
            onClick={start}
            className="inline-flex items-center gap-2 px-6 py-3 border border-accent text-[10px] font-black uppercase tracking-[0.24em] hover:bg-accent hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}
    </div>
  );
}

export default LivenessVerification;
