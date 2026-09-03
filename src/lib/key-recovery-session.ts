import type { KeyRecoverySession, KeyRecoveryStatus } from '../api/key-recovery';
import type { DeviceSummary } from './chat-encryption';

/**
 * Pure decision logic for the history-key recovery flow.
 *
 * These four rules decide what the user is shown, and each has a failure mode that is silent rather
 * than loud — a revoked device offered as a transfer source, an expired request re-opening a prompt,
 * a stale session overriding the live one, or a status that never advances the screen. They live here,
 * free of React and of the network, so they can be tested directly instead of only through a browser.
 */

/** A session is actionable only while it is unfinished and unexpired. */
export function isLiveSession(session: KeyRecoverySession, now: number): boolean {
  return (
    session.expiresAt > now && (session.status === 'PENDING' || session.status === 'DISPLAYING')
  );
}

/**
 * Devices the user may recover FROM: never this device (it is the one missing the key) and never a
 * revoked one (its key is out of the registry, so a transfer from it could not be authenticated).
 * Most recently active first, because that is almost always the device the user still has to hand.
 */
export function recoveryCandidates(devices: DeviceSummary[]): DeviceSummary[] {
  return devices
    .filter((device) => !device.isCurrentDevice && !device.revoked)
    .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
}

/**
 * Which incoming request the source device should show. Newest live request wins: because requests are
 * idempotent per device pair, a newer one from the same device replaces the old, and a second device
 * asking should not be able to bury the request the user just made.
 */
export function selectIncomingRequest(
  sessions: KeyRecoverySession[],
  now: number
): KeyRecoverySession | undefined {
  return sessions
    .filter((session) => isLiveSession(session, now))
    .sort((a, b) => b.createdAt - a.createdAt)[0];
}

/** What the target device's screen should do next, given the session status it just observed. */
export type TargetPhaseSignal = 'wait' | 'scan' | 'declined' | 'done';

export function targetPhaseFor(status: KeyRecoveryStatus): TargetPhaseSignal {
  switch (status) {
    case 'DISPLAYING':
      return 'scan';
    case 'DECLINED':
      return 'declined';
    case 'COMPLETED':
      return 'done';
    default:
      return 'wait';
  }
}

/** What the SOURCE device should do with a request it has just observed. */
export type ResponderAction =
  /** Prompt the user: show the comparison code and the approve/decline buttons. */
  | 'adopt'
  /** Decline it: this device has no history key to give, so waiting would strand the other screen. */
  | 'refuse'
  /** Nothing to do — dead, or already being handled. */
  | 'ignore';

/**
 * Decides how the source device reacts to an incoming request.
 *
 * Pulled out of the React hook because the silent-failure modes live here: a device that cannot help
 * used to do nothing at all (so the asking device waited out the full expiry with no explanation), and
 * a repeated poll must not re-decline a session it already refused.
 */
export function responderActionFor(params: {
  session: KeyRecoverySession;
  now: number;
  /** Whether this device holds the history PRIVATE key, i.e. whether it can actually fulfil a request. */
  holdsHistoryKey: boolean;
  /** The session already on screen, if any. */
  currentSessionId?: string;
  /** The last session this device declined for lack of a key. */
  refusedSessionId?: string | null;
}): ResponderAction {
  const { session, now, holdsHistoryKey, currentSessionId, refusedSessionId } = params;

  if (!isLiveSession(session, now)) return 'ignore';
  if (!holdsHistoryKey) {
    return refusedSessionId === session.sessionId ? 'ignore' : 'refuse';
  }
  if (currentSessionId === session.sessionId) return 'ignore';
  return 'adopt';
}
