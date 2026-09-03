import { CONNECTION_STATE_CHANGE, ConnectionState } from 'aws-amplify/api';
import { Hub } from 'aws-amplify/utils';

/**
 * Event-driven replacement for polling an AppSync subscription's health.
 *
 * Amplify already re-establishes a dropped subscription on its own: its WebSocket provider runs a
 * keep-alive heartbeat, records `ConnectionDisrupted` when messages stop arriving, and re-subscribes
 * with jittered exponential backoff. So a timer that re-queries "just in case" duplicates work the
 * library is already doing, and pays for it on every device for the whole session.
 *
 * What Amplify does NOT do is replay the events that occurred while the socket was down. That is the
 * only real gap, and it has an exact signal: the connection returning to `Connected` after having been
 * disrupted. Refetching once on that transition closes the gap without any polling.
 */

/** States that mean events may have been missed, so the next `Connected` is a genuine recovery. */
const DISRUPTED_STATES: ConnectionState[] = [
  ConnectionState.ConnectionDisrupted,
  ConnectionState.ConnectionDisruptedPendingNetwork,
  ConnectionState.Disconnected,
  // The socket is up but the network is gone; delivery is not guaranteed until it returns.
  ConnectionState.ConnectedPendingNetwork,
];

/**
 * Calls `onRestored` each time the AppSync realtime connection recovers from a disruption.
 *
 * Deliberately does NOT fire on the first `Connected` of a fresh page load: nothing was missed then,
 * and callers already do a one-off read when they start. Returns an unsubscribe function.
 */
export function onAppSyncConnectionRestored(onRestored: () => void): () => void {
  let wasDisrupted = false;

  return Hub.listen('api', (capsule) => {
    const payload = capsule?.payload;
    if (!payload || payload.event !== CONNECTION_STATE_CHANGE) return;

    const state = (payload.data as { connectionState?: ConnectionState } | undefined)
      ?.connectionState;
    if (!state) return;

    if (DISRUPTED_STATES.includes(state)) {
      wasDisrupted = true;
      return;
    }
    if (state === ConnectionState.Connected && wasDisrupted) {
      wasDisrupted = false;
      onRestored();
    }
  });
}
