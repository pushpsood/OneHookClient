import { useCallback, useEffect, useRef, useState } from 'react';
import { CallApi } from '../api/calls';
import {
  CallEligibilityTracker,
  callLockMessage,
  DEFAULT_ELIGIBILITY,
  type CallEligibilityState,
} from '../lib/call-eligibility';

/**
 * Call hooks for a conversation.
 *
 * The call LIFECYCLE (ringing, in-call surface, the `onCallEvent` subscription and the WebRTC
 * `CallSession`) is owned by the ONE app-level controller — see `GlobalCallController` /
 * `CallProvider` — so a call rings on any screen, not only while a conversation is open
 * (OneHookBackend/docs/voice-video-calls.md §10). A conversation starts calls through `useCall()`.
 *
 * This module now only owns the per-conversation "may I call yet?" gate, which is conversation-scoped
 * by nature (it depends on whether the two participants have both messaged).
 */

/** What the call buttons need to render and police the "message first" lock. */
export interface CallEligibilityController {
  /** True while the server says calling is not yet allowed for this match. */
  locked: boolean;
  /** User-facing explanation for the lock (server copy, else the product fallback). */
  lockMessage: string;
  /** Machine reason (e.g. `MESSAGE_FIRST`), or null. */
  reason: string | null;
  /** Ask for a throttled re-check (after the user sends / a peer message arrives). */
  recheck(): void;
}

/**
 * Tracks whether calling is unlocked for ONE open conversation. Fetches on open, re-checks (throttled)
 * on demand, stops once unlocked, and fails open on any error — the server still enforces the rule in
 * `startCall`. `enabled` is false for surfaces with no real peer (e.g. Mr.OneHook), where it stays
 * unlocked and makes no requests.
 */
export function useCallEligibility(matchId: string, enabled: boolean): CallEligibilityController {
  const [state, setState] = useState<CallEligibilityState>(DEFAULT_ELIGIBILITY);
  const trackerRef = useRef<CallEligibilityTracker | null>(null);

  useEffect(() => {
    if (!enabled || !matchId) {
      trackerRef.current = null;
      setState(DEFAULT_ELIGIBILITY);
      return;
    }
    setState(DEFAULT_ELIGIBILITY);
    const tracker = new CallEligibilityTracker({
      matchId,
      getEligibility: (id) => CallApi.getCallEligibility(id),
      onChange: setState,
    });
    trackerRef.current = tracker;
    tracker.start();
    return () => {
      tracker.dispose();
      trackerRef.current = null;
    };
  }, [matchId, enabled]);

  const recheck = useCallback(() => trackerRef.current?.recheck(), []);

  return {
    locked: !state.allowed,
    lockMessage: callLockMessage(state),
    reason: state.reason,
    recheck,
  };
}
