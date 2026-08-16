import React, { Suspense, lazy, useState } from 'react';
import { ShieldCheck, Loader, Camera, RefreshCw, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { LivenessApi } from '../../api/liveness';
import { cognitoRegion } from '../../utils/env.config';
import { useToast } from '../common/Toast';

// The Rekognition detector (and the Amplify UI / liveness SDK + CSS it pulls in)
// live in a separate chunk that is ONLY downloaded when this dynamic import runs
// — i.e. when a signed-in member actually starts a verification on this screen.
const FaceLivenessInner = lazy(() => import('./FaceLivenessInner'));

type Phase = 'idle' | 'preparing' | 'streaming' | 'submitted' | 'error';

/**
 * Face Liveness identity verification.
 *
 * Flow: request camera permission → POST /profile/liveness/session → lazily load
 * + render the detector (streams to Rekognition via Identity Pool creds). Once
 * the video is submitted, we tell the user analysis is under way — EVERYTHING
 * ELSE IS HANDLED BY THE BACKEND, which sets the profile's `verified` flag when
 * approved. The client does not poll; the badge appears on the next profile load.
 */
export function LivenessVerification({
  verified,
  onVerified,
}: {
  verified?: boolean;
  onVerified?: () => void;
}) {
  const { showToast } = useToast();
  const [phase, setPhase] = useState<Phase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fail = (msg: string) => {
    setErrorMsg(msg);
    setPhase('error');
    showToast(msg, 'error');
  };

  const start = async () => {
    setErrorMsg(null);
    setPhase('preparing');
    try {
      // 1) Ask for camera permission BEFORE creating a session.
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera is not available in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());

      // 2) Create the streaming liveness session.
      const { sessionId: sid } = await LivenessApi.createSession();
      setSessionId(sid);

      setPhase('streaming');
    } catch (err) {
      handleStartError(err);
    }
  };

  const handleStartError = (err: unknown) => {
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
    fail(err instanceof Error ? err.message : 'Could not start verification.');
  };

  // Video submitted — the backend takes it from here.
  const onSubmitted = () => {
    setPhase('submitted');
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
        {verified && (
          <span className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 border border-accent text-[9px] font-black uppercase tracking-[0.2em]">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
        )}
      </div>

      {/* Idle */}
      {phase === 'idle' && (
        <button
          onClick={start}
          className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2"
        >
          <Camera className="w-4 h-4" /> {verified ? 'Re-verify identity' : 'Verify with a selfie'}
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

      {/* Submitted — analysis handled asynchronously by the backend */}
      {phase === 'submitted' && (
        <div className="text-center py-6 space-y-4">
          <Clock className="w-10 h-10 text-accent mx-auto" />
          <p className="text-2xl font-serif italic">Verification submitted</p>
          <p className="text-sm opacity-60 leading-relaxed max-w-sm mx-auto">
            Thanks! We&rsquo;re reviewing your video now — this can take a little while. Your
            Verified badge will appear here automatically once you&rsquo;re approved.
          </p>
          <button
            onClick={() => {
              onVerified?.();
              reset();
            }}
            className="inline-flex items-center gap-2 px-6 py-3 border border-accent text-[10px] font-black uppercase tracking-[0.24em] hover:bg-accent hover:text-white transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Done
          </button>
        </div>
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
