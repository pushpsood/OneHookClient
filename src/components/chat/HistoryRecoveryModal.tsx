import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  History,
  Loader,
  MonitorSmartphone,
  ShieldCheck,
  Wifi,
  X,
} from 'lucide-react';
import { useHistoryRecovery } from '../../hooks/use-key-recovery';
import { QrCameraScanner } from './QrCameraScanner';
import { HistoryResetDialog } from './HistoryResetDialog';

/**
 * NEW-device side of history recovery, as a modal.
 *
 * Walks the user through: pick one of your other devices -> wait for it to show a code -> scan it ->
 * history unlocks. The 6-digit code shown here is the same one the other device shows; asking the user
 * to compare them is what turns a silent key exchange into something a human can verify.
 */
export function HistoryRecoveryModal({
  userId,
  open,
  onClose,
  onRecovered,
}: {
  userId?: string;
  open: boolean;
  onClose: () => void;
  /** Called after a successful import so the caller can re-decrypt what is on screen. */
  onRecovered?: () => void;
}) {
  const recovery = useHistoryRecovery(userId, onRecovered);
  const { phase, start, reset } = recovery;
  const [scanError, setScanError] = useState<string | undefined>();
  // The last rung: offered only from a genuine dead end, never while a transfer could still work.
  const [resetOpen, setResetOpen] = useState(false);

  useEffect(() => {
    if (open && phase === 'idle') void start();
    if (!open) reset();
  }, [open, phase, start, reset]);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!recovery.expiresAt) {
      setSecondsLeft(null);
      return;
    }
    const update = () =>
      setSecondsLeft(Math.max(0, Math.ceil((recovery.expiresAt! - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [recovery.expiresAt]);

  if (!open) return null;

  const close = () => {
    void recovery.cancel();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-recovery-title"
    >
      <div className="bg-white border border-border w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 p-8 border-b border-border">
          <div className="flex items-start gap-3">
            <History className="w-4 h-4 mt-1 text-accent shrink-0" aria-hidden="true" />
            <div>
              <h2
                id="history-recovery-title"
                className="text-[10px] uppercase tracking-[0.3em] font-black text-accent"
              >
                Restore Earlier Messages
              </h2>
              <p className="mt-2 text-xs opacity-50 leading-relaxed">
                Your older messages are encrypted with a key held by a device you already use. Move it
                across and this device can read them too.
              </p>
            </div>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            className="p-1 opacity-40 hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {phase === 'not-needed' && (
            <p className="text-xs leading-relaxed flex items-start gap-2 text-green-700">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              This device already holds your history key — there is nothing to restore.
            </p>
          )}

          {phase === 'choosing' && (
            <div className="space-y-4">
              <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-60 block">
                Choose a device to restore from
              </span>
              {recovery.candidates.length === 0 ? (
                <p className="text-xs opacity-60 leading-relaxed">
                  No other devices are registered on your account, so there is nothing to restore from.
                  Older messages stay unreadable here — new ones are unaffected.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recovery.candidates.map((device) => (
                    <li key={device.deviceId}>
                      <button
                        onClick={() => void recovery.chooseDevice(device.deviceId)}
                        disabled={recovery.busy}
                        className="w-full flex items-center justify-between gap-4 p-4 border border-border hover:border-accent transition-colors text-left disabled:opacity-50"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium truncate">
                            {device.displayName || `${device.platform} device`}
                          </span>
                          <span className="block text-[10px] font-mono opacity-40 truncate">
                            {device.platform} · {device.deviceId.slice(0, 8)}
                          </span>
                        </span>
                        <MonitorSmartphone className="w-4 h-4 opacity-40 shrink-0" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[10px] opacity-40 leading-relaxed">
                Keep both devices with you — you will need to scan a code shown on the other screen.
              </p>
            </div>
          )}

          {(phase === 'requesting' || phase === 'waiting') && (
            <div className="space-y-5">
              <p className="text-xs leading-relaxed flex items-center gap-2">
                <Loader className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
                Waiting for your other device to confirm…
              </p>
              {recovery.verificationCode && (
                <VerificationCode code={recovery.verificationCode} />
              )}
              {recovery.showOfflineHint && (
                <p className="text-xs text-amber-600 leading-relaxed flex items-start gap-2">
                  <Wifi className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  Not receiving the request? Make sure the other device is unlocked, online (Wi-Fi is
                  enough) and has OneHook open.
                </p>
              )}
              {secondsLeft !== null && (
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-40">
                  Request expires in {secondsLeft}s
                </p>
              )}
            </div>
          )}

          {phase === 'scanning' && (
            <div className="space-y-5">
              <p className="text-xs leading-relaxed">
                Scan the code now showing on your other device.
              </p>
              <QrCameraScanner
                active
                onScan={(text) => void recovery.submitScan(text)}
                onError={setScanError}
              />
              {recovery.verificationCode && <VerificationCode code={recovery.verificationCode} />}
              {(scanError || recovery.error) && (
                <p className="text-xs text-red-600 leading-relaxed">{scanError || recovery.error}</p>
              )}
              {secondsLeft !== null && (
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-40">
                  Code expires in {secondsLeft}s
                </p>
              )}
            </div>
          )}

          {phase === 'importing' && (
            <p className="text-xs leading-relaxed flex items-center gap-2">
              <Loader className="w-4 h-4 animate-spin shrink-0" aria-hidden="true" />
              Verifying and unlocking your history…
            </p>
          )}

          {phase === 'done' && (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed flex items-start gap-2 text-green-700">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                Done. Your earlier messages are readable on this device now.
              </p>
              <button
                onClick={onClose}
                className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity"
              >
                Back to chat
              </button>
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-4">
              <p className="text-xs text-red-600 leading-relaxed">
                {recovery.error || 'The transfer did not finish.'}
              </p>
              <button
                onClick={() => void recovery.start()}
                className="w-full py-4 border border-border text-[10px] uppercase tracking-[0.3em] font-black hover:border-accent transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {/*
            The floor of the ladder, offered only from the two genuine dead ends: no device to restore
            from, or the transfer failed. Never shown while a transfer might still succeed, because a
            holder that is merely offline must not be written off.
          */}
          {(phase === 'error' || (phase === 'choosing' && recovery.candidates.length === 0)) && (
            <div className="pt-2 border-t border-border space-y-3">
              <p className="text-[10px] opacity-40 leading-relaxed">
                Out of options? You can set up a new key and carry on without your older messages.
              </p>
              <button
                onClick={() => setResetOpen(true)}
                className="text-[10px] uppercase tracking-[0.2em] font-bold text-amber-700 underline hover:opacity-70 transition-opacity"
              >
                Start fresh without old messages
              </button>
            </div>
          )}
        </div>

        <div className="px-8 py-6 border-t border-border bg-[#F9F9F9]">
          <p className="text-[10px] opacity-50 leading-relaxed flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            The key travels only between your two screens. OneHook&rsquo;s servers never see it, and a
            photo of the code is useless to anyone else.
          </p>
        </div>
      </div>

      <HistoryResetDialog
        userId={userId}
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onReset={() => {
          setResetOpen(false);
          onRecovered?.();
          onClose();
        }}
      />
    </div>
  );
}

/** The comparison code. Shown identically on both devices; a mismatch means stop. */
function VerificationCode({ code }: { code: string }) {
  return (
    <div className="border border-border p-4 space-y-1 bg-bg/40">
      <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-60 block">
        Check this matches the other device
      </span>
      <span className="text-2xl font-mono tracking-[0.3em]">{code}</span>
      <p className="text-[10px] opacity-40 leading-relaxed">
        If the numbers differ, cancel — something is intercepting the request.
      </p>
    </div>
  );
}
