import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, Loader, Upload } from 'lucide-react';

/**
 * Live camera QR scanner for history-key recovery.
 *
 * Decoding happens entirely in this tab: frames go from the camera to a canvas to jsQR and are
 * discarded. No frame is uploaded, stored, or sent anywhere — the point of the optical channel is
 * that the payload never leaves the room, so shipping frames off-device would defeat it.
 *
 * The stream is stopped on unmount and whenever `active` goes false, so the camera indicator never
 * stays lit after the transfer finishes.
 */
export function QrCameraScanner({
  active,
  onScan,
  onError,
}: {
  /** Scanning runs only while true; the camera is released as soon as it goes false. */
  active: boolean;
  /** Called once per successful decode. The parent decides what to do with the text. */
  onScan: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const deliveredRef = useRef(false);

  // Callbacks live in refs so a parent re-render (the modal re-renders every second to tick its
  // countdown) cannot change the effect's dependencies. Without this the camera would be stopped and
  // re-acquired roughly once a second, which flickers the preview and drops so many frames that the
  // code may never be decoded at all.
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  }, [onScan, onError]);

  const [status, setStatus] = useState<'starting' | 'scanning' | 'denied' | 'unsupported'>(
    'starting'
  );

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || deliveredRef.current) return;

    const img = new Image();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (!context) {
      onErrorRef.current?.('Could not process the image.');
      return;
    }

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      context.drawImage(img, 0, 0);
      
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth',
      });
      
      if (found?.data) {
        deliveredRef.current = true;
        onScanRef.current(found.data);
      } else {
        onErrorRef.current?.('No QR code found in this image. Make sure it contains the full code.');
      }
    };

    img.onerror = () => {
      onErrorRef.current?.('Could not load this image file.');
    };

    img.src = URL.createObjectURL(file);
  }, []);

  const stop = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!active) {
      stop();
      return;
    }
    // Re-arm on every activation, so returning to the scanner after a failed import starts clean.
    deliveredRef.current = false;
    setStatus('starting');

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('unsupported');
      onErrorRef.current?.('This browser cannot open the camera. Try Safari or Chrome on a phone.');
      return;
    }

    let cancelled = false;

    const tick = () => {
      const video = videoRef.current;
      if (cancelled || !video || deliveredRef.current) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const canvas = (canvasRef.current ??= document.createElement('canvas'));
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const found = jsQR(image.data, image.width, image.height, {
            inversionAttempts: 'dontInvert',
          });
          if (found?.data) {
            // Guard against the same code firing on several frames before the parent re-renders.
            deliveredRef.current = true;
            onScanRef.current(found.data);
            return;
          }
        }
      }
      frameRef.current = requestAnimationFrame(tick);
    };

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        setStatus('scanning');
        frameRef.current = requestAnimationFrame(tick);
      } catch (err) {
        if (cancelled) return;
        setStatus('denied');
        onErrorRef.current?.(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow it in your browser settings to scan the code.'
            : 'Could not start the camera.'
        );
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, stop]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square w-full max-w-xs mx-auto bg-black overflow-hidden border border-border">
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="Camera viewfinder for scanning the recovery code"
          className="w-full h-full object-cover"
        />
        {/* Framing guide. Decorative only — decoding does not depend on alignment. */}
        <div className="absolute inset-6 border-2 border-white/70 pointer-events-none" />
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-xs gap-2">
            <Loader className="w-4 h-4 animate-spin" aria-hidden="true" /> Starting camera…
          </div>
        )}
        {(status === 'denied' || status === 'unsupported') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white text-xs gap-2 p-6 text-center">
            <CameraOff className="w-5 h-5" aria-hidden="true" />
            {status === 'denied'
              ? 'Camera access is blocked. Allow it, then try again.'
              : 'This browser cannot open the camera.'}
          </div>
        )}
      </div>
      <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-40 flex items-center justify-center gap-2">
        <Camera className="w-3 h-3" aria-hidden="true" />
        Point at the code on your other device
      </p>
      
      <div className="flex items-center justify-center gap-3">
        <div className="h-px flex-1 bg-border"></div>
        <span className="text-[9px] uppercase tracking-[0.2em] font-bold opacity-40">Or</span>
        <div className="h-px flex-1 bg-border"></div>
      </div>
      
      <label className="w-full py-3 px-4 border border-border text-[10px] uppercase tracking-[0.2em] font-bold hover:border-accent hover:text-accent transition-colors cursor-pointer inline-flex items-center justify-center gap-2">
        <Upload className="w-3 h-3" aria-hidden="true" />
        Upload saved QR image
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
          disabled={deliveredRef.current}
        />
      </label>
    </div>
  );
}
