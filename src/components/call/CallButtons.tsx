import { useState } from 'react';
import { Lock, Phone, Video } from 'lucide-react';
import { UiElement, trackProps } from '../../lib/analytics/analytics';
import { callButtonLabel, handleCallTap } from '../../lib/call-eligibility';

/**
 * The audio / video call buttons shown in a conversation header.
 *
 * Two independent states:
 *  - `disabled` — a call is already in progress for this conversation; the buttons are inert.
 *  - `locked` — calling is not yet allowed (the backend gate, e.g. "message first"). The buttons stay
 *    VISIBLE and remain real, deliberate controls: a tap still emits `chat.call` / `chat.video_call`
 *    (telemetry fires through the delegated tracker, which ignores only truly `disabled` controls),
 *    but instead of starting a call it reveals the explanation. A lock badge, a tooltip, and an
 *    inline helper line (announced via `role="status"`) explain WHY, and the `aria-label` carries the
 *    reason, e.g. "Voice call, locked. Calling unlocks once you have both sent a message".
 *
 * Locked is NOT implemented with `disabled`: a disabled control would be dropped by the telemetry
 * tracker and would hide the deliberate-press signal we want to keep.
 */
export function CallButtons({
  onAudio,
  onVideo,
  disabled,
  locked = false,
  lockMessage = '',
  peerName,
}: {
  onAudio: () => void;
  onVideo: () => void;
  disabled?: boolean;
  locked?: boolean;
  lockMessage?: string;
  peerName: string;
}) {
  // Tap-to-explain: revealed when a locked button is pressed. Also rendered inline so the reason is
  // discoverable without a tap (tooltip + helper text), but the tap announces it via the live region.
  const [explain, setExplain] = useState(false);

  const audioLabel = callButtonLabel('audio', peerName, locked, lockMessage);
  const videoLabel = callButtonLabel('video', peerName, locked, lockMessage);

  const lockedClass = locked ? 'text-text-muted' : 'text-text hover:bg-surface-hover';
  const baseClass =
    'relative w-9 h-9 flex items-center justify-center rounded-xl transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  const tap = (start: () => void) =>
    handleCallTap({ locked, start, explain: () => setExplain(true) });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => tap(onAudio)}
          disabled={disabled}
          {...trackProps(UiElement.CHAT_CALL)}
          className={`${baseClass} ${lockedClass}`}
          title={locked ? lockMessage : `Audio call ${peerName}`}
          aria-label={audioLabel}
        >
          <Phone className="w-5 h-5 stroke-[1.75]" />
          {locked && (
            <Lock
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 stroke-[2.5] text-text-muted bg-surface-card rounded-full p-[1px]"
              aria-hidden="true"
            />
          )}
        </button>
        <button
          type="button"
          onClick={() => tap(onVideo)}
          disabled={disabled}
          {...trackProps(UiElement.CHAT_VIDEO_CALL)}
          className={`${baseClass} ${lockedClass}`}
          title={locked ? lockMessage : `Video call ${peerName}`}
          aria-label={videoLabel}
        >
          <Video className="w-5 h-5 stroke-[1.75]" />
          {locked && (
            <Lock
              className="absolute -bottom-0.5 -right-0.5 w-3 h-3 stroke-[2.5] text-text-muted bg-surface-card rounded-full p-[1px]"
              aria-hidden="true"
            />
          )}
        </button>
      </div>
      {locked && (
        <p
          role="status"
          className={`text-[10px] leading-tight max-w-[200px] text-right ${
            explain ? 'text-accent' : 'text-text-muted'
          }`}
        >
          {lockMessage}
        </p>
      )}
    </div>
  );
}
