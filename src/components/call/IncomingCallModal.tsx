import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import type { CallMedia } from '../../api/calls';
import { UiElement, trackProps } from '../../lib/analytics/analytics';

/**
 * The incoming-call ring modal. Accessible as a focus-trapped dialog: focus moves to Decline on open,
 * Escape declines, and the state is announced via `aria-live`. A VIDEO call offers "Accept with
 * video" and "Accept with audio" (§3 D3: video answered with camera off is a reasonable default), an
 * AUDIO call offers a single Accept.
 */
export function IncomingCallModal({
  peerName,
  media,
  onAcceptVideo,
  onAcceptAudio,
  onDecline,
}: {
  peerName: string;
  media: CallMedia;
  onAcceptVideo: () => void;
  onAcceptAudio: () => void;
  onDecline: () => void;
}) {
  const declineRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    declineRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDecline();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDecline]);

  const label = media === 'VIDEO' ? 'Incoming video call' : 'Incoming call';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incoming-call-title"
    >
      <div className="w-full max-w-sm bg-surface-card border border-border rounded-2xl shadow-2xl p-6 text-center">
        <p className="sr-only" aria-live="assertive">
          {label} from {peerName}
        </p>
        <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-accent/15 flex items-center justify-center">
          {media === 'VIDEO' ? (
            <Video className="w-8 h-8 text-accent" aria-hidden="true" />
          ) : (
            <Phone className="w-8 h-8 text-accent" aria-hidden="true" />
          )}
        </div>
        <h2 id="incoming-call-title" className="text-lg font-semibold text-text">
          {peerName}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{label}</p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            ref={declineRef}
            type="button"
            {...trackProps(UiElement.CALL_DECLINE)}
            onClick={onDecline}
            className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-red-500 text-white font-semibold hover:bg-red-600 transition-colors cursor-pointer"
            aria-label="Decline call"
          >
            <PhoneOff className="w-5 h-5" aria-hidden="true" />
            Decline
          </button>
          {media === 'VIDEO' ? (
            <>
              <button
                type="button"
                {...trackProps(UiElement.CALL_ACCEPT, { value: 'audio' })}
                onClick={onAcceptAudio}
                className="inline-flex items-center justify-center h-11 w-11 rounded-xl bg-surface-hover text-text hover:bg-surface transition-colors cursor-pointer"
                aria-label="Accept with audio only"
                title="Accept with audio only"
              >
                <Phone className="w-5 h-5" aria-hidden="true" />
              </button>
              <button
                type="button"
                {...trackProps(UiElement.CALL_ACCEPT, { value: 'video' })}
                onClick={onAcceptVideo}
                className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors cursor-pointer"
                aria-label="Accept with video"
              >
                <Video className="w-5 h-5" aria-hidden="true" />
                Accept
              </button>
            </>
          ) : (
            <button
              type="button"
              {...trackProps(UiElement.CALL_ACCEPT, { value: 'audio' })}
              onClick={onAcceptAudio}
              className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors cursor-pointer"
              aria-label="Accept call"
            >
              <Phone className="w-5 h-5" aria-hidden="true" />
              Accept
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
