import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Fingerprint, Loader, ShieldAlert, ShieldCheck, X, Download } from 'lucide-react';
import { useRecoveryResponder } from '../../hooks/use-key-recovery';
import { useAppStore } from '../../store/app-store';

/**
 * SOURCE-device side of history recovery.
 *
 * Mounted once for the whole signed-in app so a request can be answered from any screen. It renders
 * nothing until a request actually arrives, and on a device that does not hold the history key it does
 * not even subscribe (see `useRecoveryResponder`).
 *
 * Two gates stand between an incoming request and the key leaving this device:
 *  1. Face ID / fingerprint / device unlock where the platform offers it, so someone holding an
 *     unlocked phone cannot approve silently. Where it is unavailable the user must instead confirm
 *     explicitly after comparing the code — a conscious act either way.
 *  2. The 6-digit code, computed from the transfer key AS RECEIVED. If it differs from the code on the
 *     new device, something rewrote the request in transit and the user is told to stop.
 */
export function KeyRecoveryResponder() {
  const { currentUser } = useAppStore();
  const userId = currentUser?.id;
  const displayName = currentUser?.displayName || currentUser?.name || 'OneHook member';

  const responder = useRecoveryResponder(userId);
  const { incoming, qrPayload, verificationCode, presence, error, busy } = responder;

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!incoming) {
      setSecondsLeft(null);
      return;
    }
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((incoming.expiresAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [incoming]);

  const saveQrAsImage = () => {
    if (!qrPayload) return;
    
    // Create a canvas from the QR SVG to generate a downloadable PNG
    const svg = document.querySelector('.recovery-qr-code');
    if (!svg) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const img = new Image();
    const svgBlob = new Blob([svg.outerHTML], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(svgBlob);
    
    img.onload = () => {
      canvas.width = 240;
      canvas.height = 240;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 240, 240);
      ctx.drawImage(img, 0, 0);
      
      canvas.toBlob((blob) => {
        if (!blob) return;
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = `onehook-recovery-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
      }, 'image/png');
      
      URL.revokeObjectURL(url);
    };
    
    img.src = url;
  };

  if (!userId || !incoming) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-responder-title"
    >
      <div className="bg-white border border-border w-full max-w-sm max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 p-8 border-b border-border">
          <div>
            <h2
              id="recovery-responder-title"
              className="text-[10px] uppercase tracking-[0.3em] font-black text-accent"
            >
              {qrPayload ? 'Scan This On Your New Device' : 'Restore History Request'}
            </h2>
            <p className="mt-2 text-xs opacity-50 leading-relaxed">
              {qrPayload
                ? 'Hold the other device up to this code. It disappears as soon as the transfer completes.'
                : 'Another of your devices is asking for the key that unlocks your earlier messages.'}
            </p>
          </div>
          <button
            onClick={() => void responder.decline()}
            aria-label="Dismiss"
            className="p-1 opacity-40 hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          {verificationCode && (
            <div className="border border-border p-4 space-y-1 bg-bg/40">
              <span className="text-[9px] uppercase tracking-[0.25em] font-black opacity-60 block">
                Code on the other device
              </span>
              <span className="text-2xl font-mono tracking-[0.3em]">{verificationCode}</span>
              <p className="text-[10px] opacity-40 leading-relaxed">
                These digits must match what the new device shows.
              </p>
            </div>
          )}

          {qrPayload ? (
            <div className="flex flex-col items-center gap-4">
              {/*
                Error correction stays at the default (M): the payload is a few hundred bytes and a
                denser code is slower to acquire on an ordinary phone camera. `imageSettings` is
                deliberately unused — a logo overlay would eat correction budget for decoration.
              */}
              <div className="bg-white p-4 border border-border">
                <QRCodeSVG
                  value={qrPayload}
                  size={240}
                  level="M"
                  title="History recovery code"
                  className="recovery-qr-code"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={saveQrAsImage}
                  className="py-2 px-4 border border-border text-[10px] uppercase tracking-[0.2em] font-bold hover:border-accent hover:text-accent transition-colors inline-flex items-center gap-2"
                  title="Save QR code as image for same-device transfer"
                >
                  <Download className="w-3 h-3" aria-hidden="true" />
                  Save QR
                </button>
                {secondsLeft !== null && (
                  <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-40">
                    Expires in {secondsLeft}s
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {presence === 'unsupported' && (
                <p className="text-[10px] opacity-50 leading-relaxed flex items-start gap-2">
                  <ShieldAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  This device cannot ask for a fingerprint or Face ID, so please confirm the code above
                  matches before continuing.
                </p>
              )}
              {error && <p className="text-xs text-red-600 leading-relaxed">{error}</p>}
              <button
                onClick={() => void responder.approve(displayName)}
                disabled={busy}
                className="w-full py-4 bg-accent text-white text-[10px] uppercase tracking-[0.3em] font-black hover:opacity-90 transition-opacity disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {busy ? (
                  <Loader className="w-3 h-3 animate-spin" aria-hidden="true" />
                ) : (
                  <Fingerprint className="w-3 h-3" aria-hidden="true" />
                )}
                Confirm &amp; show code
              </button>
              <button
                onClick={() => void responder.decline()}
                className="w-full py-4 border border-border text-[10px] uppercase tracking-[0.3em] font-black hover:border-red-500 hover:text-red-500 transition-colors"
              >
                Not me — decline
              </button>
              {secondsLeft !== null && (
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-40 text-center">
                  Request expires in {secondsLeft}s
                </p>
              )}
            </div>
          )}
        </div>

        <div className="px-8 py-6 border-t border-border bg-[#F9F9F9]">
          <p className="text-[10px] opacity-50 leading-relaxed flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            Only a device you just picked can read this code, and only for the next couple of minutes.
            The saved image works the same way — it&rsquo;s bound to your specific devices and expires automatically.
            Decline if you did not start this.
          </p>
        </div>
      </div>
    </div>
  );
}
