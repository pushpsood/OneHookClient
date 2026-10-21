import { Phone, PhoneMissed, PhoneOff, Video } from 'lucide-react';
import type { Call } from '../../api/calls';

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

/** The label + icon for a finished call, from the server end reason (§8 D5: server rows, not client). */
function describe(call: Call, mine: boolean): { icon: typeof Phone; text: string; danger: boolean } {
  const isVideo = call.media === 'VIDEO';
  const BaseIcon = isVideo ? Video : Phone;
  switch (call.endReason) {
    case 'MISSED':
      return { icon: PhoneMissed, text: mine ? 'No answer' : 'Missed call', danger: !mine };
    case 'DECLINED':
      return { icon: PhoneOff, text: 'Call declined', danger: false };
    case 'CANCELLED':
      return { icon: PhoneOff, text: 'Call cancelled', danger: false };
    case 'BUSY':
      return { icon: PhoneMissed, text: 'Line busy', danger: false };
    case 'UNMATCHED':
      return { icon: PhoneOff, text: 'Call ended', danger: false };
    case 'FAILED':
    case 'DROPPED':
      return { icon: PhoneOff, text: 'Call failed', danger: false };
    default:
      return {
        icon: BaseIcon,
        text:
          call.durationMs > 0
            ? `${isVideo ? 'Video call' : 'Call'} · ${formatDuration(call.durationMs)}`
            : `${isVideo ? 'Video call' : 'Call'}`,
        danger: false,
      };
  }
}

/**
 * A single call entry rendered inline in the conversation timeline. Call rows come from the server
 * (`getCallHistory`) rather than client-sent messages, so a call where neither client survived to
 * write a summary still shows up (§8 D5).
 */
export function CallHistoryItem({ call, currentUserId }: { key?: string; call: Call; currentUserId: string }) {
  const mine = call.callerId === currentUserId;
  const { icon: Icon, text, danger } = describe(call, mine);
  const when = new Date(call.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="flex justify-center" role="listitem">
      <div
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface border border-border/60 text-xs text-text-muted"
        aria-label={`${mine ? 'Outgoing' : 'Incoming'} ${text} at ${when}`}
      >
        <Icon className={`w-3.5 h-3.5 ${danger ? 'text-red-500' : ''}`} aria-hidden="true" />
        <span className={danger ? 'text-red-500' : ''}>{text}</span>
        <span className="opacity-50">· {when}</span>
      </div>
    </div>
  );
}
